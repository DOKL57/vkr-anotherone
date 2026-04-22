const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
function apiUrl(path) {
    return API_URL ? `${API_URL}${path}` : path;
}
export async function fetchJson(path, init) {
    const response = await fetch(apiUrl(path), {
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {})
        },
        ...init
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
    }
    return response.json();
}
export async function uploadFile(path, formData) {
    const response = await fetch(apiUrl(path), {
        method: "POST",
        body: formData
    });
    if (!response.ok) {
        throw new Error(await response.text());
    }
    return response.json();
}
