import { randomUUID } from "crypto";
import cors from "cors";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { query, queryOne, withTransaction } from "./db.js";
import { env } from "./env.js";
import { parseIntentWithLlm } from "./llm.js";

type SessionContext = {
  lastIntent?: string;
  lastSearch?: string;
  lastCategoryId?: string;
  lastEquipmentIds?: string[];
};

type RoleName = "ADMIN" | "WAREHOUSE" | "SOUND_ENGINEER";

type JsonMap = Record<string, unknown>;

type InventoryRow = {
  id: string;
  equipmentId: string;
  locationId: string;
  quantity: number;
  zone: string;
  rowNumber: string | null;
  rack: string | null;
  cell: string | null;
  locationNote: string | null;
  warehouseId: string;
  warehouseName: string;
};

type EquipmentRow = {
  id: string;
  categoryId: string;
  categoryName: string;
  status: string;
  name: string;
  model: string;
  serialNumber: string | null;
  specifications: JsonMap | null;
  note: string | null;
  createdAt: Date;
};

type IssueOperationRow = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  issueDate: Date;
  plannedReturnDate: Date | null;
  actualReturnDate: Date | null;
  comment: string | null;
};

type IssueItemRow = {
  id: string;
  issueId: string;
  equipmentId: string;
  quantity: number;
  equipmentName: string;
  equipmentModel: string;
};

type RepairRow = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  equipmentModel: string;
  startDate: Date;
  plannedEndDate: Date | null;
  endDate: Date | null;
  reason: string;
  description: string | null;
  status: string;
};

type EmployeeRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  role: string | null;
  roleId: string | null;
  appUserId: string | null;
  username: string | null;
};

type PurchaseView = {
  id: string;
  title: string;
  supplierName: string;
  plannedDeliveryAt?: string | null;
  actualDeliveryAt?: string | null;
  status: string;
  items: Array<{ equipmentId?: string; itemName: string; quantity: number }>;
};

type Actor = {
  employeeId: string;
  appUserId: string;
  role: RoleName;
  fullName: string;
};

type OperationLogRow = {
  id: string;
  action: string;
  actionTime: Date;
  details: JsonMap | null;
  userId: string | null;
  employeeId: string | null;
  employeeName: string | null;
};

const upload = multer();
const sessionState = new Map<string, SessionContext>();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const webDistCandidates = [
  path.resolve(process.cwd(), "apps/web/dist"),
  path.resolve(moduleDir, "../../../web/dist"),
  path.resolve(moduleDir, "../../../../apps/web/dist")
];
const webDistDir = webDistCandidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html")));

function asyncHandler<
  Req extends express.Request = express.Request,
  Res extends express.Response = express.Response
>(
  fn: (req: Req, res: Res, next: express.NextFunction) => Promise<unknown>
) {
  return (req: Req, res: Res, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const equipmentCreateSchema = z.object({
  actorId: z.string().min(1),
  name: z.string().min(2),
  type: z.string().min(2),
  model: z.string().min(1),
  manufacturer: z.string().optional(),
  serialNumber: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().min(1),
  minStock: z.number().int().nonnegative().default(0),
  technicalSpecs: z.record(z.string()).default({}),
  inventory: z
    .array(
      z.object({
        locationId: z.string().min(1),
        quantity: z.number().int().positive()
      })
    )
    .min(1)
});

const issueCreateSchema = z.object({
  actorId: z.string().min(1),
  warehouseId: z.string().min(1),
  projectId: z.string().optional(),
  assignedEmployeeId: z.string().optional(),
  purpose: z.string().min(3),
  dueAt: z.string().datetime(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        equipmentId: z.string().min(1),
        quantity: z.number().int().positive(),
        notes: z.string().optional()
      })
    )
    .min(1)
});

const repairCreateSchema = z.object({
  actorId: z.string().min(1),
  warehouseId: z.string().min(1),
  locationId: z.string().min(1),
  equipmentId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  reason: z.string().min(3),
  diagnosis: z.string().optional(),
  estimatedReadyAt: z.string().datetime().optional(),
  responsibleId: z.string().optional(),
  defectTag: z.string().optional(),
  notes: z.string().optional()
});

const purchaseCreateSchema = z.object({
  actorId: z.string().min(1),
  title: z.string().min(3),
  supplierName: z.string().min(2),
  supplierContact: z.string().optional(),
  plannedDeliveryAt: z.string().datetime().optional(),
  totalCost: z.number().nonnegative().optional(),
  reason: z.string().min(3),
  deficitSource: z.string().optional(),
  projectId: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        equipmentId: z.string().optional(),
        itemName: z.string().min(2),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative().optional(),
        totalPrice: z.number().nonnegative().optional(),
        shortageReason: z.string().optional(),
        usageNote: z.string().optional()
      })
    )
    .min(1)
});

function normalize(value: string) {
  return value.toLowerCase().replace(/[^а-яa-z0-9\s-]/gi, " ").replace(/\s+/g, " ").trim();
}

function asMap(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function asStringRecord(value: unknown) {
  const source = asMap(value);
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (typeof raw === "string") {
      result[key] = raw;
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      result[key] = String(raw);
    }
  }
  return result;
}

function getEquipmentMeta(specifications: unknown) {
  const spec = asMap(specifications);
  return {
    type: asString(spec.type),
    manufacturer: asString(spec.manufacturer),
    minStock: asNumber(spec.minStock) ?? 0,
    technicalSpecs: asStringRecord(spec.technicalSpecs)
  };
}

function buildLocationLabel(location: {
  zone: string;
  rowNumber: string | null;
  rack: string | null;
  cell: string | null;
  warehouseName: string;
}) {
  const address = [location.zone, location.rowNumber, location.rack, location.cell].filter(Boolean).join(" / ");
  return `${location.warehouseName}: ${address || location.zone}`;
}

function deriveIssueStatus(plannedReturnDate: Date | null, actualReturnDate: Date | null) {
  if (actualReturnDate) {
    return "RETURNED";
  }

  if (plannedReturnDate && plannedReturnDate.getTime() < Date.now()) {
    return "OVERDUE";
  }

  return "OPEN";
}

function purchaseStatusWeight(status: string) {
  if (status === "DELIVERED") {
    return 0;
  }

  if (status === "ORDERED") {
    return 3;
  }

  if (status === "REQUESTED") {
    return 2;
  }

  if (status === "DRAFT") {
    return 1;
  }

  return 0;
}

async function findRoleId(role: RoleName, client?: PoolClient) {
  const row = await queryOne<{ id: string }>("SELECT id FROM user_role WHERE name = $1", [role], client);
  if (!row) {
    throw new Error(`Role ${role} not found.`);
  }
  return row.id;
}

async function getEmployeeRows(client?: PoolClient) {
  return query<EmployeeRow>(
    `
      SELECT DISTINCT ON (e.id)
        e.id,
        e.full_name AS "fullName",
        e.phone,
        e.email,
        e.position,
        ur.name AS role,
        ur.id AS "roleId",
        au.id AS "appUserId",
        au.username
      FROM employee e
      LEFT JOIN app_user au
        ON au.employee_id = e.id
       AND au.status = 'ACTIVE'
      LEFT JOIN user_role ur
        ON ur.id = au.role_id
      ORDER BY e.id, au.created_at DESC
    `,
    [],
    client
  );
}

async function requireRole(actorId: string, allowed: RoleName[], client?: PoolClient) {
  const row = await queryOne<Actor>(
    `
      SELECT
        e.id AS "employeeId",
        au.id AS "appUserId",
        ur.name AS role,
        e.full_name AS "fullName"
      FROM employee e
      JOIN app_user au
        ON au.employee_id = e.id
       AND au.status = 'ACTIVE'
      JOIN user_role ur
        ON ur.id = au.role_id
      WHERE e.id = $1
      ORDER BY au.created_at DESC
      LIMIT 1
    `,
    [actorId],
    client
  );

  if (!row) {
    throw new Error("Сотрудник не найден.");
  }

  if (!allowed.includes(row.role)) {
    throw new Error("Недостаточно прав для операции.");
  }

  return row;
}

async function upsertInventoryBalance(
  client: PoolClient,
  equipmentId: string,
  locationId: string,
  quantityDelta: number
) {
  if (quantityDelta === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO inventory_balance (id, equipment_id, location_id, quantity)
      VALUES (gen_random_uuid()::text, $1, $2, $3)
      ON CONFLICT (equipment_id, location_id)
      DO UPDATE SET quantity = inventory_balance.quantity + EXCLUDED.quantity
    `,
    [equipmentId, locationId, quantityDelta]
  );
}

async function recomputeEquipmentStatus(client: PoolClient, equipmentId: string) {
  const inventory = await queryOne<{ quantity: string }>(
    "SELECT COALESCE(SUM(quantity), 0)::text AS quantity FROM inventory_balance WHERE equipment_id = $1",
    [equipmentId],
    client
  );

  const openIssue = await queryOne<{ quantity: string }>(
    `
      SELECT COALESCE(SUM(ii.quantity), 0)::text AS quantity
      FROM issue_item ii
      JOIN issue_operation io
        ON io.id = ii.issue_id
      WHERE ii.equipment_id = $1
        AND io.actual_return_date IS NULL
    `,
    [equipmentId],
    client
  );

  const openRepair = await queryOne<{ quantity: string }>(
    `
      SELECT COALESCE(SUM(COALESCE((ol.details->>'quantity')::int, 1)), 0)::text AS quantity
      FROM repair r
      LEFT JOIN operation_log ol
        ON ol.action = 'REPAIR_CREATED'
       AND ol.details->>'repairId' = r.id
      WHERE r.equipment_id = $1
        AND r.status IN ('OPEN', 'IN_PROGRESS')
        AND r.end_date IS NULL
    `,
    [equipmentId],
    client
  );

  const available = Number(inventory?.quantity ?? "0");
  const inUse = Number(openIssue?.quantity ?? "0");
  const inRepair = Number(openRepair?.quantity ?? "0");

  let statusName = "AVAILABLE";
  if (inRepair > 0 && available === 0 && inUse === 0) {
    statusName = "IN_REPAIR";
  } else if (inUse > 0 && available === 0 && inRepair === 0) {
    statusName = "IN_USE";
  } else if (available > 0 && (inUse > 0 || inRepair > 0)) {
    statusName = "PARTIAL";
  }

  const status = await queryOne<{ id: string }>("SELECT id FROM equipment_status WHERE name = $1", [statusName], client);
  if (!status) {
    throw new Error(`Equipment status ${statusName} not found.`);
  }

  await client.query("UPDATE equipment SET status_id = $2 WHERE id = $1", [equipmentId, status.id]);
}

async function getInventoryRows(client?: PoolClient) {
  return query<InventoryRow>(
    `
      SELECT
        ib.id,
        ib.equipment_id AS "equipmentId",
        ib.location_id AS "locationId",
        ib.quantity,
        sl.zone,
        sl.row_number AS "rowNumber",
        sl.rack,
        sl.cell,
        sl.note AS "locationNote",
        w.id AS "warehouseId",
        w.name AS "warehouseName"
      FROM inventory_balance ib
      JOIN storage_location sl
        ON sl.id = ib.location_id
      JOIN warehouse w
        ON w.id = sl.warehouse_id
      ORDER BY w.name, sl.zone, sl.row_number, sl.rack, sl.cell
    `,
    [],
    client
  );
}

async function getEquipmentRows(client?: PoolClient) {
  return query<EquipmentRow>(
    `
      SELECT
        e.id,
        e.category_id AS "categoryId",
        ec.name AS "categoryName",
        es.name AS status,
        e.name,
        e.model,
        e.serial_number AS "serialNumber",
        e.specifications,
        e.note,
        e.created_at AS "createdAt"
      FROM equipment e
      JOIN equipment_category ec
        ON ec.id = e.category_id
      JOIN equipment_status es
        ON es.id = e.status_id
      ORDER BY e.name, e.model
    `,
    [],
    client
  );
}

async function getIssueRows(client?: PoolClient) {
  const [operations, items] = await Promise.all([
    query<IssueOperationRow>(
      `
        SELECT
          io.id,
          io.project_id AS "projectId",
          p.name AS "projectName",
          io.employee_id AS "employeeId",
          e.full_name AS "employeeName",
          io.issue_date AS "issueDate",
          io.planned_return_date AS "plannedReturnDate",
          io.actual_return_date AS "actualReturnDate",
          io.comment
        FROM issue_operation io
        LEFT JOIN project p
          ON p.id = io.project_id
        LEFT JOIN employee e
          ON e.id = io.employee_id
        ORDER BY io.issue_date DESC
      `,
      [],
      client
    ),
    query<IssueItemRow>(
      `
        SELECT
          ii.id,
          ii.issue_id AS "issueId",
          ii.equipment_id AS "equipmentId",
          ii.quantity,
          eq.name AS "equipmentName",
          eq.model AS "equipmentModel"
        FROM issue_item ii
        JOIN equipment eq
          ON eq.id = ii.equipment_id
      `,
      [],
      client
    )
  ]);

  const itemMap = new Map<string, IssueItemRow[]>();
  for (const item of items) {
    const group = itemMap.get(item.issueId) ?? [];
    group.push(item);
    itemMap.set(item.issueId, group);
  }

  return operations.map((row) => ({
    id: row.id,
    purpose: row.comment ?? "Выдача оборудования",
    status: deriveIssueStatus(row.plannedReturnDate, row.actualReturnDate),
    dueAt: row.plannedReturnDate?.toISOString() ?? row.issueDate.toISOString(),
    issuedAt: row.issueDate.toISOString(),
    returnedAt: row.actualReturnDate?.toISOString() ?? null,
    project: row.projectId ? { id: row.projectId, name: row.projectName ?? "Проект" } : null,
    assignedEmployee: row.employeeId
      ? {
          id: row.employeeId,
          fullName: row.employeeName ?? "Сотрудник"
        }
      : null,
    items: (itemMap.get(row.id) ?? []).map((item) => ({
      id: item.id,
      quantity: item.quantity,
      returnedQuantity: row.actualReturnDate ? item.quantity : 0,
      equipment: {
        id: item.equipmentId,
        name: item.equipmentName,
        model: item.equipmentModel
      }
    }))
  }));
}

async function getRepairRows(client?: PoolClient) {
  const [repairs, employees, logs] = await Promise.all([
    query<RepairRow>(
      `
        SELECT
          r.id,
          r.equipment_id AS "equipmentId",
          eq.name AS "equipmentName",
          eq.model AS "equipmentModel",
          r.start_date AS "startDate",
          r.planned_end_date AS "plannedEndDate",
          r.end_date AS "endDate",
          r.reason,
          r.description,
          r.status
        FROM repair r
        JOIN equipment eq
          ON eq.id = r.equipment_id
        ORDER BY r.start_date DESC
      `,
      [],
      client
    ),
    getEmployeeRows(client),
    query<OperationLogRow>(
      `
        SELECT
          ol.id,
          ol.action,
          ol.action_time AS "actionTime",
          ol.details,
          ol.user_id AS "userId",
          au.employee_id AS "employeeId",
          e.full_name AS "employeeName"
        FROM operation_log ol
        LEFT JOIN app_user au
          ON au.id = ol.user_id
        LEFT JOIN employee e
          ON e.id = au.employee_id
        WHERE ol.action = 'REPAIR_CREATED'
      `,
      [],
      client
    )
  ]);

  const employeeMap = new Map(employees.map((row) => [row.id, row]));
  const repairMeta = new Map<string, JsonMap>();

  for (const log of logs) {
    const details = asMap(log.details);
    const repairId = asString(details.repairId);
    if (repairId) {
      repairMeta.set(repairId, details);
    }
  }

  return repairs.map((row) => {
    const meta = repairMeta.get(row.id) ?? {};
    const responsibleId = asString(meta.responsibleId);
    const responsible = responsibleId ? employeeMap.get(responsibleId) : undefined;
    return {
      id: row.id,
      reason: row.reason,
      diagnosis: row.description,
      estimatedReadyAt: row.plannedEndDate?.toISOString() ?? null,
      actualReadyAt: row.endDate?.toISOString() ?? null,
      status: row.status,
      equipment: {
        id: row.equipmentId,
        name: row.equipmentName,
        model: row.equipmentModel
      },
      responsible: responsible
        ? {
            id: responsible.id,
            fullName: responsible.fullName
          }
        : null,
      quantity: asNumber(meta.quantity) ?? 1
    };
  });
}

async function getPurchaseRows(client?: PoolClient) {
  const logs = await query<OperationLogRow>(
    `
      SELECT
        ol.id,
        ol.action,
        ol.action_time AS "actionTime",
        ol.details,
        ol.user_id AS "userId",
        au.employee_id AS "employeeId",
        e.full_name AS "employeeName"
      FROM operation_log ol
      LEFT JOIN app_user au
        ON au.id = ol.user_id
      LEFT JOIN employee e
        ON e.id = au.employee_id
      WHERE ol.action IN ('PURCHASE_CREATED', 'PURCHASE_RECEIVED')
      ORDER BY ol.action_time ASC
    `,
    [],
    client
  );

  const purchases = new Map<string, PurchaseView>();

  for (const log of logs) {
    const details = asMap(log.details);
    const purchaseId = asString(details.purchaseId);
    if (!purchaseId) {
      continue;
    }

    if (log.action === "PURCHASE_CREATED") {
      const rawItems = Array.isArray(details.items) ? details.items : [];
      purchases.set(purchaseId, {
        id: purchaseId,
        title: asString(details.title) ?? "Закупка",
        supplierName: asString(details.supplierName) ?? "Поставщик не указан",
        plannedDeliveryAt: asString(details.plannedDeliveryAt) ?? null,
        actualDeliveryAt: null,
        status: asString(details.status) ?? "REQUESTED",
        items: rawItems.map((item) => {
          const row = asMap(item);
          return {
            equipmentId: asString(row.equipmentId),
            itemName: asString(row.itemName) ?? "Новая позиция",
            quantity: asNumber(row.quantity) ?? 1
          };
        })
      });
    }

    if (log.action === "PURCHASE_RECEIVED") {
      const current = purchases.get(purchaseId);
      if (current) {
        current.status = "DELIVERED";
        current.actualDeliveryAt = log.actionTime.toISOString();
      }
    }
  }

  return [...purchases.values()].sort((left, right) => {
    const weight = purchaseStatusWeight(right.status) - purchaseStatusWeight(left.status);
    if (weight !== 0) {
      return weight;
    }
    return (right.plannedDeliveryAt ?? "").localeCompare(left.plannedDeliveryAt ?? "");
  });
}

async function getOperationRows(client?: PoolClient) {
  return query<OperationLogRow>(
    `
      SELECT
        ol.id,
        ol.action,
        ol.action_time AS "actionTime",
        ol.details,
        ol.user_id AS "userId",
        au.employee_id AS "employeeId",
        e.full_name AS "employeeName"
      FROM operation_log ol
      LEFT JOIN app_user au
        ON au.id = ol.user_id
      LEFT JOIN employee e
        ON e.id = au.employee_id
      ORDER BY ol.action_time DESC
      LIMIT 20
    `,
    [],
    client
  );
}

async function getBootstrapData() {
  const [categories, warehouses, locations, employees, projects, equipment, inventory, issues, repairs, purchases, operations] =
    await Promise.all([
      query<{ id: string; name: string; description: string | null }>(
        "SELECT id, name, description FROM equipment_category ORDER BY name",
        []
      ),
      query<{ id: string; name: string; description: string | null }>(
        "SELECT id, name, description FROM warehouse ORDER BY name",
        []
      ),
      query<{
        id: string;
        warehouseId: string;
        zone: string;
        rowNumber: string | null;
        rack: string | null;
        cell: string | null;
        note: string | null;
      }>(
        `
          SELECT
            id,
            warehouse_id AS "warehouseId",
            zone,
            row_number AS "rowNumber",
            rack,
            cell,
            note
          FROM storage_location
          ORDER BY zone, row_number, rack, cell
        `,
        []
      ),
      getEmployeeRows(),
      query<{ id: string; name: string; customer: string | null; location: string | null }>(
        "SELECT id, name, customer, location FROM project ORDER BY start_date NULLS LAST, name",
        []
      ),
      getEquipmentRows(),
      getInventoryRows(),
      getIssueRows(),
      getRepairRows(),
      getPurchaseRows(),
      getOperationRows()
    ]);

  const inventoryByEquipment = new Map<string, InventoryRow[]>();
  for (const row of inventory) {
    const group = inventoryByEquipment.get(row.equipmentId) ?? [];
    group.push(row);
    inventoryByEquipment.set(row.equipmentId, group);
  }

  const inUseByEquipment = new Map<string, number>();
  for (const issue of issues.filter((row) => row.status !== "RETURNED")) {
    for (const item of issue.items) {
      inUseByEquipment.set(item.equipment.id, (inUseByEquipment.get(item.equipment.id) ?? 0) + item.quantity);
    }
  }

  const inRepairByEquipment = new Map<string, number>();
  for (const repair of repairs.filter((row) => row.status === "OPEN" || row.status === "IN_PROGRESS")) {
    inRepairByEquipment.set(
      repair.equipment.id,
      (inRepairByEquipment.get(repair.equipment.id) ?? 0) + repair.quantity
    );
  }

  const equipmentView = equipment.map((row) => {
    const meta = getEquipmentMeta(row.specifications);
    const stockRows = inventoryByEquipment.get(row.id) ?? [];
    const available = stockRows.reduce((sum, item) => sum + item.quantity, 0);
    const inUse = inUseByEquipment.get(row.id) ?? 0;
    const inRepair = inRepairByEquipment.get(row.id) ?? 0;

    return {
      id: row.id,
      name: row.name,
      type: meta.type ?? row.categoryName,
      model: row.model,
      manufacturer: meta.manufacturer ?? null,
      serialNumber: row.serialNumber,
      description: row.note,
      technicalSpecs: meta.technicalSpecs,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      status: row.status,
      totalQuantity: available + inUse + inRepair,
      minStock: meta.minStock,
      available,
      reserved: 0,
      inUse,
      inRepair,
      locations: stockRows.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        reserved: 0,
        label: buildLocationLabel(item)
      }))
    };
  });

  const dashboard = {
    equipmentCount: equipmentView.length,
    availableUnits: equipmentView.reduce((sum, row) => sum + row.available, 0),
    inUseUnits: equipmentView.reduce((sum, row) => sum + row.inUse, 0),
    inRepairUnits: equipmentView.reduce((sum, row) => sum + row.inRepair, 0),
    openIssues: issues.filter((row) => row.status !== "RETURNED").length,
    overdueIssues: issues.filter((row) => row.status === "OVERDUE").length,
    openRepairs: repairs.filter((row) => row.status === "OPEN" || row.status === "IN_PROGRESS").length,
    activePurchases: purchases.filter((row) => row.status !== "DELIVERED").length,
    shortages: equipmentView.filter((row) => row.available < row.minStock)
  };

  return {
    dashboard,
    categories,
    warehouses,
    locations: locations.map((row) => ({
      id: row.id,
      warehouseId: row.warehouseId,
      label: [row.zone, row.rowNumber, row.rack, row.cell].filter(Boolean).join(" / "),
      note: row.note
    })),
    employees: employees.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      role: row.role ?? "SOUND_ENGINEER",
      phone: row.phone,
      email: row.email,
      position: row.position
    })),
    projects,
    equipment: equipmentView,
    issues,
    repairs,
    purchases,
    operations
  };
}

async function createEquipment(payload: unknown) {
  const input = equipmentCreateSchema.parse(payload);
  const employee = await requireRole(input.actorId, ["ADMIN", "WAREHOUSE"]);

  return withTransaction(async (client) => {
    const equipment = await queryOne<{ id: string; createdAt: Date }>(
      `
        INSERT INTO equipment (
          id,
          category_id,
          status_id,
          name,
          model,
          serial_number,
          specifications,
          note
        )
        VALUES (
          gen_random_uuid()::text,
          $1,
          (SELECT id FROM equipment_status WHERE name = 'AVAILABLE'),
          $2,
          $3,
          $4,
          $5::jsonb,
          $6
        )
        RETURNING id, created_at AS "createdAt"
      `,
      [
        input.categoryId,
        input.name,
        input.model,
        input.serialNumber ?? null,
        JSON.stringify({
          type: input.type,
          manufacturer: input.manufacturer,
          minStock: input.minStock,
          technicalSpecs: input.technicalSpecs
        }),
        input.description ?? null
      ],
      client
    );

    if (!equipment) {
      throw new Error("Не удалось создать оборудование.");
    }

    for (const row of input.inventory) {
      await upsertInventoryBalance(client, equipment.id, row.locationId, row.quantity);
    }

    await client.query(
      `
        INSERT INTO operation_log (id, user_id, action, details)
        VALUES (gen_random_uuid()::text, $1, 'EQUIPMENT_CREATED', $2::jsonb)
      `,
      [
        employee.appUserId,
        JSON.stringify({
          equipmentId: equipment.id,
          inventory: input.inventory,
          type: input.type,
          manufacturer: input.manufacturer,
          minStock: input.minStock
        })
      ]
    );

    await recomputeEquipmentStatus(client, equipment.id);

    return {
      id: equipment.id,
      createdAt: equipment.createdAt.toISOString()
    };
  });
}

async function createIssue(payload: unknown) {
  const input = issueCreateSchema.parse(payload);
  const employee = await requireRole(input.actorId, ["ADMIN", "WAREHOUSE"]);

  return withTransaction(async (client) => {
    const issue = await queryOne<{ id: string }>(
      `
        INSERT INTO issue_operation (
          id,
          project_id,
          employee_id,
          issue_date,
          planned_return_date,
          comment
        )
        VALUES (gen_random_uuid()::text, $1, $2, CURRENT_TIMESTAMP, $3, $4)
        RETURNING id
      `,
      [
        input.projectId ?? null,
        input.assignedEmployeeId ?? null,
        new Date(input.dueAt),
        input.purpose
      ],
      client
    );

    if (!issue) {
      throw new Error("Не удалось оформить выдачу.");
    }

    await client.query(
      `
        INSERT INTO operation_log (id, user_id, action, details)
        VALUES (gen_random_uuid()::text, $1, 'ISSUE_CREATED', $2::jsonb)
      `,
      [
        employee.appUserId,
        JSON.stringify({
          issueId: issue.id,
          warehouseId: input.warehouseId,
          issuedById: employee.employeeId,
          notes: input.notes ?? null
        })
      ]
    );

    for (const row of input.items) {
      const stocks = await query<
        QueryResultRow & {
          id: string;
          quantity: number;
          locationId: string;
          warehouseId: string;
        }
      >(
        `
          SELECT
            ib.id,
            ib.quantity,
            ib.location_id AS "locationId",
            sl.warehouse_id AS "warehouseId"
          FROM inventory_balance ib
          JOIN storage_location sl
            ON sl.id = ib.location_id
          WHERE ib.equipment_id = $1
            AND sl.warehouse_id = $2
            AND ib.quantity > 0
          ORDER BY ib.quantity DESC, ib.id ASC
        `,
        [row.equipmentId, input.warehouseId],
        client
      );

      const available = stocks.reduce((sum, item) => sum + item.quantity, 0);
      if (available < row.quantity) {
        throw new Error("Недостаточно остатка для выдачи.");
      }

      const issueItem = await queryOne<{ id: string }>(
        `
          INSERT INTO issue_item (id, issue_id, equipment_id, quantity)
          VALUES (gen_random_uuid()::text, $1, $2, $3)
          RETURNING id
        `,
        [issue.id, row.equipmentId, row.quantity],
        client
      );

      if (!issueItem) {
        throw new Error("Не удалось создать позицию выдачи.");
      }

      let remaining = row.quantity;
      const allocations: Array<{ locationId: string; quantity: number }> = [];

      for (const stock of stocks) {
        if (remaining <= 0) {
          break;
        }

        const take = Math.min(stock.quantity, remaining);
        await client.query("UPDATE inventory_balance SET quantity = quantity - $2 WHERE id = $1", [stock.id, take]);
        allocations.push({ locationId: stock.locationId, quantity: take });
        remaining -= take;
      }

      await client.query(
        `
          INSERT INTO operation_log (id, user_id, action, details)
          VALUES (gen_random_uuid()::text, $1, 'ISSUE_ALLOCATION', $2::jsonb)
        `,
        [
          employee.appUserId,
          JSON.stringify({
            issueId: issue.id,
            issueItemId: issueItem.id,
            equipmentId: row.equipmentId,
            note: row.notes ?? null,
            allocations
          })
        ]
      );

      await recomputeEquipmentStatus(client, row.equipmentId);
    }

    return issue;
  });
}

async function returnIssue(issueId: string, actorId: string) {
  const employee = await requireRole(actorId, ["ADMIN", "WAREHOUSE"]);

  return withTransaction(async (client) => {
    const issue = await queryOne<{ id: string; actualReturnDate: Date | null }>(
      `
        SELECT id, actual_return_date AS "actualReturnDate"
        FROM issue_operation
        WHERE id = $1
      `,
      [issueId],
      client
    );

    if (!issue) {
      throw new Error("Выдача не найдена.");
    }

    if (issue.actualReturnDate) {
      return { id: issue.id, status: "RETURNED", returnedAt: issue.actualReturnDate.toISOString() };
    }

    const items = await query<{ equipmentId: string }>(
      "SELECT equipment_id AS \"equipmentId\" FROM issue_item WHERE issue_id = $1",
      [issueId],
      client
    );

    const allocationLogs = await query<OperationLogRow>(
      `
        SELECT
          ol.id,
          ol.action,
          ol.action_time AS "actionTime",
          ol.details,
          ol.user_id AS "userId",
          NULL::text AS "employeeId",
          NULL::text AS "employeeName"
        FROM operation_log ol
        WHERE ol.action = 'ISSUE_ALLOCATION'
          AND ol.details->>'issueId' = $1
      `,
      [issueId],
      client
    );

    for (const log of allocationLogs) {
      const details = asMap(log.details);
      const equipmentId = asString(details.equipmentId);
      const rawAllocations = Array.isArray(details.allocations) ? details.allocations : [];
      for (const raw of rawAllocations) {
        const allocation = asMap(raw);
        const locationId = asString(allocation.locationId);
        const quantity = asNumber(allocation.quantity) ?? 0;
        if (!locationId || quantity <= 0 || !equipmentId) {
          continue;
        }
        await upsertInventoryBalance(client, equipmentId, locationId, quantity);
      }
    }

    await client.query(
      `
        UPDATE issue_operation
        SET actual_return_date = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [issueId]
    );

    await client.query(
      `
        INSERT INTO operation_log (id, user_id, action, details)
        VALUES (gen_random_uuid()::text, $1, 'ISSUE_RETURNED', $2::jsonb)
      `,
      [employee.appUserId, JSON.stringify({ issueId, acceptedById: employee.employeeId })]
    );

    for (const item of items) {
      await recomputeEquipmentStatus(client, item.equipmentId);
    }

    return {
      id: issueId,
      status: "RETURNED",
      returnedAt: new Date().toISOString()
    };
  });
}

async function createRepair(payload: unknown) {
  const input = repairCreateSchema.parse(payload);
  const employee = await requireRole(input.actorId, ["ADMIN", "WAREHOUSE"]);

  return withTransaction(async (client) => {
    const stock = await queryOne<{ id: string; quantity: number }>(
      `
        SELECT id, quantity
        FROM inventory_balance
        WHERE equipment_id = $1
          AND location_id = $2
      `,
      [input.equipmentId, input.locationId],
      client
    );

    if (!stock || stock.quantity < input.quantity) {
      throw new Error("Недостаточно остатка в выбранной ячейке.");
    }

    await client.query("UPDATE inventory_balance SET quantity = quantity - $2 WHERE id = $1", [stock.id, input.quantity]);

    const repair = await queryOne<{ id: string }>(
      `
        INSERT INTO repair (
          id,
          equipment_id,
          start_date,
          planned_end_date,
          reason,
          description,
          status
        )
        VALUES (gen_random_uuid()::text, $1, CURRENT_TIMESTAMP, $2, $3, $4, 'IN_PROGRESS')
        RETURNING id
      `,
      [
        input.equipmentId,
        input.estimatedReadyAt ? new Date(input.estimatedReadyAt) : null,
        input.reason,
        input.diagnosis ?? input.notes ?? null
      ],
      client
    );

    if (!repair) {
      throw new Error("Не удалось создать ремонт.");
    }

    await client.query(
      `
        INSERT INTO operation_log (id, user_id, action, details)
        VALUES (gen_random_uuid()::text, $1, 'REPAIR_CREATED', $2::jsonb)
      `,
      [
        employee.appUserId,
        JSON.stringify({
          repairId: repair.id,
          equipmentId: input.equipmentId,
          warehouseId: input.warehouseId,
          locationId: input.locationId,
          quantity: input.quantity,
          responsibleId: input.responsibleId ?? null,
          defectTag: input.defectTag ?? null,
          notes: input.notes ?? null
        })
      ]
    );

    await recomputeEquipmentStatus(client, input.equipmentId);
    return repair;
  });
}

async function completeRepair(repairId: string, actorId: string) {
  const employee = await requireRole(actorId, ["ADMIN", "WAREHOUSE"]);

  return withTransaction(async (client) => {
    const repair = await queryOne<{ id: string; equipmentId: string; endDate: Date | null }>(
      `
        SELECT
          id,
          equipment_id AS "equipmentId",
          end_date AS "endDate"
        FROM repair
        WHERE id = $1
      `,
      [repairId],
      client
    );

    if (!repair) {
      throw new Error("Ремонт не найден.");
    }

    if (repair.endDate) {
      return { id: repair.id, status: "DONE", actualReadyAt: repair.endDate.toISOString() };
    }

    const metaLog = await queryOne<OperationLogRow>(
      `
        SELECT
          ol.id,
          ol.action,
          ol.action_time AS "actionTime",
          ol.details,
          ol.user_id AS "userId",
          NULL::text AS "employeeId",
          NULL::text AS "employeeName"
        FROM operation_log ol
        WHERE ol.action = 'REPAIR_CREATED'
          AND ol.details->>'repairId' = $1
        ORDER BY ol.action_time DESC
        LIMIT 1
      `,
      [repairId],
      client
    );

    const meta = asMap(metaLog?.details);
    const locationId = asString(meta.locationId);
    const quantity = asNumber(meta.quantity) ?? 1;

    if (!locationId) {
      throw new Error("Не найдена исходная ячейка ремонта.");
    }

    await upsertInventoryBalance(client, repair.equipmentId, locationId, quantity);

    await client.query(
      `
        UPDATE repair
        SET end_date = CURRENT_TIMESTAMP,
            status = 'DONE'
        WHERE id = $1
      `,
      [repairId]
    );

    await client.query(
      `
        INSERT INTO operation_log (id, user_id, action, details)
        VALUES (gen_random_uuid()::text, $1, 'REPAIR_COMPLETED', $2::jsonb)
      `,
      [employee.appUserId, JSON.stringify({ repairId, completedById: employee.employeeId, locationId, quantity })]
    );

    await recomputeEquipmentStatus(client, repair.equipmentId);

    return {
      id: repairId,
      status: "DONE",
      actualReadyAt: new Date().toISOString()
    };
  });
}

async function createPurchase(payload: unknown) {
  const input = purchaseCreateSchema.parse(payload);
  const employee = await requireRole(input.actorId, ["ADMIN", "WAREHOUSE"]);
  const purchaseId = randomUUID();

  await query(
    `
      INSERT INTO operation_log (id, user_id, action, details)
      VALUES (gen_random_uuid()::text, $1, 'PURCHASE_CREATED', $2::jsonb)
    `,
    [
      employee.appUserId,
      JSON.stringify({
        purchaseId,
        title: input.title,
        supplierName: input.supplierName,
        supplierContact: input.supplierContact ?? null,
        plannedDeliveryAt: input.plannedDeliveryAt ?? null,
        totalCost: input.totalCost ?? null,
        reason: input.reason,
        deficitSource: input.deficitSource ?? null,
        projectId: input.projectId ?? null,
        notes: input.notes ?? null,
        requestedById: employee.employeeId,
        status: input.plannedDeliveryAt ? "ORDERED" : "REQUESTED",
        items: input.items
      })
    ]
  );

  return { id: purchaseId, status: input.plannedDeliveryAt ? "ORDERED" : "REQUESTED" };
}

async function receivePurchase(purchaseId: string, actorId: string) {
  const employee = await requireRole(actorId, ["ADMIN", "WAREHOUSE"]);

  return withTransaction(async (client) => {
    const purchaseLogs = await query<OperationLogRow>(
      `
        SELECT
          ol.id,
          ol.action,
          ol.action_time AS "actionTime",
          ol.details,
          ol.user_id AS "userId",
          NULL::text AS "employeeId",
          NULL::text AS "employeeName"
        FROM operation_log ol
        WHERE ol.action IN ('PURCHASE_CREATED', 'PURCHASE_RECEIVED')
          AND ol.details->>'purchaseId' = $1
        ORDER BY ol.action_time ASC
      `,
      [purchaseId],
      client
    );

    if (purchaseLogs.length === 0) {
      throw new Error("Закупка не найдена.");
    }

    if (purchaseLogs.some((log) => log.action === "PURCHASE_RECEIVED")) {
      return { id: purchaseId, status: "DELIVERED" };
    }

    const firstLocation = await queryOne<{ id: string; warehouseId: string }>(
      `
        SELECT id, warehouse_id AS "warehouseId"
        FROM storage_location
        ORDER BY zone, row_number, rack, cell
        LIMIT 1
      `,
      [],
      client
    );

    if (!firstLocation) {
      throw new Error("Нет ячеек для приёмки.");
    }

    const created = purchaseLogs.find((log) => log.action === "PURCHASE_CREATED");
    const details = asMap(created?.details);
    const items = Array.isArray(details.items) ? details.items : [];

    for (const raw of items) {
      const item = asMap(raw);
      const equipmentId = asString(item.equipmentId);
      const quantity = asNumber(item.quantity) ?? 0;
      if (!equipmentId || quantity <= 0) {
        continue;
      }
      await upsertInventoryBalance(client, equipmentId, firstLocation.id, quantity);
      await recomputeEquipmentStatus(client, equipmentId);
    }

    await client.query(
      `
        INSERT INTO operation_log (id, user_id, action, details)
        VALUES (gen_random_uuid()::text, $1, 'PURCHASE_RECEIVED', $2::jsonb)
      `,
      [
        employee.appUserId,
        JSON.stringify({
          purchaseId,
          receivedById: employee.employeeId,
          locationId: firstLocation.id,
          warehouseId: firstLocation.warehouseId
        })
      ]
    );

    return { id: purchaseId, status: "DELIVERED" };
  });
}

async function getEquipmentCatalog() {
  const rows = await getEquipmentRows();
  return rows.map((row) => {
    const meta = getEquipmentMeta(row.specifications);
    return {
      id: row.id,
      name: row.name,
      model: row.model,
      type: meta.type ?? row.categoryName,
      manufacturer: meta.manufacturer ?? "",
      categoryName: row.categoryName
    };
  });
}

async function parseEquipmentList(text: string) {
  const catalog = await getEquipmentCatalog();

  const lines = text
    .split(/\r?\n|;/)
    .map((row) => row.trim())
    .filter(Boolean);

  const parsed = lines.map((line) => {
    const quantityMatch = line.match(/(\d+)\s*(шт|штук|ед|ед\.|x)?/i);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    const search = normalize(line.replace(quantityMatch?.[0] ?? "", ""));
    const candidates = catalog.filter((item) => {
      const haystack = normalize(
        `${item.name} ${item.model} ${item.type} ${item.manufacturer} ${item.categoryName}`
      );
      return haystack.includes(search) || search.includes(normalize(item.name));
    });

    const exact = candidates[0];
    return {
      line,
      quantity,
      match: exact ? `${exact.name} ${exact.model}` : null,
      equipmentId: exact?.id ?? null,
      alternatives: candidates.slice(1, 4).map((item) => `${item.name} ${item.model}`)
    };
  });

  return {
    totalLines: parsed.length,
    matched: parsed.filter((row) => row.equipmentId).length,
    missing: parsed.filter((row) => !row.equipmentId).length,
    items: parsed
  };
}

function pickIntent(message: string, context: SessionContext) {
  const text = normalize(message);

  if (/альтернатив|замен|аналог/.test(text)) {
    return { intent: "alternatives", searchTerms: [] as string[] };
  }

  if (/ремонт|неисправ|слом/.test(text)) {
    return { intent: "repairs", searchTerms: [] as string[] };
  }

  if (/возврат|вернуть|срок|просроч/.test(text)) {
    return { intent: "due_returns", searchTerms: [] as string[] };
  }

  if (/закуп|постав|поставка|поставщик/.test(text)) {
    return { intent: "purchases", searchTerms: [] as string[] };
  }

  const terms = text
    .split(" ")
    .filter((row) => row.length > 2)
    .slice(0, 6);

  if (terms.length > 0) {
    return { intent: "search_equipment", searchTerms: terms };
  }

  if (context.lastIntent === "search_equipment" && context.lastSearch) {
    return { intent: "search_equipment", searchTerms: context.lastSearch.split(" ") };
  }

  return { intent: "unknown", searchTerms: [] as string[] };
}

async function searchEquipment(searchTerms: string[]) {
  const queryText = searchTerms.join(" ").trim();
  if (!queryText) {
    return [];
  }

  const bootstrap = await getBootstrapData();
  const terms = searchTerms.map((item) => normalize(item)).filter(Boolean);

  return bootstrap.equipment.filter((row) => {
    const haystack = normalize(
      `${row.name} ${row.model} ${row.type} ${row.categoryName} ${row.manufacturer ?? ""} ${row.serialNumber ?? ""}`
    );
    return terms.some((term) => haystack.includes(term));
  });
}

function formatEquipmentResponse(rows: Array<Awaited<ReturnType<typeof getBootstrapData>>["equipment"][number]>) {
  if (rows.length === 0) {
    return "Ничего не нашёл. Уточни модель, тип или категорию.";
  }

  return rows
    .slice(0, 6)
    .map((row) => {
      const locations = row.locations
        .filter((item) => item.quantity > 0)
        .map((item) => `${item.label} - ${item.quantity} шт`)
        .join("; ");

      return [
        `${row.name} ${row.model}`,
        `Категория: ${row.categoryName}`,
        `Статус: ${row.status}. Доступно: ${row.available} шт, в работе: ${row.inUse} шт, в ремонте: ${row.inRepair} шт.`,
        `Где лежит: ${locations || "свободного остатка нет"}`,
        row.minStock > 0 && row.available < row.minStock ? `Ниже минимума: нужно минимум ${row.minStock} шт.` : null
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

async function formatAlternatives(context: SessionContext) {
  const ids = context.lastEquipmentIds ?? [];
  if (ids.length === 0) {
    return "Нет контекста для подбора замены. Сначала назови нужное оборудование.";
  }

  const bootstrap = await getBootstrapData();
  const seed = bootstrap.equipment.find((row) => row.id === ids[0]);
  if (!seed) {
    return "Не нашёл базовую позицию для подбора альтернатив.";
  }

  const alternatives = bootstrap.equipment
    .filter((row) => row.categoryId === seed.categoryId && !ids.includes(row.id) && row.available > 0)
    .sort((left, right) => right.available - left.available)
    .slice(0, 5);

  if (alternatives.length === 0) {
    return "Свободных альтернатив сейчас нет.";
  }

  return `Можно заменить на:\n${alternatives
    .map((row) => `- ${row.name} ${row.model}: доступно ${row.available} шт`)
    .join("\n")}`;
}

async function formatDueReturns() {
  const rows = (await getIssueRows()).filter((row) => row.status === "OPEN" || row.status === "OVERDUE");
  if (rows.length === 0) {
    return "Просроченных и открытых возвратов нет.";
  }

  return rows
    .slice(0, 8)
    .map((row) => {
      const items = row.items.map((item) => `${item.equipment.name} ${item.equipment.model} x${item.quantity}`).join(", ");
      return `${row.project?.name ?? row.purpose} | вернуть до ${new Date(row.dueAt).toLocaleString("ru-RU")} | ответственный: ${row.assignedEmployee?.fullName ?? "не назначен"} | ${items}`;
    })
    .join("\n");
}

async function formatRepairs() {
  const rows = (await getRepairRows()).filter((row) => row.status === "OPEN" || row.status === "IN_PROGRESS");
  if (rows.length === 0) {
    return "Открытых ремонтов нет.";
  }

  return rows
    .slice(0, 8)
    .map((row) => {
      return `${row.equipment.name} ${row.equipment.model} x${row.quantity} | причина: ${row.reason} | диагноз: ${row.diagnosis ?? "ещё не указан"} | готовность: ${row.estimatedReadyAt ? new Date(row.estimatedReadyAt).toLocaleDateString("ru-RU") : "не назначена"} | ответственный: ${row.responsible?.fullName ?? "не назначен"}`;
    })
    .join("\n");
}

async function formatPurchases() {
  const rows = (await getPurchaseRows()).filter((row) => row.status !== "DELIVERED");
  if (rows.length === 0) {
    return "Активных закупок нет.";
  }

  return rows
    .slice(0, 8)
    .map((row) => {
      const items = row.items.map((item) => `${item.itemName} x${item.quantity}`).join(", ");
      return `${row.title} | поставщик: ${row.supplierName} | статус: ${row.status} | план: ${row.plannedDeliveryAt ? new Date(row.plannedDeliveryAt).toLocaleDateString("ru-RU") : "нет"} | ${items}`;
    })
    .join("\n");
}

async function resolveAppUserId(params: { employeeId?: string }) {
  if (params.employeeId) {
    const byEmployee = await queryOne<{ id: string }>(
      "SELECT id FROM app_user WHERE employee_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1",
      [params.employeeId]
    );
    if (byEmployee) {
      return byEmployee.id;
    }
  }

  return undefined;
}

async function askAssistant(params: {
  message: string;
  employeeId?: string;
  sessionKey: string;
}) {
  const appUserId = await resolveAppUserId({
    employeeId: params.employeeId
  });

  const context = sessionState.get(params.sessionKey) ?? {};
  const historyRows = appUserId
    ? await query<{ queryText: string; responseText: string }>(
        `
          SELECT query_text AS "queryText", response_text AS "responseText"
          FROM ai_query_log
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 6
        `,
        [appUserId]
      )
    : [];

  const contextText = historyRows
    .reverse()
    .map((row) => `USER: ${row.queryText}\nASSISTANT: ${row.responseText}`)
    .join("\n");

  const llmIntent = await parseIntentWithLlm(params.message, contextText);
  const picked = llmIntent ?? pickIntent(params.message, context);

  let answer = "Не понял запрос. Спроси про наличие, возвраты, ремонты или закупки.";
  let nextContext: SessionContext = {
    ...context,
    lastIntent: picked.intent
  };

  if (picked.intent === "search_equipment") {
    const rows = await searchEquipment(picked.searchTerms ?? []);
    answer = formatEquipmentResponse(rows);
    nextContext = {
      ...nextContext,
      lastSearch: (picked.searchTerms ?? []).join(" "),
      lastCategoryId: rows[0]?.categoryId,
      lastEquipmentIds: rows.map((row) => row.id)
    };
  } else if (picked.intent === "alternatives") {
    answer = await formatAlternatives(context);
  } else if (picked.intent === "due_returns") {
    answer = await formatDueReturns();
  } else if (picked.intent === "repairs") {
    answer = await formatRepairs();
  } else if (picked.intent === "purchases") {
    answer = await formatPurchases();
  } else if (picked.intent === "clarify" && llmIntent?.question) {
    answer = llmIntent.question;
  }

  sessionState.set(params.sessionKey, nextContext);

  await query(
    `
      INSERT INTO ai_query_log (id, user_id, query_text, response_text, status)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
    `,
    [appUserId ?? null, params.message, answer, picked.intent === "clarify" ? "CLARIFY" : "SUCCESS"]
  );

  return {
    answer,
    sessionId: params.sessionKey,
    intent: picked.intent
  };
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", asyncHandler(async (_req, res) => {
    await query("SELECT 1");
    res.json({
      status: "ok",
      service: "sound-rental-api",
      time: new Date().toISOString()
    });
  }));

  app.get("/api/bootstrap", asyncHandler(async (_req, res) => {
    const data = await getBootstrapData();
    res.json(data);
  }));

  app.post("/api/auth/demo", asyncHandler(async (_req, res) => {
    const employee = await queryOne<EmployeeRow>(
      `
        SELECT DISTINCT ON (e.id)
          e.id,
          e.full_name AS "fullName",
          e.phone,
          e.email,
          e.position,
          ur.name AS role,
          ur.id AS "roleId",
          au.id AS "appUserId",
          au.username
        FROM employee e
        JOIN app_user au
          ON au.employee_id = e.id
         AND au.status = 'ACTIVE'
        JOIN user_role ur
          ON ur.id = au.role_id
        ORDER BY e.id, au.created_at ASC
        LIMIT 1
      `,
      []
    );

    if (!employee) {
      throw new Error("Нет сотрудника для demo-входа.");
    }

    res.json({
      mode: "demo",
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        role: employee.role
      }
    });
  }));

  app.post("/api/equipment", asyncHandler(async (req, res) => {
    const created = await createEquipment(req.body);
    res.status(201).json(created);
  }));

  app.post("/api/issues", asyncHandler(async (req, res) => {
    const created = await createIssue(req.body);
    res.status(201).json(created);
  }));

  app.post("/api/issues/:id/return", asyncHandler(async (req, res) => {
    const body = z.object({ actorId: z.string().min(1) }).parse(req.body);
    const updated = await returnIssue(String(req.params.id), body.actorId);
    res.json(updated);
  }));

  app.post("/api/repairs", asyncHandler(async (req, res) => {
    const created = await createRepair(req.body);
    res.status(201).json(created);
  }));

  app.post("/api/repairs/:id/complete", asyncHandler(async (req, res) => {
    const body = z.object({ actorId: z.string().min(1) }).parse(req.body);
    const updated = await completeRepair(String(req.params.id), body.actorId);
    res.json(updated);
  }));

  app.post("/api/purchases", asyncHandler(async (req, res) => {
    const created = await createPurchase(req.body);
    res.status(201).json(created);
  }));

  app.post("/api/purchases/:id/receive", asyncHandler(async (req, res) => {
    const body = z.object({ actorId: z.string().min(1) }).parse(req.body);
    const updated = await receivePurchase(String(req.params.id), body.actorId);
    res.json(updated);
  }));

  const parseUploadHandler = async (req: express.Request, res: express.Response) => {
    const schema = z.object({
      text: z.string().optional()
    });

    let text = "";
    if (typeof req.body?.text === "string") {
      text = req.body.text;
    } else {
      schema.parse(req.body);
    }

    const file = (req as express.Request & { file?: Express.Multer.File }).file;
    if (!text && file) {
      text = file.buffer.toString("utf-8");
    }

    if (!text.trim()) {
      throw new Error("Нужен текст или файл со списком.");
    }

    const parsed = await parseEquipmentList(text);
    res.json(parsed);
  };

  app.post("/api/requests/parse-list", upload.single("file"), asyncHandler(parseUploadHandler));
  app.post("/api/uploads/parse-list", upload.single("file"), asyncHandler(parseUploadHandler));

  app.post("/api/ai/query", asyncHandler(async (req, res) => {
    const schema = z.object({
      message: z.string().optional(),
      query: z.string().optional(),
      employeeId: z.string().optional(),
      sessionId: z.string().nullable().optional()
    });

    const input = schema.parse(req.body);
    const message = input.message ?? input.query;
    if (!message) {
      throw new Error("Нужен текст запроса.");
    }

    const result = await askAssistant({
      ...input,
      message,
      sessionKey: input.sessionId ?? `employee:${input.employeeId ?? "guest"}`
    });
    res.json(result);
  }));

  if (webDistDir) {
    app.use(express.static(webDistDir));
    app.get(/^(?!\/api(?:\/|$)|\/health$).*/, (_req, res) => {
      res.sendFile(path.join(webDistDir, "index.html"));
    });
  }

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера.";
      const status = /валид|прав|найден|остатк|ячейк|нужен/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  );

  return app;
}
