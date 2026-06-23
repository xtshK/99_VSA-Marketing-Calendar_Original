import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import "dotenv/config";

// pdf-parse is CommonJS; require its lib entry directly to avoid the
// package's debug-mode side effect that reads a test file on import.
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const OMNIS_URL = process.env.OMNIS_URL || "https://omnis.viewsonic.com:8007/ask";
const OMNIS_API_KEY = process.env.OMNIS_API_KEY || "";
const MAX_BRIEF_CHARS = 15000; // cap text sent to the model
const DATA_FILE = path.join(__dirname, "data", "calendar.json");

// Prompt lives on the server. The internal model takes a single text
// "question", so we fold the instructions and the brief text together.
const PROMPT =
  "Extract ALL marketing deliverables. Return ONLY valid JSON array.\n" +
  'Each: {"title":"","contentType":"Landing Page|Email|Blog|LinkedIn Ad|Social Post|Battlecard|One-Pager|Video|Sell Sheet|Webinar|Infographic|Other","medium":"Web|Print|Event|Webinar|Digital - Email|Digital - Social|Digital - Paid Ad|Digital - Publisher","vertical":"","priority":"Priority 1|2|3","timingNote":"","goLiveDate":"YYYY-MM-DD","week":1,"month":7,"year":2025,"campaignName":"","product":""}\n' +
  "Use per-tactic Go Live Date. week=quarter week 1-13. Q3:W1=Jul1,W5=Aug1,W9=Sep1. Clean campaign names, no file prefixes.\n" +
  "medium: LandingPage/Blog=Web. SellSheet/Battlecard/OnePager=Print. Email=Digital - Email. LinkedInAd=Digital - Paid Ad. SocialPost=Digital - Social. Webinar=Webinar.";

const app = express();
app.use(express.json({ limit: "50mb" })); // base64 PDFs can be large

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

// --- Data persistence (shared team calendar) ---
app.get("/api/data", (req, res) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    res.json(Array.isArray(parsed) ? parsed : []);
  } catch {
    res.json([]);
  }
});

app.post("/api/data", (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Brief extraction via the internal Omnis model ---
app.post("/api/extract", async (req, res) => {
  const { content, isPdf } = req.body || {};
  if (!content) return res.status(400).json({ error: "Missing content" });

  try {
    // The model is text-only. PDFs arrive as base64 → extract their text here.
    let briefText;
    if (isPdf) {
      const buf = Buffer.from(content, "base64");
      const parsed = await pdfParse(buf);
      briefText = (parsed.text || "").trim();
      if (briefText.length < 30) {
        return res.status(422).json({
          error: "Could not extract text from this PDF (it may be a scanned image).",
        });
      }
    } else {
      briefText = String(content);
    }
    briefText = briefText.slice(0, MAX_BRIEF_CHARS);

    const question = PROMPT + "\n\nBRIEF:\n" + briefText;

    const headers = { "Content-Type": "application/json" };
    if (OMNIS_API_KEY) headers["Authorization"] = "Bearer " + OMNIS_API_KEY;

    const r = await fetch(OMNIS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ question }),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok || !data) {
      return res.status(502).json({ error: "Model request failed (HTTP " + r.status + ")" });
    }
    if (data.status && data.status !== "success") {
      return res.status(502).json({ error: data.detail || "Model returned a non-success status" });
    }

    // Return the model's text answer; the frontend strips code fences and
    // parses the JSON array (with its own retry logic).
    res.json({ text: data.answer || "" });
  } catch (e) {
    console.error("extract failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Serve the built frontend ---
const dist = path.join(__dirname, "dist");
app.use(express.static(dist));
app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`VS Marketing Calendar running on http://0.0.0.0:${PORT}`);
  console.log(`Model endpoint: ${OMNIS_URL}`);
});
