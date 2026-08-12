#!/usr/bin/env python3
"""
B2 Recovery Phase 1: Upload SHIPPING folder stubs to B2
Replaces 800 empty stubs with real audio files from local Dropbox SHIPPING folder

Checkpoint-based resumable upload with error handling and retry logic.
"""

import os
import sys
import json
import time
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple
import requests
from dataclasses import dataclass, asdict

# ─── Configuration ──────────────────────────────────────────────────────────

SHIPPING_DIR = Path.home() / "Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping"
CHECKPOINT_FILE = Path.home() / ".haus-recovery/phase1-checkpoint.json"
LOG_FILE = Path.home() / ".haus-recovery/phase1.log"

# B2 configuration
B2_BUCKET = "haus-music"
B2_API_URL = "https://api.backblazeb2.com/b2api/v3"
BATCH_SIZE = 50
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

# ─── Setup Logging ──────────────────────────────────────────────────────────

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

# ─── Data Structures ────────────────────────────────────────────────────────

@dataclass
class FileMatch:
    local_path: str
    local_size: int
    b2_key: str
    sku: str
    composer_id: str

    def to_dict(self):
        return asdict(self)

@dataclass
class UploadResult:
    file_path: str
    b2_key: str
    success: bool
    error: str = None
    uploaded_at: str = None

# ─── Checkpoint Management ──────────────────────────────────────────────────

class RecoveryCheckpoint:
    def __init__(self, checkpoint_file: Path):
        self.checkpoint_file = checkpoint_file
        self.data = self._load()

    def _load(self) -> Dict:
        if self.checkpoint_file.exists():
            try:
                with open(self.checkpoint_file) as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load checkpoint: {e}")
                return self._default()
        return self._default()

    def _default(self) -> Dict:
        return {
            "started_at": datetime.now().isoformat(),
            "last_batch": 0,
            "total_files": 0,
            "uploaded": 0,
            "failed": 0,
            "matches": [],
            "results": []
        }

    def save(self):
        self.checkpoint_file.write_text(json.dumps(self.data, indent=2))
        logger.info(f"Checkpoint saved: {self.checkpoint_file}")

    def add_match(self, match: FileMatch):
        self.data["matches"].append(match.to_dict())
        self.data["total_files"] = len(self.data["matches"])
        self.save()

    def add_result(self, result: UploadResult, batch_idx: int):
        self.data["results"].append(asdict(result))
        if result.success:
            self.data["uploaded"] += 1
        else:
            self.data["failed"] += 1
        self.data["last_batch"] = batch_idx
        self.save()

    def get_progress(self) -> Tuple[int, int, int]:
        return (
            self.data["uploaded"],
            self.data["failed"],
            self.data["total_files"]
        )

# ─── File Discovery & Matching ──────────────────────────────────────────────

def walk_shipping_folder() -> List[Path]:
    """Recursively list all audio files in SHIPPING folder"""
    if not SHIPPING_DIR.exists():
        logger.error(f"SHIPPING folder not found: {SHIPPING_DIR}")
        sys.exit(1)

    audio_exts = {'.wav', '.mp3', '.aiff', '.aif', '.m4a'}
    files = []

    for root, dirs, filenames in os.walk(SHIPPING_DIR):
        # Skip hidden folders and system files
        dirs[:] = [d for d in dirs if not d.startswith('.')]

        for filename in filenames:
            if Path(filename).suffix.lower() in audio_exts:
                files.append(Path(root) / filename)

    logger.info(f"Found {len(files)} audio files in SHIPPING folder")
    return sorted(files)

def extract_sku_from_filename(filename: str) -> str:
    """
    Extract ComposerID (SKU) from HAUS naming convention
    HAUS_MoonlightSonata_BbMajor_R48_FULL.wav → R48

    ComposerID format: Letter + number + optional letter variant (e.g., R48, R48a, S33a)
    """
    parts = filename.split('_')
    if len(parts) >= 4 and parts[0] == 'HAUS':
        # Format: HAUS_Title_Key_ComposerID_VERSION.ext
        # parts[3] is ComposerID (e.g., "R48" or "R48a")
        composer_id = parts[3]
        return composer_id
    return None

def match_files_to_b2_stubs(local_files: List[Path], b2_stubs: List[Dict]) -> List[FileMatch]:
    """
    Match SHIPPING files to B2 stubs by ComposerID

    Args:
        local_files: List of local Path objects from SHIPPING folder
        b2_stubs: List of B2 stub file info dicts

    Returns:
        List of matched FileMatch objects
    """
    matches = []

    # Create lookup dict from B2 stubs by ComposerID
    b2_by_composer_id = {}
    for stub in b2_stubs:
        # Extract ComposerID from B2 filename
        # Format: HAUS_Title_Key_ComposerID_VERSION.wav
        parts = stub['fileName'].split('_')
        if len(parts) >= 4 and parts[0] == 'HAUS':
            composer_id = parts[3]  # e.g., "R48", "S33a"

            # Handle duplicates by keeping track of which version to replace
            # Priority: exact match FULL version, then any version
            if composer_id not in b2_by_composer_id:
                b2_by_composer_id[composer_id] = stub
            elif 'FULL' in stub['fileName']:
                # Prefer FULL version for replacement
                b2_by_composer_id[composer_id] = stub

    logger.info(f"Indexed {len(b2_by_composer_id)} B2 stubs by ComposerID")

    for local_file in local_files:
        composer_id = extract_sku_from_filename(local_file.name)
        if not composer_id or composer_id not in b2_by_composer_id:
            continue

        stub = b2_by_composer_id[composer_id]
        match = FileMatch(
            local_path=str(local_file),
            local_size=local_file.stat().st_size,
            b2_key=stub['fileName'],
            sku=composer_id,
            composer_id=composer_id.rstrip('abcdefghijklmnopqrstuvwxyz')  # Remove version letter (e.g., R48a → R48)
        )
        matches.append(match)

    logger.info(f"Matched {len(matches)} local files to B2 stubs")
    return matches

# ─── B2 API Operations ──────────────────────────────────────────────────────

class B2Client:
    def __init__(self, key_id: str, app_key: str):
        self.key_id = key_id
        self.app_key = app_key
        self.auth_token = None
        self.api_url = None
        self.upload_url = None
        self.authorize()

    def authorize(self):
        """Get B2 auth token and upload URL"""
        auth = (self.key_id, self.app_key)
        resp = requests.get(
            f"{B2_API_URL}/b2_authorize_account",
            auth=auth,
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()

        self.auth_token = data.get('authorizationToken')
        self.account_id = data.get('accountId')
        # B2 API v3: apiUrl is nested under apiInfo.storageApi
        self.api_url = data.get('apiInfo', {}).get('storageApi', {}).get('apiUrl')

        if not self.auth_token or not self.api_url or not self.account_id:
            raise ValueError(f"Missing auth fields in B2 response. Got: {list(data.keys())}")

        logger.info("✅ B2 authorization successful")

    def get_bucket_id(self, bucket_name: str) -> str:
        """Get bucket ID from bucket name"""
        headers = {'Authorization': self.auth_token}
        resp = requests.post(
            f"{self.api_url}/b2api/v3/b2_list_buckets",
            headers=headers,
            json={'accountId': self.account_id},
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        buckets = data.get('buckets', [])

        logger.info(f"Available buckets: {[b.get('bucketName') for b in buckets]}")

        for bucket in buckets:
            if bucket.get('bucketName') == bucket_name:
                logger.info(f"Found bucket {bucket_name}: {bucket.get('bucketId')}")
                return bucket.get('bucketId')

        raise ValueError(f"Bucket {bucket_name} not found")

    def get_upload_url(self, bucket_id: str) -> Tuple[str, str]:
        """Get S3-style upload URL for bucket"""
        headers = {'Authorization': self.auth_token}
        resp = requests.get(
            f"{self.api_url}/b2api/v3/b2_get_upload_url",
            headers=headers,
            json={'bucketId': bucket_id},
            timeout=30
        )
        resp.raise_for_status()
        data = resp.json()
        return data['uploadUrl'], data['authorizationToken']

    def list_stubs(self) -> List[Dict]:
        """List all stub files (< 1MB) in bucket"""
        headers = {'Authorization': self.auth_token}
        bucket_id = self.get_bucket_id(B2_BUCKET)

        stubs = []
        start_filename = None

        while True:
            params = {
                'bucketId': bucket_id,
                'maxFileCount': 1000,
            }
            if start_filename:
                params['startFileName'] = start_filename

            resp = requests.get(
                f"{self.api_url}/b2api/v3/b2_list_file_versions",
                headers=headers,
                params=params,
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()

            for file_info in data.get('files', []):
                # Only include stubs: empty or < 1MB
                if file_info['size'] < 1024 * 1024:
                    stubs.append(file_info)

            if not data.get('nextFileName'):
                break
            start_filename = data['nextFileName']

        logger.info(f"Found {len(stubs)} stub files in B2")
        return stubs

    def upload_file(self, local_path: str, b2_key: str, bucket_id: str) -> bool:
        """Upload single file to B2"""
        try:
            upload_url, auth_token = self.get_upload_url(bucket_id)

            with open(local_path, 'rb') as f:
                data = f.read()

            headers = {
                'Authorization': auth_token,
                'X-Bz-File-Name': b2_key,
                'Content-Type': 'audio/wav',
                'X-Bz-Content-Sha1': 'unverified:' + 'dummy',  # B2 will compute
            }

            resp = requests.post(
                upload_url,
                headers=headers,
                data=data,
                timeout=60
            )
            resp.raise_for_status()
            logger.info(f"✓ Uploaded {b2_key}")
            return True

        except Exception as e:
            logger.error(f"✗ Failed to upload {b2_key}: {e}")
            return False

# ─── Main Recovery Process ──────────────────────────────────────────────────

def main():
    logger.info("=" * 80)
    logger.info("B2 RECOVERY PHASE 1: SHIPPING FOLDER UPLOAD")
    logger.info("=" * 80)

    # Load B2 credentials from environment
    b2_key_id = os.getenv('B2_KEY_ID')
    b2_app_key = os.getenv('B2_APP_KEY')

    if not b2_key_id or not b2_app_key:
        logger.error("❌ B2_KEY_ID and B2_APP_KEY environment variables required")
        sys.exit(1)

    # Initialize checkpoint
    checkpoint = RecoveryCheckpoint(CHECKPOINT_FILE)
    uploaded, failed, total = checkpoint.get_progress()

    if checkpoint.data["last_batch"] > 0:
        logger.info(f"Resuming from checkpoint: {uploaded}/{total} uploaded, {failed} failed")

    # Step 1: Discover files
    logger.info("Step 1: Discovering files in SHIPPING folder...")
    local_files = walk_shipping_folder()

    # Step 2: Connect to B2
    logger.info("Step 2: Connecting to B2...")
    try:
        b2 = B2Client(b2_key_id, b2_app_key)
        bucket_id = b2.get_bucket_id(B2_BUCKET)
    except Exception as e:
        logger.error(f"❌ Failed to connect to B2: {e}")
        sys.exit(1)

    # Step 3: List B2 stubs
    logger.info("Step 3: Listing B2 stub files...")
    try:
        b2_stubs = b2.list_stubs()
    except Exception as e:
        logger.error(f"❌ Failed to list B2 stubs: {e}")
        sys.exit(1)

    # Step 4: Match files
    logger.info("Step 4: Matching local files to B2 stubs...")
    matches = match_files_to_b2_stubs(local_files, b2_stubs)

    # Add new matches to checkpoint (skip if resuming)
    if checkpoint.data["last_batch"] == 0:
        for match in matches:
            checkpoint.add_match(match)

    # Step 5: Upload in batches
    logger.info("Step 5: Uploading files to B2...")
    start_batch = checkpoint.data["last_batch"]

    for batch_idx in range(start_batch, len(matches), BATCH_SIZE):
        batch = matches[batch_idx:batch_idx + BATCH_SIZE]
        logger.info(f"Batch {batch_idx // BATCH_SIZE + 1}: uploading {len(batch)} files...")

        for match in batch:
            for attempt in range(MAX_RETRIES):
                try:
                    success = b2.upload_file(
                        match.local_path,
                        match.b2_key,
                        bucket_id
                    )
                    result = UploadResult(
                        file_path=match.local_path,
                        b2_key=match.b2_key,
                        success=success,
                        uploaded_at=datetime.now().isoformat()
                    )
                    checkpoint.add_result(result, batch_idx)
                    break

                except Exception as e:
                    if attempt < MAX_RETRIES - 1:
                        logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES} for {match.b2_key}...")
                        time.sleep(RETRY_DELAY)
                    else:
                        result = UploadResult(
                            file_path=match.local_path,
                            b2_key=match.b2_key,
                            success=False,
                            error=str(e),
                            uploaded_at=datetime.now().isoformat()
                        )
                        checkpoint.add_result(result, batch_idx)

        # Progress report
        uploaded, failed, total = checkpoint.get_progress()
        logger.info(f"Progress: {uploaded}/{total} uploaded, {failed} failed")

    # Final report
    logger.info("=" * 80)
    logger.info("PHASE 1 RECOVERY COMPLETE")
    uploaded, failed, total = checkpoint.get_progress()
    logger.info(f"Total: {uploaded} uploaded, {failed} failed out of {total} matches")
    logger.info(f"Success rate: {100 * uploaded / total:.1f}%")
    logger.info(f"Checkpoint: {CHECKPOINT_FILE}")
    logger.info(f"Log: {LOG_FILE}")
    logger.info("=" * 80)

if __name__ == '__main__':
    main()
