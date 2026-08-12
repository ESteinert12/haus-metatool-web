#!/usr/bin/env python3
"""
B2 Recovery Script - Digital Ocean
Downloads real audio files from old Dropbox, uploads to B2 to replace stubs
Run this on a Digital Ocean droplet for reliable, high-bandwidth recovery
"""

import os
import sys
import json
import time
import requests
from pathlib import Path
from datetime import datetime

# Configuration
DROPBOX_TOKEN = os.environ.get('DROPBOX_OLD_TOKEN')
B2_KEY_ID = os.environ.get('B2_KEY_ID')
B2_APP_KEY = os.environ.get('B2_APP_KEY')

TMP_DIR = Path('/tmp/haus-recovery')
LOG_FILE = Path('/tmp/recovery.log')
CHECKPOINT_FILE = Path('/tmp/recovery_checkpoint.json')

# Create directories
TMP_DIR.mkdir(parents=True, exist_ok=True)

def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_msg = f'[{timestamp}] {msg}'
    print(log_msg)
    with open(LOG_FILE, 'a') as f:
        f.write(log_msg + '\n')

def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {
        'processed_composers': [],
        'uploaded_files': 0,
        'error_files': 0,
        'collections_done': []
    }

def save_checkpoint(checkpoint):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(checkpoint, f, indent=2)

class DropboxClient:
    def __init__(self, token):
        self.token = token
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def list_folder(self, path):
        """List contents of Dropbox folder"""
        payload = {'path': path}
        resp = requests.post(
            'https://api.dropboxapi.com/2/files/list_folder',
            headers=self.headers,
            json=payload,
            timeout=30
        )
        if resp.status_code == 200:
            return resp.json().get('entries', [])
        log(f'  List error: {resp.status_code} - {resp.text}')
        return []

    def download_file(self, dropbox_path):
        """Download file from Dropbox"""
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Dropbox-API-Arg': json.dumps({'path': dropbox_path})
        }
        try:
            resp = requests.post(
                'https://content.dropboxapi.com/2/files/download',
                headers=headers,
                timeout=60
            )
            if resp.status_code == 200:
                return resp.content
        except Exception as e:
            log(f'    Download error: {e}')
        return None

class B2Client:
    def __init__(self, key_id, app_key):
        self.key_id = key_id
        self.app_key = app_key
        self.auth = None
        self.bucket_id = None

    def authorize(self):
        """Authorize with B2"""
        import base64
        auth = f'{self.key_id}:{self.app_key}'
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
                log('✓ B2 authorized')
                return True
        except Exception as e:
            log(f'B2 auth error: {e}')
        return False

    def get_bucket_id(self):
        """Get bucket ID for haus-music"""
        if not self.auth:
            return False

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
                        log(f'✓ Found bucket: {self.bucket_id}')
                        return True
        except Exception as e:
            log(f'Get bucket error: {e}')
        return False

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
    log('B2 Recovery: Old Dropbox → B2 (Digital Ocean)')
    log('=' * 70)

    if not DROPBOX_TOKEN or not B2_KEY_ID or not B2_APP_KEY:
        log('ERROR: Missing environment variables')
        sys.exit(1)

    # Initialize clients
    dropbox = DropboxClient(DROPBOX_TOKEN)
    b2 = B2Client(B2_KEY_ID, B2_APP_KEY)

    if not b2.authorize() or not b2.get_bucket_id():
        log('ERROR: Failed to authorize B2')
        sys.exit(1)

    checkpoint = load_checkpoint()
    log(f'Resuming from checkpoint: {len(checkpoint["processed_composers"])} composers processed')

    # Archive collections
    collections = ['1. ARCHIVE_Stratus', '2. ARCHIVE_Cumulus', '3. ARCHIVE_Cirrus', '4. ARCHIVE_Nimbus']

    for collection in collections:
        if collection in checkpoint['collections_done']:
            log(f'Skipping {collection} (already done)')
            continue

        log(f'\nProcessing {collection}...')

        try:
            composers = dropbox.list_folder(f'/{collection}')
            if not composers:
                log(f'  No composers found in {collection}')
                continue

            log(f'  Found {len(composers)} composer folders')

            for composer in composers:
                if composer['.tag'] != 'folder':
                    continue

                composer_name = composer['name']
                if composer_name in checkpoint['processed_composers']:
                    continue

                composer_path = f'/{collection}/{composer_name}'

                # List song folders
                songs = dropbox.list_folder(composer_path)
                if not songs:
                    checkpoint['processed_composers'].append(composer_name)
                    continue

                wav_count = 0
                for song in songs:
                    if song['.tag'] != 'folder':
                        continue

                    # List files in song folder
                    files = dropbox.list_folder(song['path_display'])
                    for file in files:
                        if not file['name'].endswith('.wav'):
                            continue

                        # Download from Dropbox
                        file_data = dropbox.download_file(file['path_display'])
                        if not file_data:
                            checkpoint['error_files'] += 1
                            continue

                        # Save locally
                        local_path = TMP_DIR / file['name']
                        with open(local_path, 'wb') as f:
                            f.write(file_data)

                        # Upload to B2
                        b2_path = file['path_display'].replace('/1. ARCHIVE_', '/').replace('/2. ARCHIVE_', '/').replace('/3. ARCHIVE_', '/').replace('/4. ARCHIVE_', '/')
                        if b2.upload_file(local_path, b2_path):
                            checkpoint['uploaded_files'] += 1
                            wav_count += 1
                        else:
                            checkpoint['error_files'] += 1

                        # Clean up
                        try:
                            local_path.unlink()
                        except:
                            pass

                if wav_count > 0:
                    log(f'  ✓ {composer_name}: {wav_count} files')

                checkpoint['processed_composers'].append(composer_name)
                save_checkpoint(checkpoint)

        except Exception as e:
            log(f'  Error: {e}')

        checkpoint['collections_done'].append(collection)
        save_checkpoint(checkpoint)

    # Summary
    log('\n' + '=' * 70)
    log(f'COMPLETE: {checkpoint["uploaded_files"]} uploaded, {checkpoint["error_files"]} errors')
    log('=' * 70)

if __name__ == '__main__':
    main()
