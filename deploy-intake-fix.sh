#!/bin/bash
# Deploy ATMOSPHERE intake metadata endpoint fix to Vercel

set -e

# Find git repo root by searching up from current directory
find_git_root() {
  local current_dir="$PWD"
  while [ "$current_dir" != "/" ]; do
    if [ -d "$current_dir/.git" ]; then
      echo "$current_dir"
      return 0
    fi
    current_dir=$(dirname "$current_dir")
  done
  # Fallback to ATMOSPHERE directory
  echo "/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE"
  return 1
}

GIT_ROOT=$(find_git_root)
cd "$GIT_ROOT"

echo "📦 Deploying intake metadata fix..."
echo "📍 Working in: $GIT_ROOT"
echo ""

# Check git status
echo "📋 Git status:"
git status --short

echo ""
echo "⏳ Staging changes..."
git add "HAUS Workspace.app/Contents/Resources/haus-workspace/server.js"
git add "HAUS Workspace.app/Contents/Resources/haus-workspace/index.html"

echo "💬 Committing..."
git commit -m "fix: add /api/intake/metadata endpoint, disable client migrations

- Added GET /api/intake/metadata endpoint to server.js for safe metadata fetching
- Updated loadIntakeMetadata() in index.html to use new endpoint
- Disabled client-side migrations (handled by server.js)
- Fixes 404 errors on intake form load"

echo "🚀 Pushing to GitHub..."
git push origin HEAD

echo ""
echo "✅ Deploy complete!"
echo "   Vercel will auto-deploy in ~1-2 minutes"
echo "   Check https://app.hausmusicplayer.com/intake"
