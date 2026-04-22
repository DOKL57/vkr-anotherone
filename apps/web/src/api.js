const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const AUTH_STORAGE_KEY = "sound-rental-auth";
function apiUrl(path) {
    return API_URL ? `${API_URL}${path}` : path;
}
function getAuthToken() {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        return typeof parsed.token === "string" ? parsed.token : null;
    }
    catch {
        return null;
    }
}
async function readError(response) {
    const text = await response.text();
    if (!text) {
        return `HTTP ${response.status}`;
    }
    try {
        const parsed = JSON.parse(text);
        if (parsed.error) {
            return parsed.error;
        }
    }
    catch {
        // ignore json parse errors
    }
    return text;
}
export function readStoredAuthSession() {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed?.token || !parsed?.employee?.id) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
export function writeStoredAuthSession(session) {
    if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    }
}
export function clearStoredAuthSession() {
    if (typeof window !== "undefined") {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
}
export async function fetchJson(path, init) {
    const token = getAuthToken();
    const response = await fetch(apiUrl(path), {
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(init?.headers ?? {})
        },
        ...init
    });
    if (!response.ok) {
        const error = new Error(await readError(response));
        error.status = response.status;
        throw error;
    }
    return response.json();
}
export async function uploadFile(path, formData) {
    const token = getAuthToken();
    const response = await fetch(apiUrl(path), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
    });
    if (!response.ok) {
        const error = new Error(await readError(response));
        error.status = response.status;
        throw error;
    }
    return response.json();
}
