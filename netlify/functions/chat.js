import OpenAI from "openai";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: JSON_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set on Netlify");
    console.error("CHAT_FUNCTION_ERROR", err);
    return respond(500, {
      error: "CHAT_FUNCTION_ERROR",
      detail: err.message,
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
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: chatMessages,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      const err = new Error("Empty response from OpenAI");
      console.error("CHAT_FUNCTION_ERROR", err);
      return respond(500, {
        error: "CHAT_FUNCTION_ERROR",
        detail: err.message,
      });
    }

    return respond(200, { reply });
  } catch (error) {
    console.error("CHAT_FUNCTION_ERROR", error);
    return respond(500, {
      error: "CHAT_FUNCTION_ERROR",
      detail: error?.message ?? String(error),
    });
  }
}
