#!/usr/bin/env python3
"""
B2 Recovery Phase 1: Upload SHIPPING folder files to B2
Checkpoint-based resumable upload with proper error handling.
"""

import os
import sys
import json
import time
import logging
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple
from urllib.parse import quote
import requests
from dataclasses import dataclass, asdict
from requests.exceptions import RequestException, Timeout, ConnectionError

# Configuration
# Try mounted path first (for sandboxed bash), fall back to actual path
SHIPPING_MOUNTED = Path("/sessions/sleepy-trusting-heisenberg/mnt/2. ATMOS_Shipping")
SHIPPING_ACTUAL = Path.home() / "Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping"
SHIPPING_DIR = SHIPPING_MOUNTED if SHIPPING_MOUNTED.exists() else SHIPPING_ACTUAL

CHECKPOINT_FILE = Path.home() / ".haus-recovery/phase1-checkpoint.json"
LOG_FILE = Path.home() / ".haus-recovery/phase1.log"

B2_BUCKET = "haus-music"
B2_API_URL = "https://api.backblazeb2.com/b2api/v3"
BATCH_SIZE = 50
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
DRY_RUN = os.getenv('DRY_RUN', '').lower() in ('1', 'true', 'yes')

# Logging setup
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

# Error handling
def categorize_error(error: Exception, status_code: int = None) -> str:
    """Categorize error as transient (retry) or permanent (fail)"""
    if isinstance(error, (Timeout, ConnectionError)):
        return "transient"

    if status_code:
        # Transient errors: retry
        if status_code in (408, 429, 500, 503, 504):
            return "transient"
        # Permanent errors: fail
        if status_code in (400, 401, 403, 404, 405, 409, 410, 411, 413, 414, 415, 416, 417):
            return "permanent"

    return "unknown"

# Data structures
@dataclass
class FileMatch:
    local_path: str
    local_size: int
    b2_key: str
    sku: str

@dataclass
class UploadResult:
    file_path: str
    b2_key: str
    success: bool
    error: str = None
    error_type: str = None
    local_sha1: str = None
    uploaded_at: str = None

# Checkpoint management
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

    def add_match(self, match: FileMatch):
        self.data["matches"].append(asdict(match))
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

# File operations
def walk_shipping_folder() -> List[Path]:
    if not SHIPPING_DIR.exists():
        logger.error(f"SHIPPING folder not found: {SHIPPING_DIR}")
        sys.exit(1)

    audio_exts = {'.wav', '.mp3', '.aiff', '.aif', '.m4a'}
    files = []

    for root, dirs, filenames in os.walk(SHIPPING_DIR):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for filename in filenames:
            if Path(filename).suffix.lower() in audio_exts:
                files.append(Path(root) / filename)

    logger.info(f"Found {len(files)} audio files in SHIPPING folder")
    return sorted(files)

def extract_sku(filename: str) -> str:
    """Extract ComposerID from filename: HAUS_Title_Key_ComposerID_VERSION.ext"""
    parts = filename.split('_')
    if len(parts) >= 4 and parts[0] == 'HAUS':
        return parts[3]  # ComposerID
    return None

def extract_title(filename: str) -> str:
    """Extract song title from filename: HAUS_Title_Key_ComposerID_VERSION.ext"""
    parts = filename.split('_')
    if len(parts) >= 4 and parts[0] == 'HAUS':
        return parts[1]  # Title (e.g., "CowboyIntuition")
    return None

def extract_version(filename: str) -> str:
    """Extract version type from filename: HAUS_Title_Key_ComposerID_VERSION.ext"""
    parts = filename.split('_')
    if len(parts) >= 5 and parts[0] == 'HAUS':
        version = parts[4].split('.')[0]  # Remove extension
        return version
    return 'FULL'

def extract_title_from_folder(folder_path: str) -> str:
    """Extract song title from B2 folder path: .../{ComposerID}{Number}_{Title}_{Key}/"""
    # Folder format: C53a4313_Predator Pursuit_Fm
    folder_name = folder_path.split('/')[-1]  # Get last component

    # Split by underscore and find the title (between number and key)
    parts = folder_name.split('_')
    if len(parts) >= 2:
        # First part is ComposerID+number (e.g., "C53a4313")
        # Middle parts are title (can have multiple underscores)
        # Last part is key
        # Title is everything except first and last
        title = '_'.join(parts[1:-1]) if len(parts) > 2 else parts[1]
        return title.replace(' ', '')  # Remove spaces for comparison
    return None

def match_files_to_stubs(local_files: List[Path], b2_stubs: List[Dict]) -> List[FileMatch]:
    """Match local files to B2 stubs by Title + ComposerID (validated against folder name)"""
    # Index stubs by (Title, ComposerID) -> folder_path
    # BUT verify folder name title matches stub filename title
    b2_folders = {}  # (title, cid) -> folder_path

    # Debug: show first 5 stub filenames
    if b2_stubs:
        logger.info(f"DEBUG: First 5 stub filenames:")
        for i, stub in enumerate(b2_stubs[:5]):
            logger.info(f"  {i+1}. {stub.get('fileName', 'NO_NAME')}")

    for stub in b2_stubs:
        full_path = stub.get('fileName', '')
        filename = full_path.split('/')[-1] if '/' in full_path else full_path

        parts = filename.split('_')
        if len(parts) >= 4 and parts[0] == 'HAUS':
            cid = parts[3]  # e.g., "C27a"
            stub_title = parts[1]  # Title from filename: "GrungeTrap"

            # Extract folder path and validate folder title matches
            folder_path = '/'.join(full_path.split('/')[:-1])
            folder_title = extract_title_from_folder(folder_path)  # Title from folder: "GrungeTrap"

            # Only store if titles match (prevent TooLateLucy in Nosey folders)
            if folder_title and stub_title.lower() == folder_title.lower():
                key = (stub_title.lower(), cid)
                if key not in b2_folders:
                    b2_folders[key] = folder_path
            else:
                logger.debug(f"Skipping mismatched: stub={stub_title} folder={folder_title} in {full_path}")

    logger.info(f"Indexed {len(b2_folders)} validated song folders from {len(b2_stubs)} total files")

    matches = []
    for local_file in local_files:
        cid = extract_sku(local_file.name)
        title = extract_title(local_file.name)

        if not cid or not title:
            continue

        # Match by (Title, ComposerID) - only if folder title matches
        key = (title.lower(), cid)
        if key in b2_folders:
            folder_path = b2_folders[key]
            b2_key = folder_path + '/' + local_file.name

            matches.append(FileMatch(
                local_path=str(local_file),
                local_size=local_file.stat().st_size,
                b2_key=b2_key,
                sku=cid
            ))
        else:
            logger.warning(f"No B2 folder match for {title}/{cid} in {local_file.name}")

    logger.info(f"Matched {len(matches)} files to song folders (validated by title + ComposerID)")
    return matches

# B2 API client
class B2Client:
    def __init__(self, key_id: str, app_key: str):
        self.key_id = key_id
        self.app_key = app_key
        self.auth_token = None
        self.account_id = None
        self.api_url = None
        self.bucket_id = None
        self.authorize()

    def authorize(self):
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
        self.api_url = data.get('apiInfo', {}).get('storageApi', {}).get('apiUrl')

        if not all([self.auth_token, self.account_id, self.api_url]):
            raise ValueError(f"B2 auth missing fields: {list(data.keys())}")

        logger.info("✅ B2 authorization successful")

    def get_bucket_id(self, bucket_name: str) -> str:
        headers = {'Authorization': self.auth_token}
        resp = requests.post(
            f"{self.api_url}/b2api/v3/b2_list_buckets",
            headers=headers,
            json={'accountId': self.account_id},
            timeout=30
        )
        resp.raise_for_status()

        buckets = resp.json().get('buckets', [])
        for b in buckets:
            if b.get('bucketName') == bucket_name:
                self.bucket_id = b.get('bucketId')
                logger.info(f"Found bucket: {bucket_name}")
                return self.bucket_id

        raise ValueError(f"Bucket {bucket_name} not found")

    def list_stubs(self) -> List[Dict]:
        headers = {'Authorization': self.auth_token}
        stubs = []
        start_filename = None
        page = 0

        while True:
            page += 1
            logger.info(f"  Listing page {page}...")

            resp = requests.post(
                f"{self.api_url}/b2api/v3/b2_list_file_versions",
                headers=headers,
                json={
                    'bucketId': self.bucket_id,
                    'maxFileCount': 10000,
                    'startFileName': start_filename
                },
                timeout=60
            )
            resp.raise_for_status()
            data = resp.json()

            files_in_page = len(data.get('files', []))
            stubs_in_page = 0

            for f in data.get('files', []):
                size = f.get('size') or f.get('contentLength') or 0
                if size < 1024 * 1024:  # < 1MB = stub
                    stubs.append(f)
                    stubs_in_page += 1

            logger.info(f"  Page {page}: {files_in_page} files, {stubs_in_page} stubs (total: {len(stubs)})")

            if not data.get('nextFileName'):
                break
            start_filename = data['nextFileName']

        logger.info(f"Found {len(stubs)} stub files in {page} pages")
        return stubs

    def upload_file(self, local_path: str, b2_key: str) -> Tuple[bool, str, str]:
        """Upload file with retries and verification. Returns (success, error_type, sha1)"""
        local_sha1 = None

        try:
            # Validate local file
            with open(local_path, 'rb') as f:
                file_data = f.read()
            local_sha1 = hashlib.sha1(file_data).hexdigest()
            local_size = len(file_data)

            if local_size == 0:
                return False, "permanent", local_sha1  # Empty file is a permanent error

        except Exception as e:
            logger.error(f"✗ {b2_key}: Cannot read local file: {e}")
            return False, "permanent", None

        # Retry loop
        for attempt in range(MAX_RETRIES):
            try:
                # Get upload URL
                headers = {'Authorization': self.auth_token}
                resp = requests.post(
                    f"{self.api_url}/b2api/v3/b2_get_upload_url",
                    headers=headers,
                    json={'bucketId': self.bucket_id},
                    timeout=30
                )
                resp.raise_for_status()
                upload_data = resp.json()

                # Upload file with SHA1
                upload_headers = {
                    'Authorization': upload_data['authorizationToken'],
                    'X-Bz-File-Name': quote(b2_key, safe='/'),
                    'Content-Type': 'audio/wav',
                    'X-Bz-Content-Sha1': local_sha1,
                    'Content-Length': str(local_size)
                }

                resp = requests.post(
                    upload_data['uploadUrl'],
                    headers=upload_headers,
                    data=file_data,
                    timeout=60
                )

                if resp.status_code != 200:
                    error_msg = resp.text[:200]
                    logger.error(f"B2 returned {resp.status_code}: {error_msg}")
                    error_type = categorize_error(None, resp.status_code)

                    if error_type == "permanent":
                        return False, error_type, local_sha1
                    else:
                        if attempt < MAX_RETRIES - 1:
                            logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES}: {b2_key}")
                            time.sleep(RETRY_DELAY * (attempt + 1))  # Exponential backoff
                        continue

                resp.raise_for_status()

                # Verify upload: check file size in B2
                b2_file = resp.json()
                b2_size = b2_file.get('contentLength') or b2_file.get('size')
                if b2_size != local_size:
                    logger.error(f"✗ {b2_key}: Size mismatch! Local={local_size}, B2={b2_size}")
                    return False, "permanent", local_sha1

                logger.info(f"✓ {b2_key} (SHA1: {local_sha1[:8]}...)")
                return True, None, local_sha1

            except (Timeout, ConnectionError) as e:
                if attempt < MAX_RETRIES - 1:
                    logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES}: {b2_key} | Network error: {type(e).__name__}")
                    time.sleep(RETRY_DELAY * (attempt + 1))
                else:
                    logger.error(f"✗ {b2_key}: Network error after {MAX_RETRIES} attempts: {e}")
                    return False, "transient", local_sha1

            except Exception as e:
                error_type = categorize_error(e)
                if error_type == "permanent":
                    logger.error(f"✗ {b2_key}: Permanent error: {type(e).__name__}: {str(e)[:100]}")
                    return False, error_type, local_sha1
                elif attempt < MAX_RETRIES - 1:
                    logger.warning(f"Retry {attempt + 1}/{MAX_RETRIES}: {b2_key} | {type(e).__name__}: {str(e)[:100]}")
                    time.sleep(RETRY_DELAY * (attempt + 1))
                else:
                    logger.error(f"✗ {b2_key}: Failed after {MAX_RETRIES} attempts: {type(e).__name__}")
                    return False, error_type, local_sha1

        return False, "unknown", local_sha1

# Main recovery process
def main():
    logger.info("=" * 80)
    logger.info("B2 RECOVERY PHASE 1: SHIPPING FOLDER UPLOAD")
    logger.info("=" * 80)

    # Load credentials
    key_id = os.getenv('B2_KEY_ID')
    app_key = os.getenv('B2_APP_KEY')
    if not key_id or not app_key:
        logger.error("❌ Missing B2_KEY_ID or B2_APP_KEY")
        sys.exit(1)

    # Initialize
    checkpoint = RecoveryCheckpoint(CHECKPOINT_FILE)
    up, fail, tot = checkpoint.get_progress()
    if tot > 0:
        logger.info(f"Resuming: {up}/{tot} uploaded, {fail} failed")

    # Step 1: Discover
    logger.info("Step 1: Discovering files...")
    local_files = walk_shipping_folder()

    # Step 2: Connect
    logger.info("Step 2: Connecting to B2...")
    try:
        b2 = B2Client(key_id, app_key)
        b2.get_bucket_id(B2_BUCKET)
    except Exception as e:
        logger.error(f"❌ B2 connection failed: {e}")
        sys.exit(1)

    # Step 3: List stubs
    logger.info("Step 3: Listing stubs...")
    try:
        stubs = b2.list_stubs()
    except Exception as e:
        logger.error(f"❌ Failed to list stubs: {e}")
        sys.exit(1)

    # Step 4: Match
    logger.info("Step 4: Matching files...")
    matches = match_files_to_stubs(local_files, stubs)

    # Add to checkpoint if starting fresh
    if checkpoint.data["last_batch"] == 0:
        for m in matches:
            checkpoint.add_match(m)

    # DRY RUN: Show summary without uploading
    if DRY_RUN:
        logger.info("=" * 80)
        logger.info("DRY RUN MODE - NO FILES WILL BE UPLOADED")
        logger.info("=" * 80)
        logger.info(f"Would upload: {len(matches)} files")
        logger.info(f"Would skip: {len(local_files) - len(matches)} files (no B2 folder match)")
        logger.info("")
        logger.info("First 10 files to upload:")
        for match in matches[:10]:
            logger.info(f"  {Path(match.local_path).name} → {match.b2_key}")
        if len(matches) > 10:
            logger.info(f"  ... and {len(matches) - 10} more")
        logger.info("=" * 80)
        logger.info("To run for real, remove DRY_RUN environment variable:")
        logger.info("  unset DRY_RUN")
        return

    # Step 5: Upload
    logger.info("Step 5: Uploading...")
    start = checkpoint.data["last_batch"]
    transient_errors = []
    permanent_errors = []

    for batch_idx in range(start, len(matches), BATCH_SIZE):
        batch = matches[batch_idx:batch_idx + BATCH_SIZE]
        logger.info(f"Batch {batch_idx // BATCH_SIZE + 1}: {len(batch)} files")

        for match in batch:
            success, error_type, sha1 = b2.upload_file(match.local_path, match.b2_key)
            result = UploadResult(
                file_path=match.local_path,
                b2_key=match.b2_key,
                success=success,
                error=error_type,
                error_type=error_type,
                local_sha1=sha1,
                uploaded_at=datetime.now().isoformat()
            )
            checkpoint.add_result(result, batch_idx)

            if not success and error_type == "transient":
                transient_errors.append((match.b2_key, error_type))
            elif not success and error_type == "permanent":
                permanent_errors.append((match.b2_key, error_type))

        up, fail, tot = checkpoint.get_progress()
        logger.info(f"Progress: {up}/{tot} uploaded, {fail} failed")

    # Final report
    logger.info("=" * 80)
    logger.info("PHASE 1 RECOVERY COMPLETE")
    up, fail, tot = checkpoint.get_progress()
    if tot > 0:
        pct = 100 * up / tot
    else:
        pct = 0
    logger.info(f"Total: {up} uploaded, {fail} failed out of {tot}")
    logger.info(f"Success rate: {pct:.1f}%")
    if transient_errors:
        logger.info(f"⚠️  Transient errors (retry next time): {len(transient_errors)}")
    if permanent_errors:
        logger.info(f"❌ Permanent errors (need manual fix): {len(permanent_errors)}")
        for path, _ in permanent_errors[:5]:
            logger.info(f"   - {path}")
    logger.info("=" * 80)

if __name__ == '__main__':
    main()
