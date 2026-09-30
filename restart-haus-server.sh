#!/bin/bash
# restart-haus-server.sh
#
# Restarts the HAUS Workspace node server (api.js, port 9999).
#
# Why this exists: services_B2Service.js authorizes with Backblaze B2 once
# per process start and caches the token (this.authToken) for the life of
# the process. B2 auth tokens are valid for 24 hours (see authorize()'s own
# comment, services_B2Service.js:45), but _ensureAuth() only re-authorizes
# when authToken is null/unset -- it never checks token age -- so a server
# left running past ~24h keeps using a token B2 has already expired, and B2
# calls (uploads/downloads/streaming) start failing until the process is
# restarted. This script forces that refresh by restarting api.js, which
# calls authorize() again on boot.
#
# Installed as a periodic launchd job (see com.hausmusic.server-restart.plist)
# so it happens automatically, comfortably inside the 24h window.

set -e

APP_DIR="/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE"
LOG="$APP_DIR/haus-server.log"
PORT=9999

echo "[$(date)] restart-haus-server: stopping any process on port $PORT" >> "$LOG"

PIDS=$(lsof -ti tcp:$PORT 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  kill $PIDS 2>/dev/null || true
  sleep 2
  # Force-kill anything still hanging around
  STILL=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  if [ -n "$STILL" ]; then
    kill -9 $STILL 2>/dev/null || true
    sleep 1
  fi
else
  echo "[$(date)] restart-haus-server: nothing was listening on $PORT" >> "$LOG"
fi

cd "$APP_DIR"
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

echo "[$(date)] restart-haus-server: starting node api.js" >> "$LOG"
nohup node api.js >> "$LOG" 2>&1 &
disown

echo "[$(date)] restart-haus-server: launched, pid $!" >> "$LOG"
