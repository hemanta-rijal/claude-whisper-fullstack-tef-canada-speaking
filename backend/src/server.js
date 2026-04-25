import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const port = Number(process.env.PORT) || 3000;
const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use(
  cors({
    origin: [/localhost:\d+$/],
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

/** Anthropic expects alternating user/assistant; merge adjacent same-role turns. */
function toAnthropicMessages(raw) {
  const out = [];
  for (const m of raw) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = String(m.content ?? "").trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content += `\n\n${content}`;
    } else {
      out.push({ role, content });
    }
  }
  if (!out.length) {
    throw new Error("No non-empty messages");
  }
  if (out[0].role !== "user") {
    throw new Error("First message must be from the user");
  }
  return out;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    claude: Boolean(anthropic),
    whisper: Boolean(openai),
  });
});

/**
 * Body: { messages: Array<{ role: 'user' | 'assistant', content: string }> }
 */
app.post("/api/chat", async (req, res) => {
  if (!anthropic) {
    res.status(503).json({ error: "ANTHROPIC_API_KEY is not configured" });
    return;
  }
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  let normalized;
  try {
    normalized = toAnthropicMessages(messages);
  } catch (e) {
    res.status(400).json({ error: e.message || "Invalid messages" });
    return;
  }

  try {
    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 4096,
      messages: normalized,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    res.json({ text, id: response.id, model: response.model });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message || "Claude request failed" });
  }
});

/**
 * multipart/form-data: field "file" (audio)
 */
app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  if (!openai) {
    res.status(503).json({ error: "OPENAI_API_KEY is not configured" });
    return;
  }
  if (!req.file?.buffer) {
    res.status(400).json({ error: "missing file field" });
    return;
  }

  try {
    const file = new File([req.file.buffer], req.file.originalname || "audio.webm", {
      type: req.file.mimetype || "application/octet-stream",
    });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });
    res.json({ text: transcription.text });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message || "Whisper request failed" });
  }
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
