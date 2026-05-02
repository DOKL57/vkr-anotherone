import { env } from "./env.js";

export type StoredAuthSession = {
  token: string;
  employee: {
    id: string;
    fullName: string;
    role: string;
    username: string;
  };
};

export type DashboardSummary = {
  equipmentCount: number;
  availableUnits: number;
  inUseUnits: number;
  inRepairUnits: number;
  openIssues: number;
  overdueIssues: number;
  openRepairs: number;
  activePurchases: number;
};

export type Employee = { id: string; fullName: string; role: string };
export type Warehouse = { id: string; name: string };
export type Project = { id: string; name: string };
export type Category = { id: string; name: string };
export type StorageLocation = { id: string; label: string; warehouseId: string };

export type Equipment = {
  id: string;
  name: string;
  type: string;
  model: string;
  serialNumber?: string | null;
  status: string;
  categoryId: string;
  categoryName: string;
  available: number;
  inUse: number;
  inRepair: number;
  totalQuantity: number;
  locations: Array<{ id: string; quantity: number; label: string }>;
};

export type Issue = {
  id: string;
  purpose: string;
  status: string;
  dueAt: string;
  project?: { name: string } | null;
  assignedEmployee?: { fullName: string } | null;
  items: Array<{ equipment: { name: string; model: string }; quantity: number }>;
};

export type Repair = {
  id: string;
  reason: string;
  diagnosis?: string | null;
  estimatedReadyAt?: string | null;
  status: string;
  equipment: { name: string; model: string };
  responsible?: { fullName: string } | null;
  quantity: number;
};

export type Purchase = {
  id: string;
  title: string;
  supplierName: string;
  plannedDeliveryAt?: string | null;
  actualDeliveryAt?: string | null;
  status: string;
  items: Array<{
    mode: "existing" | "new";
    equipmentId?: string;
    itemName: string;
    quantity: number;
    locationId?: string;
    locationLabel?: string;
    categoryName?: string;
    name?: string;
    type?: string;
    model?: string;
    manufacturer?: string;
    serialNumber?: string;
    receivedEquipmentId?: string;
  }>;
};

export type BootstrapData = {
  dashboard: DashboardSummary;
  categories: Category[];
  employees: Employee[];
  projects: Project[];
  warehouses: Warehouse[];
  locations: StorageLocation[];
  equipment: Equipment[];
  issues: Issue[];
  repairs: Repair[];
  purchases: Purchase[];
  currentUser: StoredAuthSession["employee"];
};

export type AiResponse = {
  sessionId: string;
  answer: string;
  intent: string;
};

async function readError(response: Response) {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;

  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${env.API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const error = new Error(await readError(response)) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

export function login(username: string, password: string) {
  return apiFetch<StoredAuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function logout(token: string) {
  return apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" }, token);
}

export function bootstrap(token: string) {
  return apiFetch<BootstrapData>("/api/bootstrap", {}, token);
}

export function askAi(token: string, query: string, sessionId?: string | null) {
  return apiFetch<AiResponse>("/api/ai/query", {
    method: "POST",
    body: JSON.stringify({ query, sessionId })
  }, token);
}
