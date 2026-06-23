# SharePoint Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sharepoint-host/`, a copy of `app/` whose storage points at a OneDrive/SharePoint synced folder, so a team can share one marketing calendar with no central VM — each user runs their own local host (launched by Claude) that writes to their own per-user folder and reads everyone's merged.

**Architecture:** Reuse the `app/` Express + Vite + React calendar. Replace the single-file storage with a `store.js` module that (a) merges every `_calendar_json/<user>/calendar.json` on read and tags each item with `_owner`, and (b) writes only the current user's items back to their own file. Add `/api/config` (who am I) and `/api/brief` (save original brief). The frontend hides edit/delete on items the current user doesn't own. A `setup.mjs` script auto-detects the SharePoint path and writes `.env`.

**Tech Stack:** Node 18+, Express 4, Vite 5, React 18, `pdf-parse`, `mammoth`; tests via the built-in `node --test` runner (no extra deps).

**Note on commits:** End every commit message body with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
Work stays on the existing `sharepoint-host-design` branch. The `app/` directory is NOT modified by any task.

---

## File Structure

```
sharepoint-host/
├── package.json          # name + scripts (test, setup, serve)
├── vite.config.js        # copied from app/ (unchanged)
├── index.html            # copied from app/ (unchanged)
├── server.js             # routes; wires store.js to HTTP; + /api/config, /api/brief
├── store.js              # NEW: readMerged / writeOwn / saveBrief (pure file logic)
├── store.test.js         # NEW: node:test unit tests for store.js
├── setup.mjs             # NEW: detect SharePoint dir, write .env, make folders
├── .env.example          # OMNIS_* + USER_ID + SHAREPOINT_DIR
├── .gitignore            # copied from app/
├── README.md             # NEW: usage + "launch via Claude" instructions
└── src/
    ├── main.jsx          # copied from app/ (unchanged)
    └── vs_marketing_calendar.tsx  # copied; + owner-gating + brief upload
```

`store.js` holds all filesystem logic so it can be unit-tested against a temp dir without HTTP. `server.js` only wires routes to it.

---

## Task 1: Scaffold `sharepoint-host/` from `app/`

**Files:**
- Create: `sharepoint-host/` (copy of `app/` minus build/runtime artifacts)
- Modify: `sharepoint-host/package.json`

- [ ] **Step 1: Copy app/ to sharepoint-host/, excluding artifacts**

Run from the repo root:
```bash
rsync -a --exclude node_modules --exclude dist --exclude data --exclude .env "app/" "sharepoint-host/"
ls sharepoint-host
```
Expected: `index.html  package.json  README.md  server.js  src  vite.config.js  .env.example  .gitignore`

- [ ] **Step 2: Rename the package**

In `sharepoint-host/package.json`, change the `"name"` field and add `test`/`setup` scripts. Replace the `"name"` line and the `"scripts"` block with:
```json
  "name": "vs-marketing-calendar-sharepoint",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev:web": "vite",
    "dev:api": "node server.js",
    "build": "vite build",
    "start": "node server.js",
    "serve": "npm run build && node server.js",
    "setup": "node setup.mjs",
    "test": "node --test"
  },
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
cd sharepoint-host && npm install
```
Expected: installs without error (same deps as `app/`: express, mammoth, pdf-parse, dotenv, react, react-dom, vite, @vitejs/plugin-react).

- [ ] **Step 4: Commit**

```bash
git add sharepoint-host/package.json sharepoint-host/vite.config.js sharepoint-host/index.html sharepoint-host/server.js sharepoint-host/README.md sharepoint-host/.env.example sharepoint-host/.gitignore sharepoint-host/src
git commit -m "feat(sharepoint-host): scaffold from app/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `store.js` — merge-on-read, write-own, save-brief (TDD)

**Files:**
- Test: `sharepoint-host/store.test.js`
- Create: `sharepoint-host/store.js`

- [ ] **Step 1: Write the failing tests**

Create `sharepoint-host/store.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { readMerged, writeOwn, saveBrief, calendarRoot, briefsRoot } from "./store.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sp-store-"));
}

test("readMerged returns [] when nothing exists", () => {
  const dir = tmpDir();
  assert.deepEqual(readMerged(dir), []);
});

test("readMerged merges every user's calendar.json and tags _owner", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(calendarRoot(dir), "alice"), { recursive: true });
  fs.mkdirSync(path.join(calendarRoot(dir), "bob"), { recursive: true });
  fs.writeFileSync(path.join(calendarRoot(dir), "alice", "calendar.json"), JSON.stringify([{ id: "a1", title: "A" }]));
  fs.writeFileSync(path.join(calendarRoot(dir), "bob", "calendar.json"), JSON.stringify([{ id: "b1", title: "B" }]));
  const merged = readMerged(dir);
  assert.equal(merged.length, 2);
  const alice = merged.find((x) => x.id === "a1");
  const bob = merged.find((x) => x.id === "b1");
  assert.equal(alice._owner, "alice");
  assert.equal(bob._owner, "bob");
});

test("readMerged skips a corrupt file without throwing", () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(calendarRoot(dir), "alice"), { recursive: true });
  fs.mkdirSync(path.join(calendarRoot(dir), "bob"), { recursive: true });
  fs.writeFileSync(path.join(calendarRoot(dir), "alice", "calendar.json"), "{ not json");
  fs.writeFileSync(path.join(calendarRoot(dir), "bob", "calendar.json"), JSON.stringify([{ id: "b1" }]));
  const merged = readMerged(dir);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "b1");
});

test("writeOwn writes only the user's own items and strips _owner", () => {
  const dir = tmpDir();
  const items = [
    { id: "mine1", title: "Mine", _owner: "alice" },
    { id: "new1", title: "New (no owner)" },
    { id: "theirs1", title: "Theirs", _owner: "bob" },
  ];
  const count = writeOwn(dir, "alice", items);
  assert.equal(count, 2);
  const onDisk = JSON.parse(fs.readFileSync(path.join(calendarRoot(dir), "alice", "calendar.json"), "utf8"));
  assert.equal(onDisk.length, 2);
  assert.ok(onDisk.every((x) => !("_owner" in x)));
  assert.deepEqual(onDisk.map((x) => x.id).sort(), ["mine1", "new1"]);
});

test("saveBrief writes the file into the user's brief folder and blocks path traversal", () => {
  const dir = tmpDir();
  const name = saveBrief(dir, "alice", "../../evil.txt", Buffer.from("hello"));
  assert.equal(name, "evil.txt");
  const written = path.join(briefsRoot(dir), "alice", "evil.txt");
  assert.equal(fs.readFileSync(written, "utf8"), "hello");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd sharepoint-host && node --test
```
Expected: FAIL — `Cannot find module './store.js'` (or import error).

- [ ] **Step 3: Implement `store.js`**

Create `sharepoint-host/store.js`:
```js
import fs from "fs";
import path from "path";

export function calendarRoot(sharepointDir) {
  return path.join(sharepointDir, "_calendar_json");
}
export function briefsRoot(sharepointDir) {
  return path.join(sharepointDir, "_upload_briefs");
}

// Read every user's calendar.json and merge into one array, tagging _owner.
export function readMerged(sharepointDir) {
  const root = calendarRoot(sharepointDir);
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const owner = e.name;
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(root, owner, "calendar.json"), "utf8"));
      if (Array.isArray(arr)) for (const it of arr) out.push({ ...it, _owner: owner });
    } catch {
      /* skip missing or corrupt file */
    }
  }
  return out;
}

// Write only the current user's items (own or new/un-owned) to their own file.
export function writeOwn(sharepointDir, userId, items) {
  const mine = (Array.isArray(items) ? items : [])
    .filter((it) => !it._owner || it._owner === userId)
    .map(({ _owner, ...rest }) => rest);
  const dir = path.join(calendarRoot(sharepointDir), userId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "calendar.json"), JSON.stringify(mine, null, 2));
  return mine.length;
}

// Save an uploaded brief's original bytes under the user's brief folder.
export function saveBrief(sharepointDir, userId, filename, buffer) {
  const dir = path.join(briefsRoot(sharepointDir), userId);
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(filename) || "brief";
  fs.writeFileSync(path.join(dir, safe), buffer);
  return safe;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd sharepoint-host && node --test
```
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add sharepoint-host/store.js sharepoint-host/store.test.js
git commit -m "feat(sharepoint-host): storage module (merge/write-own/save-brief) with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Rewrite `server.js` to use `store.js` + add `/api/config` and `/api/brief`

**Files:**
- Modify: `sharepoint-host/server.js` (full rewrite)
- Modify: `sharepoint-host/.env.example`

- [ ] **Step 1: Replace `sharepoint-host/server.js` entirely**

```js
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
```

- [ ] **Step 2: Update `sharepoint-host/.env.example`**

Replace its contents with:
```
# Copy to ".env" (or run `npm run setup`). NEVER commit the real .env.
OMNIS_URL=https://omnis.viewsonic.com:8007/ask
OMNIS_API_KEY=your-omnis-key-here

# Set by `npm run setup` (or fill manually):
USER_ID=your-id-here
SHAREPOINT_DIR=/Users/<you>/Library/CloudStorage/OneDrive-SharedLibraries-ViewSonicCorporation/TESTSiteIT - <you>

# Optional:
# PORT=3000
```

- [ ] **Step 3: Verify the API end-to-end against a temp SharePoint dir**

Run (creates a throwaway dir, seeds a second user, boots, checks merge/write/config/brief):
```bash
cd sharepoint-host
TMP=$(mktemp -d)
mkdir -p "$TMP/_calendar_json/bob"
echo '[{"id":"b1","title":"Bob item","campaignName":"BobCo","month":7,"week":1,"year":2025}]' > "$TMP/_calendar_json/bob/calendar.json"
OMNIS_API_KEY=sk-VSglobal2026 USER_ID=alice SHAREPOINT_DIR="$TMP" PORT=3997 node server.js > /tmp/sp.log 2>&1 &
SRV=$!; sleep 1.5
echo "config:";  curl -s http://localhost:3997/api/config
echo; echo "data (bob tagged _owner):"; curl -s http://localhost:3997/api/data
echo; echo "save alice item:"; curl -s -X POST http://localhost:3997/api/data -H "Content-Type: application/json" -d '[{"id":"a1","title":"Alice item","_owner":"alice"},{"id":"b1","title":"Bob item","_owner":"bob"}]'
echo; echo "data after save (alice + bob):"; curl -s http://localhost:3997/api/data
echo; echo "alice file on disk (should NOT contain bob):"; cat "$TMP/_calendar_json/alice/calendar.json"
echo; echo "save brief:"; curl -s -X POST http://localhost:3997/api/brief -H "Content-Type: application/json" -d "{\"filename\":\"test.txt\",\"dataBase64\":\"$(echo -n hello | base64)\"}"
echo; echo "brief on disk:"; cat "$TMP/_upload_briefs/alice/test.txt"
kill $SRV 2>/dev/null; cat /tmp/sp.log
```
Expected: `config` → `{"userId":"alice"}`; `data` shows bob's item with `"_owner":"bob"`; after save, `data` has both alice and bob; alice's file on disk has only `a1` and no `_owner`; brief file contains `hello`.

- [ ] **Step 4: Commit**

```bash
git add sharepoint-host/server.js sharepoint-host/.env.example
git commit -m "feat(sharepoint-host): wire store.js routes + /api/config + /api/brief

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — gate edit/delete by owner

**Files:**
- Modify: `sharepoint-host/src/vs_marketing_calendar.tsx`

- [ ] **Step 1: Add module-level identity + helper and load it**

In `sharepoint-host/src/vs_marketing_calendar.tsx`, find:
```js
async function loadData() {
  try { var r=await fetch("/api/data"); var j=await r.json(); return Array.isArray(j)?j:[]; } catch(e){ return []; }
}
```
Immediately ABOVE it, insert:
```js
var MY_ID = null;
function canEdit(item) { return !item || !item._owner || item._owner === MY_ID; }
async function loadConfig() {
  try { var r = await fetch("/api/config"); var j = await r.json(); MY_ID = j.userId || null; } catch (e) {}
}
```

- [ ] **Step 2: Load identity before items render**

Find:
```js
  useEffect(function(){loadData().then(function(d){setItems(d);setLoaded(true);});},[]);
```
Replace with:
```js
  useEffect(function(){Promise.all([loadConfig(),loadData()]).then(function(r){setItems(r[1]);setLoaded(true);});},[]);
```

- [ ] **Step 3: Gate the `TRow` edit/delete buttons (Quarterly view)**

Find:
```js
      <button onClick={function(){props.onEdit(props.item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#bbb",fontSize:12,padding:"0 3px"}}>&#9998;</button>
      <button onClick={function(){props.onRemove(props.item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#bbb",fontSize:12,padding:"0 3px"}}>&#10005;</button>
    </div>
  );
}
```
Replace with:
```js
      {canEdit(props.item)&&<button onClick={function(){props.onEdit(props.item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#bbb",fontSize:12,padding:"0 3px"}}>&#9998;</button>}
      {canEdit(props.item)&&<button onClick={function(){props.onRemove(props.item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#bbb",fontSize:12,padding:"0 3px"}}>&#10005;</button>}
      {!canEdit(props.item)&&<span style={{fontSize:10,color:"#ccc",padding:"0 3px"}} title={"Owned by "+props.item._owner}>🔒</span>}
    </div>
  );
}
```

- [ ] **Step 4: Gate the `AView` (Full Year) inline buttons**

Find:
```js
                          <button onClick={function(){props.onEdit(item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#9998;</button>
                          <button onClick={function(){props.onRemove(item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#10005;</button>
```
Replace with:
```js
                          {canEdit(item)&&<button onClick={function(){props.onEdit(item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#9998;</button>}
                          {canEdit(item)&&<button onClick={function(){props.onRemove(item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#10005;</button>}
```

- [ ] **Step 5: Gate the `VView` (Vertical) inline buttons**

Find:
```js
                  <button onClick={function(){props.onEdit(item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#9998;</button>
                  <button onClick={function(){props.onRemove(item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#10005;</button>
```
Replace with:
```js
                  {canEdit(item)&&<button onClick={function(){props.onEdit(item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#9998;</button>}
                  {canEdit(item)&&<button onClick={function(){props.onRemove(item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#10005;</button>}
```

- [ ] **Step 6: Build to confirm no syntax errors**

Run:
```bash
cd sharepoint-host && npm run build
```
Expected: `✓ built` with no errors.

- [ ] **Step 7: Commit**

```bash
git add sharepoint-host/src/vs_marketing_calendar.tsx
git commit -m "feat(sharepoint-host): hide edit/delete on items the user does not own

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend — save the original brief on upload

**Files:**
- Modify: `sharepoint-host/src/vs_marketing_calendar.tsx`

- [ ] **Step 1: Send the original file to `/api/brief` at the top of `procFile`**

Find:
```js
  async function procFile(file){
    var raw=null,isPdf=false,b64=null,nm=file.name.toLowerCase();
```
Replace with:
```js
  async function procFile(file){
    try{
      var origAb=await file.arrayBuffer();
      var origB64=btoa(new Uint8Array(origAb).reduce(function(s,b){return s+String.fromCharCode(b);},""));
      fetch("/api/brief",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:file.name,dataBase64:origB64})}).catch(function(){});
    }catch(e){}
    var raw=null,isPdf=false,b64=null,nm=file.name.toLowerCase();
```

- [ ] **Step 2: Build to confirm no syntax errors**

Run:
```bash
cd sharepoint-host && npm run build
```
Expected: `✓ built` with no errors.

- [ ] **Step 3: Commit**

```bash
git add sharepoint-host/src/vs_marketing_calendar.tsx
git commit -m "feat(sharepoint-host): archive original brief file to user folder on upload

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `setup.mjs` — detect SharePoint folder and write `.env`

**Files:**
- Create: `sharepoint-host/setup.mjs`

- [ ] **Step 1: Create `sharepoint-host/setup.mjs`**

```js
// Detects the OneDrive/SharePoint synced folder, derives USER_ID, writes .env,
// and creates this user's _calendar_json / _upload_briefs subfolders.
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";

const HOME = os.homedir();
const CLOUD = path.join(HOME, "Library", "CloudStorage");

function findCandidates() {
  let dirs = [];
  try {
    for (const e of fs.readdirSync(CLOUD, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith("OneDrive-SharedLibraries")) continue;
      const base = path.join(CLOUD, e.name);
      for (const sub of fs.readdirSync(base, { withFileTypes: true })) {
        if (sub.isDirectory() && sub.name.startsWith("TESTSiteIT")) dirs.push(path.join(base, sub.name));
      }
    }
  } catch {}
  return dirs;
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

const candidates = findCandidates();
let dir = candidates[0];
if (candidates.length !== 1) {
  console.log(candidates.length ? "Multiple SharePoint folders found:" : "No SharePoint folder auto-detected.");
  candidates.forEach((c, i) => console.log(`  [${i}] ${c}`));
  const ans = await ask("Enter the index, or paste the full path: ");
  dir = /^\d+$/.test(ans) ? candidates[Number(ans)] : ans;
}
if (!dir || !fs.existsSync(dir)) {
  console.error("Could not resolve a valid SharePoint folder. Aborting.");
  process.exit(1);
}

// Derive USER_ID from the folder name suffix "TESTSiteIT - <user>", else ask.
const m = path.basename(dir).match(/-\s*(.+)$/);
let userId = m ? m[1].trim() : "";
if (!userId) userId = await ask("Enter your USER_ID (e.g. selena.ky.kuo): ");

const existing = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const keyMatch = existing.match(/^OMNIS_API_KEY=(.*)$/m);
let omnisKey = keyMatch ? keyMatch[1] : "";
if (!omnisKey || omnisKey === "your-omnis-key-here") omnisKey = await ask("Enter the Omnis API key: ");

const env = [
  "OMNIS_URL=https://omnis.viewsonic.com:8007/ask",
  `OMNIS_API_KEY=${omnisKey}`,
  `USER_ID=${userId}`,
  `SHAREPOINT_DIR=${dir}`,
  "PORT=3000",
  "",
].join("\n");
fs.writeFileSync(".env", env);

fs.mkdirSync(path.join(dir, "_calendar_json", userId), { recursive: true });
fs.mkdirSync(path.join(dir, "_upload_briefs", userId), { recursive: true });

console.log("✅ Wrote .env");
console.log(`   USER_ID=${userId}`);
console.log(`   SHAREPOINT_DIR=${dir}`);
console.log("Next: npm run serve");
```

- [ ] **Step 2: Verify detection against a fake CloudStorage layout**

Run (simulates the folder so the path-derivation logic is exercised without OneDrive):
```bash
cd sharepoint-host
node -e '
import("./setup.mjs"); // not run here; logic check below
' 2>/dev/null || true
node --input-type=module -e '
import path from "path";
const dir = "/x/OneDrive-SharedLibraries-ViewSonicCorporation/TESTSiteIT - selena.ky.kuo";
const m = path.basename(dir).match(/-\s*(.+)$/);
console.log(JSON.stringify(m && m[1].trim()));
'
```
Expected: prints `"selena.ky.kuo"` (confirms USER_ID derivation). Full interactive run is verified in Task 8.

- [ ] **Step 3: Commit**

```bash
git add sharepoint-host/setup.mjs
git commit -m "feat(sharepoint-host): setup script to detect SharePoint dir and write .env

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: README + "launch via Claude" instructions

**Files:**
- Modify: `sharepoint-host/README.md`

- [ ] **Step 1: Replace `sharepoint-host/README.md`**

````markdown
# Marketing Calendar — SharePoint Host (temporary shared solution)

A per-user local host that stores the marketing calendar in a OneDrive/SharePoint
synced folder, so a team shares one calendar with **no central server**. Each
person runs their own host; everyone reads the merged calendar, but each person
only writes their own items. OneDrive handles cross-user sync.

> This is the interim solution. The long-term single-server version is in `../app/`.

## How it works

```
You: "open the marketing calendar"  (in Claude Cowork / Claude Code)
   → Claude runs:  npm install → npm run setup → npm run serve → opens localhost:3000
You upload briefs / add items in the browser
   → host writes to  <SharePoint>/_calendar_json/<you>/calendar.json
                      <SharePoint>/_upload_briefs/<you>/<original file>
   → OneDrive syncs → teammates' hosts see your items on their next load
```

- Read: merges every `_calendar_json/*/calendar.json`; each item tagged with its owner.
- Write: only your own file. Other people's items show as read-only (🔒).
- Sync is eventual (OneDrive lag of seconds–minutes), not instant.

## For the user (via Claude)

In Claude Code or Cowork, say: **"Set up and open the marketing calendar in `sharepoint-host`."**
Claude will run the steps below for you. The only thing it may ask you for is the
**Omnis API key** (first time only).

## Manual steps (if running yourself)

Prereqs: Node 18+, Chrome/Edge, and the SharePoint folder synced via OneDrive.

```bash
cd sharepoint-host
npm install
npm run setup     # auto-detects the SharePoint folder, writes .env, makes your folders
npm run serve     # builds + starts on http://localhost:3000
```

Open http://localhost:3000.

## Notes

- `npm test` runs the storage unit tests.
- `.env` holds the Omnis key + your `USER_ID` + `SHAREPOINT_DIR`; it is git-ignored.
- macOS only for auto-detection right now (Windows path differs).
- You can only edit/delete your own items by design (per-user folders = permissions).
````

- [ ] **Step 2: Commit**

```bash
git add sharepoint-host/README.md
git commit -m "docs(sharepoint-host): usage + launch-via-Claude instructions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: End-to-end verification (two simulated users)

**Files:** none (verification only)

- [ ] **Step 1: Run the storage unit tests**

Run:
```bash
cd sharepoint-host && npm test
```
Expected: all `store.test.js` tests pass.

- [ ] **Step 2: Simulate two users sharing one folder**

Run:
```bash
cd sharepoint-host
SP=$(mktemp -d)
# Pretend bob already saved an item (as if synced from his machine):
mkdir -p "$SP/_calendar_json/bob"
echo '[{"id":"b1","title":"Bob LinkedIn Ad","contentType":"LinkedIn Ad","medium":"Digital - Paid Ad","campaignName":"BobCo","month":8,"week":5,"year":2025}]' > "$SP/_calendar_json/bob/calendar.json"

# Boot alice's host against the same shared folder:
npm run build >/dev/null 2>&1
OMNIS_API_KEY=sk-VSglobal2026 USER_ID=alice SHAREPOINT_DIR="$SP" PORT=3996 node server.js > /tmp/sp_e2e.log 2>&1 &
SRV=$!; sleep 1.5

echo "1) alice sees bob's item, tagged:"; curl -s http://localhost:3996/api/data
echo; echo "2) alice adds her own item + keeps bob's in the payload:"
curl -s -X POST http://localhost:3996/api/data -H "Content-Type: application/json" \
  -d '[{"id":"a1","title":"Alice Landing Page","_owner":"alice"},{"id":"b1","title":"Bob LinkedIn Ad","_owner":"bob"}]'
echo; echo "3) merged view now has both:"; curl -s http://localhost:3996/api/data
echo; echo "4) alice file has ONLY alice, no _owner key:"; cat "$SP/_calendar_json/alice/calendar.json"
echo; echo "5) bob file untouched:"; cat "$SP/_calendar_json/bob/calendar.json"
kill $SRV 2>/dev/null
```
Expected:
- (1) one item, `id:"b1"`, `_owner:"bob"`.
- (3) two items: `a1` (owner alice) and `b1` (owner bob).
- (4) alice's file contains only `a1`, with no `_owner` field.
- (5) bob's file is unchanged (still just `b1`, no `_owner`).

- [ ] **Step 2b: Manual browser check**

With a host running (`npm run setup` then `npm run serve` against the real SharePoint folder), open http://localhost:3000 and confirm:
- Your own items show the ✏️/✕ buttons; items from other users show 🔒 (read-only).
- Uploading a brief creates rows AND drops the original file into `_upload_briefs/<you>/`.
- A second machine (different `USER_ID`, same synced folder) sees your items after OneDrive syncs.

- [ ] **Step 3: Final commit (if any verification fixes were needed)**

```bash
git add -A sharepoint-host
git commit -m "test(sharepoint-host): end-to-end verification adjustments

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** per-user write isolation (Task 2 `writeOwn`, Task 3 POST), merge-on-read with `_owner` (Task 2 `readMerged`, Task 3 GET), read-only for others (Task 4), original brief archiving (Task 2 `saveBrief`, Task 3 `/api/brief`, Task 5), `.env` with `USER_ID`/`SHAREPOINT_DIR` (Task 3, Task 6), Claude launch UX (Task 6 setup + Task 7 README), Omnis parsing reused (Task 3). All spec sections map to a task.
- **`app/` untouched:** every task path is under `sharepoint-host/`.
- **Type/name consistency:** `readMerged`, `writeOwn`, `saveBrief`, `calendarRoot`, `briefsRoot`, `MY_ID`, `canEdit`, `/api/config`, `/api/brief`, `_owner` used identically across tasks.
