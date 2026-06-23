import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import "dotenv/config";
import { readMerged, writeOwn, saveBrief } from "./store.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const OMNIS_URL = process.env.OMNIS_URL || "https://omnis.viewsonic.com:8007/ask";
const OMNIS_API_KEY = process.env.OMNIS_API_KEY || "";
const USER_ID = process.env.USER_ID || "";
const SHAREPOINT_DIR = process.env.SHAREPOINT_DIR || "";
const MAX_BRIEF_CHARS = 15000;

if (!SHAREPOINT_DIR || !USER_ID) {
  console.error("ERROR: SHAREPOINT_DIR and USER_ID must be set. Run `npm run setup` first.");
  process.exit(1);
}

const PROMPT =
  "Extract ALL marketing deliverables. Return ONLY valid JSON array.\n" +
  'Each: {"title":"","contentType":"Landing Page|Email|Blog|LinkedIn Ad|Social Post|Battlecard|One-Pager|Video|Sell Sheet|Webinar|Infographic|Other","medium":"Web|Print|Event|Webinar|Digital - Email|Digital - Social|Digital - Paid Ad|Digital - Publisher","vertical":"","priority":"Priority 1|2|3","timingNote":"","goLiveDate":"YYYY-MM-DD","week":1,"month":7,"year":2025,"campaignName":"","product":""}\n' +
  "Use per-tactic Go Live Date. week=quarter week 1-13. Q3:W1=Jul1,W5=Aug1,W9=Sep1. Clean campaign names, no file prefixes.\n" +
  "medium: LandingPage/Blog=Web. SellSheet/Battlecard/OnePager=Print. Email=Digital - Email. LinkedInAd=Digital - Paid Ad. SocialPost=Digital - Social. Webinar=Webinar.";

const app = express();
app.use(express.json({ limit: "50mb" }));

// Who is this host's user? Frontend uses it to gate edit/delete.
app.get("/api/config", (req, res) => res.json({ userId: USER_ID }));

// Merged read across all users; write only my own.
app.get("/api/data", (req, res) => {
  try {
    res.json(readMerged(SHAREPOINT_DIR));
  } catch (e) {
    console.error("read failed:", e.message);
    res.json([]);
  }
});

app.post("/api/data", (req, res) => {
  try {
    const n = writeOwn(SHAREPOINT_DIR, USER_ID, req.body);
    res.json({ ok: true, saved: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save an uploaded brief's original file (best-effort; frontend ignores failures).
app.post("/api/brief", (req, res) => {
  const { filename, dataBase64 } = req.body || {};
  if (!filename || !dataBase64) return res.status(400).json({ error: "Missing filename/dataBase64" });
  try {
    const saved = saveBrief(SHAREPOINT_DIR, USER_ID, filename, Buffer.from(dataBase64, "base64"));
    res.json({ ok: true, saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Brief extraction via Omnis (unchanged from app/).
app.post("/api/extract", async (req, res) => {
  const { content, isPdf } = req.body || {};
  if (!content) return res.status(400).json({ error: "Missing content" });
  try {
    let briefText;
    if (isPdf) {
      const parsed = await pdfParse(Buffer.from(content, "base64"));
      briefText = (parsed.text || "").trim();
      if (briefText.length < 30) {
        return res.status(422).json({ error: "Could not extract text from this PDF (it may be a scanned image)." });
      }
    } else {
      briefText = String(content);
    }
    briefText = briefText.slice(0, MAX_BRIEF_CHARS);

    const headers = { "Content-Type": "application/json" };
    if (OMNIS_API_KEY) headers["Authorization"] = "Bearer " + OMNIS_API_KEY;

    const r = await fetch(OMNIS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ question: PROMPT + "\n\nBRIEF:\n" + briefText }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) return res.status(502).json({ error: "Model request failed (HTTP " + r.status + ")" });
    if (data.status && data.status !== "success") {
      return res.status(502).json({ error: data.detail || "Model returned a non-success status" });
    }
    res.json({ text: data.answer || "" });
  } catch (e) {
    console.error("extract failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

const dist = path.join(__dirname, "dist");
app.use(express.static(dist));
app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`VS Marketing Calendar (SharePoint host) on http://0.0.0.0:${PORT}`);
  console.log(`User: ${USER_ID}`);
  console.log(`SharePoint dir: ${SHAREPOINT_DIR}`);
});
