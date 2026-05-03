import type { BootstrapData, Equipment, Issue, Project, Purchase, Repair } from "./api.js";

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    AVAILABLE: "Доступно",
    PARTIAL: "Частично",
    RESERVED: "Резерв",
    IN_USE: "В работе",
    IN_REPAIR: "В ремонте",
    REPAIR: "В ремонте",
    RETIRED: "Списано",
    OPEN: "Открыто",
    CLOSED: "Закрыто",
    OVERDUE: "Просрочено",
    RETURNED: "Возвращено",
    IN_PROGRESS: "В процессе",
    DONE: "Готово",
    DRAFT: "Черновик",
    REQUESTED: "Запрошено",
    ORDERED: "Заказано",
    DELIVERED: "Поставлено",
    CANCELLED: "Отменено"
  };
  return map[status] ?? status;
}

export function roleLabel(role: string) {
  const map: Record<string, string> = {
    ADMIN: "Администратор",
    WAREHOUSE: "Кладовщик",
    SOUND_ENGINEER: "Звукорежиссёр"
  };
  return map[role] ?? role;
}

export function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "-";
}

export function normalize(value: string) {
  return value.toLowerCase().replace(/[^а-яa-z0-9\s-]/gi, " ").replace(/\s+/g, " ").trim();
}

export function page<T>(rows: T[], pageNumber: number, size = 8) {
  const start = Math.max(0, pageNumber) * size;
  return rows.slice(start, start + size);
}

export function dashboardText(data: BootstrapData) {
  return [
    "Сводка",
    `Оборудование: ${data.dashboard.equipmentCount}`,
    `Доступно: ${data.dashboard.availableUnits} шт.`,
    `В работе: ${data.dashboard.inUseUnits} шт.`,
    `В ремонте: ${data.dashboard.inRepairUnits} шт.`,
    `Открытые выдачи: ${data.dashboard.openIssues}`,
    `Просрочено: ${data.dashboard.overdueIssues}`,
    `Открытые ремонты: ${data.dashboard.openRepairs}`,
    `Активные закупки: ${data.dashboard.activePurchases}`
  ].join("\n");
}

export function equipmentText(rows: Equipment[]) {
  if (rows.length === 0) return "Оборудование не найдено.";
  return rows.map((item, index) => {
    const locations = item.locations.length
      ? item.locations.map((location) => `${location.label}: ${location.quantity}`).join("; ")
      : "нет на складе";

    return [
      `${index + 1}. ${item.name} ${item.model}`,
      `Тип: ${item.type}. Категория: ${item.categoryName}`,
      `Статус: ${statusLabel(item.status)}. Доступно: ${item.available}. В работе: ${item.inUse}. Ремонт: ${item.inRepair}.`,
      `Склад: ${locations}`
    ].join("\n");
  }).join("\n\n");
}

export function issuesText(rows: Issue[]) {
  if (rows.length === 0) return "Выдач нет.";
  return rows.map((issue, index) => {
    const items = issue.items.map((item) => `${item.equipment.name} ${item.equipment.model} x${item.quantity}`).join(", ");
    return [
      `${index + 1}. ${issue.purpose}${issue.project ? ` (${issue.project.name})` : ""}`,
      `ID: ${issue.id}`,
      `Статус: ${statusLabel(issue.status)}. Вернуть: ${fmtDate(issue.dueAt)}.`,
      `Ответственный: ${issue.assignedEmployee?.fullName ?? "нет"}`,
      items
    ].join("\n");
  }).join("\n\n");
}

export function repairsText(rows: Repair[]) {
  if (rows.length === 0) return "Ремонтов нет.";
  return rows.map((repair, index) => [
    `${index + 1}. ${repair.equipment.name} ${repair.equipment.model} x${repair.quantity}`,
    `Статус: ${statusLabel(repair.status)}. Причина: ${repair.reason}`,
    repair.diagnosis ? `Диагноз: ${repair.diagnosis}` : null,
    `Готовность: ${fmtDate(repair.estimatedReadyAt)}. Ответственный: ${repair.responsible?.fullName ?? "нет"}`
  ].filter(Boolean).join("\n")).join("\n\n");
}

export function purchasesText(rows: Purchase[]) {
  if (rows.length === 0) return "Закупок нет.";
  return rows.map((purchase, index) => {
    const items = purchase.items.map((item) => {
      const mode = item.mode === "new" ? "новая позиция" : "пополнение";
      const location = item.locationLabel ? `, приёмка: ${item.locationLabel}` : "";
      return `${item.itemName} x${item.quantity} (${mode}${location})`;
    }).join(", ");
    return [
      `${index + 1}. ${purchase.title}`,
      `Поставщик: ${purchase.supplierName}. Статус: ${statusLabel(purchase.status)}.`,
      `План: ${fmtDate(purchase.plannedDeliveryAt)}. ${items}`
    ].join("\n");
  }).join("\n\n");
}

export function projectsText(rows: Project[]) {
  const activeRows = rows.filter((project) => !project.archivedAt);
  if (activeRows.length === 0) return "Активных мероприятий нет.";
  return activeRows.map((project, index) => [
    `${index + 1}. ${project.name}`,
    `Сроки: ${project.startDate ? fmtDate(project.startDate) : "без начала"} - ${project.endDate ? fmtDate(project.endDate) : "без окончания"}.`,
    `Заказчик: ${project.customer ?? "не указан"}. Площадка: ${project.location ?? "не указана"}.`,
    project.comment ? `Комментарий: ${project.comment}` : null
  ].filter(Boolean).join("\n")).join("\n\n");
}

export function employeesText(data: BootstrapData) {
  return data.employees
    .map((employee, index) => `${index + 1}. ${employee.fullName} - ${roleLabel(employee.role)}`)
    .join("\n");
}

export function userHelpText() {
  return [
    "Команды",
    "/login user pass - вход",
    "/logout - выход",
    "/dashboard - сводка",
    "/catalog [поиск] - каталог",
    "/employees - сотрудники",
    "/projects - мероприятия",
    "/issues - выдачи",
    "/repairs - ремонты",
    "/purchases - закупки",
    "/ai вопрос - AI-помощник",
    "/new_project - создать мероприятие",
    "/hide_past_projects - скрыть прошедшие мероприятия",
    "/new_issue - создать выдачу",
    "/new_repair - создать ремонт",
    "/new_purchase_existing - закупка существующей позиции",
    "/new_purchase_new - закупка новой позиции",
    "/return_issue ID - принять выдачу",
    "/receive_purchase ID - принять закупку",
    "",
    "Формы вводятся одной строкой. Бот подскажет формат."
  ].join("\n");
}
