#!/usr/bin/env node

/**
 * B2 Batch Upload: SHIPPING Stubs → B2
 * Uploads 800 stub replacements from SHIPPING folder to B2
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const os = require('os');

// B2 credentials
const B2_KEY_ID = '0050a76021cb5da0000000005';
const B2_APP_KEY = 'K005m8v8s2N2M6u78T2CauZMieyj8rw';

// Read CSV with fixable stubs
const csvPath = '/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/B2_FIXABLE_FROM_SHIPPING.csv';
const shippingRoot = '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping';

let b2Auth = null;
let uploadCount = 0;
let errorCount = 0;

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

async function authorize() {
  console.log('Authorizing with B2...');
  const auth = Buffer.from(`${B2_KEY_ID}:${B2_APP_KEY}`).toString('base64');
  const res = await https_request(
    'POST',
    'https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
    { 'Authorization': `Basic ${auth}` },
    ''
  );
  if (res.status !== 200) {
    console.error('Authorization failed:', res.body);
    process.exit(1);
  }
  b2Auth = res.body;
  console.log('✓ B2 Authorization successful\n');
  return b2Auth;
}

function parseB2Key(b2Key) {
  // Extract version from b2_key: "nimbus/.../HAUS_Title_Key_Composer_VERSION.wav"
  const match = b2Key.match(/HAUS_.*_([A-Z][A-Za-z0-9]*)\.(wav|mp3|aiff)$/i);
  return match ? match[1] : null;
}

function findSourceFile(sku, version) {
  // Search SHIPPING folders for the file matching SKU and version
  const shippingFolders = ['260708_TEXAS WIVES_3', '260729_TEXAS WIVES_6', 'CORRECTIONS', 'MIGRATE'];

  for (const folder of shippingFolders) {
    const folderPath = path.join(shippingRoot, folder);
    if (!fs.existsSync(folderPath)) continue;

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(sku)) {
        const skuPath = path.join(folderPath, entry.name);
        const files = fs.readdirSync(skuPath);

        // Find file with matching version
        const versionPattern = new RegExp(`_${version}\\.(wav|mp3|aiff)$`, 'i');
        const matchedFile = files.find(f => versionPattern.test(f));

        if (matchedFile) {
          return path.join(skuPath, matchedFile);
        }
      }
    }
  }

  return null;
}

async function uploadFile(sourceFile, b2Path) {
  try {
    if (!fs.existsSync(sourceFile)) {
      console.log(`  ✗ Source file not found: ${path.basename(sourceFile)}`);
      return false;
    }

    const fileData = fs.readFileSync(sourceFile);
    const apiHostname = b2Auth.apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const uploadRes = await https_request(
      'POST',
      `${b2Auth.apiUrl}/b2api/v3/b2_upload_file`,
      {
        'Authorization': b2Auth.authorizationToken,
        'X-Bz-File-Name': b2Path,
        'X-Bz-Content-Type': 'application/octet-stream',
        'Content-Length': fileData.length
      },
      fileData
    );

    if (uploadRes.status === 200) {
      uploadCount++;
      if (uploadCount % 50 === 0) {
        console.log(`  ✓ ${uploadCount} files uploaded...`);
      }
      return true;
    } else {
      console.log(`  ✗ Upload failed (${uploadRes.status}): ${b2Path.split('/').pop()}`);
      return false;
    }
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('B2 Batch Upload: SHIPPING Stubs Replacement');
  console.log('='.repeat(70) + '\n');

  try {
    await authorize();

    // Parse CSV and build upload queue
    console.log('Building upload manifest from fixable stubs...');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(l => l.trim());

    const uploadQueue = [];
    const skuVersionSeen = new Set();

    for (const line of lines) {
      const parts = line.split('","');
      if (parts.length < 6) continue;

      const sku = parts[2].replace(/"/g, '');
      const b2Path = parts[5].replace(/"/g, '');

      if (!sku || !b2Path) continue;

      // Skip duplicates (same SKU + version)
      const version = parseB2Key(b2Path);
      const key = `${sku}_${version}`;
      if (skuVersionSeen.has(key)) continue;
      skuVersionSeen.add(key);

      // Find source file
      const sourceFile = findSourceFile(sku, version);
      if (sourceFile) {
        uploadQueue.push({ sku, version, sourceFile, b2Path });
      }
    }

    console.log(`Found ${uploadQueue.length} unique files to upload\n`);

    // Upload with batching and delays
    const batchSize = 10;
    for (let i = 0; i < uploadQueue.length; i += batchSize) {
      const batch = uploadQueue.slice(i, i + batchSize);
      const promises = batch.map(item =>
        uploadFile(item.sourceFile, item.b2Path)
          .then(ok => ok ? uploadCount++ : errorCount++)
          .catch(e => errorCount++)
      );
      await Promise.all(promises);

      if (i + batchSize < uploadQueue.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms between batches
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`UPLOAD COMPLETE: ${uploadCount} succeeded, ${errorCount} failed`);
    console.log('='.repeat(70));
    process.exit(errorCount > 0 ? 1 : 0);

  } catch (e) {
    console.error('Fatal error:', e.message);
    process.exit(1);
  }
}

main();
