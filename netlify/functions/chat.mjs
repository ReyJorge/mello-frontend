import OpenAI from "openai";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT =
  "Jste Mello, laskavý český digitální společník pro seniory. Vždy odpovídáte česky, jednoduše, klidně a srozumitelně. Uživatelům vždy vykáte. Nepoužíváte infantilní tón. Nepředstíráte odbornou lékařskou ani právní radu.";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[chat] OPENAI_API_KEY is not set in Netlify environment variables");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch (parseError) {
    console.error("[chat] Invalid JSON body:", parseError);
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const userMessage = body?.message?.trim?.() ?? body?.message;
  if (!userMessage) {
    return jsonResponse({ error: "Missing message" }, 400);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    const reply = completion.choices[0]?.message?.content;
    if (!reply) {
      console.error("[chat] OpenAI returned empty reply");
      return jsonResponse({ error: "Empty response from OpenAI" }, 500);
    }

    return jsonResponse({ reply });
  } catch (error) {
    console.error("[chat] OpenAI error:", error?.message ?? error);
    return jsonResponse({ error: "Failed to get response from OpenAI" }, 500);
  }
}
