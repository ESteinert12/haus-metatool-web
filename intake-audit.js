// intake-audit.js
// Audits every track intaked since the migration date.
// Checks: mix_stems, B2 keys, SKU format, composer match, lot assignment,
//         description, S20d sequence anomaly, and shipping folder existence.
//
// Usage:
//   node intake-audit.js                         — audit from default migration date
//   node intake-audit.js --since 2026-06-01      — audit from a specific date
//   node intake-audit.js --composer S20d         — single composer deep-dive
//   node intake-audit.js --csv                   — write results to intake-audit.csv

const { Pool } = require('pg')
const fs        = require('fs')
const path      = require('path')
const os        = require('os')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const DEFAULT_SINCE = '2026-06-24'
const args          = process.argv.slice(2)
const SINCE         = (() => { const i = args.indexOf('--since'); return i >= 0 ? args[i+1] : DEFAULT_SINCE })()
const COMPOSER      = (() => { const i = args.indexOf('--composer'); return i >= 0 ? args[i+1] : null })()
const CSV           = args.includes('--csv')

// Load shipping folder from cfg file
function getShippingPath() {
  try {
    const cfgPath = path.join(os.homedir(), '.haus-workspace-cfg.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    return cfg.hausjup || null
  } catch { return null }
}

function checkShippingFolder(skuRoot, title, shippingPath) {
  if (!shippingPath) return null
  try {
    // Walk shipping folder up to 3 levels deep looking for a folder with this sku_root prefix
    const lots = fs.readdirSync(shippingPath)
    for (const lot of lots) {
      const lotPath = path.join(shippingPath, lot)
      try {
        const tracks = fs.readdirSync(lotPath)
        const match  = tracks.find(t => t.startsWith(skuRoot.slice(0,7)))
        if (match) {
          const trackPath = path.join(lotPath, match)
          const files = fs.readdirSync(trackPath).filter(f => /\.(wav|mp3|aiff?)/i.test(f))
          return { lotFolder: lot, trackFolder: match, audioCount: files.length }
        }
      } catch {}
    }
    return { lotFolder: null, trackFolder: null, audioCount: 0 }
  } catch { return null }
}

const PAD = 14

function fmt(label, val) { return `${label.padEnd(PAD)} ${val}` }

let errors = 0, warnings = 0

function ok(msg)   { console.log(`  ✓  ${msg}`) }
function warn(msg) { console.warn(`  ⚠  ${msg}`); warnings++ }
function err(msg)  { console.error(`  ✗  ${msg}`); errors++ }
function info(msg) { console.log(`  →  ${msg}`) }

async function run() {
  const shippingPath = getShippingPath()
  const csvRows = [['sku_root','title','composer_id','lot','created_at','has_mix_stems','has_b2','local_audio_count','issues']]

  console.log('\n══════════════════════════════════════════')
  console.log('  HAUS Intake Audit')
  console.log(`  Since: ${SINCE}${COMPOSER ? `  |  Composer: ${COMPOSER}` : ''}`)
  if (shippingPath) console.log(`  Shipping: ${shippingPath}`)
  else              console.log(`  Shipping: not found in ~/.haus-workspace-cfg.json — skipping disk checks`)
  console.log('══════════════════════════════════════════\n')

  // ── Pull all relevant titles ────────────────────────────────────────────────
  const composerClause = COMPOSER ? `AND t.composer_id ILIKE $2` : ''
  const params = COMPOSER ? [SINCE, COMPOSER] : [SINCE]

  const { rows: titles } = await pool.query(`
    SELECT
      t.sku_root,
      t.title,
      t.composer_id,
      t.created_at,
      t.description,
      t.status,
      t.release_date,
      l.lot_name,
      l.lot_id,
      s.next_seq AS seq_next,
      COUNT(ms.mix_stem_id)                                        AS stem_count,
      COUNT(ms.mix_stem_id) FILTER (WHERE ms.b2_key IS NOT NULL)  AS b2_count
    FROM titles t
    LEFT JOIN lot_titles lt ON lt.sku_root = t.sku_root
    LEFT JOIN lots l        ON l.lot_id    = lt.lot_id
    LEFT JOIN mix_stems ms  ON ms.sku_root = t.sku_root
    LEFT JOIN sku_sequences s ON s.composer_full_id = t.composer_id
    WHERE t.created_at >= $1 ${composerClause}
    GROUP BY t.sku_root, t.title, t.composer_id, t.created_at, t.description,
             t.status, t.release_date, l.lot_name, l.lot_id, s.next_seq
    ORDER BY t.composer_id, t.created_at
  `, params)

  if (!titles.length) {
    console.log(`  No titles found since ${SINCE}${COMPOSER ? ` for ${COMPOSER}` : ''}.`)
    await pool.end(); return
  }

  console.log(`  ${titles.length} title${titles.length !== 1 ? 's' : ''} to audit\n`)

  // ── Check S20d sequence anomaly ─────────────────────────────────────────────
  const { rows: seqRows } = await pool.query(`
    SELECT composer_full_id, next_seq,
           (SELECT COUNT(*) FROM titles WHERE composer_id = composer_full_id) AS actual_count
    FROM sku_sequences
    WHERE next_seq > 50
      AND (SELECT COUNT(*) FROM titles WHERE composer_id = composer_full_id) < 20
    ORDER BY next_seq DESC
  `)
  if (seqRows.length) {
    console.log('─── Sequence Anomalies (high counter, few tracks) ───\n')
    for (const r of seqRows) {
      warn(`${r.composer_full_id}: next_seq=${r.next_seq} but only ${r.actual_count} track(s) in DB`)
      info(`Fix: UPDATE sku_sequences SET next_seq=${parseInt(r.actual_count)+1} WHERE composer_full_id='${r.composer_full_id}';`)
    }
    console.log()
  }

  // ── Per-track audit ─────────────────────────────────────────────────────────
  console.log('─── Track-by-track ───\n')

  // Group by composer for readability
  const byComposer = {}
  for (const t of titles) {
    const k = t.composer_id || 'UNKNOWN'
    if (!byComposer[k]) byComposer[k] = []
    byComposer[k].push(t)
  }

  for (const [composerId, tracks] of Object.entries(byComposer)) {
    console.log(`  ── ${composerId} (${tracks.length} track${tracks.length !== 1 ? 's' : ''}) ──`)
    for (const t of tracks) {
      const issues = []
      const stemCount = parseInt(t.stem_count)
      const b2Count   = parseInt(t.b2_count)
      const date      = t.created_at ? new Date(t.created_at).toISOString().slice(0,10) : '?'
      const lot       = t.lot_name || '—'

      // Mix stems
      if (stemCount === 0)  issues.push('NO MIX_STEMS')
      if (b2Count   === 0)  issues.push('NOT IN B2')

      // Lot assignment
      if (!t.lot_id)        issues.push('NO LOT')

      // Description
      if (!t.description)   issues.push('NO DESCRIPTION')

      // SKU format check — should be composer_id + 3 digits + album digit
      const expectedPrefix = composerId
      if (!t.sku_root.toLowerCase().startsWith(expectedPrefix.toLowerCase())) {
        issues.push(`SKU PREFIX MISMATCH (sku=${t.sku_root}, composer=${composerId})`)
      }

      // Local shipping folder check
      let localInfo = null
      if (shippingPath) {
        localInfo = checkShippingFolder(t.sku_root, t.title, shippingPath)
        if (localInfo && localInfo.audioCount === 0) issues.push('NO AUDIO IN SHIPPING')
      }

      // Print
      const statusIcon = issues.length === 0 ? '✓' : issues.some(i => i.includes('MIX_STEMS') || i.includes('PREFIX')) ? '✗' : '⚠'
      const localStr   = localInfo
        ? (localInfo.audioCount > 0 ? `${localInfo.audioCount} files` : 'EMPTY FOLDER')
        : 'no disk check'

      console.log(`\n    ${statusIcon} ${t.sku_root}  "${t.title}"`)
      console.log(`       ${fmt('Lot:', lot)}  ${fmt('Intaked:', date)}  ${fmt('Stems:', stemCount + ' (' + b2Count + ' in B2)')}  ${fmt('Disk:', localStr)}`)
      if (issues.length) {
        console.log(`       ⚑  ${issues.join('  |  ')}`)
        if (issues.some(i => i.includes('MIX_STEMS') || i.includes('PREFIX'))) errors++
        else warnings++
      }

      csvRows.push([
        t.sku_root, t.title, composerId, lot, date,
        stemCount > 0 ? 'yes' : 'no',
        b2Count   > 0 ? 'yes' : 'no',
        localInfo?.audioCount ?? '',
        issues.join('; ')
      ])
    }
    console.log()
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const noStems   = titles.filter(t => parseInt(t.stem_count) === 0)
  const noB2      = titles.filter(t => parseInt(t.b2_count)   === 0)
  const noLot     = titles.filter(t => !t.lot_id)
  const noDesc    = titles.filter(t => !t.description)

  console.log('══════════════════════════════════════════')
  console.log(`  ${titles.length} tracks audited  |  ${errors} errors  |  ${warnings} warnings`)
  console.log('──────────────────────────────────────────')
  if (noStems.length)   console.error(`  ✗  ${noStems.length} tracks have NO mix_stems (files never registered)`)
  else                  console.log(  `  ✓  All tracks have mix_stems`)
  if (noB2.length)      console.warn( `  ⚠  ${noB2.length} tracks not in B2`)
  else                  console.log(  `  ✓  All tracks have B2 audio`)
  if (noLot.length)     console.warn( `  ⚠  ${noLot.length} tracks have no lot assignment`)
  else                  console.log(  `  ✓  All tracks have a lot`)
  if (noDesc.length)    console.warn( `  ⚠  ${noDesc.length} tracks missing a description`)
  else                  console.log(  `  ✓  All tracks have descriptions`)
  console.log('══════════════════════════════════════════\n')

  // ── CSV export ───────────────────────────────────────────────────────────────
  if (CSV) {
    const csvPath = path.join(__dirname, 'intake-audit.csv')
    fs.writeFileSync(csvPath, csvRows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'))
    console.log(`  CSV written to: ${csvPath}\n`)
  }

  await pool.end()
  process.exit(errors > 0 ? 1 : 0)
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
