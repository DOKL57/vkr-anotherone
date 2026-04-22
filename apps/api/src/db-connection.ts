import { URL } from "node:url";

function isLocalWorkspace(cwd: string) {
  return (
    /^[A-Za-z]:\\/.test(cwd) ||
    cwd.startsWith("/mnt/") ||
    cwd.startsWith("/Users/") ||
    cwd.startsWith("/home/")
  );
}

function replaceHost(raw: string, hostname: string, port?: string) {
  const url = new URL(raw);
  url.hostname = hostname;
  if (port) {
    url.port = port;
  }
  return url.toString();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function getConnectionStringCandidates(raw = process.env.DATABASE_URL, cwd = process.cwd()) {
  if (!raw) {
    return [];
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
  } catch {
    return [raw];
  }

  const currentHost = parsed.hostname;
  const currentPort = parsed.port || undefined;
  const explicitHost = process.env.POSTGRES_HOST?.trim();
  const explicitPort = process.env.POSTGRES_PORT?.trim() || currentPort;
  const candidates: string[] = [];
  const localWorkspace = isLocalWorkspace(cwd);

  const addCandidate = (hostname?: string | null) => {
    if (!hostname) {
      return;
    }
    candidates.push(replaceHost(raw, hostname, explicitPort));
  };

  addCandidate(explicitHost);
  candidates.push(explicitPort ? replaceHost(raw, currentHost, explicitPort) : raw);

  if (currentHost === "worklist-postgres" || currentHost.endsWith("-postgres")) {
    addCandidate("postgres");
  }

  if (localWorkspace && currentHost !== "localhost") {
    if (currentHost === "postgres" || currentHost === "worklist-postgres" || currentHost.endsWith("-postgres")) {
      addCandidate("localhost");
    }
  }

  return unique(candidates);
}

export function formatConnectionTargets(connectionStrings: string[]) {
  return unique(
    connectionStrings.map((connectionString) => {
      try {
        const url = new URL(connectionString);
        return `${url.hostname}:${url.port || "5432"}`;
      } catch {
        return connectionString;
      }
    })
  ).join(", ");
}
