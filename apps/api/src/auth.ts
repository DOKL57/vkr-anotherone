import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type AuthRoleName = "ADMIN" | "WAREHOUSE" | "SOUND_ENGINEER";

export type EmployeeDirectoryEntry = {
  role: AuthRoleName;
  fullName: string;
  position: string;
  username: string;
  password: string;
  phone: string | null;
  email: string | null;
  telegramId: string | null;
  status: string;
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const employeeDirectoryCandidates = [
  path.resolve(process.cwd(), "docs/employees.md"),
  path.resolve(process.cwd(), "../../docs/employees.md"),
  path.resolve(moduleDir, "../../../docs/employees.md"),
  path.resolve(moduleDir, "../../../../docs/employees.md")
];

const validRoles = new Set<AuthRoleName>(["ADMIN", "WAREHOUSE", "SOUND_ENGINEER"]);
const requiredEmployeeHeaders = [
  "role",
  "full_name",
  "position",
  "username",
  "password",
  "phone",
  "email",
  "telegram_id",
  "status"
];

export function resolveEmployeeDirectoryPath() {
  const found = employeeDirectoryCandidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Employee directory file docs/employees.md not found.");
  }
  return found;
}

function splitMarkdownRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string) {
  return /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(line.trim());
}

function normalizeNullable(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || normalized === "-" || normalized.toLowerCase() === "null") {
    return null;
  }
  return normalized;
}

function findEmployeeTable(lines: string[]) {
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index]?.startsWith("|")) {
      continue;
    }

    const header = splitMarkdownRow(lines[index]!);
    const separator = lines[index + 1]!;
    if (!isSeparatorRow(separator)) {
      continue;
    }

    const headerIndex = new Map(header.map((name, cellIndex) => [name.toLowerCase(), cellIndex]));
    if (requiredEmployeeHeaders.every((name) => headerIndex.has(name))) {
      const tableLines: string[] = [];
      for (const line of lines.slice(index + 2)) {
        if (!line.startsWith("|")) {
          break;
        }
        tableLines.push(line);
      }
      return { headerIndex, tableLines };
    }
  }

  return null;
}

export function readEmployeeDirectory() {
  const content = fs.readFileSync(resolveEmployeeDirectoryPath(), "utf-8");
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim());

  if (lines.filter((line) => line.startsWith("|")).length < 3) {
    throw new Error("Employee directory markdown table is empty.");
  }

  const employeeTable = findEmployeeTable(lines);
  if (!employeeTable) {
    throw new Error(`Employee directory table with columns ${requiredEmployeeHeaders.join(", ")} is missing.`);
  }

  const entries: EmployeeDirectoryEntry[] = [];

  for (const line of employeeTable.tableLines) {
    if (isSeparatorRow(line)) continue;
    const cells = splitMarkdownRow(line);
    if (cells.every((cell) => cell.length === 0)) continue;

    const role = cells[employeeTable.headerIndex.get("role")!]!.toUpperCase() as AuthRoleName;
    if (!validRoles.has(role)) {
      throw new Error(`Unsupported role "${role}" in employee directory.`);
    }

    const username = cells[employeeTable.headerIndex.get("username")!]!.trim().toLowerCase();
    const password = cells[employeeTable.headerIndex.get("password")!]!.trim();
    const fullName = cells[employeeTable.headerIndex.get("full_name")!]!.trim();
    const position = cells[employeeTable.headerIndex.get("position")!]!.trim();
    const status = cells[employeeTable.headerIndex.get("status")!]!.trim().toUpperCase();

    if (!username || !password || !fullName || !position || !status) {
      throw new Error(`Employee directory row is incomplete: ${line}`);
    }

    entries.push({
      role,
      fullName,
      position,
      username,
      password,
      phone: normalizeNullable(cells[employeeTable.headerIndex.get("phone")!]),
      email: normalizeNullable(cells[employeeTable.headerIndex.get("email")!]),
      telegramId: normalizeNullable(cells[employeeTable.headerIndex.get("telegram_id")!]),
      status
    });
  }

  if (entries.length === 0) {
    throw new Error("Employee directory has no employees.");
  }

  return entries;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHash] = passwordHash.split(":");
  if (algorithm !== "scrypt" || !salt || !storedHash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, "hex");

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}
