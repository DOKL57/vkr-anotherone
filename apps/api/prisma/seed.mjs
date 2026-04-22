import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString });

async function one(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0];
}

async function main() {
  const existing = await one('SELECT COUNT(*)::text AS count FROM "EquipmentCategory"');
  if (existing && Number(existing.count) > 0) {
    console.log("Seed skipped: data already exists");
    return;
  }

  const mic = await one('INSERT INTO "EquipmentCategory" ("id","name","description") VALUES (gen_random_uuid()::text,$1,$2) RETURNING id', ["Микрофоны", "Все типы микрофонов"]);
  const dyn = await one('INSERT INTO "EquipmentCategory" ("id","name","description","parentId") VALUES (gen_random_uuid()::text,$1,$2,$3) RETURNING id', ["Динамические микрофоны", "Сценические микрофоны", mic.id]);
  const radio = await one('INSERT INTO "EquipmentCategory" ("id","name","description") VALUES (gen_random_uuid()::text,$1,$2) RETURNING id', ["Радиосистемы", "Беспроводные комплекты"]);
  const cables = await one('INSERT INTO "EquipmentCategory" ("id","name","description") VALUES (gen_random_uuid()::text,$1,$2) RETURNING id', ["Кабели", "Сигнальные и силовые кабели"]);
  const monitors = await one('INSERT INTO "EquipmentCategory" ("id","name","description") VALUES (gen_random_uuid()::text,$1,$2) RETURNING id', ["Мониторы", "Сценические мониторы"]);
  const mixers = await one('INSERT INTO "EquipmentCategory" ("id","name","description") VALUES (gen_random_uuid()::text,$1,$2) RETURNING id', ["Пульты", "Микшерные пульты"]);

  const whMain = await one('INSERT INTO "Warehouse" ("id","name","description") VALUES (gen_random_uuid()::text,$1,$2) RETURNING id', ["Основной склад", "Главный склад компании"]);
  const whStage = await one('INSERT INTO "Warehouse" ("id","name","description") VALUES (gen_random_uuid()::text,$1,$2) RETURNING id', ["Склад сцены", "Оборудование для быстрых выездов"]);
  const whRoad = await one('INSERT INTO "Warehouse" ("id","name","description") VALUES (gen_random_uuid()::text,$1,$2) RETURNING id', ["Выездной кейс", "Комплекты для гастролей"]);

  const locA1 = await one('INSERT INTO "StorageLocation" ("id","warehouseId","zone","row","rack","cell","label") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6) RETURNING id', [whMain.id, "A", "1", "R1", "C1", "A-1-R1-C1"]);
  const locA2 = await one('INSERT INTO "StorageLocation" ("id","warehouseId","zone","row","rack","cell","label") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6) RETURNING id', [whMain.id, "A", "2", "R2", "C4", "A-2-R2-C4"]);
  const locB1 = await one('INSERT INTO "StorageLocation" ("id","warehouseId","zone","row","rack","cell","label") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6) RETURNING id', [whStage.id, "Сцена", "1", "Мон", "02", "Сцена-1-Мон-02"]);
  const locCase = await one('INSERT INTO "StorageLocation" ("id","warehouseId","zone","row","rack","cell","label") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6) RETURNING id', [whRoad.id, "Кейс", "1", "W", "7", "Кейс-1-W-7"]);

  const admin = await one('INSERT INTO "Employee" ("id","fullName","role","phone","email") VALUES (gen_random_uuid()::text,$1,$2::"EmployeeRole",$3,$4) RETURNING id', ["Смирнов Артем Павлович", "ADMIN", "+7 999 111-22-33", "admin@sound.local"]);
  const keeper = await one('INSERT INTO "Employee" ("id","fullName","role","phone","email") VALUES (gen_random_uuid()::text,$1,$2::"EmployeeRole",$3,$4) RETURNING id', ["Ковалев Игорь Сергеевич", "WAREHOUSE", "+7 999 222-33-44", "store@sound.local"]);
  const engineer = await one('INSERT INTO "Employee" ("id","fullName","role","phone","email") VALUES (gen_random_uuid()::text,$1,$2::"EmployeeRole",$3,$4) RETURNING id', ["Белова Марина Андреевна", "SOUND_ENGINEER", "+7 999 333-44-55", "engineer@sound.local"]);

  const project = await one('INSERT INTO "Project" ("id","name","venue","customer","startsAt","endsAt") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5) RETURNING id', ["Фестиваль Город Звук", "ДК Центральный", "ООО Ивент Групп", new Date("2026-05-01T10:00:00.000Z"), new Date("2026-05-03T23:00:00.000Z")]);

  const sm58a = await one('INSERT INTO "EquipmentItem" ("id","type","model","serialNumber","specs","status","notes","categoryId") VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5::"EquipmentStatus",$6,$7) RETURNING id', ["Микрофон", "Shure SM58", "SM58-001", JSON.stringify({ pattern: "кардиоидный", connector: "XLR", use: "вокал" }), "AVAILABLE", "Основной вокальный микрофон", dyn.id]);
  const sm58b = await one('INSERT INTO "EquipmentItem" ("id","type","model","serialNumber","specs","status","categoryId") VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5::"EquipmentStatus",$6) RETURNING id', ["Микрофон", "Shure SM58", "SM58-002", JSON.stringify({ pattern: "кардиоидный", connector: "XLR", use: "вокал" }), "IN_USE", dyn.id]);
  const ulxd = await one('INSERT INTO "EquipmentItem" ("id","type","model","serialNumber","specs","status","categoryId") VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5::"EquipmentStatus",$6) RETURNING id', ["Радиосистема", "Shure ULXD24/B58", "ULXD-018", JSON.stringify({ channels: 1, band: "G51", capsule: "Beta58" }), "REPAIR", radio.id]);
  const xlr = await one('INSERT INTO "EquipmentItem" ("id","type","model","serialNumber","specs","status","categoryId") VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5::"EquipmentStatus",$6) RETURNING id', ["Кабель", "Klotz XLR 10m", "XLR-10-021", JSON.stringify({ length: "10m", connector: "XLR-XLR", shielding: "двойной" }), "AVAILABLE", cables.id]);
  const monitor = await one('INSERT INTO "EquipmentItem" ("id","type","model","serialNumber","specs","status","categoryId") VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5::"EquipmentStatus",$6) RETURNING id', ["Монитор", "Yamaha DXR12", "DXR12-007", JSON.stringify({ power: "1100W", size: "12", type: "активный" }), "AVAILABLE", monitors.id]);
  const mixer = await one('INSERT INTO "EquipmentItem" ("id","type","model","serialNumber","specs","status","categoryId") VALUES (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5::"EquipmentStatus",$6) RETURNING id', ["Пульт", "Allen & Heath SQ-5", "SQ5-001", JSON.stringify({ channels: 48, mixBuses: 12, format: "digital" }), "AVAILABLE", mixers.id]);

  await pool.query('INSERT INTO "InventoryBalance" ("id","equipmentItemId","warehouseId","locationId","quantity") VALUES (gen_random_uuid()::text,$1,$2,$3,$4),(gen_random_uuid()::text,$5,$6,$7,$8),(gen_random_uuid()::text,$9,$10,$11,$12),(gen_random_uuid()::text,$13,$14,$15,$16),(gen_random_uuid()::text,$17,$18,$19,$20),(gen_random_uuid()::text,$21,$22,$23,$24)', [sm58a.id, whMain.id, locA1.id, 4, sm58b.id, whStage.id, locB1.id, 1, ulxd.id, whMain.id, locA2.id, 1, xlr.id, whMain.id, locA2.id, 24, monitor.id, whStage.id, locB1.id, 6, mixer.id, whRoad.id, locCase.id, 1]);

  await one('INSERT INTO "IssueRecord" ("id","equipmentItemId","quantity","employeeId","projectId","dueAt","status","issuedById","notes") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6::"IssueStatus",$7,$8)', [sm58b.id, 1, engineer.id, project.id, new Date("2026-05-04T20:00:00.000Z"), "OPEN", keeper.id, "Выдано на главный вокал"]);
  await one('INSERT INTO "RepairRecord" ("id","equipmentItemId","reason","diagnosis","etaDate","status","responsibleId") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5::"RepairStatus",$6)', [ulxd.id, "Потеря RF-сигнала", "Проблема в антенном модуле", new Date("2026-04-28T12:00:00.000Z"), "IN_PROGRESS", engineer.id]);
  await one('INSERT INTO "PurchaseRequest" ("id","equipmentItemId","title","supplier","cost","plannedDeliveryAt","linkedReason","usageStats","status","requesterId") VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8::"PurchaseStatus",$9)', [xlr.id, "Закупка XLR кабелей 10м", "ООО ПроАудио Снаб", "18500.00", new Date("2026-04-25T09:00:00.000Z"), "Дефицит на выездных проектах", "Средний расход 18-22 кабеля на мероприятие", "ORDERED", keeper.id]);

  await pool.query('INSERT INTO "OperationHistory" ("id","type","equipmentItemId","quantity","fromWarehouseId","fromLocationId","toWarehouseId","toLocationId","actorEmployeeId","metadata") VALUES (gen_random_uuid()::text,$1::"OperationType",$2,$3,$4,$5,$6,$7,$8,$9::jsonb),(gen_random_uuid()::text,$10::"OperationType",$11,$12,$13,$14,$15,$16,$17,$18::jsonb),(gen_random_uuid()::text,$19::"OperationType",$20,$21,$22,$23,$24,$25,$26,$27::jsonb)', ["ISSUE", sm58b.id, 1, whStage.id, locB1.id, null, null, keeper.id, JSON.stringify({ project: "Фестиваль Город Звук", note: "Выдача на фестиваль" }), "REPAIR_SENT", ulxd.id, 1, whMain.id, locA2.id, null, null, engineer.id, JSON.stringify({ service: "Audio Lab", defect: "Потеря RF-сигнала" }), "PURCHASE_REQUEST", xlr.id, 10, null, null, whMain.id, locA2.id, keeper.id, JSON.stringify({ supplier: "ООО ПроАудио Снаб" })]);

  const session = await one('INSERT INTO "ChatSession" ("id","title","lastIntent","contextJson") VALUES (gen_random_uuid()::text,$1,$2,$3::jsonb) RETURNING id', ["Поиск вокального комплекта", "availability_lookup", JSON.stringify({ requested: ["Shure SM58", "XLR"], project: "Фестиваль Город Звук" })]);
  await pool.query('INSERT INTO "ChatMessage" ("id","sessionId","role","content") VALUES (gen_random_uuid()::text,$1,$2::"MessageRole",$3),(gen_random_uuid()::text,$4,$5::"MessageRole",$6)', [session.id, "USER", "Нужны 2 SM58 и 4 XLR на фестиваль", session.id, "ASSISTANT", "На основном складе есть 4 Shure SM58 и 24 кабеля Klotz XLR 10m. Один SM58 уже в работе на проекте."]);
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
