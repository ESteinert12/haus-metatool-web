#!/usr/bin/env python3
"""
B2 Recovery from Old Dropbox - Production Script
Downloads real audio files from old Dropbox, uploads to B2 to replace stubs
Runs unattended with checkpointing and resume capability
"""

import os
import sys
import json
import time
import csv
import requests
from pathlib import Path
from datetime import datetime

# Configuration
DROPBOX_TOKEN = os.environ.get('DROPBOX_OLD_TOKEN')
B2_KEY_ID = os.environ.get('B2_KEY_ID')
B2_APP_KEY = os.environ.get('B2_APP_KEY')

STUB_CSV = Path.home() / 'Documents/Claude/Projects/ATMOSPHERE/B2_FULL_STUB_AUDIT.csv'
CHECKPOINT_FILE = Path.home() / 'Documents/Claude/Projects/ATMOSPHERE/recovery_checkpoint.json'
LOG_FILE = Path.home() / 'Documents/Claude/Projects/ATMOSPHERE/recovery.log'
TMP_DIR = Path('/tmp/haus-recovery')

# Create directories
TMP_DIR.mkdir(parents=True, exist_ok=True)

# Logging
def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_msg = f'[{timestamp}] {msg}'
    print(log_msg)
    with open(LOG_FILE, 'a') as f:
        f.write(log_msg + '\n')

# Checkpoint management
def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {'processed_skus': [], 'uploaded_files': 0, 'error_files': 0}

def save_checkpoint(checkpoint):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(checkpoint, f, indent=2)

# Dropbox API
def dropbox_search_sku(sku):
    """Search Dropbox for files matching SKU"""
    headers = {'Authorization': f'Bearer {DROPBOX_TOKEN}', 'Content-Type': 'application/json'}

    # Search all ARCHIVE collections
    results = []
    for collection in ['ARCHIVE_Stratus', 'ARCHIVE_Cumulus', 'ARCHIVE_Cirrus', 'ARCHIVE_Nimbus']:
        payload = {
            'query': sku,
            'options': {'path': f'/{collection}', 'file_status': 'active'}
        }
        try:
            resp = requests.post(
                'https://api.dropboxapi.com/2/files/search_v2',
                headers=headers,
                json=payload,
                timeout=30
            )
            if resp.status_code == 200:
                matches = resp.json().get('matches', [])
                results.extend(matches)
        except Exception as e:
            log(f'  Search error in {collection}: {e}')

    return results

def dropbox_download(dropbox_path, local_path):
    """Download file from Dropbox"""
    headers = {
        'Authorization': f'Bearer {DROPBOX_TOKEN}',
        'Dropbox-API-Arg': json.dumps({'path': dropbox_path})
    }
    try:
        resp = requests.post(
            'https://content.dropboxapi.com/2/files/download',
            headers=headers,
            timeout=60
        )
        if resp.status_code == 200:
            with open(local_path, 'wb') as f:
                f.write(resp.content)
            return True
    except Exception as e:
        log(f'    Download error: {e}')
    return False

# B2 API
class B2Client:
    def __init__(self, key_id, app_key):
        self.key_id = key_id
        self.app_key = app_key
        self.auth = None
        self.bucket_id = None

    def authorize(self):
        """Authorize with B2"""
        auth = f'{self.key_id}:{self.app_key}'
        import base64
        auth_b64 = base64.b64encode(auth.encode()).decode()
        headers = {'Authorization': f'Basic {auth_b64}'}

        try:
            resp = requests.post(
                'https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
                headers=headers,
                timeout=30
            )
            if resp.status_code == 200:
                self.auth = resp.json()
                return True
        except Exception as e:
            log(f'B2 auth error: {e}')
        return False

    def get_bucket_id(self):
        """Get bucket ID for haus-music"""
        if not self.auth:
            return None

        headers = {'Authorization': self.auth['authorizationToken']}
        params = {'accountId': self.auth['accountId']}

        try:
            resp = requests.get(
                f"{self.auth['apiUrl']}/b2api/v3/b2_list_buckets",
                headers=headers,
                params=params,
                timeout=30
            )
            if resp.status_code == 200:
                buckets = resp.json().get('buckets', [])
                for b in buckets:
                    if b['bucketName'] == 'haus-music':
                        self.bucket_id = b['bucketId']
                        return self.bucket_id
        except Exception as e:
            log(f'Get bucket error: {e}')
        return None

    def upload_file(self, local_path, b2_path):
        """Upload file to B2"""
        if not self.auth or not self.bucket_id:
            return False

        try:
            # Get upload URL
            headers = {'Authorization': self.auth['authorizationToken']}
            payload = {'bucketId': self.bucket_id}
            resp = requests.post(
                f"{self.auth['apiUrl']}/b2api/v3/b2_get_upload_url",
                headers=headers,
                json=payload,
                timeout=30
            )

            if resp.status_code != 200:
                log(f'    Get upload URL failed: {resp.status_code}')
                return False

            upload_info = resp.json()
            upload_url = upload_info['uploadUrl']
            upload_auth = upload_info['authorizationToken']

            # Upload file
            with open(local_path, 'rb') as f:
                file_data = f.read()

            headers = {
                'Authorization': upload_auth,
                'X-Bz-File-Name': b2_path,
                'X-Bz-Content-Type': 'application/octet-stream',
                'Content-Length': str(len(file_data))
            }

            resp = requests.post(
                upload_url,
                headers=headers,
                data=file_data,
                timeout=120
            )

            return resp.status_code == 200
        except Exception as e:
            log(f'    Upload error: {e}')
        return False

def main():
    log('=' * 70)
    log('B2 Recovery: Old Dropbox → B2')
    log('=' * 70)

    if not DROPBOX_TOKEN:
        log('ERROR: DROPBOX_OLD_TOKEN not set')
        sys.exit(1)

    if not B2_KEY_ID or not B2_APP_KEY:
        log('ERROR: B2_KEY_ID or B2_APP_KEY not set')
        sys.exit(1)

    if not STUB_CSV.exists():
        log(f'ERROR: Stub CSV not found: {STUB_CSV}')
        sys.exit(1)

    # Load checkpoint
    checkpoint = load_checkpoint()
    log(f'Resuming from checkpoint: {len(checkpoint["processed_skus"])} SKUs processed')
    log(f'Progress: {checkpoint["uploaded_files"]} uploaded, {checkpoint["error_files"]} errors')

    # Initialize B2
    b2 = B2Client(B2_KEY_ID, B2_APP_KEY)
    if not b2.authorize():
        log('ERROR: Failed to authorize B2')
        sys.exit(1)
    log('✓ B2 authorized')

    if not b2.get_bucket_id():
        log('ERROR: Could not find haus-music bucket')
        sys.exit(1)
    log(f'✓ Found bucket: {b2.bucket_id}')

    # Parse stub CSV to get unique SKUs
    stub_skus = set()
    try:
        with open(STUB_CSV) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                # Parse CSV fields
                fields = []
                in_quote = False
                current = ''
                for char in line:
                    if char == '"':
                        in_quote = not in_quote
                    elif char == ',' and not in_quote:
                        fields.append(current)
                        current = ''
                    else:
                        current += char
                fields.append(current)

                if len(fields) >= 3:
                    sku = fields[2].strip()
                    if sku:
                        stub_skus.add(sku)
    except Exception as e:
        log(f'ERROR reading CSV: {e}')
        sys.exit(1)

    stub_skus = sorted(stub_skus)
    log(f'\nFound {len(stub_skus)} unique stub SKUs')
    log(f'Starting recovery batch...\n')

    # Process SKUs
    start_time = time.time()
    skipped = len(checkpoint['processed_skus'])

    for idx, sku in enumerate(stub_skus):
        if sku in checkpoint['processed_skus']:
            continue

        progress = idx + 1 - skipped
        log(f'[{progress}/{len(stub_skus)-skipped}] Processing {sku}...')

        # Search Dropbox
        matches = dropbox_search_sku(sku)
        if not matches:
            log(f'  Not found in Dropbox')
            checkpoint['processed_skus'].append(sku)
            continue

        # Download and upload files
        for match in matches:
            if match['metadata'].get('.tag') != 'file':
                continue

            dropbox_path = match['metadata']['path_display']
            file_name = match['metadata']['name']
            local_path = TMP_DIR / file_name

            # Download
            if not dropbox_download(dropbox_path, local_path):
                log(f'  ✗ Failed to download {file_name}')
                checkpoint['error_files'] += 1
                continue

            # Construct B2 path (keep original path structure)
            b2_path = dropbox_path.replace('/ARCHIVE_', '/').replace('_', '/', 1)  # Approximate

            # Upload to B2
            if b2.upload_file(local_path, b2_path):
                log(f'  ✓ {file_name}')
                checkpoint['uploaded_files'] += 1
            else:
                log(f'  ✗ Upload failed: {file_name}')
                checkpoint['error_files'] += 1

            # Clean up
            try:
                local_path.unlink()
            except:
                pass

        checkpoint['processed_skus'].append(sku)
        save_checkpoint(checkpoint)

        # Status every 50 SKUs
        if progress % 50 == 0:
            elapsed = time.time() - start_time
            rate = progress / elapsed
            remaining = (len(stub_skus) - skipped - progress) / rate if rate > 0 else 0
            log(f'  Status: {checkpoint["uploaded_files"]} files uploaded, {remaining:.0f}s remaining\n')

    # Final summary
    elapsed = time.time() - start_time
    log('\n' + '=' * 70)
    log('RECOVERY COMPLETE')
    log(f'Uploaded: {checkpoint["uploaded_files"]} files')
    log(f'Errors: {checkpoint["error_files"]} files')
    log(f'Time: {elapsed/3600:.1f} hours')
    log('=' * 70)

if __name__ == '__main__':
    main()
