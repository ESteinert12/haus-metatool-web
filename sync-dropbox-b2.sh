#!/bin/bash
# sync-dropbox-b2.sh
# Copies missing audio files from Dropbox composer folders into the correct B2 paths.
# Matches by 3-char composer prefix (e.g. R87_ASOL → cumulus/R87_Armin Solo_CUMULUS).
#
# Usage:
#   bash sync-dropbox-b2.sh          # dry run (no files copied)
#   bash sync-dropbox-b2.sh live     # actually copy

ALBUMS=("stratus" "cumulus" "cirrus" "nimbus")

if [ "$1" = "live" ]; then
  echo "LIVE MODE — files WILL be copied to B2"
  DRYRUN=""
else
  echo "DRY RUN — no files will be copied (pass 'live' to copy)"
  DRYRUN="--dry-run"
fi

echo ""
echo "Listing Dropbox composer folders..."
dropbox_folders=$(rclone lsd dropbox: 2>/dev/null | awk '{print $NF}')

total_transferred=0
unmatched_b2=()

for album in "${ALBUMS[@]}"; do
  echo ""
  echo "══════════════════════════════"
  echo "  Album: $album"
  echo "══════════════════════════════"

  b2_folders=$(rclone lsd "b2:haus-music/$album" 2>/dev/null | awk '{print $NF}')

  if [ -z "$b2_folders" ]; then
    echo "  (no B2 folders found for $album)"
    continue
  fi

  while IFS= read -r b2_folder; do
    [ -z "$b2_folder" ] && continue

    # Extract 3-char prefix: "R87_Armin Solo_CUMULUS" → "R87"
    prefix=$(echo "$b2_folder" | cut -d_ -f1)

    # Find matching Dropbox folder by prefix
    dropbox_match=$(echo "$dropbox_folders" | grep -m1 "^${prefix}_")

    if [ -n "$dropbox_match" ]; then
      echo ""
      echo "  ↳ dropbox:$dropbox_match"
      echo "    → b2:haus-music/$album/$b2_folder"
      rclone copy "dropbox:$dropbox_match" "b2:haus-music/$album/$b2_folder" \
        --progress \
        --transfers 4 \
        $DRYRUN \
        2>&1 | grep -E "(Transferred|Checks|Errors|ERROR)" | head -4
    else
      unmatched_b2+=("$album/$b2_folder (prefix: $prefix)")
    fi
  done <<< "$b2_folders"
done

echo ""
echo "══════════════════════════════"
echo "  Complete"
echo "══════════════════════════════"

if [ ${#unmatched_b2[@]} -gt 0 ]; then
  echo ""
  echo "B2 folders with no Dropbox match (may have been renamed or removed):"
  for item in "${unmatched_b2[@]}"; do
    echo "  - $item"
  done
fi
