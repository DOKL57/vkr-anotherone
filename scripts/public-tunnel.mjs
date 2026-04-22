import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(moduleDir, "..");
const runtimeDir = path.join(rootDir, ".runtime");
const cacheDir = path.join(rootDir, ".npm-cache");
const pidFile = path.join(runtimeDir, "public-tunnel.pid");
const envFile = path.join(runtimeDir, "public-tunnel.env");
const logFile = path.join(runtimeDir, "public-tunnel.log");
const port = Number(process.env.PUBLIC_TUNNEL_PORT ?? 3001);
const command = process.argv[2] ?? "start";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDirs() {
  await Promise.all([
    fsp.mkdir(runtimeDir, { recursive: true }),
    fsp.mkdir(cacheDir, { recursive: true })
  ]);
}

async function readPid() {
  try {
    return Number((await fsp.readFile(pidFile, "utf8")).trim());
  } catch {
    return undefined;
  }
}

function isAlive(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function cleanupFiles() {
  await Promise.allSettled([
    fsp.rm(pidFile, { force: true }),
    fsp.rm(envFile, { force: true })
  ]);
}

async function stopTunnel() {
  const pid = await readPid();
  if (pid && isAlive(pid)) {
    process.kill(pid);
  }

  await cleanupFiles();
}

async function waitForEnvFile(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await fsp.readFile(envFile, "utf8");
      if (/^TELEGRAM_WEBAPP_URL=https:\/\//m.test(content)) {
        return content;
      }
    } catch {
      // Keep polling.
    }

    await sleep(500);
  }

  throw new Error(`Tunnel env file not ready after ${timeoutMs}ms`);
}

async function startTunnelAgent() {
  await ensureDirs();

  const existingPid = await readPid();
  if (existingPid && isAlive(existingPid)) {
    process.stdout.write(await waitForEnvFile());
    return;
  }

  await cleanupFiles();

  const logFd = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      npm_config_cache: cacheDir
    }
  });

  child.unref();
  fs.closeSync(logFd);

  process.stdout.write(await waitForEnvFile());
}

async function serveTunnel() {
  await ensureDirs();
  await cleanupFiles();
  await fsp.writeFile(pidFile, `${process.pid}\n`, "utf8");

  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", `npx --yes localtunnel --port ${port}`], {
          cwd: rootDir,
          env: {
            ...process.env,
            npm_config_cache: cacheDir
          },
          stdio: ["ignore", "pipe", "pipe"]
        })
      : spawn("npx", ["--yes", "localtunnel", "--port", String(port)], {
          cwd: rootDir,
          env: {
            ...process.env,
            npm_config_cache: cacheDir
          },
          stdio: ["ignore", "pipe", "pipe"]
        });

  let ready = false;

  const writeEnvIfFound = async (chunk) => {
    const text = chunk.toString();
    logStream.write(text);
    const match = text.match(/https:\/\/[^\s]+/);
    if (!ready && match) {
      ready = true;
      const url = match[0];
      const envText = [
        `PUBLIC_TUNNEL_URL=${url}`,
        `TELEGRAM_WEBAPP_URL=${url}`,
        `CORS_ORIGIN=${url}`
      ].join("\n");
      await fsp.writeFile(envFile, `${envText}\n`, "utf8");
      logStream.write(`Public tunnel ready: ${url}\n`);
    }
  };

  child.stdout.on("data", (chunk) => {
    void writeEnvIfFound(chunk);
  });

  child.stderr.on("data", (chunk) => {
    void writeEnvIfFound(chunk);
  });

  const shutdown = async () => {
    if (!child.killed) {
      child.kill();
    }
    await cleanupFiles();
    logStream.end();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  child.once("exit", async (code) => {
    if (!ready) {
      logStream.write(`localtunnel exited before URL ready: ${code ?? "null"}\n`);
    }
    await cleanupFiles();
    logStream.end();
    process.exit(code ?? 0);
  });
}

if (command === "start") {
  await startTunnelAgent();
} else if (command === "serve") {
  await serveTunnel();
} else if (command === "stop") {
  await stopTunnel();
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
