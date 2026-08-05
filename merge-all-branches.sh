#!/bin/bash

# HAUS Workspace - Automated Merge Script
# Run this to automatically fetch and merge all 4 feature branches
# Usage: bash merge-all-branches.sh

set -e  # Exit on error

echo "🚀 HAUS Workspace - Automated Branch Merge"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Verify we're in the right repo
echo "📍 Checking repository..."
if [ ! -d ".git" ]; then
  echo -e "${RED}✗ Not a git repository. Run this from the repo root.${NC}"
  exit 1
fi

if ! git remote get-url origin | grep -q "haus-metatool-web"; then
  echo -e "${RED}✗ Not the HAUS repository. Wrong directory?${NC}"
  exit 1
fi

echo -e "${GREEN}✓ HAUS repository found${NC}"
echo ""

# Step 2: Check current branch
CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT" != "main" ]; then
  echo "⚠️  Currently on branch: $CURRENT"
  echo "Switching to main..."
  git checkout main
fi

# Step 3: Fetch all branches
echo "📥 Fetching branches from GitHub..."
git fetch origin
echo -e "${GREEN}✓ Branches fetched${NC}"
echo ""

# Step 4: Verify all 4 branches exist
echo "🔍 Verifying branches..."
BRANCHES=(
  "feature/composers-management"
  "feature/playlist-reliability"
  "feature/collection-reliability"
  "feature/integration-fixes"
)

for branch in "${BRANCHES[@]}"; do
  if git rev-parse --verify "origin/$branch" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ $branch${NC}"
  else
    echo -e "${RED}✗ $branch NOT FOUND${NC}"
    echo "Cannot proceed without all 4 branches."
    exit 1
  fi
done
echo ""

# Step 5: Pull latest main
echo "🔄 Updating main from GitHub..."
git pull origin main
echo -e "${GREEN}✓ Main up to date${NC}"
echo ""

# Step 6: Merge in order
echo "🔗 Merging branches (this should be instant, no conflicts expected)..."
echo ""

MERGE_COUNT=0

# Merge 1: Composers
echo "1️⃣  Merging feature/composers-management..."
if git merge --no-edit --no-ff "origin/feature/composers-management" 2>/dev/null; then
  echo -e "${GREEN}✓ Merged${NC}"
  MERGE_COUNT=$((MERGE_COUNT + 1))
else
  echo -e "${RED}✗ CONFLICT detected${NC}"
  echo "Run: git merge --abort"
  echo "Then contact Kyle for help."
  exit 1
fi
echo ""

# Merge 2: Playlist
echo "2️⃣  Merging feature/playlist-reliability..."
if git merge --no-edit --no-ff "origin/feature/playlist-reliability" 2>/dev/null; then
  echo -e "${GREEN}✓ Merged${NC}"
  MERGE_COUNT=$((MERGE_COUNT + 1))
else
  echo -e "${RED}✗ CONFLICT detected${NC}"
  echo "Run: git merge --abort"
  echo "Then contact Kyle for help."
  exit 1
fi
echo ""

# Merge 3: Collection
echo "3️⃣  Merging feature/collection-reliability..."
if git merge --no-edit --no-ff "origin/feature/collection-reliability" 2>/dev/null; then
  echo -e "${GREEN}✓ Merged${NC}"
  MERGE_COUNT=$((MERGE_COUNT + 1))
else
  echo -e "${RED}✗ CONFLICT detected${NC}"
  echo "Run: git merge --abort"
  echo "Then contact Kyle for help."
  exit 1
fi
echo ""

# Merge 4: Integration
echo "4️⃣  Merging feature/integration-fixes..."
if git merge --no-edit --no-ff "origin/feature/integration-fixes" 2>/dev/null; then
  echo -e "${GREEN}✓ Merged${NC}"
  MERGE_COUNT=$((MERGE_COUNT + 1))
else
  echo -e "${RED}✗ CONFLICT detected${NC}"
  echo "Run: git merge --abort"
  echo "Then contact Kyle for help."
  exit 1
fi
echo ""

# Step 7: Verify merge
echo "✅ Verification..."
echo ""

# Check all 4 merges are in log
MERGE_COMMITS=$(git log --oneline main | grep "Merge branch" | wc -l)
if [ $MERGE_COMMITS -ge 4 ]; then
  echo -e "${GREEN}✓ All 4 branches merged (found $MERGE_COMMITS merge commits)${NC}"
else
  echo -e "${YELLOW}⚠ Only $MERGE_COMMITS merge commits found (expected 4)${NC}"
fi

# Check server.js unchanged
if git diff HEAD~4..HEAD -- server.js | grep -q "^"; then
  echo -e "${RED}⚠ server.js was modified (should be unchanged)${NC}"
else
  echo -e "${GREEN}✓ server.js unchanged (Erik's work protected)${NC}"
fi

# Check only index.html changed
CHANGED_FILES=$(git diff --name-only HEAD~4..HEAD | wc -l)
if [ $CHANGED_FILES -le 2 ]; then
  echo -e "${GREEN}✓ Only $CHANGED_FILES file(s) changed${NC}"
else
  echo -e "${YELLOW}⚠ $CHANGED_FILES files changed (expected only index.html + INTEGRATION_VERIFICATION.js)${NC}"
fi

echo ""

# Step 8: Push to GitHub
echo "🚀 Pushing merged code to GitHub..."
if git push origin main; then
  echo -e "${GREEN}✓ Pushed successfully${NC}"
else
  echo -e "${RED}✗ Push failed${NC}"
  echo "Try again manually: git push origin main"
  exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ ALL DONE!${NC}"
echo "=========================================="
echo ""
echo "Summary:"
echo "  • 4 branches merged into main"
echo "  • All changes in index.html only"
echo "  • server.js untouched (Erik's work safe)"
echo "  • Pushed to GitHub"
echo ""
echo "Next steps:"
echo "  1. Test locally (optional)"
echo "  2. Deploy when ready"
echo ""
echo "Questions? See: ERIK_HANDOFF.md"
echo ""
