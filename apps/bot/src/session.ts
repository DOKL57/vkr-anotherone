import fs from "node:fs";
import { env, ensureRuntimeDir } from "./env.js";
import type { StoredAuthSession } from "./api.js";

export type ChatSession = {
  auth?: StoredAuthSession;
  aiSessionId?: string | null;
  pending?: PendingAction;
};

export type PendingAction =
  | { type: "login" }
  | { type: "ai" }
  | { type: "search" }
  | { type: "project" }
  | { type: "issue" }
  | { type: "repair" }
  | { type: "purchase_existing" }
  | { type: "purchase_new" }
  | { type: "return_issue" }
  | { type: "complete_repair" }
  | { type: "receive_purchase" };

type SessionStore = Record<string, ChatSession>;

let store: SessionStore = {};

export function loadSessions() {
  ensureRuntimeDir();
  if (!fs.existsSync(env.TELEGRAM_BOT_SESSION_FILE)) return;

  try {
    store = JSON.parse(fs.readFileSync(env.TELEGRAM_BOT_SESSION_FILE, "utf-8")) as SessionStore;
  } catch {
    store = {};
  }
}

export function saveSessions() {
  ensureRuntimeDir();
  fs.writeFileSync(env.TELEGRAM_BOT_SESSION_FILE, JSON.stringify(store, null, 2));
}

export function getSession(chatId: number) {
  const key = String(chatId);
  store[key] ??= {};
  return store[key];
}

export function updateSession(chatId: number, patch: Partial<ChatSession>) {
  const session = getSession(chatId);
  store[String(chatId)] = { ...session, ...patch };
  saveSessions();
  return store[String(chatId)];
}

export function clearSession(chatId: number) {
  delete store[String(chatId)];
  saveSessions();
}
