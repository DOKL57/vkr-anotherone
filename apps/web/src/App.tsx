import { useEffect, useMemo, useState } from "react";
import { fetchJson, uploadFile } from "./api";

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
type Project = { id: string; name: string };
type Warehouse = { id: string; name: string };
type StorageLocation = { id: string; label: string; warehouseId: string };

type Equipment = {
  id: string;
  name: string;
  type: string;
  model: string;
  serialNumber?: string | null;
  status: string;
  categoryName: string;
  available: number;
  inUse: number;
  inRepair: number;
  totalQuantity: number;
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
  status: string;
  items: Array<{ itemName: string; quantity: number }>;
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
};

type AiResponse = {
  sessionId: string;
  answer: string;
  intent: string;
};

type UploadResponse = {
  text: string;
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
  title: "",
  supplierName: "",
  plannedDeliveryAt: "",
  reason: "",
  equipmentId: "",
  itemName: "",
  quantity: 1
};

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
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
    SOUND_ENGINEER: "Звукорежиссер"
  };
  return map[role] ?? role;
}

export default function App() {
  const [data, setData] = useState<BootstrapData | null>(null);
  
  const [query, setQuery] = useState("Где есть Shure SM58 и сколько XLR кабелей доступно?");
  const [aiResult, setAiResult] = useState<AiResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [search, setSearch] = useState("");
  
  const [authMode, setAuthMode] = useState<"guest" | "demo">("guest");
  const [actorId, setActorId] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<string | null>(null);
  
  const [issueForm, setIssueForm] = useState(emptyIssueForm);
  const [repairForm, setRepairForm] = useState(emptyRepairForm);
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);
  
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      const bootstrap = await fetchJson<BootstrapData>("/api/bootstrap");
      setData(bootstrap);
      
      // If we are in demo mode and haven't picked an actor yet, pick the first one
      if (authMode === "demo" && !actorId && bootstrap.employees.length > 0) {
        setActorId(bootstrap.employees[0].id);
        setActorRole(bootstrap.employees[0].role);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    setAuthMode("demo");
    loadData();
  }, []);

  const equipmentFiltered = useMemo(() => {
    if (!data) return [];
    if (!search) return data.equipment;
    const lq = search.toLowerCase();
    return data.equipment.filter(e => 
      e.name.toLowerCase().includes(lq) || 
      e.model.toLowerCase().includes(lq) || 
      e.type.toLowerCase().includes(lq) ||
      (e.serialNumber && e.serialNumber.toLowerCase().includes(lq))
    );
  }, [data, search]);

  const equipmentOptions = useMemo(
    () => (data?.equipment ?? []).map((item) => ({ id: item.id, label: `${item.name} ${item.model}` })),
    [data]
  );

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
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitIssue() {
    if (!actorId) return setError("Нет прав для операции (не авторизован).");
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
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitRepair() {
    if (!actorId) return setError("Нет прав для операции (не авторизован).");
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
          estimatedReadyAt: repairForm.estimatedReadyAt ? new Date(repairForm.estimatedReadyAt).toISOString() : undefined,
          responsibleId: repairForm.responsibleId || undefined
        })
      });
      setRepairForm(emptyRepairForm);
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitPurchase() {
    if (!actorId) return setError("Нет прав для операции (не авторизован).");
    setBusy("purchase");
    setError(null);
    try {
      await fetchJson("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          actorId,
          title: purchaseForm.title,
          supplierName: purchaseForm.supplierName,
          plannedDeliveryAt: purchaseForm.plannedDeliveryAt ? new Date(purchaseForm.plannedDeliveryAt).toISOString() : undefined,
          reason: purchaseForm.reason || "Закупка оборудования",
          items: [
            {
              equipmentId: purchaseForm.equipmentId || undefined,
              itemName: purchaseForm.itemName || "Новая позиция",
              quantity: Number(purchaseForm.quantity)
            }
          ]
        })
      });
      setPurchaseForm(emptyPurchaseForm);
      await loadData();
    } catch (err) {
      setError(String(err));
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
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <div className="eyebrow">Склад звука / {authMode}</div>
          <h1>Учёт оборудования</h1>
          <p>
            Единая панель управления выдачей, складом, закупками и ремонтом.
          </p>
        </div>
        <div className="hero-card">
          <div>
            Авторизация: 
            <select 
              value={actorId ?? ""} 
              onChange={e => {
                const targetId = e.target.value;
                const emp = data?.employees.find(x => x.id === targetId);
                if (emp) {
                  if (window.confirm(`Вы уверены, что хотите сменить пользователя на "${emp.fullName}"?\nПрава доступа будут изменены на: ${roleLabel(emp.role)}`)) {
                    setActorId(targetId);
                    setActorRole(emp.role);
                    setSessionId(null);
                  }
                }
              }} 
              style={{ width: "auto", padding: "4px 8px", marginBottom: 0, marginLeft: 8 }}
            >
              <option value="" disabled>Выберите сотрудника...</option>
              {data?.employees.map(emp => <option key={emp.id} value={emp.id}>{emp.fullName} ({roleLabel(emp.role)})</option>)}
            </select>
          </div>
          <div>Категорий: {data?.categories.length ?? "..."}</div>
          <div>Сессия AI: {sessionId ?? "новая"}</div>
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
          <div className="loading-box">Загрузка сводки…</div>
        )}
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="panel-header">
            <h2>AI-помощник</h2>
            <span>{busy === "ai" ? "Обработка…" : "Готов"}</span>
          </div>
          <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={3} placeholder="Спросите что-нибудь..." />
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
            <h2>Роли и Сотрудники</h2>
            <span>Справочник</span>
          </div>
          <div className="stack-list" style={{ maxHeight: "200px", overflowY: "auto" }}>
            {data?.employees.map(emp => (
              <div key={emp.id} className="list-row" style={{ padding: "10px" }}>
                <strong>{emp.fullName}</strong>
                <span className="status-pill status-available">{roleLabel(emp.role)}</span>
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
            onChange={(e) => setSearch(e.target.value)}
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
                    {item.locations.map((loc) => (
                      <div key={loc.id} style={{ marginBottom: 4 }}>
                        {loc.label}: <strong>{loc.quantity}</strong> шт.
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

      {/* FORM SECTION */}
      {actorId && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (
        <section className="grid-three">
          {/* ВЫДАЧА */}
          <article className="panel">
            <div className="panel-header"><h2>Выдача</h2><span>{busy === "issue" ? "Сохранение…" : "Новая запись"}</span></div>
            <select value={issueForm.equipmentId} onChange={(e) => setIssueForm({ ...issueForm, equipmentId: e.target.value })}>
              <option value="">Оборудование</option>
              {equipmentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <input type="number" min={1} value={issueForm.quantity} onChange={(e) => setIssueForm({ ...issueForm, quantity: Number(e.target.value) })} placeholder="Количество" />
            <select value={issueForm.warehouseId} onChange={(e) => setIssueForm({ ...issueForm, warehouseId: e.target.value })}>
              <option value="">Склад списания</option>
              {data?.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={issueForm.projectId} onChange={(e) => setIssueForm({ ...issueForm, projectId: e.target.value })}>
              <option value="">Проект / Ивент (опционально)</option>
              {data?.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={issueForm.assignedEmployeeId} onChange={(e) => setIssueForm({ ...issueForm, assignedEmployeeId: e.target.value })}>
              <option value="">Ответственный сотрудник (опционально)</option>
              {data?.employees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
            </select>
            <input value={issueForm.purpose} onChange={(e) => setIssueForm({ ...issueForm, purpose: e.target.value })} placeholder="Цель выдачи" />
            <input type="datetime-local" value={issueForm.dueAt} onChange={(e) => setIssueForm({ ...issueForm, dueAt: e.target.value })} />
            <button className="primary-btn" onClick={submitIssue} disabled={!issueForm.equipmentId || !issueForm.warehouseId || !issueForm.dueAt}>Оформить выдачу</button>
          </article>

          {/* РЕМОНТ */}
          <article className="panel">
            <div className="panel-header"><h2>Ремонт</h2><span>{busy === "repair" ? "Сохранение…" : "Отправить"}</span></div>
            <select value={repairForm.equipmentId} onChange={(e) => setRepairForm({ ...repairForm, equipmentId: e.target.value })}>
              <option value="">Оборудование</option>
              {equipmentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <select value={repairForm.warehouseId} onChange={(e) => setRepairForm({ ...repairForm, warehouseId: e.target.value })}>
              <option value="">Склад</option>
              {data?.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={repairForm.locationId} onChange={(e) => setRepairForm({ ...repairForm, locationId: e.target.value })}>
              <option value="">Ячейка списания</option>
              {data?.locations.filter(l => l.warehouseId === repairForm.warehouseId).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <input value={repairForm.reason} onChange={(e) => setRepairForm({ ...repairForm, reason: e.target.value })} placeholder="Причина неисправности" />
            <select value={repairForm.responsibleId} onChange={(e) => setRepairForm({ ...repairForm, responsibleId: e.target.value })}>
              <option value="">Мастер (опционально)</option>
              {data?.employees.filter(e => e.role === "ADMIN" || e.role === "WAREHOUSE").map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
            </select>
            <button className="primary-btn" onClick={submitRepair} disabled={!repairForm.equipmentId || !repairForm.locationId || !repairForm.reason}>Передать в ремонт</button>
          </article>

          {/* ЗАКУПКА */}
          <article className="panel">
            <div className="panel-header"><h2>Закупка</h2><span>{busy === "purchase" ? "Сохранение…" : "Заявка"}</span></div>
            <input value={purchaseForm.title} onChange={(e) => setPurchaseForm({ ...purchaseForm, title: e.target.value })} placeholder="Название заявки" />
            <input value={purchaseForm.supplierName} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierName: e.target.value })} placeholder="Поставщик" />
            <select value={purchaseForm.equipmentId} onChange={(e) => setPurchaseForm({ ...purchaseForm, equipmentId: e.target.value })}>
              <option value="">Пополнить позицию (опционально)</option>
              {equipmentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            {!purchaseForm.equipmentId && <input value={purchaseForm.itemName} onChange={(e) => setPurchaseForm({ ...purchaseForm, itemName: e.target.value })} placeholder="Или название новой позиции" />}
            <input type="number" min={1} value={purchaseForm.quantity} onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: Number(e.target.value) })} placeholder="Количество" />
            <button className="primary-btn" onClick={submitPurchase} disabled={!purchaseForm.title || !purchaseForm.supplierName}>Создать закупку</button>
          </article>
        </section>
      ) : actorId ? (
        <div className="panel">
          <p style={{ textAlign: "center", color: "var(--muted)" }}>Недостаточно прав для создания выдач, ремонтов и закупок. Необходима роль Администратора или Кладовщика.</p>
        </div>
      ) : (
        <div className="panel">
          <p style={{ textAlign: "center", color: "var(--muted)" }}>Авторизуйтесь, чтобы создавать выдачи, ремонты и закупки.</p>
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
                  {issue.items.map((item, idx) => (
                    <div key={idx} style={{ fontSize: 13 }}>- {item.equipment.name} {item.equipment.model} (x{item.quantity})</div>
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
          <div className="panel-header"><h2>Ремонт и Закупки</h2></div>
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
                <small>Поставщик: {purchase.supplierName}. {purchase.items.map(i => `${i.itemName} (x${i.quantity})`).join(", ")}</small>
              </div>
            ))}
            {(!data?.repairs.length && !data?.purchases.length) && <div className="muted-text">Нет ремонтов и закупок.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}
