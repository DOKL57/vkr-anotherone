import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { clearStoredAuthSession, fetchJson, readStoredAuthSession, writeStoredAuthSession } from "./api";
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
    mode: "existing",
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
function fmtDate(value) {
    return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}
function fmtDateRange(start, end) {
    if (!start && !end) {
        return "Сроки не указаны";
    }
    const startText = start ? fmtDate(start) : "без начала";
    const endText = end ? fmtDate(end) : "без окончания";
    return `${startText} - ${endText}`;
}
function statusLabel(status) {
    const map = {
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
function roleLabel(role) {
    const map = {
        ADMIN: "Администратор",
        WAREHOUSE: "Кладовщик",
        SOUND_ENGINEER: "Звукорежиссёр"
    };
    return map[role] ?? role;
}
function isAuthError(error) {
    const status = typeof error === "object" && error && "status" in error ? error.status : undefined;
    const message = String(error).toLowerCase();
    return status === 401 || message.includes("авториза") || message.includes("сесс") || message.includes("нет прав");
}
function formatUserError(error, mode = "default") {
    const status = typeof error === "object" && error && "status" in error ? error.status : undefined;
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
    const [data, setData] = useState(null);
    const [auth, setAuth] = useState(null);
    const [authForm, setAuthForm] = useState({ username: "", password: "" });
    const [authBusy, setAuthBusy] = useState(false);
    const [query, setQuery] = useState("Где есть Shure SM58 и сколько XLR кабелей доступно?");
    const [aiResult, setAiResult] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [search, setSearch] = useState("");
    const [issueForm, setIssueForm] = useState(emptyIssueForm);
    const [projectForm, setProjectForm] = useState(emptyProjectForm);
    const [repairForm, setRepairForm] = useState(emptyRepairForm);
    const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const actor = auth?.employee ?? data?.currentUser ?? null;
    const actorId = actor?.id ?? null;
    const actorRole = actor?.role ?? null;
    async function loadData() {
        try {
            const bootstrap = await fetchJson("/api/bootstrap");
            setData(bootstrap);
            if (auth) {
                const nextAuth = { ...auth, employee: bootstrap.currentUser };
                setAuth(nextAuth);
                writeStoredAuthSession(nextAuth);
            }
        }
        catch (err) {
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
        if (!data)
            return [];
        if (!search)
            return data.equipment;
        const lq = search.toLowerCase();
        return data.equipment.filter((item) => item.name.toLowerCase().includes(lq) ||
            item.model.toLowerCase().includes(lq) ||
            item.type.toLowerCase().includes(lq) ||
            (item.serialNumber && item.serialNumber.toLowerCase().includes(lq)));
    }, [data, search]);
    const equipmentOptions = useMemo(() => (data?.equipment ?? []).map((item) => ({ id: item.id, label: `${item.name} ${item.model}` })), [data]);
    const locationOptions = useMemo(() => (data?.locations ?? []).map((location) => {
        const warehouse = data?.warehouses.find((item) => item.id === location.warehouseId);
        return {
            id: location.id,
            label: `${warehouse?.name ?? "Склад"}: ${location.label}`
        };
    }), [data]);
    const selectedPurchaseEquipment = useMemo(() => data?.equipment.find((item) => item.id === purchaseForm.equipmentId), [data, purchaseForm.equipmentId]);
    const purchaseReady = Boolean(purchaseForm.title && purchaseForm.supplierName && purchaseForm.locationId && purchaseForm.quantity > 0) &&
        (purchaseForm.mode === "existing"
            ? Boolean(purchaseForm.equipmentId)
            : Boolean(purchaseForm.categoryId && purchaseForm.name && purchaseForm.type && purchaseForm.model));
    const projectReady = Boolean(projectForm.name.trim());
    async function handleLogin(event) {
        event.preventDefault();
        setAuthBusy(true);
        setError(null);
        try {
            const result = await fetchJson("/api/auth/login", {
                method: "POST",
                body: JSON.stringify(authForm)
            });
            const session = {
                token: result.token,
                employee: result.employee
            };
            writeStoredAuthSession(session);
            setAuth(session);
            setAuthForm({ username: "", password: "" });
            await loadData();
        }
        catch (err) {
            clearStoredAuthSession();
            setAuth(null);
            setData(null);
            setError(formatUserError(err, "auth"));
        }
        finally {
            setAuthBusy(false);
        }
    }
    async function handleLogout() {
        try {
            await fetchJson("/api/auth/logout", { method: "POST" });
        }
        catch {
            // local logout still enough
        }
        finally {
            clearStoredAuthSession();
            setAuth(null);
            setData(null);
            setAiResult(null);
            setSessionId(null);
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
            const res = await fetchJson("/api/ai/query", {
                method: "POST",
                body: JSON.stringify({
                    query,
                    sessionId
                })
            });
            setAiResult(res);
            setSessionId(res.sessionId);
        }
        catch (err) {
            setError(formatUserError(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function submitIssue() {
        if (!actorId)
            return setError("Нет прав для операции.");
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
        }
        catch (err) {
            setError(formatUserError(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function submitProject() {
        if (!actorId)
            return setError("Нет прав для операции.");
        setBusy("project");
        setError(null);
        try {
            const created = await fetchJson("/api/projects", {
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
        }
        catch (err) {
            setError(formatUserError(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function submitRepair() {
        if (!actorId)
            return setError("Нет прав для операции.");
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
        }
        catch (err) {
            setError(formatUserError(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function submitPurchase() {
        if (!actorId)
            return setError("Нет прав для операции.");
        setBusy("purchase");
        setError(null);
        try {
            const item = purchaseForm.mode === "existing"
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
        }
        catch (err) {
            setError(formatUserError(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function receivePurchase(purchaseId) {
        if (!actorId)
            return setError("Нет прав.");
        setBusy(purchaseId);
        setError(null);
        try {
            await fetchJson(`/api/purchases/${purchaseId}/receive`, {
                method: "POST",
                body: JSON.stringify({ actorId })
            });
            await loadData();
        }
        catch (err) {
            setError(formatUserError(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function closeIssue(issueId) {
        if (!actorId)
            return setError("Нет прав.");
        setBusy(issueId);
        try {
            await fetchJson(`/api/issues/${issueId}/return`, {
                method: "POST",
                body: JSON.stringify({ actorId })
            });
            await loadData();
        }
        catch (err) {
            setError(formatUserError(err));
        }
        finally {
            setBusy(null);
        }
    }
    if (!auth) {
        return (_jsxs("div", { className: "auth-shell", children: [_jsx("div", { className: "auth-backdrop" }), _jsxs("div", { className: "auth-layout", children: [_jsxs("section", { className: "auth-side", children: [_jsx("div", { className: "eyebrow", children: "Sound Rental / Employee Access" }), _jsx("h1", { children: "\u0412\u0445\u043E\u0434 \u0434\u043B\u044F \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432" }), _jsx("p", { children: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u0438 \u043F\u0430\u0440\u043E\u043B\u044C, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0432\u0430\u043C \u0432\u044B\u0434\u0430\u043B \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440. \u0421\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F \u043D\u0430 \u044D\u0442\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430." }), _jsxs("div", { className: "auth-note", children: [_jsx("strong", { children: "\u041D\u0435\u0442 \u043B\u043E\u0433\u0438\u043D\u0430 \u0438\u043B\u0438 \u043F\u0430\u0440\u043E\u043B\u044F?" }), _jsx("span", { children: "\u0427\u0442\u043E\u0431\u044B \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F \u0438\u043B\u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0435\u0433\u043E, \u043E\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044C \u043A \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443 \u0441\u0438\u0441\u0442\u0435\u043C\u044B." })] }), _jsxs("div", { className: "auth-points", children: [_jsxs("div", { className: "auth-point", children: [_jsx("strong", { children: "\u0422\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439" }), _jsx("span", { children: "\u0412\u0445\u043E\u0434 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430\u043C, \u0443 \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u0443\u0436\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0430 \u0443\u0447\u0451\u0442\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C." })] }), _jsxs("div", { className: "auth-point", children: [_jsx("strong", { children: "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u043A\u0443 \u0438 \u0440\u0435\u0433\u0438\u0441\u0442\u0440" }), _jsx("span", { children: "\u041B\u043E\u0433\u0438\u043D \u0438 \u043F\u0430\u0440\u043E\u043B\u044C \u0432\u0432\u043E\u0434\u044F\u0442\u0441\u044F \u0442\u043E\u0447\u043D\u043E \u0442\u0430\u043A, \u043A\u0430\u043A \u0431\u044B\u043B\u0438 \u0432\u044B\u0434\u0430\u043D\u044B." })] }), _jsxs("div", { className: "auth-point", children: [_jsx("strong", { children: "\u041F\u043E\u0441\u043B\u0435 \u0432\u0445\u043E\u0434\u0430 \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F \u0440\u0430\u0431\u043E\u0447\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u044C" }), _jsx("span", { children: "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F, \u0432\u044B\u0434\u0430\u0447\u0438, \u0440\u0435\u043C\u043E\u043D\u0442\u044B \u0438 \u0437\u0430\u043A\u0443\u043F\u043A\u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u043F\u043E\u0441\u043B\u0435 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u0438." })] })] })] }), _jsxs("section", { className: "auth-card", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0412\u043E\u0439\u0442\u0438 \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0443" }), _jsx("span", { children: authBusy ? "Проверка..." : "Защищённый вход" })] }), _jsx("p", { className: "auth-caption", children: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0441\u0432\u043E\u0435\u0439 \u0443\u0447\u0451\u0442\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430." }), _jsxs("form", { className: "auth-form", onSubmit: handleLogin, children: [_jsxs("label", { children: [_jsx("span", { children: "\u041B\u043E\u0433\u0438\u043D" }), _jsx("input", { autoComplete: "username", value: authForm.username, onChange: (event) => setAuthForm((prev) => ({ ...prev, username: event.target.value })), placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D" })] }), _jsxs("label", { children: [_jsx("span", { children: "\u041F\u0430\u0440\u043E\u043B\u044C" }), _jsx("input", { type: "password", autoComplete: "current-password", value: authForm.password, onChange: (event) => setAuthForm((prev) => ({ ...prev, password: event.target.value })), placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C" })] }), _jsx("button", { className: "primary-btn", type: "submit", disabled: authBusy || !authForm.username || !authForm.password, children: "\u0412\u043E\u0439\u0442\u0438" })] }), _jsx("div", { className: "auth-support", children: "\u0415\u0441\u043B\u0438 \u0434\u043E\u0441\u0442\u0443\u043F \u043D\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442, \u043E\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044C \u043A \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443. \u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0430\u0440\u043E\u043B\u044F \u0447\u0435\u0440\u0435\u0437 \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441 \u043D\u0435 \u043F\u0440\u0435\u0434\u0443\u0441\u043C\u043E\u0442\u0440\u0435\u043D\u044B." }), error ? _jsx("div", { className: "error-box auth-error", children: error }) : null] })] })] }));
    }
    return (_jsxs("div", { className: "page-shell", children: [_jsxs("header", { className: "hero", children: [_jsxs("div", { children: [_jsx("div", { className: "eyebrow", children: "\u0421\u043A\u043B\u0430\u0434 \u0437\u0432\u0443\u043A\u0430 / \u0437\u0430\u0449\u0438\u0449\u0451\u043D\u043D\u044B\u0439 \u0434\u043E\u0441\u0442\u0443\u043F" }), _jsx("h1", { children: "\u0423\u0447\u0451\u0442 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F" }), _jsx("p", { children: "\u0415\u0434\u0438\u043D\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0432\u044B\u0434\u0430\u0447\u0430\u043C\u0438, \u0441\u043A\u043B\u0430\u0434\u043E\u043C, \u0437\u0430\u043A\u0443\u043F\u043A\u0430\u043C\u0438 \u0438 \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u043C." })] }), _jsxs("div", { className: "hero-card", children: [_jsxs("div", { children: [_jsx("span", { children: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C:" }), _jsx("strong", { children: actor?.fullName })] }), _jsxs("div", { children: [_jsx("span", { children: "\u0420\u043E\u043B\u044C:" }), _jsx("strong", { children: roleLabel(actor?.role ?? "") })] }), _jsxs("div", { children: [_jsx("span", { children: "\u041B\u043E\u0433\u0438\u043D:" }), _jsx("strong", { children: actor?.username })] }), _jsxs("div", { children: [_jsx("span", { children: "\u0421\u0435\u0441\u0441\u0438\u044F AI:" }), _jsx("strong", { children: sessionId ?? "новая" })] }), _jsx("button", { className: "secondary-btn hero-logout", onClick: handleLogout, children: "\u0412\u044B\u0439\u0442\u0438" })] })] }), error ? _jsx("div", { className: "error-box", children: error }) : null, _jsx("section", { className: "stats-grid", children: data ? (_jsxs(_Fragment, { children: [_jsxs("article", { className: "stat-card accent-1", children: [_jsx("span", { children: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435" }), _jsx("strong", { children: data.dashboard.equipmentCount })] }), _jsxs("article", { className: "stat-card accent-2", children: [_jsx("span", { children: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E (\u0448\u0442)" }), _jsx("strong", { children: data.dashboard.availableUnits })] }), _jsxs("article", { className: "stat-card accent-3", children: [_jsx("span", { children: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435 (\u0448\u0442)" }), _jsx("strong", { children: data.dashboard.inUseUnits })] }), _jsxs("article", { className: "stat-card accent-4", children: [_jsx("span", { children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0432\u044B\u0434\u0430\u0447\u0438" }), _jsx("strong", { children: data.dashboard.openIssues })] }), _jsxs("article", { className: "stat-card accent-5", children: [_jsx("span", { children: "\u0412 \u0440\u0435\u043C\u043E\u043D\u0442\u0435 (\u0448\u0442)" }), _jsx("strong", { children: data.dashboard.inRepairUnits })] }), _jsxs("article", { className: "stat-card accent-6", children: [_jsx("span", { children: "\u0417\u0430\u043A\u0443\u043F\u043A\u0438" }), _jsx("strong", { children: data.dashboard.activePurchases })] })] })) : (_jsx("div", { className: "loading-box", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u0432\u043E\u0434\u043A\u0438..." })) }), _jsxs("section", { className: "grid-two", children: [_jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "AI-\u043F\u043E\u043C\u043E\u0449\u043D\u0438\u043A" }), _jsx("span", { children: busy === "ai" ? "Обработка..." : "Готов" })] }), _jsx("textarea", { value: query, onChange: (event) => setQuery(event.target.value), rows: 3, placeholder: "\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u0447\u0442\u043E-\u043D\u0438\u0431\u0443\u0434\u044C..." }), _jsx("button", { className: "primary-btn", onClick: handleAiQuery, disabled: busy === "ai", children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441" }), aiResult ? (_jsx("div", { className: "response-box", children: _jsxs("div", { className: "chip-card", children: [_jsxs("strong", { children: ["\u041E\u0442\u0432\u0435\u0442 (", aiResult.intent, "):"] }), _jsx("p", { style: { margin: "4px 0 0", whiteSpace: "pre-wrap" }, children: aiResult.answer })] }) })) : null] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0420\u043E\u043B\u0438 \u0438 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0438" }), _jsx("span", { children: "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A" })] }), _jsx("div", { className: "stack-list", style: { maxHeight: "200px", overflowY: "auto" }, children: data?.employees.map((employee) => (_jsxs("div", { className: "list-row", style: { padding: "10px" }, children: [_jsx("strong", { children: employee.fullName }), _jsx("span", { className: "status-pill status-available", children: roleLabel(employee.role) })] }, employee.id))) })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F" }), _jsx("input", { className: "search-input", placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043C\u043E\u0434\u0435\u043B\u0438, \u0442\u0438\u043F\u0443, \u0441\u0435\u0440\u0438\u0439\u043D\u043E\u043C\u0443 \u043D\u043E\u043C\u0435\u0440\u0443", value: search, onChange: (event) => setSearch(event.target.value) })] }), _jsx("div", { className: "table-wrap", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u041C\u043E\u0434\u0435\u043B\u044C / \u0422\u0438\u043F" }), _jsx("th", { children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { children: "\u0421\u043A\u043B\u0430\u0434 / \u042F\u0447\u0435\u0439\u043A\u0438 (\u043E\u0441\u0442\u0430\u0442\u043E\u043A)" }), _jsx("th", { children: "\u0412\u0441\u0435\u0433\u043E \u0448\u0442." })] }) }), _jsx("tbody", { children: equipmentFiltered.map((item) => (_jsxs("tr", { children: [_jsxs("td", { children: [_jsxs("strong", { children: [item.name, " ", item.model] }), _jsxs("div", { className: "muted-text", children: [item.type, " ", item.serialNumber ? `· s/n: ${item.serialNumber}` : ""] })] }), _jsx("td", { children: item.categoryName }), _jsx("td", { children: _jsx("span", { className: `status-pill status-${item.status.toLowerCase()}`, children: statusLabel(item.status) }) }), _jsxs("td", { children: [item.locations.map((location) => (_jsxs("div", { style: { marginBottom: 4 }, children: [location.label, ": ", _jsx("strong", { children: location.quantity }), " \u0448\u0442."] }, location.id))), item.locations.length === 0 && _jsx("span", { className: "muted-text", children: "\u041D\u0435\u0442 \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435" })] }), _jsx("td", { children: item.totalQuantity })] }, item.id))) })] }) })] }), _jsxs("section", { className: "panel project-list-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u041C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F" }), _jsxs("span", { children: [data?.projects.length ?? 0, " \u0437\u0430\u043F\u0438\u0441\u0435\u0439"] })] }), _jsxs("div", { className: "project-list", children: [data?.projects.map((project) => (_jsxs("div", { className: "project-row", children: [_jsxs("div", { children: [_jsx("strong", { children: project.name }), _jsx("small", { children: fmtDateRange(project.startDate, project.endDate) })] }), _jsxs("div", { children: [_jsx("span", { children: project.customer || "Заказчик не указан" }), _jsx("small", { children: project.location || "Площадка не указана" })] }), project.comment ? _jsx("small", { children: project.comment }) : null] }, project.id))), data?.projects.length === 0 && _jsx("div", { className: "muted-text", children: "\u041C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0439 \u043D\u0435\u0442." })] })] }), actorId && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (_jsxs("section", { className: "grid-three", children: [_jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0412\u044B\u0434\u0430\u0447\u0430" }), _jsx("span", { children: busy === "issue" ? "Сохранение..." : "Новая запись" })] }), _jsxs("select", { value: issueForm.equipmentId, onChange: (event) => setIssueForm({ ...issueForm, equipmentId: event.target.value }), children: [_jsx("option", { value: "", children: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435" }), equipmentOptions.map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] }), _jsx("input", { type: "number", min: 1, value: issueForm.quantity, onChange: (event) => setIssueForm({ ...issueForm, quantity: Number(event.target.value) }), placeholder: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E" }), _jsxs("select", { value: issueForm.warehouseId, onChange: (event) => setIssueForm({ ...issueForm, warehouseId: event.target.value }), children: [_jsx("option", { value: "", children: "\u0421\u043A\u043B\u0430\u0434 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F" }), data?.warehouses.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] }), _jsxs("select", { value: issueForm.projectId, onChange: (event) => setIssueForm({ ...issueForm, projectId: event.target.value }), children: [_jsx("option", { value: "", children: "\u041C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), data?.projects.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] }), _jsxs("select", { value: issueForm.assignedEmployeeId, onChange: (event) => setIssueForm({ ...issueForm, assignedEmployeeId: event.target.value }), children: [_jsx("option", { value: "", children: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), data?.employees.map((item) => _jsx("option", { value: item.id, children: item.fullName }, item.id))] }), _jsx("input", { value: issueForm.purpose, onChange: (event) => setIssueForm({ ...issueForm, purpose: event.target.value }), placeholder: "\u0426\u0435\u043B\u044C \u0432\u044B\u0434\u0430\u0447\u0438" }), _jsx("input", { type: "datetime-local", value: issueForm.dueAt, onChange: (event) => setIssueForm({ ...issueForm, dueAt: event.target.value }) }), _jsx("button", { className: "primary-btn", onClick: submitIssue, disabled: !issueForm.equipmentId || !issueForm.warehouseId || !issueForm.dueAt, children: "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u0432\u044B\u0434\u0430\u0447\u0443" })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u041C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435" }), _jsx("span", { children: busy === "project" ? "Сохранение..." : "Добавление" })] }), _jsx("input", { value: projectForm.name, onChange: (event) => setProjectForm({ ...projectForm, name: event.target.value }), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F" }), _jsx("input", { value: projectForm.customer, onChange: (event) => setProjectForm({ ...projectForm, customer: event.target.value }), placeholder: "\u0417\u0430\u043A\u0430\u0437\u0447\u0438\u043A" }), _jsx("input", { value: projectForm.location, onChange: (event) => setProjectForm({ ...projectForm, location: event.target.value }), placeholder: "\u041F\u043B\u043E\u0449\u0430\u0434\u043A\u0430 / \u0430\u0434\u0440\u0435\u0441" }), _jsx("input", { type: "datetime-local", value: projectForm.startAt, onChange: (event) => setProjectForm({ ...projectForm, startAt: event.target.value }) }), _jsx("input", { type: "datetime-local", value: projectForm.endAt, onChange: (event) => setProjectForm({ ...projectForm, endAt: event.target.value }) }), _jsx("textarea", { value: projectForm.comment, onChange: (event) => setProjectForm({ ...projectForm, comment: event.target.value }), rows: 2, placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" }), _jsx("button", { className: "primary-btn", onClick: submitProject, disabled: !projectReady || busy === "project", children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435" })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0420\u0435\u043C\u043E\u043D\u0442" }), _jsx("span", { children: busy === "repair" ? "Сохранение..." : "Отправить" })] }), _jsxs("select", { value: repairForm.equipmentId, onChange: (event) => setRepairForm({ ...repairForm, equipmentId: event.target.value }), children: [_jsx("option", { value: "", children: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435" }), equipmentOptions.map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] }), _jsxs("select", { value: repairForm.warehouseId, onChange: (event) => setRepairForm({ ...repairForm, warehouseId: event.target.value }), children: [_jsx("option", { value: "", children: "\u0421\u043A\u043B\u0430\u0434" }), data?.warehouses.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] }), _jsxs("select", { value: repairForm.locationId, onChange: (event) => setRepairForm({ ...repairForm, locationId: event.target.value }), children: [_jsx("option", { value: "", children: "\u042F\u0447\u0435\u0439\u043A\u0430 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F" }), data?.locations.filter((location) => location.warehouseId === repairForm.warehouseId).map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] }), _jsx("input", { value: repairForm.reason, onChange: (event) => setRepairForm({ ...repairForm, reason: event.target.value }), placeholder: "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043D\u0435\u0438\u0441\u043F\u0440\u0430\u0432\u043D\u043E\u0441\u0442\u0438" }), _jsxs("select", { value: repairForm.responsibleId, onChange: (event) => setRepairForm({ ...repairForm, responsibleId: event.target.value }), children: [_jsx("option", { value: "", children: "\u041C\u0430\u0441\u0442\u0435\u0440 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), data?.employees.filter((employee) => employee.role === "ADMIN" || employee.role === "WAREHOUSE").map((item) => _jsx("option", { value: item.id, children: item.fullName }, item.id))] }), _jsx("button", { className: "primary-btn", onClick: submitRepair, disabled: !repairForm.equipmentId || !repairForm.locationId || !repairForm.reason, children: "\u041F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u0432 \u0440\u0435\u043C\u043E\u043D\u0442" })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0417\u0430\u043A\u0443\u043F\u043A\u0430" }), _jsx("span", { children: busy === "purchase" ? "Сохранение..." : "Заявка" })] }), _jsx("input", { value: purchaseForm.title, onChange: (event) => setPurchaseForm({ ...purchaseForm, title: event.target.value }), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438" }), _jsx("input", { value: purchaseForm.supplierName, onChange: (event) => setPurchaseForm({ ...purchaseForm, supplierName: event.target.value }), placeholder: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A" }), _jsxs("div", { className: "segmented-control", role: "group", "aria-label": "\u0422\u0438\u043F \u0437\u0430\u043A\u0443\u043F\u043A\u0438", children: [_jsx("button", { type: "button", className: purchaseForm.mode === "existing" ? "active" : "", onClick: () => setPurchaseForm({ ...purchaseForm, mode: "existing" }), children: "\u041F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435" }), _jsx("button", { type: "button", className: purchaseForm.mode === "new" ? "active" : "", onClick: () => setPurchaseForm({ ...purchaseForm, mode: "new" }), children: "\u041D\u043E\u0432\u0430\u044F \u043F\u043E\u0437\u0438\u0446\u0438\u044F" })] }), purchaseForm.mode === "existing" ? (_jsxs("select", { value: purchaseForm.equipmentId, onChange: (event) => setPurchaseForm({ ...purchaseForm, equipmentId: event.target.value }), children: [_jsx("option", { value: "", children: "\u041F\u043E\u0437\u0438\u0446\u0438\u044F \u0438\u0437 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430" }), equipmentOptions.map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] })) : (_jsxs(_Fragment, { children: [_jsxs("select", { value: purchaseForm.categoryId, onChange: (event) => setPurchaseForm({ ...purchaseForm, categoryId: event.target.value }), children: [_jsx("option", { value: "", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), data?.categories.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] }), _jsx("input", { value: purchaseForm.name, onChange: (event) => setPurchaseForm({ ...purchaseForm, name: event.target.value }), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435: \u043F\u0443\u043B\u044C\u0442, \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D, \u0441\u0442\u043E\u0439\u043A\u0430" }), _jsx("input", { value: purchaseForm.type, onChange: (event) => setPurchaseForm({ ...purchaseForm, type: event.target.value }), placeholder: "\u0422\u0438\u043F: \u0446\u0438\u0444\u0440\u043E\u0432\u043E\u0439 \u043C\u0438\u043A\u0448\u0435\u0440, \u0440\u0430\u0434\u0438\u043E\u0441\u0438\u0441\u0442\u0435\u043C\u0430" }), _jsx("input", { value: purchaseForm.model, onChange: (event) => setPurchaseForm({ ...purchaseForm, model: event.target.value }), placeholder: "\u041C\u043E\u0434\u0435\u043B\u044C" }), _jsx("input", { value: purchaseForm.manufacturer, onChange: (event) => setPurchaseForm({ ...purchaseForm, manufacturer: event.target.value }), placeholder: "\u041F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C" }), _jsx("input", { value: purchaseForm.serialNumber, onChange: (event) => setPurchaseForm({ ...purchaseForm, serialNumber: event.target.value }), placeholder: "\u0421\u0435\u0440\u0438\u0439\u043D\u044B\u0439 \u043D\u043E\u043C\u0435\u0440" }), _jsx("input", { value: purchaseForm.description, onChange: (event) => setPurchaseForm({ ...purchaseForm, description: event.target.value }), placeholder: "\u041F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u0435" }), _jsx("input", { type: "number", min: 0, value: purchaseForm.minStock, onChange: (event) => setPurchaseForm({ ...purchaseForm, minStock: Number(event.target.value) }), placeholder: "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A" })] })), _jsx("input", { type: "number", min: 1, value: purchaseForm.quantity, onChange: (event) => setPurchaseForm({ ...purchaseForm, quantity: Number(event.target.value) }), placeholder: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E" }), _jsxs("select", { value: purchaseForm.locationId, onChange: (event) => setPurchaseForm({ ...purchaseForm, locationId: event.target.value }), children: [_jsx("option", { value: "", children: "\u042F\u0447\u0435\u0439\u043A\u0430 \u043F\u0440\u0438\u0451\u043C\u043A\u0438" }), locationOptions.map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] }), _jsx("button", { className: "primary-btn", onClick: submitPurchase, disabled: !purchaseReady, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u043A\u0443\u043F\u043A\u0443" })] })] })) : (_jsx("div", { className: "panel", children: _jsx("p", { style: { textAlign: "center", color: "var(--muted)" }, children: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432 \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0432\u044B\u0434\u0430\u0447, \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u0432 \u0438 \u0437\u0430\u043A\u0443\u043F\u043E\u043A. \u041D\u0443\u0436\u043D\u0430 \u0440\u043E\u043B\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430 \u0438\u043B\u0438 \u043A\u043B\u0430\u0434\u043E\u0432\u0449\u0438\u043A\u0430." }) })), _jsxs("section", { className: "grid-two", children: [_jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0432 \u0440\u0430\u0431\u043E\u0442\u0435" }), _jsxs("span", { children: [data?.issues.length ?? 0, " \u0437\u0430\u043F\u0438\u0441\u0435\u0439"] })] }), _jsxs("div", { className: "stack-list", children: [data?.issues.map((issue) => (_jsxs("div", { className: "list-row", children: [_jsxs("strong", { children: [issue.purpose, " ", issue.project ? `(${issue.project.name})` : ""] }), _jsx("span", { children: _jsx("span", { className: `status-pill status-${issue.status.toLowerCase()}`, children: statusLabel(issue.status) }) }), _jsxs("small", { children: ["\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439: ", issue.assignedEmployee?.fullName ?? "Нет", " \u00B7 \u0412\u0435\u0440\u043D\u0443\u0442\u044C: ", fmtDate(issue.dueAt)] }), _jsx("div", { style: { marginTop: 6 }, children: issue.items.map((item, index) => (_jsxs("div", { style: { fontSize: 13 }, children: ["- ", item.equipment.name, " ", item.equipment.model, " (x", item.quantity, ")"] }, index))) }), issue.status !== "RETURNED" && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (_jsx("button", { className: "secondary-btn", onClick: () => closeIssue(issue.id), disabled: busy === issue.id, children: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u043D\u0430 \u0441\u043A\u043B\u0430\u0434" })) : null] }, issue.id))), data?.issues.length === 0 && _jsx("div", { className: "muted-text", children: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0432\u044B\u0434\u0430\u0447." })] })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsx("h2", { children: "\u0420\u0435\u043C\u043E\u043D\u0442 \u0438 \u0437\u0430\u043A\u0443\u043F\u043A\u0438" }) }), _jsxs("div", { className: "stack-list", children: [data?.repairs.map((repair) => (_jsxs("div", { className: "list-row", children: [_jsxs("strong", { children: [repair.equipment.name, " ", repair.equipment.model, " (x", repair.quantity, ")"] }), _jsx("span", { children: _jsx("span", { className: `status-pill status-${repair.status.toLowerCase()}`, children: statusLabel(repair.status) }) }), _jsxs("small", { children: ["\u041F\u0440\u0438\u0447\u0438\u043D\u0430: ", repair.reason, ". ", repair.diagnosis ? `Диагноз: ${repair.diagnosis}` : ""] })] }, repair.id))), data?.purchases.map((purchase) => (_jsxs("div", { className: "list-row", children: [_jsx("strong", { children: purchase.title }), _jsx("span", { children: _jsx("span", { className: `status-pill status-${purchase.status.toLowerCase()}`, children: statusLabel(purchase.status) }) }), _jsxs("small", { children: ["\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A: ", purchase.supplierName, ". \u041F\u043B\u0430\u043D: ", fmtDate(purchase.plannedDeliveryAt)] }), _jsx("div", { className: "purchase-items", children: purchase.items.map((item, index) => (_jsxs("div", { children: [_jsx("span", { className: `status-pill ${item.mode === "new" ? "status-partial" : "status-ordered"}`, children: item.mode === "new" ? "Новая" : "Пополнение" }), _jsxs("span", { children: [item.itemName, " (x", item.quantity, ")"] }), item.categoryName ? _jsxs("small", { children: ["\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F: ", item.categoryName] }) : null, item.locationLabel ? _jsxs("small", { children: ["\u041F\u0440\u0438\u0451\u043C\u043A\u0430: ", item.locationLabel] }) : null] }, index))) }), purchase.status !== "DELIVERED" && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (_jsx("button", { className: "secondary-btn", onClick: () => receivePurchase(purchase.id), disabled: busy === purchase.id, children: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u0437\u0430\u043A\u0443\u043F\u043A\u0443" })) : null] }, purchase.id))), (!data?.repairs.length && !data?.purchases.length) && _jsx("div", { className: "muted-text", children: "\u041D\u0435\u0442 \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u0432 \u0438 \u0437\u0430\u043A\u0443\u043F\u043E\u043A." })] })] })] })] }));
}
