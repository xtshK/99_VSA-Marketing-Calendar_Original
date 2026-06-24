#!/bin/bash
# VSA Marketing Calendar — macOS launcher
# Lives in the synced "_main" folder. Double-click it in Finder (first time you
# may need: chmod +x launch.command), or run:  bash launch.command
#
# Copies the host code to a local folder (outside OneDrive), writes .env,
# installs dependencies, starts the host, and opens the browser.

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # the _main folder
SRC="$DIR/sharepoint-host"
LOCAL="$HOME/vsa-marketing-calendar-host"

echo "== VSA Marketing Calendar launcher =="

command -v node >/dev/null 2>&1 || { echo "Node.js not found. Install the LTS from https://nodejs.org, then re-run."; exit 1; }
echo "Node $(node -v)"

[ -f "$SRC/package.json" ] || { echo "Can't find 'sharepoint-host' next to this script. Run from the synced _main folder."; exit 1; }

# Locate the shared _data folder (sibling of _main)
if [ -d "$DIR/../_data" ]; then
  DATA="$(cd "$DIR/../_data" && pwd)"
else
  read -r -p "Could not find ../_data. Paste the full path to the shared _data folder: " DATA
fi
[ -d "$DATA" ] || { echo "Invalid _data path: $DATA"; exit 1; }
echo "Data folder: $DATA"

# Copy code to the local run folder
echo "Copying code to $LOCAL ..."
rsync -a --exclude node_modules --exclude .env --exclude dist "$SRC/" "$LOCAL/"

# USER_ID (defaults to the macOS username)
DEFAULT="$(whoami)"
read -r -p "Your USER_ID (e.g. selena.ky.kuo) [Enter = $DEFAULT]: " UID_IN
USER_ID="${UID_IN:-$DEFAULT}"

# Omnis API key (reuse existing local .env if present)
KEY=""
if [ -f "$LOCAL/.env" ]; then KEY="$(grep '^OMNIS_API_KEY=' "$LOCAL/.env" | cut -d= -f2-)"; fi
if [ -z "$KEY" ] || [ "$KEY" = "your-omnis-key-here" ]; then read -r -p "Paste the Omnis API key: " KEY; fi

# Write .env
cat > "$LOCAL/.env" <<EOF
OMNIS_URL=https://omnis.viewsonic.com:8007/ask
OMNIS_API_KEY=$KEY
USER_ID=$USER_ID
SHAREPOINT_DIR=$DATA
PORT=3000
EOF

# Install deps on first run, then start + open browser
cd "$LOCAL"
[ -d node_modules ] || { echo "Installing dependencies (first run, ~1 min)..."; npm install; }
echo "Starting host..."
( npm run serve >/tmp/vsa-calendar.log 2>&1 & )
sleep 7
open "http://localhost:3000"
echo "Done. Open http://localhost:3000 in Chrome/Edge.  USER_ID=$USER_ID"
