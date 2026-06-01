/**
 * API base URL: VITE_API_URL (optional) or same-origin /api (Vite proxy in dev).
 */
export function getApiBase() {
  const env = import.meta.env.VITE_API_URL;
  if (env) return env.replace(/\/$/, "");
  return "";
}

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
