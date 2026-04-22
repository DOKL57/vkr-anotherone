import dotenv from "dotenv";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { fileURLToPath } from "url";
import path from "path";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(moduleDir, "../../../.env"),
  path.resolve(moduleDir, "../../../../.env")
];

for (const candidate of envCandidates) {
  const result = dotenv.config({ path: candidate, override: true });
  if (!result.error && result.parsed?.DATABASE_URL) {
    break;
  }
}

function resolveConnectionString() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return raw;
  }

  const localWorkspace =
    /^[A-Za-z]:\\/.test(process.cwd()) ||
    process.cwd().startsWith("/mnt/") ||
    process.cwd().startsWith("/Users/") ||
    process.cwd().startsWith("/home/");

  if (localWorkspace && raw.includes("@postgres:")) {
    return raw.replace("@postgres:", "@localhost:");
  }

  return raw;
}

const connectionString = resolveConnectionString();

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({ connectionString });

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: PoolClient
) {
  const runner = client ?? pool;
  const result = await runner.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: PoolClient
) {
  const rows = await query<T>(text, params, client);
  return rows[0];
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
