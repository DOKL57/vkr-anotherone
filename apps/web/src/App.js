import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "./api";
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
function fmtDate(value) {
    return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
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
        SOUND_ENGINEER: "Звукорежиссер"
    };
    return map[role] ?? role;
}
export default function App() {
    const [data, setData] = useState(null);
    const [query, setQuery] = useState("Где есть Shure SM58 и сколько XLR кабелей доступно?");
    const [aiResult, setAiResult] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [uploadResult, setUploadResult] = useState(null);
    const [search, setSearch] = useState("");
    const [authMode, setAuthMode] = useState("guest");
    const [actorId, setActorId] = useState(null);
    const [actorRole, setActorRole] = useState(null);
    const [issueForm, setIssueForm] = useState(emptyIssueForm);
    const [repairForm, setRepairForm] = useState(emptyRepairForm);
    const [purchaseForm, setPurchaseForm] = useState(emptyPurchaseForm);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    async function loadData() {
        try {
            const bootstrap = await fetchJson("/api/bootstrap");
            setData(bootstrap);
            // If we are in demo mode and haven't picked an actor yet, pick the first one
            if (authMode === "demo" && !actorId && bootstrap.employees.length > 0) {
                setActorId(bootstrap.employees[0].id);
                setActorRole(bootstrap.employees[0].role);
            }
        }
        catch (err) {
            setError(String(err));
        }
    }
    useEffect(() => {
        setAuthMode("demo");
        loadData();
    }, []);
    const equipmentFiltered = useMemo(() => {
        if (!data)
            return [];
        if (!search)
            return data.equipment;
        const lq = search.toLowerCase();
        return data.equipment.filter(e => e.name.toLowerCase().includes(lq) ||
            e.model.toLowerCase().includes(lq) ||
            e.type.toLowerCase().includes(lq) ||
            (e.serialNumber && e.serialNumber.toLowerCase().includes(lq)));
    }, [data, search]);
    const equipmentOptions = useMemo(() => (data?.equipment ?? []).map((item) => ({ id: item.id, label: `${item.name} ${item.model}` })), [data]);
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
            setError(String(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function submitIssue() {
        if (!actorId)
            return setError("Нет прав для операции (не авторизован).");
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
            setError(String(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function submitRepair() {
        if (!actorId)
            return setError("Нет прав для операции (не авторизован).");
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
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setBusy(null);
        }
    }
    async function submitPurchase() {
        if (!actorId)
            return setError("Нет прав для операции (не авторизован).");
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
        }
        catch (err) {
            setError(String(err));
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
            setError(String(err));
        }
        finally {
            setBusy(null);
        }
    }
    return (_jsxs("div", { className: "page-shell", children: [_jsxs("header", { className: "hero", children: [_jsxs("div", { children: [_jsxs("div", { className: "eyebrow", children: ["\u0421\u043A\u043B\u0430\u0434 \u0437\u0432\u0443\u043A\u0430 / ", authMode] }), _jsx("h1", { children: "\u0423\u0447\u0451\u0442 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F" }), _jsx("p", { children: "\u0415\u0434\u0438\u043D\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0432\u044B\u0434\u0430\u0447\u0435\u0439, \u0441\u043A\u043B\u0430\u0434\u043E\u043C, \u0437\u0430\u043A\u0443\u043F\u043A\u0430\u043C\u0438 \u0438 \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u043C." })] }), _jsxs("div", { className: "hero-card", children: [_jsxs("div", { children: ["\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F:", _jsxs("select", { value: actorId ?? "", onChange: e => {
                                            const targetId = e.target.value;
                                            const emp = data?.employees.find(x => x.id === targetId);
                                            if (emp) {
                                                if (window.confirm(`Вы уверены, что хотите сменить пользователя на "${emp.fullName}"?\nПрава доступа будут изменены на: ${roleLabel(emp.role)}`)) {
                                                    setActorId(targetId);
                                                    setActorRole(emp.role);
                                                    setSessionId(null);
                                                }
                                            }
                                        }, style: { width: "auto", padding: "4px 8px", marginBottom: 0, marginLeft: 8 }, children: [_jsx("option", { value: "", disabled: true, children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430..." }), data?.employees.map(emp => _jsxs("option", { value: emp.id, children: [emp.fullName, " (", roleLabel(emp.role), ")"] }, emp.id))] })] }), _jsxs("div", { children: ["\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439: ", data?.categories.length ?? "..."] }), _jsxs("div", { children: ["\u0421\u0435\u0441\u0441\u0438\u044F AI: ", sessionId ?? "новая"] })] })] }), error ? _jsx("div", { className: "error-box", children: error }) : null, _jsx("section", { className: "stats-grid", children: data ? (_jsxs(_Fragment, { children: [_jsxs("article", { className: "stat-card accent-1", children: [_jsx("span", { children: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435" }), _jsx("strong", { children: data.dashboard.equipmentCount })] }), _jsxs("article", { className: "stat-card accent-2", children: [_jsx("span", { children: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E (\u0448\u0442)" }), _jsx("strong", { children: data.dashboard.availableUnits })] }), _jsxs("article", { className: "stat-card accent-3", children: [_jsx("span", { children: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435 (\u0448\u0442)" }), _jsx("strong", { children: data.dashboard.inUseUnits })] }), _jsxs("article", { className: "stat-card accent-4", children: [_jsx("span", { children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0432\u044B\u0434\u0430\u0447\u0438" }), _jsx("strong", { children: data.dashboard.openIssues })] }), _jsxs("article", { className: "stat-card accent-5", children: [_jsx("span", { children: "\u0412 \u0440\u0435\u043C\u043E\u043D\u0442\u0435 (\u0448\u0442)" }), _jsx("strong", { children: data.dashboard.inRepairUnits })] }), _jsxs("article", { className: "stat-card accent-6", children: [_jsx("span", { children: "\u0417\u0430\u043A\u0443\u043F\u043A\u0438" }), _jsx("strong", { children: data.dashboard.activePurchases })] })] })) : (_jsx("div", { className: "loading-box", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u0432\u043E\u0434\u043A\u0438\u2026" })) }), _jsxs("section", { className: "grid-two", children: [_jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "AI-\u043F\u043E\u043C\u043E\u0449\u043D\u0438\u043A" }), _jsx("span", { children: busy === "ai" ? "Обработка…" : "Готов" })] }), _jsx("textarea", { value: query, onChange: (e) => setQuery(e.target.value), rows: 3, placeholder: "\u0421\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u0447\u0442\u043E-\u043D\u0438\u0431\u0443\u0434\u044C..." }), _jsx("button", { className: "primary-btn", onClick: handleAiQuery, disabled: busy === "ai", children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441" }), aiResult ? (_jsx("div", { className: "response-box", children: _jsxs("div", { className: "chip-card", children: [_jsxs("strong", { children: ["\u041E\u0442\u0432\u0435\u0442 (", aiResult.intent, "):"] }), _jsx("p", { style: { margin: "4px 0 0", whiteSpace: "pre-wrap" }, children: aiResult.answer })] }) })) : null] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0420\u043E\u043B\u0438 \u0438 \u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0438" }), _jsx("span", { children: "\u0421\u043F\u0440\u0430\u0432\u043E\u0447\u043D\u0438\u043A" })] }), _jsx("div", { className: "stack-list", style: { maxHeight: "200px", overflowY: "auto" }, children: data?.employees.map(emp => (_jsxs("div", { className: "list-row", style: { padding: "10px" }, children: [_jsx("strong", { children: emp.fullName }), _jsx("span", { className: "status-pill status-available", children: roleLabel(emp.role) })] }, emp.id))) })] })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u041A\u0430\u0442\u0430\u043B\u043E\u0433 \u043E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u044F" }), _jsx("input", { className: "search-input", placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043C\u043E\u0434\u0435\u043B\u0438, \u0442\u0438\u043F\u0443, \u0441\u0435\u0440\u0438\u0439\u043D\u043E\u043C\u0443 \u043D\u043E\u043C\u0435\u0440\u0443", value: search, onChange: (e) => setSearch(e.target.value) })] }), _jsx("div", { className: "table-wrap", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u041C\u043E\u0434\u0435\u043B\u044C / \u0422\u0438\u043F" }), _jsx("th", { children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { children: "\u0421\u043A\u043B\u0430\u0434 / \u042F\u0447\u0435\u0439\u043A\u0438 (\u043E\u0441\u0442\u0430\u0442\u043E\u043A)" }), _jsx("th", { children: "\u0412\u0441\u0435\u0433\u043E \u0448\u0442." })] }) }), _jsx("tbody", { children: equipmentFiltered.map((item) => (_jsxs("tr", { children: [_jsxs("td", { children: [_jsxs("strong", { children: [item.name, " ", item.model] }), _jsxs("div", { className: "muted-text", children: [item.type, " ", item.serialNumber ? `· s/n: ${item.serialNumber}` : ""] })] }), _jsx("td", { children: item.categoryName }), _jsx("td", { children: _jsx("span", { className: `status-pill status-${item.status.toLowerCase()}`, children: statusLabel(item.status) }) }), _jsxs("td", { children: [item.locations.map((loc) => (_jsxs("div", { style: { marginBottom: 4 }, children: [loc.label, ": ", _jsx("strong", { children: loc.quantity }), " \u0448\u0442."] }, loc.id))), item.locations.length === 0 && _jsx("span", { className: "muted-text", children: "\u041D\u0435\u0442 \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435" })] }), _jsx("td", { children: item.totalQuantity })] }, item.id))) })] }) })] }), actorId && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (_jsxs("section", { className: "grid-three", children: [_jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0412\u044B\u0434\u0430\u0447\u0430" }), _jsx("span", { children: busy === "issue" ? "Сохранение…" : "Новая запись" })] }), _jsxs("select", { value: issueForm.equipmentId, onChange: (e) => setIssueForm({ ...issueForm, equipmentId: e.target.value }), children: [_jsx("option", { value: "", children: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435" }), equipmentOptions.map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] }), _jsx("input", { type: "number", min: 1, value: issueForm.quantity, onChange: (e) => setIssueForm({ ...issueForm, quantity: Number(e.target.value) }), placeholder: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E" }), _jsxs("select", { value: issueForm.warehouseId, onChange: (e) => setIssueForm({ ...issueForm, warehouseId: e.target.value }), children: [_jsx("option", { value: "", children: "\u0421\u043A\u043B\u0430\u0434 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F" }), data?.warehouses.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] }), _jsxs("select", { value: issueForm.projectId, onChange: (e) => setIssueForm({ ...issueForm, projectId: e.target.value }), children: [_jsx("option", { value: "", children: "\u041F\u0440\u043E\u0435\u043A\u0442 / \u0418\u0432\u0435\u043D\u0442 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), data?.projects.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] }), _jsxs("select", { value: issueForm.assignedEmployeeId, onChange: (e) => setIssueForm({ ...issueForm, assignedEmployeeId: e.target.value }), children: [_jsx("option", { value: "", children: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), data?.employees.map((item) => _jsx("option", { value: item.id, children: item.fullName }, item.id))] }), _jsx("input", { value: issueForm.purpose, onChange: (e) => setIssueForm({ ...issueForm, purpose: e.target.value }), placeholder: "\u0426\u0435\u043B\u044C \u0432\u044B\u0434\u0430\u0447\u0438" }), _jsx("input", { type: "datetime-local", value: issueForm.dueAt, onChange: (e) => setIssueForm({ ...issueForm, dueAt: e.target.value }) }), _jsx("button", { className: "primary-btn", onClick: submitIssue, disabled: !issueForm.equipmentId || !issueForm.warehouseId || !issueForm.dueAt, children: "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u0432\u044B\u0434\u0430\u0447\u0443" })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0420\u0435\u043C\u043E\u043D\u0442" }), _jsx("span", { children: busy === "repair" ? "Сохранение…" : "Отправить" })] }), _jsxs("select", { value: repairForm.equipmentId, onChange: (e) => setRepairForm({ ...repairForm, equipmentId: e.target.value }), children: [_jsx("option", { value: "", children: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435" }), equipmentOptions.map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] }), _jsxs("select", { value: repairForm.warehouseId, onChange: (e) => setRepairForm({ ...repairForm, warehouseId: e.target.value }), children: [_jsx("option", { value: "", children: "\u0421\u043A\u043B\u0430\u0434" }), data?.warehouses.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id))] }), _jsxs("select", { value: repairForm.locationId, onChange: (e) => setRepairForm({ ...repairForm, locationId: e.target.value }), children: [_jsx("option", { value: "", children: "\u042F\u0447\u0435\u0439\u043A\u0430 \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F" }), data?.locations.filter(l => l.warehouseId === repairForm.warehouseId).map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] }), _jsx("input", { value: repairForm.reason, onChange: (e) => setRepairForm({ ...repairForm, reason: e.target.value }), placeholder: "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u043D\u0435\u0438\u0441\u043F\u0440\u0430\u0432\u043D\u043E\u0441\u0442\u0438" }), _jsxs("select", { value: repairForm.responsibleId, onChange: (e) => setRepairForm({ ...repairForm, responsibleId: e.target.value }), children: [_jsx("option", { value: "", children: "\u041C\u0430\u0441\u0442\u0435\u0440 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), data?.employees.filter(e => e.role === "ADMIN" || e.role === "WAREHOUSE").map((item) => _jsx("option", { value: item.id, children: item.fullName }, item.id))] }), _jsx("button", { className: "primary-btn", onClick: submitRepair, disabled: !repairForm.equipmentId || !repairForm.locationId || !repairForm.reason, children: "\u041F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u0432 \u0440\u0435\u043C\u043E\u043D\u0442" })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u0417\u0430\u043A\u0443\u043F\u043A\u0430" }), _jsx("span", { children: busy === "purchase" ? "Сохранение…" : "Заявка" })] }), _jsx("input", { value: purchaseForm.title, onChange: (e) => setPurchaseForm({ ...purchaseForm, title: e.target.value }), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438" }), _jsx("input", { value: purchaseForm.supplierName, onChange: (e) => setPurchaseForm({ ...purchaseForm, supplierName: e.target.value }), placeholder: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A" }), _jsxs("select", { value: purchaseForm.equipmentId, onChange: (e) => setPurchaseForm({ ...purchaseForm, equipmentId: e.target.value }), children: [_jsx("option", { value: "", children: "\u041F\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u043F\u043E\u0437\u0438\u0446\u0438\u044E (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), equipmentOptions.map((item) => _jsx("option", { value: item.id, children: item.label }, item.id))] }), !purchaseForm.equipmentId && _jsx("input", { value: purchaseForm.itemName, onChange: (e) => setPurchaseForm({ ...purchaseForm, itemName: e.target.value }), placeholder: "\u0418\u043B\u0438 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043D\u043E\u0432\u043E\u0439 \u043F\u043E\u0437\u0438\u0446\u0438\u0438" }), _jsx("input", { type: "number", min: 1, value: purchaseForm.quantity, onChange: (e) => setPurchaseForm({ ...purchaseForm, quantity: Number(e.target.value) }), placeholder: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E" }), _jsx("button", { className: "primary-btn", onClick: submitPurchase, disabled: !purchaseForm.title || !purchaseForm.supplierName, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u043A\u0443\u043F\u043A\u0443" })] })] })) : actorId ? (_jsx("div", { className: "panel", children: _jsx("p", { style: { textAlign: "center", color: "var(--muted)" }, children: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u0440\u0430\u0432 \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0432\u044B\u0434\u0430\u0447, \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u0432 \u0438 \u0437\u0430\u043A\u0443\u043F\u043E\u043A. \u041D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u0430 \u0440\u043E\u043B\u044C \u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430 \u0438\u043B\u0438 \u041A\u043B\u0430\u0434\u043E\u0432\u0449\u0438\u043A\u0430." }) })) : (_jsx("div", { className: "panel", children: _jsx("p", { style: { textAlign: "center", color: "var(--muted)" }, children: "\u0410\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435\u0441\u044C, \u0447\u0442\u043E\u0431\u044B \u0441\u043E\u0437\u0434\u0430\u0432\u0430\u0442\u044C \u0432\u044B\u0434\u0430\u0447\u0438, \u0440\u0435\u043C\u043E\u043D\u0442\u044B \u0438 \u0437\u0430\u043A\u0443\u043F\u043A\u0438." }) })), _jsxs("section", { className: "grid-two", children: [_jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "\u041E\u0431\u043E\u0440\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0432 \u0440\u0430\u0431\u043E\u0442\u0435" }), _jsxs("span", { children: [data?.issues.length ?? 0, " \u0437\u0430\u043F\u0438\u0441\u0435\u0439"] })] }), _jsxs("div", { className: "stack-list", children: [data?.issues.map((issue) => (_jsxs("div", { className: "list-row", children: [_jsxs("strong", { children: [issue.purpose, " ", issue.project ? `(${issue.project.name})` : ""] }), _jsx("span", { children: _jsx("span", { className: `status-pill status-${issue.status.toLowerCase()}`, children: statusLabel(issue.status) }) }), _jsxs("small", { children: ["\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439: ", issue.assignedEmployee?.fullName ?? "Нет", " \u00B7 \u0412\u0435\u0440\u043D\u0443\u0442\u044C: ", fmtDate(issue.dueAt)] }), _jsx("div", { style: { marginTop: 6 }, children: issue.items.map((item, idx) => (_jsxs("div", { style: { fontSize: 13 }, children: ["- ", item.equipment.name, " ", item.equipment.model, " (x", item.quantity, ")"] }, idx))) }), issue.status !== "RETURNED" && (actorRole === "ADMIN" || actorRole === "WAREHOUSE") ? (_jsx("button", { className: "secondary-btn", onClick: () => closeIssue(issue.id), disabled: busy === issue.id, children: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u043D\u0430 \u0441\u043A\u043B\u0430\u0434" })) : null] }, issue.id))), data?.issues.length === 0 && _jsx("div", { className: "muted-text", children: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0432\u044B\u0434\u0430\u0447." })] })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsx("h2", { children: "\u0420\u0435\u043C\u043E\u043D\u0442 \u0438 \u0417\u0430\u043A\u0443\u043F\u043A\u0438" }) }), _jsxs("div", { className: "stack-list", children: [data?.repairs.map((repair) => (_jsxs("div", { className: "list-row", children: [_jsxs("strong", { children: [repair.equipment.name, " ", repair.equipment.model, " (x", repair.quantity, ")"] }), _jsx("span", { children: _jsx("span", { className: `status-pill status-${repair.status.toLowerCase()}`, children: statusLabel(repair.status) }) }), _jsxs("small", { children: ["\u041F\u0440\u0438\u0447\u0438\u043D\u0430: ", repair.reason, ". ", repair.diagnosis ? `Диагноз: ${repair.diagnosis}` : ""] })] }, repair.id))), data?.purchases.map((purchase) => (_jsxs("div", { className: "list-row", children: [_jsx("strong", { children: purchase.title }), _jsx("span", { children: _jsx("span", { className: `status-pill status-${purchase.status.toLowerCase()}`, children: statusLabel(purchase.status) }) }), _jsxs("small", { children: ["\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A: ", purchase.supplierName, ". ", purchase.items.map(i => `${i.itemName} (x${i.quantity})`).join(", ")] })] }, purchase.id))), (!data?.repairs.length && !data?.purchases.length) && _jsx("div", { className: "muted-text", children: "\u041D\u0435\u0442 \u0440\u0435\u043C\u043E\u043D\u0442\u043E\u0432 \u0438 \u0437\u0430\u043A\u0443\u043F\u043E\u043A." })] })] })] })] }));
}
