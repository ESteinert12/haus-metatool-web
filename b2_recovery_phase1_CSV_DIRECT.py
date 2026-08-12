#!/usr/bin/env python3
"""
B2 Recovery Phase 1: Upload SHIPPING files using CSV-based mappings
Includes B2 API client, retry logic, checkpointing, and progress tracking.
"""

import os
import sys
import csv
import json
import time
import logging
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from urllib.parse import quote
import requests
from requests.exceptions import RequestException, Timeout, ConnectionError

# Configuration
CSV_FILE = Path.home() / "Documents/Claude/Projects/ATMOSPHERE/B2_FIXABLE_FROM_SHIPPING.csv"
SHIPPING_DIR = Path.home() / "Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping"

CHECKPOINT_FILE = Path.home() / ".haus-recovery/phase1-checkpoint.json"
LOG_FILE = Path.home() / ".haus-recovery/phase1.log"

B2_BUCKET = "haus-music"
B2_API_URL = "https://api.backblazeb2.com/b2api/v3"
MAX_RETRIES = 3
RETRY_DELAY = 2
DRY_RUN = os.getenv('DRY_RUN', '').lower() in ('1', 'true', 'yes')

# Logging
CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class B2Client:
    """B2 API client with authorization and upload functionality"""

    def __init__(self, key_id: str, app_key: str):
        self.key_id = key_id
        self.app_key = app_key
        self.auth_token = None
        self.account_id = None
        self.api_url = None
        self.bucket_id = None
        self.authorize()

    def authorize(self):
        """Authorize with B2 API"""
        try:
            resp = requests.get(
                f"{B2_API_URL}/b2_authorize_account",
                auth=(self.key_id, self.app_key),
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()

            self.auth_token = data.get('authorizationToken')
            self.account_id = data.get('accountId')
            self.api_url = data.get('apiInfo', {}).get('storageApi', {}).get('apiUrl')

            if not all([self.auth_token, self.account_id, self.api_url]):
                raise ValueError(f"B2 auth incomplete: {list(data.keys())}")

            logger.info("✓ B2 authorization successful")
            self.get_bucket_id()

        except RequestException as e:
            logger.error(f"B2 authorization failed: {e}")
            sys.exit(1)

    def get_bucket_id(self):
        """Get bucket ID for haus-music"""
        headers = {'Authorization': self.auth_token}
        try:
            resp = requests.post(
                f"{self.api_url}/b2api/v3/b2_list_buckets",
                headers=headers,
                json={'accountId': self.account_id},
                timeout=30
            )
            resp.raise_for_status()

            for bucket in resp.json().get('buckets', []):
                if bucket.get('bucketName') == B2_BUCKET:
                    self.bucket_id = bucket.get('bucketId')
                    logger.info(f"✓ Found bucket: {B2_BUCKET}")
                    return

            raise ValueError(f"Bucket {B2_BUCKET} not found")

        except RequestException as e:
            logger.error(f"Failed to get bucket ID: {e}")
            sys.exit(1)

    def get_upload_url(self) -> Tuple[str, str]:
        """Get upload URL and auth token for this bucket"""
        headers = {'Authorization': self.auth_token}
        try:
            resp = requests.post(
                f"{self.api_url}/b2api/v3/b2_get_upload_url",
                headers=headers,
                json={'bucketId': self.bucket_id},
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get('uploadUrl'), data.get('authorizationToken')

        except RequestException as e:
            logger.error(f"Failed to get upload URL: {e}")
            raise

    def upload_file(self, local_path: str, b2_key: str, retries: int = 0) -> Tuple[bool, Optional[str]]:
        """
        Upload file to B2. Returns (success, sha1_hash)
        """
        try:
            # Calculate SHA1
            sha1 = hashlib.sha1()
            with open(local_path, 'rb') as f:
                while True:
                    data = f.read(65536)
                    if not data:
                        break
                    sha1.update(data)
            file_sha1 = sha1.hexdigest()

            # Get upload URL
            upload_url, upload_auth = self.get_upload_url()

            # Upload file
            with open(local_path, 'rb') as f:
                file_data = f.read()

            # URL-encode the b2_key for proper handling of spaces and special chars
            encoded_b2_key = quote(b2_key, safe='/')

            headers = {
                'Authorization': upload_auth,
                'X-Bz-File-Name': encoded_b2_key,
                'Content-Type': 'application/octet-stream',
                'X-Bz-Content-Sha1': file_sha1,
                'X-Bz-Info-src_last_modified_millis': str(int(Path(local_path).stat().st_mtime * 1000))
            }

            resp = requests.post(
                upload_url,
                headers=headers,
                data=file_data,
                timeout=120
            )

            if resp.status_code == 200:
                logger.info(f"✓ Uploaded {Path(local_path).name} → {b2_key}")
                return True, file_sha1
            elif resp.status_code in (408, 429, 500, 503, 504) and retries < MAX_RETRIES:
                logger.warning(f"Transient error (status {resp.status_code}), retrying...")
                time.sleep(RETRY_DELAY * (retries + 1))
                return self.upload_file(local_path, b2_key, retries + 1)
            else:
                logger.error(f"Upload failed (status {resp.status_code}): {resp.text}")
                return False, None

        except (Timeout, ConnectionError) as e:
            if retries < MAX_RETRIES:
                logger.warning(f"Connection error, retrying... ({retries + 1}/{MAX_RETRIES})")
                time.sleep(RETRY_DELAY * (retries + 1))
                return self.upload_file(local_path, b2_key, retries + 1)
            else:
                logger.error(f"Upload failed after retries: {e}")
                return False, None

        except Exception as e:
            logger.error(f"Upload error: {e}")
            return False, None

class Checkpoint:
    """Manage upload checkpoint for resumability"""

    def __init__(self):
        self.data = self.load()

    def load(self) -> Dict:
        default = {
            'started_at': datetime.now().isoformat(),
            'total_files': 0,
            'uploaded': 0,
            'failed': 0,
            'skipped': 0,
            'last_index': -1,
            'failures': []
        }

        if CHECKPOINT_FILE.exists():
            try:
                loaded = json.loads(CHECKPOINT_FILE.read_text())
                # Merge with defaults to ensure all keys exist
                for key in default:
                    if key not in loaded:
                        loaded[key] = default[key]
                return loaded
            except Exception as e:
                logger.warning(f"Could not load checkpoint: {e}, starting fresh")

        return default

    def save(self):
        CHECKPOINT_FILE.write_text(json.dumps(self.data, indent=2))

    def mark_progress(self, index: int, success: bool, filename: str = None):
        self.data['last_index'] = index
        if success:
            self.data['uploaded'] += 1
        else:
            self.data['failed'] += 1
            if filename:
                self.data['failures'].append(filename)
        self.save()

    def mark_skipped(self):
        self.data['skipped'] += 1
        self.save()

def load_csv_mappings() -> Dict[str, Tuple[str, Dict]]:
    """Load CSV mappings: filename -> (b2_key, metadata)"""
    if not CSV_FILE.exists():
        logger.error(f"CSV not found: {CSV_FILE}")
        sys.exit(1)

    mappings = {}
    audio_exts = {'.wav', '.mp3', '.aif', '.aiff', '.m4a'}

    with open(CSV_FILE) as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 6:
                continue

            composer_id = row[0].strip('"').strip()
            title = row[1].strip('"').strip()
            sku = row[2].strip('"').strip()
            collection = row[3].strip('"').strip()
            b2_path = row[5].strip('"').strip()

            if not b2_path:
                continue

            filename = b2_path.split('/')[-1]
            ext = Path(filename).suffix.lower()

            if ext not in audio_exts or filename.startswith('gramophone-'):
                continue

            mappings[filename] = (b2_path, {
                'composer_id': composer_id or 'UNKNOWN',
                'title': title,
                'sku': sku,
                'collection': collection
            })

    logger.info(f"Loaded {len(mappings)} file mappings from CSV")
    return mappings

def find_local_files(mappings: Dict) -> List[Dict]:
    """Find SHIPPING files that match CSV mappings"""
    if not SHIPPING_DIR.exists():
        logger.error(f"SHIPPING folder not found: {SHIPPING_DIR}")
        sys.exit(1)

    jobs = []
    missing = []

    logger.info(f"Searching SHIPPING folder: {SHIPPING_DIR}")

    for filename, (b2_path, meta) in mappings.items():
        local_path = None
        for root, dirs, files in os.walk(SHIPPING_DIR):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            if filename in files:
                local_path = Path(root) / filename
                break

        if not local_path or not local_path.exists():
            missing.append(filename)
            continue

        try:
            size = local_path.stat().st_size
            jobs.append({
                'filename': filename,
                'local_path': str(local_path),
                'local_size': size,
                'b2_key': b2_path,
                'metadata': meta
            })
        except Exception as e:
            logger.warning(f"Failed to stat {filename}: {e}")
            missing.append(filename)

    logger.info(f"Found {len(jobs)} matching files in SHIPPING")
    if missing:
        logger.warning(f"Missing from SHIPPING: {len(missing)} files")

    return jobs

def main():
    logger.info("=" * 80)
    logger.info("B2 RECOVERY PHASE 1: CSV-BASED UPLOAD")
    logger.info("=" * 80)
    logger.info(f"DRY_RUN: {DRY_RUN}")

    # Load mappings and find files
    mappings = load_csv_mappings()
    jobs = find_local_files(mappings)

    if not jobs:
        logger.error("No matching files found!")
        sys.exit(1)

    total_size = sum(j['local_size'] for j in jobs)
    logger.info(f"Ready to upload: {len(jobs)} files ({total_size / (1024*1024):.1f} MB)")

    if DRY_RUN:
        logger.info("\nSample uploads (first 5):")
        for i, job in enumerate(jobs[:5]):
            meta = job['metadata']
            logger.info(f"  {i+1}. {job['filename']}")
            logger.info(f"     SKU: {meta['sku']} | {meta['collection']}")
        if len(jobs) > 5:
            logger.info(f"  ... and {len(jobs) - 5} more")

        logger.info("\n" + "=" * 80)
        logger.info("DRY RUN COMPLETE")
        logger.info("To run for real, remove DRY_RUN:")
        logger.info("  unset DRY_RUN && python3 b2_recovery_phase1_CSV_DIRECT.py")
        logger.info("=" * 80)
        return

    # Live upload
    logger.info("\n" + "=" * 80)
    logger.info("STARTING LIVE UPLOAD")
    logger.info("=" * 80)

    # Get B2 credentials
    b2_key_id = os.getenv('B2_KEY_ID')
    b2_app_key = os.getenv('B2_APP_KEY')

    if not b2_key_id or not b2_app_key:
        logger.error("B2_KEY_ID and B2_APP_KEY environment variables required")
        sys.exit(1)

    # Initialize B2 client and checkpoint
    client = B2Client(b2_key_id, b2_app_key)
    checkpoint = Checkpoint()
    checkpoint.data['total_files'] = len(jobs)
    checkpoint.save()

    # Upload files
    start_index = checkpoint.data['last_index'] + 1

    if start_index > 0:
        logger.info(f"Resuming from file {start_index}/{len(jobs)}")

    for i, job in enumerate(jobs[start_index:], start=start_index):
        logger.info(f"\n[{i+1}/{len(jobs)}] Uploading {job['filename']}...")

        success, sha1 = client.upload_file(job['local_path'], job['b2_key'])
        checkpoint.mark_progress(i, success, job['filename'] if not success else None)

        if not success:
            logger.error(f"Failed to upload {job['filename']}")

    # Summary
    logger.info("\n" + "=" * 80)
    logger.info("UPLOAD COMPLETE")
    logger.info(f"  Uploaded: {checkpoint.data['uploaded']}/{len(jobs)}")
    logger.info(f"  Failed: {checkpoint.data['failed']}")
    if checkpoint.data['failures']:
        logger.info(f"  Failed files: {', '.join(checkpoint.data['failures'][:10])}")
    logger.info("=" * 80)

if __name__ == '__main__':
    main()
