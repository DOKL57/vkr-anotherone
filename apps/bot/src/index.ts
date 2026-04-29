import TelegramBot from "node-telegram-bot-api";
import { apiFetch, askAi, bootstrap, login, logout } from "./api.js";
import type { BootstrapData } from "./api.js";
import { env } from "./env.js";
import {
  dashboardText,
  employeesText,
  equipmentText,
  issuesText,
  normalize,
  purchasesText,
  repairsText,
  roleLabel,
  userHelpText
} from "./format.js";
import { clearSession, getSession, loadSessions, saveSessions, updateSession } from "./session.js";

type Msg = TelegramBot.Message;

const loginHint = "Вход: /login логин пароль";
const buttons = {
  login: "Войти",
  dashboard: "Сводка",
  catalog: "Каталог",
  search: "Поиск",
  ai: "AI-помощник",
  employees: "Сотрудники",
  issues: "Выдачи",
  repairs: "Ремонты",
  purchases: "Закупки",
  createIssue: "Создать выдачу",
  createRepair: "Создать ремонт",
  createPurchase: "Создать закупку",
  returnIssue: "Принять выдачу",
  completeRepair: "Завершить ремонт",
  receivePurchase: "Принять закупку",
  menu: "Главное меню",
  help: "Помощь",
  cancel: "Отмена",
  logout: "Выйти"
} as const;

function menuKeyboard(role?: string): TelegramBot.SendMessageOptions {
  const canMutate = role === "ADMIN" || role === "WAREHOUSE";
  const row = (...items: string[]): TelegramBot.KeyboardButton[] => items.map((text) => ({ text }));
  return {
    reply_markup: {
      resize_keyboard: true,
      keyboard: [
        row(buttons.dashboard, buttons.catalog),
        row(buttons.search, buttons.ai),
        row(buttons.issues, buttons.repairs, buttons.purchases),
        row(buttons.employees, buttons.help),
        ...(canMutate
          ? [
              row(buttons.createIssue, buttons.createRepair),
              row(buttons.createPurchase),
              row(buttons.returnIssue, buttons.completeRepair),
              row(buttons.receivePurchase)
            ]
          : []),
        row(buttons.logout)
      ]
    }
  };
}

function loginKeyboard(): TelegramBot.SendMessageOptions {
  const row = (...items: string[]): TelegramBot.KeyboardButton[] => items.map((text) => ({ text }));
  return {
    reply_markup: {
      resize_keyboard: true,
      keyboard: [row(buttons.login), row(buttons.help)]
    }
  };
}

function cancelKeyboard(): TelegramBot.SendMessageOptions {
  const row = (...items: string[]): TelegramBot.KeyboardButton[] => items.map((text) => ({ text }));
  return {
    reply_markup: {
      resize_keyboard: true,
      keyboard: [row(buttons.cancel), row(buttons.menu)]
    }
  };
}

async function sendMenu(bot: TelegramBot, chatId: number, text = "Выберите действие.") {
  const role = getSession(chatId).auth?.employee.role;
  await bot.sendMessage(chatId, text, role ? menuKeyboard(role) : loginKeyboard());
}

function requireToken(chatId: number) {
  const token = getSession(chatId).auth?.token;
  if (!token) throw new Error(loginHint);
  return token;
}

function canEdit(data: BootstrapData) {
  const role = data.currentUser.role;
  return role === "ADMIN" || role === "WAREHOUSE";
}

function idByIndex<T extends { id: string }>(rows: T[], value: string) {
  const trimmed = value.trim();
  const index = Number(trimmed);
  if (Number.isInteger(index) && index > 0 && index <= rows.length) return rows[index - 1]?.id;
  return trimmed;
}

function parsePairs(text: string) {
  const pairs: Record<string, string> = {};
  for (const part of text.split(";")) {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValue.join("=").trim();
    if (key && value) pairs[key] = value;
  }
  return pairs;
}

function firstText(msg: Msg) {
  return msg.text?.trim() ?? "";
}

async function sendLong(bot: TelegramBot, chatId: number, text: string) {
  const limit = 3900;
  if (text.length <= limit) {
    await bot.sendMessage(chatId, text);
    return;
  }

  for (let i = 0; i < text.length; i += limit) {
    await bot.sendMessage(chatId, text.slice(i, i + limit));
  }
}

async function sendLongWithMenu(bot: TelegramBot, chatId: number, text: string) {
  await sendLong(bot, chatId, text);
  await sendMenu(bot, chatId);
}

async function withData<T>(chatId: number, fn: (token: string, data: BootstrapData) => Promise<T>) {
  const token = requireToken(chatId);
  const data = await bootstrap(token);
  updateSession(chatId, {
    auth: {
      token,
      employee: data.currentUser
    }
  });
  return fn(token, data);
}

async function handlePending(bot: TelegramBot, msg: Msg) {
  const chatId = msg.chat.id;
  const session = getSession(chatId);
  const text = firstText(msg);
  if (!session.pending || text.startsWith("/")) return false;

  if (text === buttons.cancel || text === buttons.menu) {
    updateSession(chatId, { pending: undefined });
    await sendMenu(bot, chatId);
    return true;
  }

  try {
    if (session.pending.type === "login") {
      const [username, ...passwordParts] = text.split(/\s+/);
      const password = passwordParts.join(" ");
      if (!username || !password) throw new Error(loginHint);
      const auth = await login(username, password);
      updateSession(chatId, { auth, pending: undefined, aiSessionId: null });
      await sendMenu(bot, chatId, `Вход выполнен: ${auth.employee.fullName} (${roleLabel(auth.employee.role)})`);
      return true;
    }

    if (session.pending.type === "ai") {
      await handleAi(bot, msg, text);
      updateSession(chatId, { pending: undefined });
      return true;
    }

    if (session.pending.type === "search") {
      await handleCatalog(bot, msg, text === "all" ? "" : text);
      updateSession(chatId, { pending: undefined });
      return true;
    }

    if (session.pending.type === "issue") {
      await createIssueFromText(bot, chatId, text);
      updateSession(chatId, { pending: undefined });
      return true;
    }

    if (session.pending.type === "repair") {
      await createRepairFromText(bot, chatId, text);
      updateSession(chatId, { pending: undefined });
      return true;
    }

    if (session.pending.type === "purchase") {
      await createPurchaseFromText(bot, chatId, text);
      updateSession(chatId, { pending: undefined });
      return true;
    }

    if (session.pending.type === "return_issue") {
      await returnIssue(bot, msg, text);
      updateSession(chatId, { pending: undefined });
      return true;
    }

    if (session.pending.type === "complete_repair") {
      await completeRepair(bot, msg, text);
      updateSession(chatId, { pending: undefined });
      return true;
    }

    if (session.pending.type === "receive_purchase") {
      await receivePurchase(bot, msg, text);
      updateSession(chatId, { pending: undefined });
      return true;
    }
  } catch (error) {
    await bot.sendMessage(chatId, formatError(error), cancelKeyboard());
    return true;
  }

  return false;
}

function formatError(error: unknown) {
  return String(error instanceof Error ? error.message : error).replace(/^Error:\s*/i, "");
}

async function handleLogin(bot: TelegramBot, msg: Msg, args: string) {
  const chatId = msg.chat.id;
  const [username, ...passwordParts] = args.trim().split(/\s+/);
  const password = passwordParts.join(" ");

  if (!username || !password) {
    updateSession(chatId, { pending: { type: "login" } });
    await bot.sendMessage(chatId, loginHint, cancelKeyboard());
    return;
  }

  const auth = await login(username, password);
  updateSession(chatId, { auth, aiSessionId: null, pending: undefined });
  await sendMenu(bot, chatId, `Вход выполнен: ${auth.employee.fullName} (${roleLabel(auth.employee.role)})`);
}

async function handleLogout(bot: TelegramBot, msg: Msg) {
  const chatId = msg.chat.id;
  const token = getSession(chatId).auth?.token;
  if (token) {
    try {
      await logout(token);
    } catch {
      // local logout enough
    }
  }
  clearSession(chatId);
  await bot.sendMessage(chatId, "Выход выполнен.", loginKeyboard());
}

async function handleDashboard(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    await sendLongWithMenu(bot, msg.chat.id, dashboardText(data));
  });
}

async function handleEmployees(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    await sendLongWithMenu(bot, msg.chat.id, employeesText(data));
  });
}

async function handleCatalog(bot: TelegramBot, msg: Msg, query: string) {
  await withData(msg.chat.id, async (_token, data) => {
    const terms = normalize(query);
    const rows = terms
      ? data.equipment.filter((item) => normalize(`${item.name} ${item.model} ${item.type} ${item.categoryName} ${item.serialNumber ?? ""}`).includes(terms))
      : data.equipment;

    await sendLongWithMenu(bot, msg.chat.id, equipmentText(rows.slice(0, 20)));
  });
}

async function handleIssues(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    await sendLongWithMenu(bot, msg.chat.id, issuesText(data.issues));
  });
}

async function handleRepairs(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    await sendLongWithMenu(bot, msg.chat.id, repairsText(data.repairs));
  });
}

async function handlePurchases(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    await sendLongWithMenu(bot, msg.chat.id, purchasesText(data.purchases));
  });
}

async function handleAi(bot: TelegramBot, msg: Msg, query: string) {
  if (!query.trim()) {
    updateSession(msg.chat.id, { pending: { type: "ai" } });
    await bot.sendMessage(msg.chat.id, "Напишите вопрос для AI-помощника.", cancelKeyboard());
    return;
  }

  const token = requireToken(msg.chat.id);
  const session = getSession(msg.chat.id);
  const result = await askAi(token, query, session.aiSessionId);
  updateSession(msg.chat.id, { aiSessionId: result.sessionId });
  await sendLongWithMenu(bot, msg.chat.id, `Ответ (${result.intent}):\n${result.answer}`);
}

async function promptIssue(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    updateSession(msg.chat.id, { pending: { type: "issue" } });
    await sendLong(bot, msg.chat.id, [
      "Новая выдача. Формат:",
      "equipment=1; qty=1; warehouse=1; due=2026-05-01T18:00; project=1; employee=1; purpose=Выдача на проект",
      "",
      "Оборудование:",
      data.equipment.map((item, i) => `${i + 1}. ${item.name} ${item.model}`).slice(0, 30).join("\n"),
      "",
      "Склады:",
      data.warehouses.map((item, i) => `${i + 1}. ${item.name}`).join("\n")
    ].join("\n"));
    await bot.sendMessage(msg.chat.id, "Отправьте строку с полями или нажмите Отмена.", cancelKeyboard());
  });
}

async function promptRepair(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    updateSession(msg.chat.id, { pending: { type: "repair" } });
    await sendLong(bot, msg.chat.id, [
      "Новый ремонт. Формат:",
      "equipment=1; qty=1; warehouse=1; location=1; reason=Не включается; diagnosis=; ready=2026-05-01T18:00; responsible=1",
      "",
      "Оборудование:",
      data.equipment.map((item, i) => `${i + 1}. ${item.name} ${item.model}`).slice(0, 30).join("\n"),
      "",
      "Ячейки:",
      data.locations.map((item, i) => `${i + 1}. ${item.label}`).slice(0, 40).join("\n")
    ].join("\n"));
    await bot.sendMessage(msg.chat.id, "Отправьте строку с полями или нажмите Отмена.", cancelKeyboard());
  });
}

async function promptPurchase(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    updateSession(msg.chat.id, { pending: { type: "purchase" } });
    await sendLong(bot, msg.chat.id, [
      "Новая закупка. Формат:",
      "title=Заявка; supplier=Поставщик; equipment=1; item=Shure SM58; qty=1; planned=2026-05-01T18:00; reason=Пополнение склада",
      "",
      "equipment можно не указывать, если новая позиция.",
      "",
      "Оборудование:",
      data.equipment.map((item, i) => `${i + 1}. ${item.name} ${item.model}`).slice(0, 30).join("\n")
    ].join("\n"));
    await bot.sendMessage(msg.chat.id, "Отправьте строку с полями или нажмите Отмена.", cancelKeyboard());
  });
}

async function createIssueFromText(bot: TelegramBot, chatId: number, text: string) {
  await withData(chatId, async (token, data) => {
    const p = parsePairs(text);
    const equipmentId = idByIndex(data.equipment, p.equipment ?? "");
    const warehouseId = idByIndex(data.warehouses, p.warehouse ?? "");
    const projectId = p.project ? idByIndex(data.projects, p.project) : undefined;
    const assignedEmployeeId = p.employee ? idByIndex(data.employees, p.employee) : undefined;
    const dueAt = p.due ? new Date(p.due).toISOString() : "";

    await apiFetch("/api/issues", {
      method: "POST",
      body: JSON.stringify({
        actorId: data.currentUser.id,
        warehouseId,
        projectId,
        assignedEmployeeId,
        purpose: p.purpose ?? "Выдача на проект",
        dueAt,
        items: [{ equipmentId, quantity: Number(p.qty ?? 1) }]
      })
    }, token);

    await sendMenu(bot, chatId, "Выдача создана.");
  });
}

async function createRepairFromText(bot: TelegramBot, chatId: number, text: string) {
  await withData(chatId, async (token, data) => {
    const p = parsePairs(text);
    const equipmentId = idByIndex(data.equipment, p.equipment ?? "");
    const warehouseId = idByIndex(data.warehouses, p.warehouse ?? "");
    const locationId = idByIndex(data.locations, p.location ?? "");
    const responsibleId = p.responsible ? idByIndex(data.employees, p.responsible) : undefined;

    await apiFetch("/api/repairs", {
      method: "POST",
      body: JSON.stringify({
        actorId: data.currentUser.id,
        warehouseId,
        locationId,
        equipmentId,
        quantity: Number(p.qty ?? 1),
        reason: p.reason,
        diagnosis: p.diagnosis,
        estimatedReadyAt: p.ready ? new Date(p.ready).toISOString() : undefined,
        responsibleId
      })
    }, token);

    await sendMenu(bot, chatId, "Ремонт создан.");
  });
}

async function createPurchaseFromText(bot: TelegramBot, chatId: number, text: string) {
  await withData(chatId, async (token, data) => {
    const p = parsePairs(text);
    const equipmentId = p.equipment ? idByIndex(data.equipment, p.equipment) : undefined;
    const selected = equipmentId ? data.equipment.find((item) => item.id === equipmentId) : undefined;

    await apiFetch("/api/purchases", {
      method: "POST",
      body: JSON.stringify({
        actorId: data.currentUser.id,
        title: p.title,
        supplierName: p.supplier,
        plannedDeliveryAt: p.planned ? new Date(p.planned).toISOString() : undefined,
        reason: p.reason ?? "Закупка оборудования",
        items: [{
          equipmentId,
          itemName: p.item ?? (selected ? `${selected.name} ${selected.model}` : "Новая позиция"),
          quantity: Number(p.qty ?? 1)
        }]
      })
    }, token);

    await sendMenu(bot, chatId, "Закупка создана.");
  });
}

async function returnIssue(bot: TelegramBot, msg: Msg, issueId: string) {
  await withData(msg.chat.id, async (token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    const id = idByIndex(data.issues, issueId);
    await apiFetch(`/api/issues/${id}/return`, {
      method: "POST",
      body: JSON.stringify({ actorId: data.currentUser.id })
    }, token);
    await sendMenu(bot, msg.chat.id, "Выдача принята на склад.");
  });
}

async function completeRepair(bot: TelegramBot, msg: Msg, repairId: string) {
  await withData(msg.chat.id, async (token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    const id = idByIndex(data.repairs, repairId);
    await apiFetch(`/api/repairs/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ actorId: data.currentUser.id })
    }, token);
    await sendMenu(bot, msg.chat.id, "Ремонт завершён.");
  });
}

async function receivePurchase(bot: TelegramBot, msg: Msg, purchaseId: string) {
  await withData(msg.chat.id, async (token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    const id = idByIndex(data.purchases, purchaseId);
    await apiFetch(`/api/purchases/${id}/receive`, {
      method: "POST",
      body: JSON.stringify({ actorId: data.currentUser.id })
    }, token);
    await sendMenu(bot, msg.chat.id, "Закупка принята.");
  });
}

async function promptReturnIssue(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    updateSession(msg.chat.id, { pending: { type: "return_issue" } });
    await sendLong(bot, msg.chat.id, issuesText(data.issues));
    await bot.sendMessage(msg.chat.id, "Отправьте номер или ID выдачи для приёма на склад.", cancelKeyboard());
  });
}

async function promptCompleteRepair(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    updateSession(msg.chat.id, { pending: { type: "complete_repair" } });
    await sendLong(bot, msg.chat.id, repairsText(data.repairs));
    await bot.sendMessage(msg.chat.id, "Отправьте номер или ID ремонта для завершения.", cancelKeyboard());
  });
}

async function promptReceivePurchase(bot: TelegramBot, msg: Msg) {
  await withData(msg.chat.id, async (_token, data) => {
    if (!canEdit(data)) throw new Error("Нет прав. Нужна роль ADMIN или WAREHOUSE.");
    updateSession(msg.chat.id, { pending: { type: "receive_purchase" } });
    await sendLong(bot, msg.chat.id, purchasesText(data.purchases));
    await bot.sendMessage(msg.chat.id, "Отправьте номер или ID закупки для приёма.", cancelKeyboard());
  });
}

async function main() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN missing. Put token to .env.");
  }

  loadSessions();
  const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, {
    polling: {
      interval: env.BOT_POLLING_INTERVAL,
      autoStart: true
    },
    baseApiUrl: env.TELEGRAM_BOT_API_URL
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = firstText(msg);

    try {
      if (await handlePending(bot, msg)) return;

      const [commandRaw, ...rest] = text.split(/\s+/);
      const command = commandRaw?.split("@")[0];
      const args = rest.join(" ");

      switch (command) {
        case "/start":
        case "/help":
        case buttons.help:
          if (getSession(chatId).auth) {
            await bot.sendMessage(chatId, userHelpText(), menuKeyboard(getSession(chatId).auth?.employee.role));
          } else {
            await bot.sendMessage(chatId, userHelpText(), loginKeyboard());
          }
          break;
        case buttons.menu:
          updateSession(chatId, { pending: undefined });
          await sendMenu(bot, chatId);
          break;
        case buttons.login:
          updateSession(chatId, { pending: { type: "login" } });
          await bot.sendMessage(chatId, loginHint, cancelKeyboard());
          break;
        case "/login":
          await handleLogin(bot, msg, args);
          break;
        case "/logout":
        case buttons.logout:
          await handleLogout(bot, msg);
          break;
        case "/dashboard":
        case buttons.dashboard:
          await handleDashboard(bot, msg);
          break;
        case "/catalog":
        case buttons.catalog:
          if (command === buttons.catalog) {
            await handleCatalog(bot, msg, "");
            break;
          }
          if (!args) {
            updateSession(chatId, { pending: { type: "search" } });
            await bot.sendMessage(chatId, "Напишите строку поиска или отправьте all, чтобы показать весь каталог.", cancelKeyboard());
          } else {
            await handleCatalog(bot, msg, args === "all" ? "" : args);
          }
          break;
        case buttons.search:
          updateSession(chatId, { pending: { type: "search" } });
          await bot.sendMessage(chatId, "Что найти в каталоге?", cancelKeyboard());
          break;
        case "/employees":
        case buttons.employees:
          await handleEmployees(bot, msg);
          break;
        case "/issues":
        case buttons.issues:
          await handleIssues(bot, msg);
          break;
        case "/repairs":
        case buttons.repairs:
          await handleRepairs(bot, msg);
          break;
        case "/purchases":
        case buttons.purchases:
          await handlePurchases(bot, msg);
          break;
        case "/ai":
        case buttons.ai:
          await handleAi(bot, msg, args);
          break;
        case "/new_issue":
        case buttons.createIssue:
          await promptIssue(bot, msg);
          break;
        case "/new_repair":
        case buttons.createRepair:
          await promptRepair(bot, msg);
          break;
        case "/new_purchase":
        case buttons.createPurchase:
          await promptPurchase(bot, msg);
          break;
        case "/return_issue":
          if (!args) {
            await promptReturnIssue(bot, msg);
            break;
          }
          await returnIssue(bot, msg, args);
          break;
        case buttons.returnIssue:
          await promptReturnIssue(bot, msg);
          break;
        case "/complete_repair":
          if (!args) {
            await promptCompleteRepair(bot, msg);
            break;
          }
          await completeRepair(bot, msg, args);
          break;
        case buttons.completeRepair:
          await promptCompleteRepair(bot, msg);
          break;
        case "/receive_purchase":
          if (!args) {
            await promptReceivePurchase(bot, msg);
            break;
          }
          await receivePurchase(bot, msg, args);
          break;
        case buttons.receivePurchase:
          await promptReceivePurchase(bot, msg);
          break;
        default:
          await sendMenu(bot, chatId, getSession(chatId).auth ? "Не понял. Выберите действие кнопкой." : loginHint);
      }
    } catch (error) {
      const role = getSession(chatId).auth?.employee.role;
      await bot.sendMessage(chatId, formatError(error), role ? menuKeyboard(role) : loginKeyboard());
    }
  });

  process.once("SIGINT", () => {
    saveSessions();
    bot.stopPolling();
  });
  process.once("SIGTERM", () => {
    saveSessions();
    bot.stopPolling();
  });

  console.log("[bot] started");
}

void main().catch((error) => {
  console.error("[bot][error]", error);
  process.exit(1);
});
