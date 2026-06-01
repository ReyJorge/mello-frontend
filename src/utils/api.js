/**
 * API base URL pro chat backend.
 *
 * Vývoj (Vite): prázdné = same-origin /api → proxy na localhost:5000 (vite.config.js)
 * Netlify produkce: prázdné = same-origin /api/chat → redirect na Netlify Function
 *
 * VITE_API_URL nastavujte jen pro lokální backend mimo proxy (např. http://127.0.0.1:5001).
 * Na Netlify NENASTAVUJTE – jinak fetch míří na localhost a chat selže.
 */
export function getApiBase() {
  const env = import.meta.env.VITE_API_URL;
  if (env && String(env).trim()) {
    if (import.meta.env.PROD) {
      console.warn(
        "[Mello] VITE_API_URL je nastavené v produkčním buildu – chat může selhat. Na Netlify ho odstraňte."
      );
    }
    return String(env).trim().replace(/\/$/, "");
  }
  return "";
}

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
