// server/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/api/classify-memory", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // nebo "gpt-3.5-turbo" dle tvého přístupu
      messages: [
        {
          role: "system",
          content:
            "Rozhodni, zda zpráva obsahuje osobní vzpomínku vhodnou k uložení do deníku. Odpověz pouze ANO nebo NE.",
        },
        { role: "user", content: message },
      ],
    });

    const answer = completion.choices[0].message.content.trim().toUpperCase();
    res.json({ worthy: answer === "ANO" });
  } catch (error) {
    console.error("OpenAI classify error:", error);
    res.status(500).json({ error: "Failed to classify memory." });
  }
});

app.post("/api/chat", async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Jste Mello, laskavý český digitální společník pro seniory. Vždy odpovídáte česky, jednoduše, klidně a srozumitelně. Uživatelům vždy vykáte. Nepoužíváte infantilní tón. Nepředstíráte odbornou lékařskou ani právní radu.",
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("OpenAI error:", error);
    res.status(500).json({ error: "Failed to get response from OpenAI." });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Mello backend je online.");
});

app.listen(port, () => {
  console.log(`✅ Server běží na http://localhost:${port}`);
});
