const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function apiRequest(path, options = {}, token = null) {
  if (!API_BASE_URL) {
    throw new Error("API URL is not configured. Set EXPO_PUBLIC_API_URL before starting the app.");
  }

  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}
