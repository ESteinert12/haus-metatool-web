// db-cleanup.js
// Fixes post-recovery data issues:
//   1. Remove duplicate sku_roots (keep first inserted)
//   2. Report 219 unparseable sku_roots (X/R suffix) — ask before deleting
//   3. Fix S33a sequence inflated by a malformed sku_root
//
//   node db-cleanup.js            — dry run (shows what would change)
//   node db-cleanup.js --fix      — apply all repairs
//   node db-cleanup.js --fix --delete-unparseable  — also delete the 219 bad rows

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX                = process.argv.includes('--fix')
const DELETE_UNPARSEABLE = process.argv.includes('--delete-unparseable')

function log(msg)  { console.log(`  ${msg}`) }
function ok(msg)   { console.log(`  ✓  ${msg}`) }
function info(msg) { console.log(`  →  ${msg}`) }
function warn(msg) { console.warn(`  ⚠  ${msg}`) }

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  HAUS DB Cleanup')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: DRY RUN (pass --fix to apply)')
  console.log('══════════════════════════════════════════\n')

  // ── 1. Duplicates ──────────────────────────────────────────────────────────
  console.log('─── Duplicate sku_roots ───\n')
  const dups = await pool.query(`
    SELECT sku_root, COUNT(*) AS cnt
    FROM titles
    GROUP BY sku_root
    HAVING COUNT(*) > 1
  `)

  if (dups.rows.length === 0) {
    ok('No duplicates found')
  } else {
    for (const row of dups.rows) {
      // Show both rows
      const rows = await pool.query(
        `SELECT ctid, sku_root, title, composer_id, bpm, key FROM titles WHERE sku_root = $1 ORDER BY ctid`,
        [row.sku_root]
      )
      warn(`Duplicate: ${row.sku_root} (${row.cnt} copies)`)
      for (const r of rows.rows) {
        info(`  ctid=${r.ctid}  title="${r.title}"  key=${r.key}  bpm=${r.bpm}`)
      }

      if (FIX) {
        // Keep lowest ctid (first inserted), delete the rest
        const minCtid = rows.rows[0].ctid
        const result = await pool.query(
          `DELETE FROM titles WHERE sku_root = $1 AND ctid != $2`,
          [row.sku_root, minCtid]
        )
        ok(`  Deleted ${result.rowCount} duplicate(s) of ${row.sku_root}`)
      } else {
        info(`  Would delete all but ctid=${rows.rows[0].ctid}`)
      }
    }
  }

  // ── 2. Unparseable sku_roots ───────────────────────────────────────────────
  console.log('\n─── Unparseable sku_roots (uppercase suffix like X, R) ───\n')

  // These don't match: strict (digits{4,5}), SIB (digits+lowercase letter), or lenient (digits only)
  // They end in uppercase letters — look like radio edits, remixes, etc.
  const unparseable = await pool.query(`
    SELECT sku_root, composer_id, title
    FROM titles
    WHERE sku_root !~ '^[A-Z0-9]+[a-zA-Z][0-9]+$'
      AND sku_root !~ '^[A-Z0-9]+[a-z][0-9]{2,4}[a-z]$'
    ORDER BY sku_root
  `)

  log(`Found ${unparseable.rows.length} unparseable sku_roots`)
  if (unparseable.rows.length > 0) {
    // Group by suffix pattern
    const byPattern = {}
    for (const r of unparseable.rows) {
      const m = r.sku_root.match(/([A-Z])$/)
      const suffix = m ? m[1] : '?'
      if (!byPattern[suffix]) byPattern[suffix] = []
      byPattern[suffix].push(r)
    }
    for (const [suffix, items] of Object.entries(byPattern)) {
      info(`Suffix "${suffix}": ${items.length} rows`)
      items.slice(0, 3).forEach(r => info(`  ${r.sku_root}  "${r.title}"  (${r.composer_id})`))
      if (items.length > 3) info(`  ... and ${items.length - 3} more`)
    }

    if (DELETE_UNPARSEABLE && FIX) {
      const skus = unparseable.rows.map(r => r.sku_root)
      const result = await pool.query(
        `DELETE FROM titles WHERE sku_root = ANY($1::text[])`,
        [skus]
      )
      ok(`Deleted ${result.rowCount} unparseable rows`)
    } else if (DELETE_UNPARSEABLE) {
      info(`Would delete ${unparseable.rows.length} unparseable rows (add --fix to apply)`)
    } else {
      warn(`These rows are kept — run with --delete-unparseable --fix to remove them`)
      info(`Or they can stay — they won't cause collisions since intake skips them`)
    }
  }

  // ── 3. S33a — find the malformed sku_root driving seq to 364744 ───────────
  console.log('\n─── S33a sequence inflation check ───\n')
  const s33a = await pool.query(`
    SELECT sku_root, title, length(sku_root) AS len
    FROM titles
    WHERE composer_id = 'S33a'
    ORDER BY length(sku_root) DESC, sku_root DESC
    LIMIT 20
  `)

  log(`S33a — longest sku_roots:`)
  for (const r of s33a.rows) {
    info(`  ${r.sku_root} (len=${r.len})  "${r.title}"`)
  }

  // Flag any S33a sku_roots with 6+ trailing digits after 'S33a'
  const s33aBad = s33a.rows.filter(r => {
    const m = r.sku_root.match(/^S33a(\d+)$/)
    return m && m[1].length >= 6
  })

  if (s33aBad.length === 0) {
    ok('No S33a outliers found — sequence inflation may have another cause')
  } else {
    warn(`${s33aBad.length} S33a sku_root(s) with 6+ trailing digits:`)
    s33aBad.forEach(r => info(`  ${r.sku_root}  "${r.title}"`))
    if (FIX) {
      // If these are genuinely bad data (not real tracks), delete them
      // and reset S33a sequence to sane value
      const badSkus = s33aBad.map(r => r.sku_root)
      const del = await pool.query(
        `DELETE FROM titles WHERE sku_root = ANY($1::text[])`,
        [badSkus]
      )
      ok(`Deleted ${del.rowCount} malformed S33a row(s)`)

      // Recalculate correct S33a max seq
      const maxSeq = await pool.query(`
        SELECT MAX(
          CASE
            WHEN sku_root ~ '^S33a\\d{4,5}$'
            THEN CAST(substring(left(sku_root, -1) FROM '(\\d+)$') AS INTEGER)
            WHEN sku_root ~ '^S33a\\d{2,4}[a-z]$'
            THEN CAST(substring(sku_root FROM '(\\d+)') AS INTEGER)
            ELSE NULL
          END
        ) AS max_seq
        FROM titles
        WHERE composer_id = 'S33a'
      `)
      const correct = parseInt(maxSeq.rows[0].max_seq || 0) + 1
      await pool.query(
        `UPDATE sku_sequences SET next_seq = $1 WHERE composer_full_id = 'S33a' AND next_seq > $1`,
        [correct]
      )
      ok(`S33a next_seq corrected to ${correct}`)
    } else {
      info(`Would delete these and reset S33a next_seq (add --fix to apply)`)
    }
  }

  // ── 4. Final state ─────────────────────────────────────────────────────────
  console.log('\n─── Final State ───\n')
  const counts = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(DISTINCT sku_root) AS unique_skus
    FROM titles
  `)
  const s33aSeq = await pool.query(`SELECT next_seq FROM sku_sequences WHERE composer_full_id='S33a'`)
  ok(`titles: ${counts.rows[0].total} rows, ${counts.rows[0].unique_skus} unique sku_roots`)
  ok(`S33a next_seq: ${s33aSeq.rows[0]?.next_seq ?? 'not found'}`)

  if (!FIX) {
    console.log('\n  Run with --fix to apply all repairs shown above.\n')
  }

  await pool.end()
}

run().catch(async e => {
  console.error('\n[db-cleanup] Fatal:', e.message)
  await pool.end()
  process.exit(1)
})
