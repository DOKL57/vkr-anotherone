import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const client = new Client({ connectionString });

const statements = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,
  `DO $$ BEGIN CREATE TYPE "EmployeeRole" AS ENUM ('ADMIN', 'WAREHOUSE', 'SOUND_ENGINEER'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "EquipmentStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_USE', 'REPAIR', 'RETIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'CLOSED', 'PARTIAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "RepairStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'REQUESTED', 'ORDERED', 'DELIVERED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "OperationType" AS ENUM ('ISSUE', 'RETURN', 'TRANSFER', 'REPAIR_SENT', 'REPAIR_RETURN', 'PURCHASE_REQUEST', 'PURCHASE_RECEIPT', 'STOCK_ADJUSTMENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `CREATE TABLE IF NOT EXISTS "EquipmentCategory" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT, "parentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "Warehouse" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "StorageLocation" ("id" TEXT PRIMARY KEY, "warehouseId" TEXT NOT NULL, "zone" TEXT NOT NULL, "row" TEXT, "rack" TEXT, "cell" TEXT, "label" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "EquipmentItem" ("id" TEXT PRIMARY KEY, "type" TEXT NOT NULL, "model" TEXT NOT NULL, "serialNumber" TEXT UNIQUE, "specs" JSONB NOT NULL, "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE', "notes" TEXT, "categoryId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "InventoryBalance" ("id" TEXT PRIMARY KEY, "equipmentItemId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL, "locationId" TEXT, "quantity" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "Employee" ("id" TEXT PRIMARY KEY, "fullName" TEXT NOT NULL, "role" "EmployeeRole" NOT NULL, "phone" TEXT, "email" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "Project" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "venue" TEXT, "customer" TEXT, "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "IssueRecord" ("id" TEXT PRIMARY KEY, "equipmentItemId" TEXT NOT NULL, "quantity" INTEGER NOT NULL, "employeeId" TEXT, "projectId" TEXT, "dueAt" TIMESTAMP(3) NOT NULL, "returnedAt" TIMESTAMP(3), "status" "IssueStatus" NOT NULL DEFAULT 'OPEN', "issuedById" TEXT NOT NULL, "acceptedById" TEXT, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "RepairRecord" ("id" TEXT PRIMARY KEY, "equipmentItemId" TEXT NOT NULL, "reason" TEXT NOT NULL, "diagnosis" TEXT, "etaDate" TIMESTAMP(3), "readyAt" TIMESTAMP(3), "status" "RepairStatus" NOT NULL DEFAULT 'OPEN', "responsibleId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "PurchaseRequest" ("id" TEXT PRIMARY KEY, "equipmentItemId" TEXT, "title" TEXT NOT NULL, "supplier" TEXT NOT NULL, "cost" NUMERIC(12,2) NOT NULL, "plannedDeliveryAt" TIMESTAMP(3), "actualDeliveryAt" TIMESTAMP(3), "linkedReason" TEXT, "usageStats" TEXT, "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT', "requesterId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "OperationHistory" ("id" TEXT PRIMARY KEY, "type" "OperationType" NOT NULL, "equipmentItemId" TEXT, "quantity" INTEGER NOT NULL, "fromWarehouseId" TEXT, "fromLocationId" TEXT, "toWarehouseId" TEXT, "toLocationId" TEXT, "actorEmployeeId" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "ChatSession" ("id" TEXT PRIMARY KEY, "title" TEXT, "lastIntent" TEXT, "contextJson" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "ChatMessage" ("id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "role" "MessageRole" NOT NULL, "content" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS "QueryCache" ("id" TEXT PRIMARY KEY, "cacheKey" TEXT NOT NULL UNIQUE, "responseJson" JSONB NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  `ALTER TABLE "EquipmentCategory" DROP CONSTRAINT IF EXISTS "EquipmentCategory_parentId_fkey";`,
  `ALTER TABLE "StorageLocation" DROP CONSTRAINT IF EXISTS "StorageLocation_warehouseId_fkey";`,
  `ALTER TABLE "EquipmentItem" DROP CONSTRAINT IF EXISTS "EquipmentItem_categoryId_fkey";`,
  `ALTER TABLE "InventoryBalance" DROP CONSTRAINT IF EXISTS "InventoryBalance_equipmentItemId_fkey";`,
  `ALTER TABLE "InventoryBalance" DROP CONSTRAINT IF EXISTS "InventoryBalance_warehouseId_fkey";`,
  `ALTER TABLE "InventoryBalance" DROP CONSTRAINT IF EXISTS "InventoryBalance_locationId_fkey";`,
  `ALTER TABLE "IssueRecord" DROP CONSTRAINT IF EXISTS "IssueRecord_equipmentItemId_fkey";`,
  `ALTER TABLE "IssueRecord" DROP CONSTRAINT IF EXISTS "IssueRecord_employeeId_fkey";`,
  `ALTER TABLE "IssueRecord" DROP CONSTRAINT IF EXISTS "IssueRecord_projectId_fkey";`,
  `ALTER TABLE "IssueRecord" DROP CONSTRAINT IF EXISTS "IssueRecord_issuedById_fkey";`,
  `ALTER TABLE "IssueRecord" DROP CONSTRAINT IF EXISTS "IssueRecord_acceptedById_fkey";`,
  `ALTER TABLE "RepairRecord" DROP CONSTRAINT IF EXISTS "RepairRecord_equipmentItemId_fkey";`,
  `ALTER TABLE "RepairRecord" DROP CONSTRAINT IF EXISTS "RepairRecord_responsibleId_fkey";`,
  `ALTER TABLE "PurchaseRequest" DROP CONSTRAINT IF EXISTS "PurchaseRequest_equipmentItemId_fkey";`,
  `ALTER TABLE "PurchaseRequest" DROP CONSTRAINT IF EXISTS "PurchaseRequest_requesterId_fkey";`,
  `ALTER TABLE "OperationHistory" DROP CONSTRAINT IF EXISTS "OperationHistory_equipmentItemId_fkey";`,
  `ALTER TABLE "OperationHistory" DROP CONSTRAINT IF EXISTS "OperationHistory_fromWarehouseId_fkey";`,
  `ALTER TABLE "OperationHistory" DROP CONSTRAINT IF EXISTS "OperationHistory_fromLocationId_fkey";`,
  `ALTER TABLE "OperationHistory" DROP CONSTRAINT IF EXISTS "OperationHistory_toWarehouseId_fkey";`,
  `ALTER TABLE "OperationHistory" DROP CONSTRAINT IF EXISTS "OperationHistory_toLocationId_fkey";`,
  `ALTER TABLE "OperationHistory" DROP CONSTRAINT IF EXISTS "OperationHistory_actorEmployeeId_fkey";`,
  `ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_sessionId_fkey";`,
  `ALTER TABLE "EquipmentCategory" ADD CONSTRAINT "EquipmentCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EquipmentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "IssueRecord" ADD CONSTRAINT "IssueRecord_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE "IssueRecord" ADD CONSTRAINT "IssueRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "IssueRecord" ADD CONSTRAINT "IssueRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "IssueRecord" ADD CONSTRAINT "IssueRecord_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE "IssueRecord" ADD CONSTRAINT "IssueRecord_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "RepairRecord" ADD CONSTRAINT "RepairRecord_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `ALTER TABLE "RepairRecord" ADD CONSTRAINT "RepairRecord_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "OperationHistory" ADD CONSTRAINT "OperationHistory_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "OperationHistory" ADD CONSTRAINT "OperationHistory_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "OperationHistory" ADD CONSTRAINT "OperationHistory_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "OperationHistory" ADD CONSTRAINT "OperationHistory_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "OperationHistory" ADD CONSTRAINT "OperationHistory_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "OperationHistory" ADD CONSTRAINT "OperationHistory_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
  `ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "InventoryBalance_equipment_warehouse_location_key" ON "InventoryBalance" ("equipmentItemId","warehouseId","locationId");`
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
