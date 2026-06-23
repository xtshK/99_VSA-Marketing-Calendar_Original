# ViewSonic Americas — Marketing Calendar (VM deployment)

A React frontend + small Express backend. The backend holds the model API key,
proxies brief extraction to the internal **ViewSonic Omnis** model, and persists
the calendar to a file on the VM so the whole team sees the same data.

```
Browser ──▶ Express (:3000)
              ├─ serves the built React app (dist/)
              ├─ POST /api/extract  → extracts PDF text, then calls Omnis (/ask)
              └─ GET/POST /api/data → reads/writes data/calendar.json
```

The Omnis model (`https://omnis.viewsonic.com:8007/ask`) is text-only, so PDFs
are converted to text on the backend (via `pdf-parse`) before being sent.

## What changed from the original single file

- `window.storage` (sandbox-only) → `GET/POST /api/data`, stored in `data/calendar.json`.
- Direct browser → Anthropic call (key would leak) → `POST /api/extract` on the backend.
- Added a build toolchain (Vite) and an Express server.

## Prerequisites on the VM

- **Node.js 18+** and npm. Check with `node -v`.
- The VM must be able to reach `https://omnis.viewsonic.com:8007` (same network / VPN).
- The Omnis API key.

## One-time setup

```bash
cd app
npm install
cp .env.example .env
# edit .env: set OMNIS_API_KEY (and OMNIS_URL if it ever changes)
```

## Run it (production-style, single process)

```bash
npm run serve     # builds the frontend, then starts Express on :3000
```

Open `http://<VM-IP>:3000` from a browser on the same network.

> If you change the React code later, re-run `npm run build` (or `npm run serve`).
> Plain `npm start` just runs the server against the existing `dist/`.

## Keep it running after you log out

Use a process manager so it survives terminal/SSH disconnects and reboots.

**Option A — pm2 (simplest):**
```bash
sudo npm install -g pm2
npm run build
pm2 start server.js --name vs-calendar
pm2 save
pm2 startup     # follow the printed command to enable boot startup
```

**Option B — systemd:** create `/etc/systemd/system/vs-calendar.service`:
```ini
[Unit]
Description=VS Marketing Calendar
After=network.target

[Service]
WorkingDirectory=/path/to/app
ExecStart=/usr/bin/node server.js
Restart=always
EnvironmentFile=/path/to/app/.env

[Install]
WantedBy=multi-user.target
```
Then: `sudo systemctl enable --now vs-calendar`

## Open the firewall

Allow inbound TCP on the port (default 3000). On Ubuntu: `sudo ufw allow 3000`.
On a cloud VM (AWS/GCP/Azure), add an inbound rule in the security group / firewall.

## Local development (two terminals)

```bash
npm run dev:api   # Express backend on :3000
npm run dev:web   # Vite dev server on :5173 (proxies /api to :3000)
```
Open `http://localhost:5173`.

## Notes

- Uses the internal Omnis model — no external AI vendor or per-token cost.
- Brief extraction is **text-only**: digital PDFs and Word/PowerPoint work, but
  scanned/image-only PDFs return an error (no text to read).
- This setup has **no login** (team-internal use). Anyone who can reach the port
  can view and edit. Put it behind the company VPN / restrict the firewall to
  trusted IPs. When you later need HTTPS or a domain, front it with nginx.
- Back up `data/calendar.json` — it is the single source of truth for the calendar.
