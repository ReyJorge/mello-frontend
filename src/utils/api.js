/**
 * Chat API – v produkci vždy same-origin /api/chat (Netlify Function).
 * VITE_API_URL jen pro lokální vývoj; localhost/127.0.0.1 se v produkci ignoruje.
 */

function isLocalDevApiUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url, "http://localhost").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

export function getApiBase() {
  if (import.meta.env.PROD) {
    return "";
  }

  const env = import.meta.env.VITE_API_URL;
  if (!env || !String(env).trim()) {
    return "";
  }

  const trimmed = String(env).trim().replace(/\/$/, "");
  if (isLocalDevApiUrl(trimmed)) {
    return trimmed;
  }

  console.warn("[Mello] VITE_API_URL ignorováno – používám /api/chat");
  return "";
}

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/**
 * Odešle zprávu na chat API. Vrací { reply } nebo hodí Error s popisem.
 */
export async function postChat(message) {
  const text = String(message ?? "").trim();
  if (!text) {
    throw new Error("Chyba chatu: prázdná zpráva");
  }

  const url = apiUrl("/api/chat");

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
  } catch (networkErr) {
    console.error("[Mello chat] Síťová chyba:", { url, networkErr });
    throw new Error(
      `Chyba chatu: síť – ${networkErr?.message ?? "nelze se spojit se serverem"}`
    );
  }

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (parseErr) {
    console.error("[Mello chat] Neplatná JSON odpověď:", {
      url,
      status: response.status,
      raw: raw.slice(0, 200),
      parseErr,
    });
    throw new Error(
      `Chyba chatu: ${response.status} – server nevrátil JSON (možná SPA fallback)`
    );
  }

  if (!response.ok) {
    const detail = data?.detail ?? data?.error ?? response.statusText;
    console.error("[Mello chat] API chyba:", {
      url,
      status: response.status,
      data,
    });
    throw new Error(`Chyba chatu: ${response.status} – ${detail}`);
  }

  if (data?.error) {
    const detail = data.detail ?? data.error;
    console.error("[Mello chat] CHAT_FUNCTION_ERROR:", detail);
    throw new Error(`Chyba chatu: ${detail}`);
  }

  if (!data?.reply || typeof data.reply !== "string") {
    console.error("[Mello chat] Chybí pole reply:", { url, data });
    throw new Error("Chyba chatu: odpověď bez pole reply");
  }

  return { reply: data.reply };
}
