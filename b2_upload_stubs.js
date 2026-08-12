#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const B2_KEY_ID = '0050a76021cb5da0000000005';
const B2_APP_KEY = 'K005m8v8s2N2M6u78T2CauZMieyj8rw';

// Upload manifest
const uploads = [
  {
    sku: 'R46a8244',
    title: 'Too Late Lucy',
    source: '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/260708_TEXAS WIVES_3/R46a8244_Too Late Lucy_E/HAUS_TooLateLucy_E_R46a_FULL.wav',
    b2Path: 'nimbus/R46_Martin Briley_NIMBUS/R46a8244_Too Late Lucy_E/HAUS_TooLateLucy_E_R46a_NoDrums.wav'
  },
  {
    sku: 'R48a4084',
    title: 'SMOOTH DADDY',
    source: '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/MIGRATE/R48a4084_SMOOTH DADDY_SOUL_Eb min/HAUS_SmoothDaddy_Ebm_R48a_FULL.mp3',
    b2Path: 'nimbus/R48_Michael Toland_NIMBUS/R48a4084_SMOOTH DADDY_SOUL_Eb min/HAUS_SmoothDaddy_Ebm_R48a_BUMPER.wav'
  },
  {
    sku: 'R93c0034',
    title: 'MidnightRust',
    source: '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/260708_TEXAS WIVES_3/R93c0034_MidnightRust_Am/HAUS_MidnightRust_Am_R93c_FULL.wav',
    b2Path: 'nimbus/R93_Adonis Tsilimparis_NIMBUS/R93c0034_MidnightRust_Am/HAUS_MidnightRust_Am_R93c_STING.wav'
  },
  {
    sku: 'R93c0074',
    title: 'True Grit',
    source: '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/260708_TEXAS WIVES_3/R93c0074_True Grit_G/HAUS_TrueGrit_G_R93c_FULL.wav',
    b2Path: 'nimbus/R93_Adonis Tsilimparis_NIMBUS/R93c0074_True Grit_G/HAUS_TrueGrit_G_R93c_DNB.wav'
  },
  {
    sku: 'S33a44044',
    title: 'Counting What Ifs',
    source: '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/MIGRATE/S33a44044_Counting What Ifs_Dsharpm_SoHoEDM/HAUS_CountingWhatIfs_Dsharpm_S33a_FULL.wav',
    b2Path: 'nimbus/S33_Peter Lobo_NIMBUS/S33a44044_Counting What Ifs_Dsharpm_SoHoEDM/HAUS_CountingWhatIfs_Dsharpm_S33a_STING.wav'
  },
  {
    sku: 'S33a44194',
    title: 'Let Your Voice Ring',
    source: '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/MIGRATE/S33a44194_Let Your Voice Ring_Cm_SoHoEDM/HAUS_LetYourVoiceRing_Cm_S33a_FULL.mp3',
    b2Path: 'nimbus/S33_Peter Lobo_NIMBUS/S33a44194_Let Your Voice Ring_Cm_SoHoEDM/HAUS_LetYourVoiceRing_Cm_S33a_STING.wav'
  },
  {
    sku: 'S33a49244',
    title: 'Dance At Five',
    source: '/Users/HAUS/Library/CloudStorage/Dropbox/2. COLLECTION UPLOADER/2. ATMOS_Shipping/260729_TEXAS WIVES_6/S33a49244_Dance At Five/HAUS_DanceAtFive_Gm_S33a_FULL.mp3',
    b2Path: 'nimbus/S33_Peter Lobo_NIMBUS/S33a49244_Dance At Five/HAUS_DanceAtFive_Gm_S33a_STING.wav'
  }
];

async function b2Request(method, url, headers = {}, body = null) {
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
            headers: res.headers,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
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
    const res = await b2Request(
      'POST',
      'https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
      { 'Authorization': `Basic ${auth}` },
      ''
    );

    if (res.status !== 200) {
      console.error('Authorization failed:', res.body);
      process.exit(1);
    }

    console.log('✓ Authorization successful');
    return res.body;
  } catch (e) {
    console.error('Authorization error:', e.message);
    process.exit(1);
  }
}

async function uploadFile(auth, file) {
  console.log(`\nUploading: ${file.sku} (${file.title})`);

  try {
    // Read file
    if (!fs.existsSync(file.source)) {
      console.error(`✗ Source file not found: ${file.source}`);
      return false;
    }

    const fileData = fs.readFileSync(file.source);
    console.log(`  File size: ${(fileData.length / 1048576).toFixed(2)}MB`);

    // Upload to B2
    const uploadUrl = `${auth.apiUrl}/b2api/v3/b2_upload_file`;
    const headers = {
      'Authorization': auth.authorizationToken,
      'X-Bz-File-Name': file.b2Path,
      'X-Bz-Content-Type': 'application/octet-stream',
      'X-Bz-Info-src_last_modified_millis': Date.now().toString(),
      'Content-Length': fileData.length,
      'X-Bz-Account-Id': auth.accountId
    };

    const res = await b2Request('POST', uploadUrl, headers, fileData);

    if (res.status === 200) {
      console.log(`✓ Uploaded successfully to B2`);
      return true;
    } else {
      console.error(`✗ Upload failed: ${res.status}`, res.body);
      return false;
    }
  } catch (e) {
    console.error(`✗ Error uploading: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('B2 Stub File Replacement');
  console.log('='.repeat(60));

  try {
    const auth = await authorize();

    let success = 0;
    let failed = 0;

    for (const file of uploads) {
      const result = await uploadFile(auth, file);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Results: ${success} succeeded, ${failed} failed`);
    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
}

main();
