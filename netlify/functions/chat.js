const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SYSTEM_PROMPT =
  "Jste Mello, laskavý český digitální společník pro seniory. Vždy odpovídáte česky, jednoduše, klidně a srozumitelně. Uživatelům vždy vykáte. Nepoužíváte infantilní tón. Nepředstíráte odbornou lékařskou ani právní radu.";

function respond(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

async function openaiChat(apiKey, messages) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 0.7,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg =
      data?.error?.message ??
      `OpenAI HTTP ${response.status}`;
    const err = new Error(msg);
    err.status = response.status;
    err.code = data?.error?.code;
    throw err;
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Empty response from OpenAI");
  }

  return reply;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: JSON_HEADERS, body: "" };
  }

  if (event.httpMethod === "GET") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    return respond(200, {
      ok: true,
      openaiConfigured: Boolean(apiKey),
      hint: apiKey
        ? "Chat API is ready"
        : "Set OPENAI_API_KEY in Netlify → Site configuration → Environment variables → Production, then redeploy",
    });
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("CHAT_FUNCTION_ERROR", "OPENAI_API_KEY is not set on Netlify");
    return respond(500, {
      error: "CHAT_FUNCTION_ERROR",
      detail: "OPENAI_API_KEY is not set on Netlify",
    });
  }

  let message = "";
  let messages = null;

  try {
    const parsed = JSON.parse(event.body || "{}");
    message = typeof parsed.message === "string" ? parsed.message.trim() : "";
    messages = Array.isArray(parsed.messages) ? parsed.messages : null;
  } catch (parseError) {
    console.error("CHAT_FUNCTION_ERROR", parseError);
    return respond(400, {
      error: "CHAT_FUNCTION_ERROR",
      detail: parseError?.message ?? "Invalid JSON body",
    });
  }

  const chatMessages = messages?.length
    ? messages
    : message
      ? [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ]
      : null;

  if (!chatMessages?.length) {
    return respond(400, {
      error: "CHAT_FUNCTION_ERROR",
      detail: "Missing message",
    });
  }

  try {
    const reply = await openaiChat(apiKey, chatMessages);
    return respond(200, { reply });
  } catch (error) {
    console.error("CHAT_FUNCTION_ERROR", error);
    const status = error?.status === 429 ? 503 : 500;
    let detail = error?.message ?? String(error);
    if (error?.code === "insufficient_quota" || error?.status === 429) {
      detail =
        "OpenAI kvóta vyčerpána. Zkontrolujte billing na platform.openai.com.";
    }
    return respond(status, {
      error: "CHAT_FUNCTION_ERROR",
      detail,
    });
  }
}
