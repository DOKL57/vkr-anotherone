import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  clearStoredAuthSession,
  fetchJson,
  readStoredAuthSession,
  writeStoredAuthSession,
  type StoredAuthSession
} from "./api";

type DashboardSummary = {
  equipmentCount: number;
  availableUnits: number;
  inUseUnits: number;
  inRepairUnits: number;
  openIssues: number;
  overdueIssues: number;
  openRepairs: number;
  activePurchases: number;
};

type Category = { id: string; name: string };
type Employee = { id: string; fullName: string; role: string };
type Project = {
  id: string;
  name: string;
  customer?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  archivedAt?: string | null;
  comment?: string | null;
};
type Warehouse = { id: string; name: string };
type StorageLocation = { id: string; label: string; warehouseId: string };
type AuthEmployee = StoredAuthSession["employee"];

type Equipment = {
  id: string;
  name: string;
  type: string;
  model: string;
  manufacturer?: string | null;
  serialNumber?: string | null;
  status: string;
  categoryId: string;
  categoryName: string;
  available: number;
  inUse: number;
  inRepair: number;
  totalQuantity: number;
  minStock: number;
  technicalSpecs: Record<string, string>;
  locations: Array<{ id: string; quantity: number; label: string }>;
};

type Issue = {
  id: string;
  purpose: string;
  status: string;
  dueAt: string;
  project?: { name: string } | null;
  assignedEmployee?: { fullName: string } | null;
  items: Array<{ equipment: { name: string; model: string }; quantity: number; returnedQuantity: number }>;
};

type Repair = {
  id: string;
  reason: string;
  diagnosis?: string | null;
  estimatedReadyAt?: string | null;
  status: string;
  equipment: { name: string; model: string };
  responsible?: { fullName: string } | null;
  quantity: number;
};

type Purchase = {
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

type BootstrapData = {
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
  currentUser: AuthEmployee;
};

type AiResponse = {
  sessionId: string;
  answer: string;
  intent: string;
};

type LoginResponse = {
  token: string;
  employee: AuthEmployee;
};

const emptyIssueForm = {
  warehouseId: "",
  projectId: "",
  assignedEmployeeId: "",
  purpose: "",
  dueAt: "",
  notes: "",
  equipmentId: "",
  quantity: 1
};

const emptyProjectForm = {
  name: "",
  customer: "",
  location: "",
  startAt: "",
  endAt: "",
  comment: ""
};

const emptyRepairForm = {
  warehouseId: "",
  locationId: "",
  equipmentId: "",
  quantity: 1,
  reason: "",
  diagnosis: "",
  estimatedReadyAt: "",
  responsibleId: ""
};

const emptyPurchaseForm = {
  mode: "existing" as "existing" | "new",
  title: "",
  supplierName: "",
  plannedDeliveryAt: "",
  reason: "",
  equipmentId: "",
  locationId: "",
  itemName: "",
  quantity: 1,
  categoryId: "",
  name: "",
  type: "",
  model: "",
  manufacturer: "",
  serialNumber: "",
  description: "",
  minStock: 0
};

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

function fmtDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) {
    return "Сроки не указаны";
  }

  const startText = start ? fmtDate(start) : "без начала";
  const endText = end ? fmtDate(end) : "без окончания";
  return `${startText} - ${endText}`;
}

function isPastProject(project: Project) {
  return Boolean(project.endDate && new Date(project.endDate).getTime() < Date.now());
}

function statusLabel(status: string) {
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

function roleLabel(role: string) {
  const map: Record<string, string> = {
    ADMIN: "Администратор",
    WAREHOUSE: "Кладовщик",
    SOUND_ENGINEER: "Звукорежиссёр"
  };
  return map[role] ?? role;
}

function isAuthError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? (error as { status?: number }).status : undefined;
  const message = String(error).toLowerCase();
  return status === 401 || message.includes("авториза") || message.includes("сесс") || message.includes("нет прав");
}

function formatUserError(error: unknown, mode: "default" | "auth" = "default") {
  const status = typeof error === "object" && error && "status" in error ? (error as { status?: number }).status : undefined;
  const raw = String(error).replace(/^Error:\s*/i, "").trim();

  if (mode === "auth") {
    if (status === 401) {
      return "Неверный логин или пароль. Проверьте данные и попробуйте снова.";
    }

    if (status === 500 || /http 500/i.test(raw)) {
      return "Сервис входа временно недоступен. Попробуйте позже или обратитесь к администратору.";
    }
  }

  if (status === 500 || /http 500/i.test(raw)) {
    return "Сервис временно недоступен. Попробуйте позже.";
  }

  return raw || "Произошла ошибка. Попробуйте ещё раз.";
}

export default function App() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [auth, setAuth] = useState<StoredAuthSession | null>(null);
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);

  const [query, setQuery] = useState("Где есть Shure SM58 и сколько XLR кабелей доступно?");
  const [aiResult, setAiResult] = useState<AiResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);

  const [issueForm, setIssueForm] = useState(emptyIssueForm);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [repairForm, setRepairForm] = useState(emptyRepairForm);
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actor = auth?.employee ?? data?.currentUser ?? null;
  const actorId = actor?.id ?? null;
  const actorRole = actor?.role ?? null;

  async function loadData() {
    try {
      const bootstrap = await fetchJson<BootstrapData>("/api/bootstrap");
      setData(bootstrap);

      if (auth) {
        const nextAuth = { ...auth, employee: bootstrap.currentUser };
        setAuth(nextAuth);
        writeStoredAuthSession(nextAuth);
      }
    } catch (err) {
      if (isAuthError(err)) {
        clearStoredAuthSession();
        setAuth(null);
        setData(null);
        setSessionId(null);
      }
      setError(formatUserError(err));
    }
  }

  useEffect(() => {
    const stored = readStoredAuthSession();
    if (!stored) {
      return;
    }

    setAuth(stored);
    void loadData();
  }, []);

  const equipmentFiltered = useMemo(() => {
    if (!data) return [];
    if (!search) return data.equipment;
    const lq = search.toLowerCase();
    return data.equipment.filter((item) =>
      item.name.toLowerCase().includes(lq) ||
      item.model.toLowerCase().includes(lq) ||
      item.type.toLowerCase().includes(lq) ||
      (item.serialNumber && item.serialNumber.toLowerCase().includes(lq))
    );
  }, [data, search]);

  const equipmentOptions = useMemo(
    () => (data?.equipment ?? []).map((item) => ({ id: item.id, label: `${item.name} ${item.model}` })),
    [data]
  );

  const locationOptions = useMemo(
    () => (data?.locations ?? []).map((location) => {
      const warehouse = data?.warehouses.find((item) => item.id === location.warehouseId);
      return {
        id: location.id,
        label: `${warehouse?.name ?? "Склад"}: ${location.label}`
      };
    }),
    [data]
  );

  const selectedPurchaseEquipment = useMemo(
    () => data?.equipment.find((item) => item.id === purchaseForm.equipmentId),
    [data, purchaseForm.equipmentId]
  );

  const activeProjects = useMemo(
    () => (data?.projects ?? []).filter((project) => !project.archivedAt),
    [data]
  );

  const visibleProjects = useMemo(
    () => showArchivedProjects ? (data?.projects ?? []) : activeProjects,
    [activeProjects, data, showArchivedProjects]
  );

  const pastProjectsToArchive = useMemo(
    () => activeProjects.filter(isPastProject),
    [activeProjects]
  );

  const purchaseReady =
    Boolean(purchaseForm.title && purchaseForm.supplierName && purchaseForm.locationId && purchaseForm.quantity > 0) &&
    (purchaseForm.mode === "existing"
      ? Boolean(purchaseForm.equipmentId)
      : Boolean(purchaseForm.categoryId && purchaseForm.name && purchaseForm.type && purchaseForm.model));

  const projectReady = Boolean(projectForm.name.trim());

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setError(null);

    try {
      const result = await fetchJson<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(authForm)
      });

      const session: StoredAuthSession = {
        token: result.token,
        employee: result.employee
      };

      writeStoredAuthSession(session);
      setAuth(session);
      setAuthForm({ username: "", password: "" });
      await loadData();
    } catch (err) {
      clearStoredAuthSession();
      setAuth(null);
      setData(null);
      setError(formatUserError(err, "auth"));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await fetchJson("/api/auth/logout", { method: "POST" });
    } catch {
      // local logout still enough
    } finally {
      clearStoredAuthSession();
      setAuth(null);
      setData(null);
      setAiResult(null);
      setSessionId(null);
      setShowArchivedProjects(false);
      setIssueForm(emptyIssueForm);
      setProjectForm(emptyProjectForm);
      setRepairForm(emptyRepairForm);
      setPurchaseForm(emptyPurchaseForm);
    }
  }

  async function handleAiQuery() {
    setBusy("ai");
    setError(null);
    try {
      const res = await fetchJson<AiResponse>("/api/ai/query", {
        method: "POST",
        body: JSON.stringify({
          query,
          sessionId
        })
      });
      setAiResult(res);
      setSessionId(res.sessionId);
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitIssue() {
    if (!actorId) return setError("Нет прав для операции.");
    setBusy("issue");
    setError(null);
    try {
      await fetchJson("/api/issues", {
        method: "POST",
        body: JSON.stringify({
          actorId,
          warehouseId: issueForm.warehouseId,
          projectId: issueForm.projectId || undefined,
          assignedEmployeeId: issueForm.assignedEmployeeId || undefined,
          purpose: issueForm.purpose || "Выдача на проект",
          dueAt: new Date(issueForm.dueAt).toISOString(),
          notes: issueForm.notes || undefined,
          items: [
            {
              equipmentId: issueForm.equipmentId,
              quantity: Number(issueForm.quantity)
            }
          ]
        })
      });
      setIssueForm(emptyIssueForm);
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitProject() {
    if (!actorId) return setError("Нет прав для операции.");
    setBusy("project");
    setError(null);
    try {
      const created = await fetchJson<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          actorId,
          name: projectForm.name,
          customer: projectForm.customer || undefined,
          location: projectForm.location || undefined,
          startAt: projectForm.startAt ? new Date(projectForm.startAt).toISOString() : undefined,
          endAt: projectForm.endAt ? new Date(projectForm.endAt).toISOString() : undefined,
          comment: projectForm.comment || undefined
        })
      });
      setProjectForm(emptyProjectForm);
      setIssueForm((prev) => ({
        ...prev,
        projectId: created.id,
        purpose: prev.purpose || created.name
      }));
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function archiveProject(projectId: string) {
    if (!actorId) return setError("Нет прав для операции.");
    setBusy(`project:${projectId}`);
    setError(null);
    try {
      await fetchJson(`/api/projects/${projectId}/archive`, {
        method: "POST",
        body: JSON.stringify({ actorId })
      });
      if (issueForm.projectId === projectId) {
        setIssueForm((prev) => ({ ...prev, projectId: "" }));
      }
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function restoreProject(projectId: string) {
    if (!actorId) return setError("Нет прав для операции.");
    setBusy(`project:${projectId}`);
    setError(null);
    try {
      await fetchJson(`/api/projects/${projectId}/restore`, {
        method: "POST",
        body: JSON.stringify({ actorId })
      });
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function archivePastProjects() {
    if (!actorId) return setError("Нет прав для операции.");
    setBusy("project:archive-past");
    setError(null);
    try {
      await fetchJson("/api/projects/archive-past", {
        method: "POST",
        body: JSON.stringify({ actorId })
      });
      if (issueForm.projectId && pastProjectsToArchive.some((project) => project.id === issueForm.projectId)) {
        setIssueForm((prev) => ({ ...prev, projectId: "" }));
      }
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitRepair() {
    if (!actorId) return setError("Нет прав для операции.");
    setBusy("repair");
    setError(null);
    try {
      await fetchJson("/api/repairs", {
        method: "POST",
        body: JSON.stringify({
          actorId,
          warehouseId: repairForm.warehouseId,
          locationId: repairForm.locationId,
          equipmentId: repairForm.equipmentId,
          quantity: Number(repairForm.quantity),
          reason: repairForm.reason,
          diagnosis: repairForm.diagnosis || undefined,
          estimatedReadyAt: repairForm.estimatedReadyAt
            ? new Date(repairForm.estimatedReadyAt).toISOString()
            : undefined,
          responsibleId: repairForm.responsibleId || undefined
        })
      });
      setRepairForm(emptyRepairForm);
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitPurchase() {
    if (!actorId) return setError("Нет прав для операции.");
    setBusy("purchase");
    setError(null);
    try {
      const item =
        purchaseForm.mode === "existing"
          ? {
              mode: "existing",
              equipmentId: purchaseForm.equipmentId,
              itemName: selectedPurchaseEquipment
                ? `${selectedPurchaseEquipment.name} ${selectedPurchaseEquipment.model}`
                : "Пополнение склада",
              quantity: Number(purchaseForm.quantity),
              locationId: purchaseForm.locationId
            }
          : {
              mode: "new",
              itemName: purchaseForm.itemName || `${purchaseForm.name} ${purchaseForm.model}`,
              quantity: Number(purchaseForm.quantity),
              locationId: purchaseForm.locationId,
              categoryId: purchaseForm.categoryId,
              name: purchaseForm.name,
              type: purchaseForm.type,
              model: purchaseForm.model,
              manufacturer: purchaseForm.manufacturer || undefined,
              serialNumber: purchaseForm.serialNumber || undefined,
              description: purchaseForm.description || undefined,
              minStock: Number(purchaseForm.minStock) || 0
            };

      await fetchJson("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          actorId,
          title: purchaseForm.title,
          supplierName: purchaseForm.supplierName,
          plannedDeliveryAt: purchaseForm.plannedDeliveryAt
            ? new Date(purchaseForm.plannedDeliveryAt).toISOString()
            : undefined,
          reason: purchaseForm.reason || "Закупка оборудования",
          items: [item]
        })
      });
      setPurchaseForm(emptyPurchaseForm);
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function receivePurchase(purchaseId: string) {
    if (!actorId) return setError("Нет прав.");
    setBusy(purchaseId);
    setError(null);
    try {
      await fetchJson(`/api/purchases/${purchaseId}/receive`, {
        method: "POST",
        body: JSON.stringify({ actorId })
      });
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  async function closeIssue(issueId: string) {
    if (!actorId) return setError("Нет прав.");
    setBusy(issueId);
    try {
      await fetchJson(`/api/issues/${issueId}/return`, {
        method: "POST",
        body: JSON.stringify({ actorId })
      });
      await loadData();
    } catch (err) {
      setError(formatUserError(err));
    } finally {
      setBusy(null);
    }
  }

  if (!auth) {
    return (
      <div className="auth-shell">
        <div className="auth-backdrop" />
        <div className="auth-layout">
          <section className="auth-side">
            <div className="eyebrow">Sound Rental / Employee Access</div>
            <h1>Вход для сотрудников</h1>
            <p>
              Используйте логин и пароль, которые вам выдал администратор. Самостоятельная регистрация на этой странице
              недоступна.
            </p>
            <div className="auth-note">
              <strong>Нет логина или пароля?</strong>
              <span>Чтобы получить доступ или восстановить его, обратитесь к администратору системы.</span>
            </div>
            <div className="auth-points">
              <div className="auth-point">
                <strong>Только для зарегистрированных пользователей</strong>
                <span>Вход доступен сотрудникам, у которых уже создана учётная запись.</span>
              </div>
              <div className="auth-point">
                <strong>Проверьте раскладку и регистр</strong>
                <span>Логин и пароль вводятся точно так, как были выданы.</span>
              </div>
              <div className="auth-point">
                <strong>После входа откроется рабочая панель</strong>
                <span>Каталог оборудования, выдачи, ремонты и закупки доступны после авторизации.</span>
              </div>
            </div>
          </section>

          <section className="auth-card">
            <div className="panel-header">
              <h2>Войти в систему</h2>
              <span>{authBusy ? "Проверка..." : "Защищённый вход"}</span>
            </div>

            <p className="auth-caption">Введите данные своей учётной записи сотрудника.</p>

            <form className="auth-form" onSubmit={handleLogin}>
              <label>
                <span>Логин</span>
                <input
                  autoComplete="username"
                  value={authForm.username}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder="Введите логин"
                />
              </label>

              <label>
                <span>Пароль</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Введите пароль"
                />
              </label>

              <button className="primary-btn" type="submit" disabled={authBusy || !authForm.username || !authForm.password}>
                Войти
              </button>
            </form>

            <div className="auth-support">
              Если доступ не работает, обратитесь к администратору. Регистрация и восстановление пароля через интерфейс не
              предусмотрены.
            </div>

            {error ? <div className="error-box auth-error">{error}</div> : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <div className="eyebrow">Склад звука / защищённый доступ</div>
          <h1>Учёт оборудования</h1>
          <p>Единая панель управления выдачами, складом, закупками и ремонтом.</p>
        </div>
        <div className="hero-card">
          <div>
            <span>Пользователь:</span>
            <strong>{actor?.fullName}</strong>
          </div>
          <div>
            <span>Роль:</span>
            <strong>{roleLabel(actor?.role ?? "")}</strong>
          </div>
          <div>
            <span>Логин:</span>
            <strong>{actor?.username}</strong>
          </div>
          <div>
            <span>Сессия AI:</span>
            <strong>{sessionId ?? "новая"}</strong>
          </div>
          <button className="secondary-btn hero-logout" onClick={handleLogout}>Выйти</button>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="stats-grid">
        {data ? (
          <>
            <article className="stat-card accent-1"><span>Оборудование</span><strong>{data.dashboard.equipmentCount}</strong></article>
            <article className="stat-card accent-2"><span>Доступно (шт)</span><strong>{data.dashboard.availableUnits}</strong></article>
            <article className="stat-card accent-3"><span>В работе (шт)</span><strong>{data.dashboard.inUseUnits}</strong></article>
            <article className="stat-card accent-4"><span>Открытые выдачи</span><strong>{data.dashboard.openIssues}</strong></article>
            <article className="stat-card accent-5"><span>В ремонте (шт)</span><strong>{data.dashboard.inRepairUnits}</strong></article>
            <article className="stat-card accent-6"><span>Закупки</span><strong>{data.dashboard.activePurchases}</strong></article>
          </>
        ) : (
          <div className="loading-box">Загрузка сводки...</div>
        )}
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="panel-header">
            <h2>AI-помощник</h2>
            <span>{busy === "ai" ? "Обработка..." : "Готов"}</span>
          </div>
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={3} placeholder="Спросите что-нибудь..." />
          <button className="primary-btn" onClick={handleAiQuery} disabled={busy === "ai"}>Отправить запрос</button>
          {aiResult ? (
            <div className="response-box">
              <div className="chip-card">
                <strong>Ответ ({aiResult.intent}):</strong>
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{aiResult.answer}</p>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Роли и сотрудники</h2>
            <span>Справочник</span>
          </div>
          <div className="stack-list" style={{ maxHeight: "200px", overflowY: "auto" }}>
            {data?.employees.map((employee) => (
              <div key={employee.id} className="list-row" style={{ padding: "10px" }}>
                <strong>{employee.fullName}</strong>
                <span className="status-pill status-available">{roleLabel(employee.role)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Каталог оборудования</h2>
          <input
            className="search-input"
            placeholder="Поиск по модели, типу, серийному номеру"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Модель / Тип</th>
                <th>Категория</th>
                <th>Статус</th>
                <th>Склад / Ячейки (остаток)</th>
                <th>Всего шт.</th>
              </tr>
            </thead>
            <tbody>
              {equipmentFiltered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name} {item.model}</strong>
                    <div className="muted-text">{item.type} {item.serialNumber ? `· s/n: ${item.serialNumber}` : ""}</div>
                  </td>
                  <td>{item.categoryName}</td>
                  <td><span className={`status-pill status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></td>
                  <td>
                    {item.locations.map((location) => (
                      <div key={location.id} style={{ marginBottom: 4 }}>
                        {location.label}: <strong>{location.quantity}</strong> шт.
                      </div>
                    ))}
                    {item.locations.length === 0 && <span className="muted-text">Нет на складе</span>}
                  </td>
                  <td>{item.totalQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel project-list-panel">
        <div className="panel-header">
          <h2>Мероприятия</h2>
          <div className="panel-header-actions">
            <span>{visibleProjects.length} записей</span>
            {actorRole === "ADMIN" ? (
              <>
                <button className="secondary-btn compact-btn" onClick={archivePastProjects} disabled={pastProjectsToArchive.length === 0 || busy === "project:archive-past"}>
                  Скрыть прошедшие ({pastProjectsToArchive.length})
                </button>
                <button className="secondary-btn compact-btn" onClick={() => setShowArchivedProjects((value) => !value)}>
                  {showArchivedProjects ? "Скрыть архив" : "Показать архив"}
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="project-list">
          {visibleProjects.map((project) => (
            <div key={project.id} className={`project-row${project.archivedAt ? " is-archived" : ""}`}>
              <div>
                <strong>{project.name}</strong>
                <small>{fmtDateRange(project.startDate, project.endDate)}{isPastProject(project) ? " · прошло" : ""}</small>
              </div>
              <div>
                <span>{project.customer || "Заказчик не указан"}</span>
                <small>{project.location || "Площадка не указана"}</small>
              </div>
              <div>
                {project.archivedAt ? <span className="status-pill status-retired">Скрыто</span> : <span className="status-pill status-available">Активно</span>}
                {project.comment ? <small>{project.comment}</small> : null}
              </div>
              {actorRole === "ADMIN" ? (
                <button
                  className="secondary-btn compact-btn"
                  onClick={() => project.archivedAt ? restoreProject(project.id) : archiveProject(project.id)}
                  disabled={busy === `project:${project.id}`}
                >
                  {project.archivedAt ? "Вернуть" : "Скрыть"}
                </button>
              ) : null}
            </div>
          ))}
          {visibleProjects.length === 0 && <div className="muted-text">{showArchivedProjects ? "Мероприятий нет." : "Активных мероприятий нет."}</div>}
        </div>
      </section>

      {actorId && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (
        <section className="grid-three">
          <article className="panel">
            <div className="panel-header"><h2>Выдача</h2><span>{busy === "issue" ? "Сохранение..." : "Новая запись"}</span></div>
            <select value={issueForm.equipmentId} onChange={(event) => setIssueForm({ ...issueForm, equipmentId: event.target.value })}>
              <option value="">Оборудование</option>
              {equipmentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <input type="number" min={1} value={issueForm.quantity} onChange={(event) => setIssueForm({ ...issueForm, quantity: Number(event.target.value) })} placeholder="Количество" />
            <select value={issueForm.warehouseId} onChange={(event) => setIssueForm({ ...issueForm, warehouseId: event.target.value })}>
              <option value="">Склад списания</option>
              {data?.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={issueForm.projectId} onChange={(event) => setIssueForm({ ...issueForm, projectId: event.target.value })}>
              <option value="">Мероприятие (опционально)</option>
              {activeProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={issueForm.assignedEmployeeId} onChange={(event) => setIssueForm({ ...issueForm, assignedEmployeeId: event.target.value })}>
              <option value="">Ответственный сотрудник (опционально)</option>
              {data?.employees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
            </select>
            <input value={issueForm.purpose} onChange={(event) => setIssueForm({ ...issueForm, purpose: event.target.value })} placeholder="Цель выдачи" />
            <input type="datetime-local" value={issueForm.dueAt} onChange={(event) => setIssueForm({ ...issueForm, dueAt: event.target.value })} />
            <button className="primary-btn" onClick={submitIssue} disabled={!issueForm.equipmentId || !issueForm.warehouseId || !issueForm.dueAt}>Оформить выдачу</button>
          </article>

          <article className="panel">
            <div className="panel-header"><h2>Мероприятие</h2><span>{busy === "project" ? "Сохранение..." : "Добавление"}</span></div>
            <input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} placeholder="Название мероприятия" />
            <input value={projectForm.customer} onChange={(event) => setProjectForm({ ...projectForm, customer: event.target.value })} placeholder="Заказчик" />
            <input value={projectForm.location} onChange={(event) => setProjectForm({ ...projectForm, location: event.target.value })} placeholder="Площадка / адрес" />
            <input type="datetime-local" value={projectForm.startAt} onChange={(event) => setProjectForm({ ...projectForm, startAt: event.target.value })} />
            <input type="datetime-local" value={projectForm.endAt} onChange={(event) => setProjectForm({ ...projectForm, endAt: event.target.value })} />
            <textarea value={projectForm.comment} onChange={(event) => setProjectForm({ ...projectForm, comment: event.target.value })} rows={2} placeholder="Комментарий" />
            <button className="primary-btn" onClick={submitProject} disabled={!projectReady || busy === "project"}>Добавить мероприятие</button>
          </article>

          <article className="panel">
            <div className="panel-header"><h2>Ремонт</h2><span>{busy === "repair" ? "Сохранение..." : "Отправить"}</span></div>
            <select value={repairForm.equipmentId} onChange={(event) => setRepairForm({ ...repairForm, equipmentId: event.target.value })}>
              <option value="">Оборудование</option>
              {equipmentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <select value={repairForm.warehouseId} onChange={(event) => setRepairForm({ ...repairForm, warehouseId: event.target.value })}>
              <option value="">Склад</option>
              {data?.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={repairForm.locationId} onChange={(event) => setRepairForm({ ...repairForm, locationId: event.target.value })}>
              <option value="">Ячейка списания</option>
              {data?.locations.filter((location) => location.warehouseId === repairForm.warehouseId).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <input value={repairForm.reason} onChange={(event) => setRepairForm({ ...repairForm, reason: event.target.value })} placeholder="Причина неисправности" />
            <select value={repairForm.responsibleId} onChange={(event) => setRepairForm({ ...repairForm, responsibleId: event.target.value })}>
              <option value="">Мастер (опционально)</option>
              {data?.employees.filter((employee) => employee.role === "ADMIN" || employee.role === "WAREHOUSE").map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
            </select>
            <button className="primary-btn" onClick={submitRepair} disabled={!repairForm.equipmentId || !repairForm.locationId || !repairForm.reason}>Передать в ремонт</button>
          </article>

          <article className="panel">
            <div className="panel-header"><h2>Закупка</h2><span>{busy === "purchase" ? "Сохранение..." : "Заявка"}</span></div>
            <input value={purchaseForm.title} onChange={(event) => setPurchaseForm({ ...purchaseForm, title: event.target.value })} placeholder="Название заявки" />
            <input value={purchaseForm.supplierName} onChange={(event) => setPurchaseForm({ ...purchaseForm, supplierName: event.target.value })} placeholder="Поставщик" />
            <div className="segmented-control" role="group" aria-label="Тип закупки">
              <button
                type="button"
                className={purchaseForm.mode === "existing" ? "active" : ""}
                onClick={() => setPurchaseForm({ ...purchaseForm, mode: "existing" })}
              >
                Пополнение
              </button>
              <button
                type="button"
                className={purchaseForm.mode === "new" ? "active" : ""}
                onClick={() => setPurchaseForm({ ...purchaseForm, mode: "new" })}
              >
                Новая позиция
              </button>
            </div>
            {purchaseForm.mode === "existing" ? (
              <select value={purchaseForm.equipmentId} onChange={(event) => setPurchaseForm({ ...purchaseForm, equipmentId: event.target.value })}>
                <option value="">Позиция из каталога</option>
                {equipmentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            ) : (
              <>
                <select value={purchaseForm.categoryId} onChange={(event) => setPurchaseForm({ ...purchaseForm, categoryId: event.target.value })}>
                  <option value="">Категория</option>
                  {data?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <input value={purchaseForm.name} onChange={(event) => setPurchaseForm({ ...purchaseForm, name: event.target.value })} placeholder="Название: пульт, микрофон, стойка" />
                <input value={purchaseForm.type} onChange={(event) => setPurchaseForm({ ...purchaseForm, type: event.target.value })} placeholder="Тип: цифровой микшер, радиосистема" />
                <input value={purchaseForm.model} onChange={(event) => setPurchaseForm({ ...purchaseForm, model: event.target.value })} placeholder="Модель" />
                <input value={purchaseForm.manufacturer} onChange={(event) => setPurchaseForm({ ...purchaseForm, manufacturer: event.target.value })} placeholder="Производитель" />
                <input value={purchaseForm.serialNumber} onChange={(event) => setPurchaseForm({ ...purchaseForm, serialNumber: event.target.value })} placeholder="Серийный номер" />
                <input value={purchaseForm.description} onChange={(event) => setPurchaseForm({ ...purchaseForm, description: event.target.value })} placeholder="Примечание" />
                <input type="number" min={0} value={purchaseForm.minStock} onChange={(event) => setPurchaseForm({ ...purchaseForm, minStock: Number(event.target.value) })} placeholder="Минимальный остаток" />
              </>
            )}
            <input type="number" min={1} value={purchaseForm.quantity} onChange={(event) => setPurchaseForm({ ...purchaseForm, quantity: Number(event.target.value) })} placeholder="Количество" />
            <select value={purchaseForm.locationId} onChange={(event) => setPurchaseForm({ ...purchaseForm, locationId: event.target.value })}>
              <option value="">Ячейка приёмки</option>
              {locationOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button className="primary-btn" onClick={submitPurchase} disabled={!purchaseReady}>Создать закупку</button>
          </article>
        </section>
      ) : (
        <div className="panel">
          <p style={{ textAlign: "center", color: "var(--muted)" }}>
            Недостаточно прав для создания выдач, ремонтов и закупок. Нужна роль администратора или кладовщика.
          </p>
        </div>
      )}

      <section className="grid-two">
        <article className="panel">
          <div className="panel-header"><h2>Оборудование в работе</h2><span>{data?.issues.length ?? 0} записей</span></div>
          <div className="stack-list">
            {data?.issues.map((issue) => (
              <div key={issue.id} className="list-row">
                <strong>{issue.purpose} {issue.project ? `(${issue.project.name})` : ""}</strong>
                <span><span className={`status-pill status-${issue.status.toLowerCase()}`}>{statusLabel(issue.status)}</span></span>
                <small>Ответственный: {issue.assignedEmployee?.fullName ?? "Нет"} · Вернуть: {fmtDate(issue.dueAt)}</small>
                <div style={{ marginTop: 6 }}>
                  {issue.items.map((item, index) => (
                    <div key={index} style={{ fontSize: 13 }}>- {item.equipment.name} {item.equipment.model} (x{item.quantity})</div>
                  ))}
                </div>
                {issue.status !== "RETURNED" && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (
                  <button className="secondary-btn" onClick={() => closeIssue(issue.id)} disabled={busy === issue.id}>Принять на склад</button>
                ) : null}
              </div>
            ))}
            {data?.issues.length === 0 && <div className="muted-text">Нет активных выдач.</div>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><h2>Ремонт и закупки</h2></div>
          <div className="stack-list">
            {data?.repairs.map((repair) => (
              <div key={repair.id} className="list-row">
                <strong>{repair.equipment.name} {repair.equipment.model} (x{repair.quantity})</strong>
                <span><span className={`status-pill status-${repair.status.toLowerCase()}`}>{statusLabel(repair.status)}</span></span>
                <small>Причина: {repair.reason}. {repair.diagnosis ? `Диагноз: ${repair.diagnosis}` : ""}</small>
              </div>
            ))}
            {data?.purchases.map((purchase) => (
              <div key={purchase.id} className="list-row">
                <strong>{purchase.title}</strong>
                <span><span className={`status-pill status-${purchase.status.toLowerCase()}`}>{statusLabel(purchase.status)}</span></span>
                <small>Поставщик: {purchase.supplierName}. План: {fmtDate(purchase.plannedDeliveryAt)}</small>
                <div className="purchase-items">
                  {purchase.items.map((item, index) => (
                    <div key={index}>
                      <span className={`status-pill ${item.mode === "new" ? "status-partial" : "status-ordered"}`}>
                        {item.mode === "new" ? "Новая" : "Пополнение"}
                      </span>
                      <span>{item.itemName} (x{item.quantity})</span>
                      {item.categoryName ? <small>Категория: {item.categoryName}</small> : null}
                      {item.locationLabel ? <small>Приёмка: {item.locationLabel}</small> : null}
                    </div>
                  ))}
                </div>
                {purchase.status !== "DELIVERED" && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (
                  <button className="secondary-btn" onClick={() => receivePurchase(purchase.id)} disabled={busy === purchase.id}>Принять закупку</button>
                ) : null}
              </div>
            ))}
            {(!data?.repairs.length && !data?.purchases.length) && <div className="muted-text">Нет ремонтов и закупок.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}
