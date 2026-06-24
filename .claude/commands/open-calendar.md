---
description: Set up and launch the VSA Marketing Calendar host on this machine (no GitHub needed)
---

You are setting up and launching the SharePoint-backed **VSA Marketing Calendar** host for the current user.

The host code lives next to you in `sharepoint-host/`. When run from the synced `_main` folder, the shared data folder `_data` is its sibling (`../_data`). Work through these steps in order. Be concise. Only ask the user where a step explicitly says to.

## 0. Confirm location and OS
- Run `pwd` (macOS/Linux) / `cd` (Windows) to see the current folder, and detect the OS.
- Verify `sharepoint-host/package.json` exists in the current folder. If not, tell the user to open Claude Code/Cowork inside the synced `_main` folder and re-run. Stop.

## 1. Check Node.js
Run `node -v`. If it errors or the major version is below 18, tell the user to install Node.js LTS from https://nodejs.org, then stop.

## 2. Locate the shared `_data` folder (this becomes SHAREPOINT_DIR)
- First try the sibling: resolve the absolute path of `../_data`.
  - macOS/Linux: `cd ../_data && pwd` (then come back).
  - Windows (PowerShell): `(Resolve-Path ..\_data).Path`.
- If `../_data` does not exist, ask the user:
  "Paste the full path to the shared `_data` folder (inside the synced 'TESTSiteIT - VSA Marketing Calendar' library)."
- Save the result as SHAREPOINT_DIR (absolute path).

## 3. Choose a LOCAL run folder (outside OneDrive)
Never run from inside the synced folder — `npm install` would sync thousands of `node_modules` files. Use:
- macOS/Linux: `$HOME/vsa-marketing-calendar-host`
- Windows: `%USERPROFILE%\vsa-marketing-calendar-host`
Call this LOCAL_DIR.

## 4. Copy the code into LOCAL_DIR (exclude node_modules, .env, dist)
- macOS/Linux:
  `rsync -a --exclude node_modules --exclude .env --exclude dist "$(pwd)/sharepoint-host/" "$HOME/vsa-marketing-calendar-host/"`
- Windows (PowerShell):
  `robocopy ".\sharepoint-host" "$env:USERPROFILE\vsa-marketing-calendar-host" /E /XD node_modules dist /XF .env`
  (robocopy returns exit codes < 8 on success — treat 0–7 as OK.)

## 5. Ask the user for their USER_ID
Ask: "What's your user id for the calendar? (e.g. `selena.ky.kuo`, `mina`, `chris`)". Offer the OS username as the default. This decides which personal folder they read/write. Each person MUST use their own id — it keeps writes from colliding.

## 6. Omnis API key
If `LOCAL_DIR/.env` already exists with a real `OMNIS_API_KEY` (not the placeholder), reuse it. Otherwise ask the user once: "Paste the Omnis API key."

## 7. Write `LOCAL_DIR/.env`
Write exactly (substituting the gathered values):
```
OMNIS_URL=https://omnis.viewsonic.com:8007/ask
OMNIS_API_KEY=<key>
USER_ID=<user id>
SHAREPOINT_DIR=<absolute path to _data from step 2>
PORT=3000
```

## 8. Install dependencies (first run only)
In LOCAL_DIR: if `node_modules` is missing, run `npm install`.

## 9. Start the host
In LOCAL_DIR, start it in the background: `npm run serve`.
Then poll `http://localhost:3000/api/config` until it returns HTTP 200 (up to ~30s).
If port 3000 is already in use, a host may already be running for this user — confirm with the user before stopping it; otherwise reuse the running one.

## 10. Open the browser
- macOS: `open http://localhost:3000`
- Windows: `start http://localhost:3000`
- Linux: `xdg-open http://localhost:3000`

## 11. Report to the user
Tell them, briefly:
- It's running at http://localhost:3000 (open in Chrome or Edge).
- Their `USER_ID`.
- Their calendar saves to `<_data>/_calendar_json/<user>/calendar.json` and briefs to `<_data>/_upload_briefs/<user>/`, synced to the team via OneDrive.
- Other people's items appear read-only (🔒); they can only edit their own.
