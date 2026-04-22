import dotenv from "dotenv";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { fileURLToPath } from "url";
import path from "path";
import { formatConnectionTargets, getConnectionStringCandidates } from "./db-connection.js";

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

const connectionStrings = getConnectionStringCandidates();

if (connectionStrings.length === 0) {
  throw new Error("DATABASE_URL is not set");
}

let poolPromise: Promise<Pool> | null = null;

async function createPool() {
  const errors: string[] = [];

  for (const connectionString of connectionStrings) {
    const pool = new Pool({ connectionString });
    try {
      await pool.query("SELECT 1");
      return pool;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      await pool.end().catch(() => undefined);
    }
  }

  throw new Error(
    `DB conn fail. Tried ${formatConnectionTargets(connectionStrings)}. Last errors: ${errors.join(" | ")}`
  );
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = createPool();
  }
  return poolPromise;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: PoolClient
) {
  const runner = client ?? (await getPool());
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
  const pool = await getPool();
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
  if (!poolPromise) {
    return;
  }

  const pool = await poolPromise.catch(() => null);
  if (pool) {
    await pool.end();
  }
}
