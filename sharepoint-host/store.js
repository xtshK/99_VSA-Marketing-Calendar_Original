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
