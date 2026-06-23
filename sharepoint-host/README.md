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
- Duplicate detection runs per-host only: it checks your own view, not other users' files. "Replace" never touches another user's items — so the same campaign can appear once per user if two people add it.
