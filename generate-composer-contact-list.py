#!/usr/bin/env python3
import json

# Read missing folders from the audit
with open('recovery-dropbox-paths.txt', 'r') as f:
    paths = [line.strip() for line in f if line.strip() and not line.startswith('#')]

# Group by composer
by_composer = {}
for path in paths:
    parts = path.split('/')
    if len(parts) >= 2:
        composer_full = parts[1]
        song = parts[2] if len(parts) > 2 else "Unknown"
        
        if composer_full not in by_composer:
            by_composer[composer_full] = []
        by_composer[composer_full].append(song)

# Generate contact list
contact_list = []
contact_list.append("=" * 70)
contact_list.append("COMPOSER CONTACT LIST - MISSING SONGS")
contact_list.append("=" * 70)
contact_list.append("")
contact_list.append("During a migration on 7/7-7/31/2026, the following songs were lost.")
contact_list.append("Please resend these files to recover them.")
contact_list.append("")

for composer_full in sorted(by_composer.keys()):
    songs = by_composer[composer_full]
    # Extract composer name and ID
    if '_' in composer_full:
        parts = composer_full.split('_')
        composer_id = parts[0]
        composer_name = ' '.join(parts[1:-1]) if len(parts) > 2 else parts[1]
    else:
        composer_id = composer_full
        composer_name = "Unknown"
    
    contact_list.append(f"{'=' * 70}")
    contact_list.append(f"{composer_name} ({composer_id})")
    contact_list.append(f"{'=' * 70}")
    contact_list.append(f"Missing {len(songs)} songs:")
    contact_list.append("")
    for song in sorted(songs):
        contact_list.append(f"  • {song}")
    contact_list.append("")

contact_text = '\n'.join(contact_list)
with open('COMPOSER_RESEND_LIST.txt', 'w') as f:
    f.write(contact_text)

print("✓ Generated: COMPOSER_RESEND_LIST.txt")
print(f"✓ {len(by_composer)} composers need to resend songs")
print(f"✓ Total missing songs: {sum(len(v) for v in by_composer.values())}")
