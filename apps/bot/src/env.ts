import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(moduleDir, "../../../.env"),
  path.resolve(moduleDir, "../../../../.env")
];

let envDir = process.cwd();

for (const candidate of envCandidates) {
  const result = dotenv.config({ path: candidate, override: true });
  if (!result.error && result.parsed) {
    envDir = path.dirname(candidate);
    break;
  }
}

const defaultSessionFile = path.resolve(process.cwd(), ".runtime", "telegram-bot-sessions.json");
const configuredSessionFile = process.env.TELEGRAM_BOT_SESSION_FILE;

export const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
  TELEGRAM_BOT_API_URL: process.env.TELEGRAM_BOT_API_URL ?? "https://api.telegram.org",
  TELEGRAM_BOT_SESSION_FILE: configuredSessionFile
    ? path.resolve(envDir, configuredSessionFile)
    : defaultSessionFile,
  API_URL: (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, ""),
  BOT_POLLING_INTERVAL: Number(process.env.BOT_POLLING_INTERVAL ?? 1000)
};

export function ensureRuntimeDir() {
  fs.mkdirSync(path.dirname(env.TELEGRAM_BOT_SESSION_FILE), { recursive: true });
}
