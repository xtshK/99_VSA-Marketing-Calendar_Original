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
