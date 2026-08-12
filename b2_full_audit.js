#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const { Client } = require('pg');
const os = require('os');
const path = require('path');

// B2 credentials
const B2_KEY_ID = '0050a76021cb5da0000000005';
const B2_APP_KEY = 'K005m8v8s2N2M6u78T2CauZMieyj8rw';

// Read database config
const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json');
let pgConn = '';

try {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  pgConn = cfg.pgConn;
  if (!pgConn) {
    console.error('pgConn not found in config');
    process.exit(1);
  }
} catch (e) {
  console.error('Error reading config:', e.message);
  process.exit(1);
}

let b2Auth = null;

async function https_request(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      method,
      headers: { ...headers }
    };

    const req = https.request(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data
          });
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

  try {
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
    console.log('✓ B2 Authorization successful');
    return b2Auth;
  } catch (e) {
    console.error('Authorization error:', e.message);
    process.exit(1);
  }
}

async function getFileSize(b2Path) {
  if (!b2Auth) return null;

  try {
    const url = `${b2Auth.apiUrl}/b2api/v3/b2_get_file_info`;
    const params = new URLSearchParams({
      fileName: b2Path,
      bucketId: 'haus-music' // This may need adjustment
    });

    const res = await https_request(
      'GET',
      `${url}?${params}`,
      { 'Authorization': b2Auth.authorizationToken }
    );

    if (res.status === 200 && res.body.contentLength !== undefined) {
      return res.body.contentLength;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function getAllB2Keys() {
  console.log('\nConnecting to database...');
  const client = new Client(pgConn);

  try {
    await client.connect();
    console.log('✓ Database connected');

    console.log('Querying all b2_keys...');
    const result = await client.query(`
      SELECT
        ms.b2_key,
        t.sku_root,
        t.title,
        t.composer_id,
        CASE
          WHEN ms.b2_key LIKE 'nimbus/%' THEN 'NIMBUS'
          WHEN ms.b2_key LIKE 'cumulus/%' THEN 'CUMULUS'
          WHEN ms.b2_key LIKE 'stratus/%' THEN 'STRATUS'
          WHEN ms.b2_key LIKE 'cirrus/%' THEN 'CIRRUS'
          ELSE 'OTHER'
        END as collection
      FROM mix_stems ms
      LEFT JOIN titles t ON ms.sku_root = t.sku_root
      WHERE ms.b2_key IS NOT NULL AND ms.b2_key != ''
      ORDER BY ms.b2_key
    `);

    await client.end();
    console.log(`✓ Found ${result.rows.length} b2_keys`);
    return result.rows;
  } catch (e) {
    console.error('Database error:', e.message);
    process.exit(1);
  }
}

async function checkFileSizes(files) {
  console.log('\nBatch-checking file sizes in B2...');

  const stubs = [];
  const realFiles = [];
  const errors = [];

  const batchSize = 50;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    console.log(`Checking batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)}...`);

    const promises = batch.map(async (file) => {
      try {
        // Simple HEAD request to check file size
        const size = await getFileSize(file.b2_key);

        if (size === null || size === undefined) {
          // File might not exist or error occurred - treat as potential issue
          errors.push({
            b2_key: file.b2_key,
            sku: file.sku_root,
            reason: 'Could not determine size'
          });
        } else if (size < 1048576) { // < 1MB
          stubs.push({
            b2_key: file.b2_key,
            sku: file.sku_root,
            title: file.title,
            composer: file.composer_id,
            collection: file.collection,
            size: size
          });
        } else {
          realFiles.push({
            b2_key: file.b2_key,
            sku: file.sku_root,
            size: size
          });
        }
      } catch (e) {
        errors.push({
          b2_key: file.b2_key,
          sku: file.sku_root,
          reason: e.message
        });
      }
    });

    await Promise.all(promises);
  }

  return { stubs, realFiles, errors };
}

async function saveResults(stubs) {
  const csvPath = '/Users/HAUS/Documents/Claude/Projects/ATMOSPHERE/B2_FULL_STUB_AUDIT.csv';

  const header = 'Composer ID,Song Title,SKU,Collection,File Size (bytes),B2 Path\n';
  const rows = stubs.map(s =>
    `${s.composer || ''},${s.title || ''},${s.sku || ''},${s.collection},${s.size},"${s.b2_key}"`
  ).join('\n');

  fs.writeFileSync(csvPath, header + rows);
  console.log(`\n✓ Results saved to ${csvPath}`);
  return csvPath;
}

async function main() {
  console.log('='.repeat(70));
  console.log('B2 FULL ARCHIVE AUDIT - Identifying All Stub Files');
  console.log('='.repeat(70));

  try {
    await authorize();

    const files = await getAllB2Keys();
    console.log(`Total files in archive: ${files.length}`);

    const { stubs, realFiles, errors } = await checkFileSizes(files);

    console.log('\n' + '='.repeat(70));
    console.log('RESULTS');
    console.log('='.repeat(70));
    console.log(`Real audio files: ${realFiles.length}`);
    console.log(`Stub files (< 1MB): ${stubs.length}`);
    console.log(`Errors/inaccessible: ${errors.length}`);

    if (stubs.length > 0) {
      console.log('\nStubs by collection:');
      const byCollection = {};
      stubs.forEach(s => {
        byCollection[s.collection] = (byCollection[s.collection] || 0) + 1;
      });
      Object.entries(byCollection).forEach(([col, count]) => {
        console.log(`  ${col}: ${count}`);
      });

      console.log('\nTop 10 affected composers:');
      const byComposer = {};
      stubs.forEach(s => {
        byComposer[s.composer] = (byComposer[s.composer] || 0) + 1;
      });
      Object.entries(byComposer)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([comp, count]) => {
          console.log(`  ${comp}: ${count} stubs`);
        });
    }

    await saveResults(stubs);

    console.log('\n' + '='.repeat(70));
    console.log('AUDIT COMPLETE - CSV generated with full stub list');
    console.log('='.repeat(70));

  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
}

main();
