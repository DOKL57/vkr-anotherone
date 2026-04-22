import dotenv from "dotenv";
import { Client } from "pg";
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

const client = new Client({ connectionString });

const statements = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,

  `DROP TABLE IF EXISTS "ChatMessage" CASCADE;`,
  `DROP TABLE IF EXISTS "ChatSession" CASCADE;`,
  `DROP TABLE IF EXISTS "QueryCache" CASCADE;`,
  `DROP TABLE IF EXISTS "OperationHistory" CASCADE;`,
  `DROP TABLE IF EXISTS "PurchaseRequest" CASCADE;`,
  `DROP TABLE IF EXISTS "IssueRecord" CASCADE;`,
  `DROP TABLE IF EXISTS "RepairRecord" CASCADE;`,
  `DROP TABLE IF EXISTS "InventoryBalance" CASCADE;`,
  `DROP TABLE IF EXISTS "EquipmentItem" CASCADE;`,
  `DROP TABLE IF EXISTS "Employee" CASCADE;`,
  `DROP TABLE IF EXISTS "StorageLocation" CASCADE;`,
  `DROP TABLE IF EXISTS "Warehouse" CASCADE;`,
  `DROP TABLE IF EXISTS "EquipmentCategory" CASCADE;`,

  `DROP TYPE IF EXISTS "EmployeeRole";`,
  `DROP TYPE IF EXISTS "EquipmentStatus";`,
  `DROP TYPE IF EXISTS "IssueStatus";`,
  `DROP TYPE IF EXISTS "RepairStatus";`,
  `DROP TYPE IF EXISTS "PurchaseStatus";`,
  `DROP TYPE IF EXISTS "OperationType";`,
  `DROP TYPE IF EXISTS "MessageRole";`,

  `DROP TABLE IF EXISTS operation_log CASCADE;`,
  `DROP TABLE IF EXISTS ai_query_log CASCADE;`,
  `DROP TABLE IF EXISTS issue_item CASCADE;`,
  `DROP TABLE IF EXISTS issue_operation CASCADE;`,
  `DROP TABLE IF EXISTS repair CASCADE;`,
  `DROP TABLE IF EXISTS inventory_balance CASCADE;`,
  `DROP TABLE IF EXISTS equipment CASCADE;`,
  `DROP TABLE IF EXISTS equipment_status CASCADE;`,
  `DROP TABLE IF EXISTS equipment_category CASCADE;`,
  `DROP TABLE IF EXISTS storage_location CASCADE;`,
  `DROP TABLE IF EXISTS warehouse CASCADE;`,
  `DROP TABLE IF EXISTS app_user CASCADE;`,
  `DROP TABLE IF EXISTS user_role CASCADE;`,
  `DROP TABLE IF EXISTS employee CASCADE;`,
  `DROP TABLE IF EXISTS project CASCADE;`,

  `CREATE TABLE warehouse (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
  );`,

  `CREATE TABLE storage_location (
    id TEXT PRIMARY KEY,
    warehouse_id TEXT NOT NULL REFERENCES warehouse(id) ON DELETE RESTRICT,
    zone TEXT NOT NULL,
    row_number TEXT,
    rack TEXT,
    cell TEXT,
    note TEXT
  );`,

  `CREATE TABLE equipment_category (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
  );`,

  `CREATE TABLE equipment_status (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
  );`,

  `CREATE TABLE equipment (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES equipment_category(id) ON DELETE RESTRICT,
    status_id TEXT NOT NULL REFERENCES equipment_status(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    serial_number TEXT UNIQUE,
    specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
    note TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE inventory_balance (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
    location_id TEXT NOT NULL REFERENCES storage_location(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity >= 0)
  );`,

  `CREATE TABLE employee (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    position TEXT
  );`,

  `CREATE TABLE user_role (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
  );`,

  `CREATE TABLE app_user (
    id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL REFERENCES user_role(id) ON DELETE RESTRICT,
    employee_id TEXT REFERENCES employee(id) ON DELETE SET NULL,
    username TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE project (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    customer TEXT,
    location TEXT,
    start_date TIMESTAMP(3),
    end_date TIMESTAMP(3),
    comment TEXT
  );`,

  `CREATE TABLE issue_operation (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES project(id) ON DELETE SET NULL,
    employee_id TEXT REFERENCES employee(id) ON DELETE SET NULL,
    issue_date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    planned_return_date TIMESTAMP(3),
    actual_return_date TIMESTAMP(3),
    comment TEXT
  );`,

  `CREATE TABLE issue_item (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES issue_operation(id) ON DELETE CASCADE,
    equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0)
  );`,

  `CREATE TABLE repair (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
    start_date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    planned_end_date TIMESTAMP(3),
    end_date TIMESTAMP(3),
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN'
  );`,

  `CREATE TABLE ai_query_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES app_user(id) ON DELETE SET NULL,
    query_text TEXT NOT NULL,
    response_text TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'SUCCESS'
  );`,

  `CREATE TABLE operation_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES app_user(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    action_time TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    details JSONB
  );`,

  `CREATE UNIQUE INDEX inventory_balance_equipment_location_key
    ON inventory_balance (equipment_id, location_id);`,
  `CREATE INDEX issue_item_issue_idx ON issue_item (issue_id);`,
  `CREATE INDEX repair_equipment_idx ON repair (equipment_id);`,
  `CREATE INDEX operation_log_action_idx ON operation_log (action, action_time DESC);`,
  `CREATE INDEX ai_query_log_user_idx ON ai_query_log (user_id, created_at DESC);`
];

async function main() {
  await client.connect();
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
