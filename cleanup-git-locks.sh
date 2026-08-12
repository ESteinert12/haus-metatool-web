#!/bin/bash
# Delete all git lock files that are blocking commits

WORKSPACE_DIR="/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/HAUS Workspace.app/Contents/Resources/haus-workspace"

cd "$WORKSPACE_DIR" || exit 1

echo "🔍 Finding git lock files..."
LOCK_COUNT=$(find .git -name "*.lock" 2>/dev/null | wc -l)

if [ "$LOCK_COUNT" -eq 0 ]; then
  echo "✅ No lock files found"
  exit 0
fi

echo "🗑️  Found $LOCK_COUNT lock files. Deleting..."

find .git -name "*.lock" -type f -delete 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ All lock files deleted successfully"
  echo ""
  echo "You can now commit:"
  echo "  git add -A"
  echo "  git commit -m 'fix: composers management, lot status filtering, Neon keep-alive, B2 audit, intake metadata'"
  exit 0
else
  echo "❌ Error deleting lock files"
  exit 1
fi
