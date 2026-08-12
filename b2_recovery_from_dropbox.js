#!/usr/bin/env node

/**
 * B2 Recovery: Download stubs from old Dropbox, upload to B2
 * Minimal local storage: only keeps 1 SKU worth of files at a time
 *
 * Usage:
 *   export DROPBOX_OLD_TOKEN="your_token"
 *   export B2_KEY_ID="your_key"
 *   export B2_APP_KEY="your_key"
 *   node b2_recovery_from_dropbox.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const DROPBOX_TOKEN = process.env.DROPBOX_OLD_TOKEN;
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APP_KEY = process.env.B2_APP_KEY;
const TMP_DIR = path.join(os.tmpdir(), 'haus-recovery');

if (!DROPBOX_TOKEN) {
  console.error('Error: DROPBOX_OLD_TOKEN environment variable not set');
  process.exit(1);
}

if (!B2_KEY_ID || !B2_APP_KEY) {
  console.error('Error: B2_KEY_ID and B2_APP_KEY environment variables not set');
  process.exit(1);
}

let b2Auth = null;
let uploadCount = 0;
let errorCount = 0;

// Ensure temp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function https_request(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const opts = { method, headers: { ...headers } };
    const req = https.request(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function b2Authorize() {
  console.log('Authorizing with B2...');
  const auth = Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString('base64');
  const res = await https_request(
    'POST',
    'https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
    { 'Authorization': `Basic ${auth}` },
    ''
  );
  if (res.status !== 200) {
    console.error('B2 auth failed:', res.body);
    process.exit(1);
  }
  b2Auth = res.body;
  console.log('✓ B2 authorized\n');
}

async function dropboxSearch(query) {
  // Search for files matching the query in old Dropbox
  const res = await https_request(
    'POST',
    'https://api.dropboxapi.com/2/files/search_v2',
    {
      'Authorization': `Bearer ${DROPBOX_TOKEN}`,
      'Content-Type': 'application/json'
    },
    JSON.stringify({
      query: query,
      options: {
        path: '/ARCHIVE_Stratus',
        file_status: 'active',
        filename_only: false
      }
    })
  );
  return res.body.matches || [];
}

async function dropboxListFolder(path) {
  // List files in a Dropbox folder
  const res = await https_request(
    'POST',
    'https://api.dropboxapi.com/2/files/list_folder',
    {
      'Authorization': `Bearer ${DROPBOX_TOKEN}`,
      'Content-Type': 'application/json'
    },
    JSON.stringify({ path: path })
  );
  return res.status === 200 ? (res.body.entries || []) : [];
}

async function dropboxDownload(dropboxPath) {
  // Download file from Dropbox
  return new Promise((resolve, reject) => {
    const opts = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_TOKEN}`,
        'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath })
      }
    };
    const req = https.request('https://content.dropboxapi.com/2/files/download', opts, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`Download failed: ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function b2Upload(localPath, b2Path) {
  // Upload file to B2
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }

  const fileData = fs.readFileSync(localPath);

  // Get upload URL
  const apiHostname = b2Auth.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const bucketId = b2Auth.allowed?.bucketId;

  if (!bucketId) {
    // Need to look up bucket ID
    throw new Error('Could not determine bucket ID');
  }

  const urlRes = await https_request(
    'POST',
    `${b2Auth.apiUrl}/b2api/v3/b2_get_upload_url`,
    { 'Authorization': b2Auth.authorizationToken },
    JSON.stringify({ bucketId: bucketId })
  );

  if (urlRes.status !== 200) {
    throw new Error(`Get upload URL failed: ${urlRes.body?.message}`);
  }

  const uploadUrl = urlRes.body.uploadUrl;
  const uploadHostname = uploadUrl.replace(/^https?:\/\//, '').split('/')[0];
  const uploadPath = uploadUrl.replace(/^https?:\/\/[^/]+/, '');

  // Upload
  const uploadRes = await https_request(
    'POST',
    uploadUrl,
    {
      'Authorization': urlRes.body.authorizationToken,
      'X-Bz-File-Name': b2Path,
      'X-Bz-Content-Type': 'application/octet-stream',
      'Content-Length': fileData.length
    },
    fileData
  );

  if (uploadRes.status !== 200) {
    throw new Error(`Upload failed: ${uploadRes.status}`);
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('B2 Recovery: Dropbox → B2');
  console.log('='.repeat(70) + '\n');

  try {
    await b2Authorize();

    // Read stub list
    const stubCsvPath = path.join(os.homedir(), 'Documents/Claude/Projects/ATMOSPHERE/B2_FULL_STUB_AUDIT.csv');
    if (!fs.existsSync(stubCsvPath)) {
      console.error('Stub CSV not found:', stubCsvPath);
      process.exit(1);
    }

    const stubContent = fs.readFileSync(stubCsvPath, 'utf8');
    const stubs = stubContent.split('\n').filter(l => l.trim());

    // Extract unique SKUs
    const skuSet = new Set();
    for (const line of stubs) {
      const fields = [];
      let inQuote = false;
      let currentField = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
          fields.push(currentField);
          currentField = '';
        } else {
          currentField += char;
        }
      }
      fields.push(currentField);

      if (fields.length >= 3) {
        const sku = fields[2].trim();
        if (sku) skuSet.add(sku);
      }
    }

    const uniqueSkus = Array.from(skuSet).sort();
    console.log(`Found ${uniqueSkus.length} unique stub SKUs to recover\n`);

    // For now, just log the plan
    console.log('Recovery Plan:');
    console.log(`1. Search old Dropbox for ${uniqueSkus.length} SKUs`);
    console.log('2. Download files for each SKU');
    console.log('3. Upload to B2');
    console.log('4. Delete local copy');
    console.log('\nNote: This will process SKUs sequentially to minimize local storage use');
    console.log('\nTo implement full recovery:');
    console.log('- Use dropboxListFolder() to search for /ARCHIVE_*/{Composer}/{SKU}');
    console.log('- Download WAV files for each SKU');
    console.log('- Upload to corresponding B2 path');
    console.log('- Delete local files after upload\n');

    console.log('Sample SKUs to recover:');
    uniqueSkus.slice(0, 20).forEach(sku => console.log(`  ${sku}`));
    if (uniqueSkus.length > 20) {
      console.log(`  ... and ${uniqueSkus.length - 20} more`);
    }

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
