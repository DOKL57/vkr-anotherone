import dotenv from "dotenv";
import { Pool, type QueryResultRow } from "pg";
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

const pool = new Pool({ connectionString });

async function one<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  const result = await pool.query<T>(sql, params);
  return result.rows[0];
}

async function main() {
  const existing = await one<{ count: string }>("SELECT COUNT(*)::text AS count FROM equipment_category");
  if (existing && Number(existing.count) > 0) {
    console.log("Seed skipped: data already exists");
    return;
  }

  await pool.query(
    `INSERT INTO user_role (id, name, description) VALUES
      ('admin', 'ADMIN', 'Полный доступ к системе'),
      ('warehouse', 'WAREHOUSE', 'Складские операции и учёт'),
      ('sound_engineer', 'SOUND_ENGINEER', 'Поиск оборудования и контроль возвратов')`
  );

  await pool.query(
    `INSERT INTO equipment_status (id, name, description) VALUES
      ('available', 'AVAILABLE', 'Полностью доступно'),
      ('partial', 'PARTIAL', 'Часть единиц занята'),
      ('in_use', 'IN_USE', 'Все единицы выданы'),
      ('in_repair', 'IN_REPAIR', 'Все единицы в ремонте'),
      ('retired', 'RETIRED', 'Списано')`
  );

  const mic = await one<{ id: string }>(
    "INSERT INTO equipment_category (id, name, description) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
    ["Микрофоны", "Вокальные и инструментальные микрофоны"]
  );
  const radio = await one<{ id: string }>(
    "INSERT INTO equipment_category (id, name, description) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
    ["Радиосистемы", "Беспроводные системы"]
  );
  const cables = await one<{ id: string }>(
    "INSERT INTO equipment_category (id, name, description) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
    ["Кабели", "Коммутация и сигнальные линии"]
  );
  const monitors = await one<{ id: string }>(
    "INSERT INTO equipment_category (id, name, description) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
    ["Мониторы", "Сценические мониторы"]
  );
  const mixers = await one<{ id: string }>(
    "INSERT INTO equipment_category (id, name, description) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
    ["Пульты", "Микшерные консоли"]
  );

  const whMain = await one<{ id: string }>(
    "INSERT INTO warehouse (id, name, description) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
    ["Основной склад", "Главный склад компании"]
  );
  const whStage = await one<{ id: string }>(
    "INSERT INTO warehouse (id, name, description) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
    ["Склад сцены", "Оперативный склад для выездов"]
  );
  const whRoad = await one<{ id: string }>(
    "INSERT INTO warehouse (id, name, description) VALUES (gen_random_uuid()::text, $1, $2) RETURNING id",
    ["Выездной кейс", "Комплекты для гастролей"]
  );

  const locA1 = await one<{ id: string }>(
    `INSERT INTO storage_location (id, warehouse_id, zone, row_number, rack, cell, note)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6) RETURNING id`,
    [whMain.id, "A", "1", "R1", "C1", "Основной стеллаж"]
  );
  const locA2 = await one<{ id: string }>(
    `INSERT INTO storage_location (id, warehouse_id, zone, row_number, rack, cell, note)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6) RETURNING id`,
    [whMain.id, "A", "2", "R2", "C4", "Радио и кабели"]
  );
  const locB1 = await one<{ id: string }>(
    `INSERT INTO storage_location (id, warehouse_id, zone, row_number, rack, cell, note)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6) RETURNING id`,
    [whStage.id, "Сцена", "1", "MON", "02", "Мониторная зона"]
  );
  const locCase = await one<{ id: string }>(
    `INSERT INTO storage_location (id, warehouse_id, zone, row_number, rack, cell, note)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6) RETURNING id`,
    [whRoad.id, "Кейс", "1", "W", "7", "Гастрольный комплект"]
  );

  const admin = await one<{ id: string }>(
    "INSERT INTO employee (id, full_name, phone, email, position) VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING id",
    ["Смирнов Артём Павлович", "+7 999 111-22-33", "admin@sound.local", "Руководитель"]
  );
  const keeper = await one<{ id: string }>(
    "INSERT INTO employee (id, full_name, phone, email, position) VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING id",
    ["Ковалёв Игорь Сергеевич", "+7 999 222-33-44", "store@sound.local", "Кладовщик"]
  );
  const engineer = await one<{ id: string }>(
    "INSERT INTO employee (id, full_name, phone, email, position) VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING id",
    ["Белова Марина Андреевна", "+7 999 333-44-55", "engineer@sound.local", "Звукорежиссёр"]
  );

  const adminUser = await one<{ id: string }>(
    "INSERT INTO app_user (id, role_id, employee_id, telegram_id, username, status) VALUES (gen_random_uuid()::text, 'admin', $1, $2, $3, 'ACTIVE') RETURNING id",
    [admin.id, "100100100", "artem_admin"]
  );
  await one(
    "INSERT INTO app_user (id, role_id, employee_id, telegram_id, username, status) VALUES (gen_random_uuid()::text, 'warehouse', $1, $2, $3, 'ACTIVE') RETURNING id",
    [keeper.id, "200200200", "store_keeper"]
  );
  const engineerUser = await one<{ id: string }>(
    "INSERT INTO app_user (id, role_id, employee_id, telegram_id, username, status) VALUES (gen_random_uuid()::text, 'sound_engineer', $1, $2, $3, 'ACTIVE') RETURNING id",
    [engineer.id, "300300300", "mix_maryna"]
  );

  const project = await one<{ id: string }>(
    `INSERT INTO project (id, name, customer, location, start_date, end_date, comment)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      "Фестиваль Город Звук",
      "ООО Ивент Групп",
      "ДК Центральный",
      new Date("2026-05-01T10:00:00.000Z"),
      new Date("2026-05-03T23:00:00.000Z"),
      "Весенний городской фестиваль"
    ]
  );

  const sm58a = await one<{ id: string }>(
    `INSERT INTO equipment (id, category_id, status_id, name, model, serial_number, specifications, note)
     VALUES (gen_random_uuid()::text, $1, 'available', $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [
      mic.id,
      "Микрофон",
      "Shure SM58",
      "SM58-001",
      JSON.stringify({
        type: "Микрофон",
        manufacturer: "Shure",
        minStock: 2,
        technicalSpecs: { pattern: "кардиоидный", connector: "XLR", use: "вокал" }
      }),
      "Основной вокальный микрофон"
    ]
  );
  const sm58b = await one<{ id: string }>(
    `INSERT INTO equipment (id, category_id, status_id, name, model, serial_number, specifications, note)
     VALUES (gen_random_uuid()::text, $1, 'in_use', $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [
      mic.id,
      "Микрофон",
      "Shure SM58",
      "SM58-002",
      JSON.stringify({
        type: "Микрофон",
        manufacturer: "Shure",
        minStock: 2,
        technicalSpecs: { pattern: "кардиоидный", connector: "XLR", use: "вокал" }
      }),
      "Резервный вокальный микрофон"
    ]
  );
  const ulxd = await one<{ id: string }>(
    `INSERT INTO equipment (id, category_id, status_id, name, model, serial_number, specifications, note)
     VALUES (gen_random_uuid()::text, $1, 'in_repair', $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [
      radio.id,
      "Радиосистема",
      "Shure ULXD24/B58",
      "ULXD-018",
      JSON.stringify({
        type: "Радиосистема",
        manufacturer: "Shure",
        minStock: 1,
        technicalSpecs: { channels: "1", band: "G51", capsule: "Beta58" }
      }),
      "Нужна диагностика RF тракта"
    ]
  );
  const xlr = await one<{ id: string }>(
    `INSERT INTO equipment (id, category_id, status_id, name, model, serial_number, specifications, note)
     VALUES (gen_random_uuid()::text, $1, 'available', $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [
      cables.id,
      "Кабель",
      "Klotz XLR 10m",
      "XLR-10-021",
      JSON.stringify({
        type: "Кабель",
        manufacturer: "Klotz",
        minStock: 10,
        technicalSpecs: { length: "10m", connector: "XLR-XLR", shielding: "двойной" }
      }),
      "Основной сценический кабель"
    ]
  );
  const monitor = await one<{ id: string }>(
    `INSERT INTO equipment (id, category_id, status_id, name, model, serial_number, specifications, note)
     VALUES (gen_random_uuid()::text, $1, 'available', $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [
      monitors.id,
      "Монитор",
      "Yamaha DXR12",
      "DXR12-007",
      JSON.stringify({
        type: "Монитор",
        manufacturer: "Yamaha",
        minStock: 2,
        technicalSpecs: { power: "1100W", size: "12", mode: "активный" }
      }),
      "Сценический монитор"
    ]
  );
  const mixer = await one<{ id: string }>(
    `INSERT INTO equipment (id, category_id, status_id, name, model, serial_number, specifications, note)
     VALUES (gen_random_uuid()::text, $1, 'available', $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [
      mixers.id,
      "Пульт",
      "Allen & Heath SQ-5",
      "SQ5-001",
      JSON.stringify({
        type: "Пульт",
        manufacturer: "Allen & Heath",
        minStock: 1,
        technicalSpecs: { channels: "48", mixBuses: "12", format: "digital" }
      }),
      "Основная цифровая консоль"
    ]
  );

  await pool.query(
    `INSERT INTO inventory_balance (id, equipment_id, location_id, quantity) VALUES
      (gen_random_uuid()::text, $1, $2, 4),
      (gen_random_uuid()::text, $3, $4, 1),
      (gen_random_uuid()::text, $5, $6, 1),
      (gen_random_uuid()::text, $7, $8, 24),
      (gen_random_uuid()::text, $9, $10, 6),
      (gen_random_uuid()::text, $11, $12, 1)`,
    [sm58a.id, locA1.id, sm58b.id, locB1.id, ulxd.id, locA2.id, xlr.id, locA2.id, monitor.id, locB1.id, mixer.id, locCase.id]
  );

  const issue = await one<{ id: string }>(
    `INSERT INTO issue_operation (id, project_id, employee_id, issue_date, planned_return_date, comment)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5) RETURNING id`,
    [
      project.id,
      engineer.id,
      new Date("2026-04-20T10:00:00.000Z"),
      new Date("2026-05-04T20:00:00.000Z"),
      "Выдача на главный вокал"
    ]
  );
  const issueItem = await one<{ id: string }>(
    "INSERT INTO issue_item (id, issue_id, equipment_id, quantity) VALUES (gen_random_uuid()::text, $1, $2, $3) RETURNING id",
    [issue.id, sm58b.id, 1]
  );
  await pool.query(
    `INSERT INTO operation_log (id, user_id, action, details) VALUES
      (gen_random_uuid()::text, $1, 'ISSUE_CREATED', $2::jsonb),
      (gen_random_uuid()::text, $1, 'ISSUE_ALLOCATION', $3::jsonb)`,
    [
      adminUser.id,
      JSON.stringify({ issueId: issue.id, warehouseId: whStage.id, issuedById: keeper.id, notes: "Выдано на фестиваль" }),
      JSON.stringify({
        issueId: issue.id,
        issueItemId: issueItem.id,
        equipmentId: sm58b.id,
        allocations: [{ locationId: locB1.id, quantity: 1 }]
      })
    ]
  );

  const repair = await one<{ id: string }>(
    `INSERT INTO repair (id, equipment_id, start_date, planned_end_date, reason, description, status)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'IN_PROGRESS') RETURNING id`,
    [
      ulxd.id,
      new Date("2026-04-19T09:00:00.000Z"),
      new Date("2026-04-28T12:00:00.000Z"),
      "Потеря RF-сигнала",
      "Проблема в антенном модуле"
    ]
  );
  await one(
    "INSERT INTO operation_log (id, user_id, action, details) VALUES (gen_random_uuid()::text, $1, 'REPAIR_CREATED', $2::jsonb) RETURNING id",
    [
      adminUser.id,
      JSON.stringify({
        repairId: repair.id,
        equipmentId: ulxd.id,
        warehouseId: whMain.id,
        locationId: locA2.id,
        quantity: 1,
        responsibleId: engineer.id
      })
    ]
  );

  const purchaseId = crypto.randomUUID();
  await one(
    "INSERT INTO operation_log (id, user_id, action, details) VALUES (gen_random_uuid()::text, $1, 'PURCHASE_CREATED', $2::jsonb) RETURNING id",
    [
      adminUser.id,
      JSON.stringify({
        purchaseId,
        title: "Закупка XLR кабелей 10м",
        supplierName: "ООО ПроАудио Снаб",
        plannedDeliveryAt: "2026-04-25T09:00:00.000Z",
        reason: "Дефицит на выездных проектах",
        status: "ORDERED",
        items: [{ equipmentId: xlr.id, itemName: "Klotz XLR 10m", quantity: 10 }]
      })
    ]
  );

  await one(
    "INSERT INTO ai_query_log (id, user_id, query_text, response_text, status) VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING id",
    [
      engineerUser.id,
      "Нужны 2 SM58 и 4 XLR на фестиваль",
      "На складе есть 4 Shure SM58 и 24 кабеля Klotz XLR 10m.",
      "SUCCESS"
    ]
  );
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
