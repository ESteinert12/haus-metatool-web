#!/usr/bin/env python3
"""
Dropbox Stub Recovery Download
Downloads available folders from Dropbox backup to local recovery directory.
For missing folders, generates a composer contact list.
"""

import dropbox
from dropbox.exceptions import ApiError
import os
import sys
import json
from pathlib import Path

# Configuration
DROPBOX_TOKEN = sys.argv[1] if len(sys.argv) > 1 else None
RECOVERY_DIR = Path.home() / "Desktop" / "STUB_RECOVERY"
DROPBOX_BASE = "/2. COLLECTION UPLOADER/2. ATMOS_Shipping"

if not DROPBOX_TOKEN:
    print("Usage: python3 dropbox-recovery-download.py <access_token>")
    sys.exit(1)

# Read recovery paths
recovery_paths = []
try:
    with open("recovery-dropbox-paths.txt", "r") as f:
        for line in f:
            line = line.strip()
            # Skip comments and empty lines
            if line and not line.startswith("#"):
                recovery_paths.append(line)
except FileError:
    print("Error: recovery-dropbox-paths.txt not found")
    sys.exit(1)

print(f"Found {len(recovery_paths)} folders to attempt recovery")
print(f"Recovery directory: {RECOVERY_DIR}")
print()

# Create recovery directory
RECOVERY_DIR.mkdir(parents=True, exist_ok=True)

# Connect to Dropbox
try:
    dbx = dropbox.Dropbox(DROPBOX_TOKEN)
    dbx.users_get_current_account()
    print("✓ Connected to Dropbox\n")
except ApiError as e:
    print(f"❌ Dropbox auth failed: {e}")
    sys.exit(1)

# Track results
downloaded = 0
unavailable = []
errors = []
total_files = 0
total_size = 0

for i, folder_path in enumerate(recovery_paths, 1):
    dropbox_path = f"{DROPBOX_BASE}/{folder_path}"
    local_path = RECOVERY_DIR / folder_path

    # Extract composer info from path
    # Format: nimbus/C27_Aaron Saloman_NIMBUS/C27a2844_Desert Drone
    parts = folder_path.split('/')
    bucket = parts[0]
    composer_folder = parts[1]
    song_folder = parts[2] if len(parts) > 2 else ""

    print(f"[{i}/{len(recovery_paths)}] {composer_folder} / {song_folder}...", end=" ")

    try:
        # List all files in this folder recursively
        result = dbx.files_list_folder(dropbox_path, recursive=True)

        files_in_folder = 0
        size_in_folder = 0

        while True:
            for entry in result.entries:
                if isinstance(entry, dropbox.files.FileMetadata):
                    # Create local directory structure
                    local_file_path = local_path / entry.name
                    local_file_path.parent.mkdir(parents=True, exist_ok=True)

                    # Download file
                    try:
                        metadata, response = dbx.files_download(entry.path_display)
                        with open(local_file_path, 'wb') as f:
                            f.write(response.content)

                        files_in_folder += 1
                        size_in_folder += entry.size
                        total_files += 1
                        total_size += entry.size
                    except ApiError as e:
                        errors.append({
                            'path': folder_path,
                            'file': entry.name,
                            'error': str(e)
                        })

            # Check if there are more results
            if not result.has_more:
                break
            result = dbx.files_list_folder_continue(result.cursor)

        if files_in_folder > 0:
            print(f"✓ {files_in_folder} files ({size_in_folder / 1024 / 1024:.1f}MB)")
            downloaded += 1
        else:
            print(f"⚠ Empty")

    except ApiError as e:
        if 'not_found' in str(e):
            print(f"❌ NOT FOUND")
            unavailable.append({
                'path': folder_path,
                'bucket': bucket,
                'composer': composer_folder,
                'song': song_folder
            })
        else:
            print(f"❌ ERROR")
            errors.append({'path': folder_path, 'error': str(e)})

# Save unavailable composers list
if unavailable:
    # Group by composer
    by_composer = {}
    for item in unavailable:
        composer = item['composer']
        if composer not in by_composer:
            by_composer[composer] = []
        by_composer[composer].append(item['song'])

    # Generate composer contact list
    contact_list = []
    contact_list.append("# COMPOSERS - PLEASE RESEND THESE SONGS")
    contact_list.append("")
    contact_list.append(f"We need you to resend the following songs from your collection.")
    contact_list.append(f"These were lost during a migration on 7/7-7/31/2026.")
    contact_list.append("")

    for composer_full, songs in sorted(by_composer.items()):
        # Extract composer name and ID
        if '_' in composer_full:
            parts = composer_full.split('_')
            composer_id = parts[0]
            composer_name = '_'.join(parts[1:-1]) if len(parts) > 2 else parts[1]
        else:
            composer_id = composer_full
            composer_name = "Unknown"

        contact_list.append(f"## {composer_name} ({composer_id})")
        contact_list.append(f"Missing {len(songs)} songs:")
        for song in sorted(songs):
            contact_list.append(f"  - {song}")
        contact_list.append("")

    contact_text = '\n'.join(contact_list)
    with open('missing-composers-contact-list.txt', 'w') as f:
        f.write(contact_text)

    # Save JSON for import
    with open('missing-folders.json', 'w') as f:
        json.dump(unavailable, f, indent=2)

# Summary
print("\n" + "=" * 70)
print("RECOVERY DOWNLOAD COMPLETE")
print("=" * 70)
print(f"Folders found & downloaded: {downloaded}/{len(recovery_paths)}")
print(f"Folders NOT FOUND in Dropbox: {len(unavailable)}")
print(f"Total files recovered: {total_files}")
print(f"Total size: {total_size / 1024 / 1024 / 1024:.2f} GB")
if errors:
    print(f"Errors during download: {len(errors)}")
print("=" * 70)
print()

if downloaded > 0:
    print(f"✓ Downloaded {downloaded} folders to: {RECOVERY_DIR}")
    print("  Ready for backfill to B2")
print()

if unavailable:
    print(f"❌ {len(unavailable)} folders NOT FOUND in Dropbox backup")
    print(f"✓ Saved composer contact list: missing-composers-contact-list.txt")
    print(f"✓ Saved missing folders data: missing-folders.json")
    print()
    print("Next step: Contact composers listed in missing-composers-contact-list.txt")
    print("           Have them resend these songs, then backfill them to B2")
print()

if errors:
    print(f"⚠ {len(errors)} errors during download")
    with open('download-errors.json', 'w') as f:
        json.dump(errors, f, indent=2)
    print("  See download-errors.json for details")
