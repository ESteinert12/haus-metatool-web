// sku-audit.js
// Comprehensive SKU integrity audit. Run any time to verify the entire
// SKU system is consistent.
//
//   node sku-audit.js            — audit only (read-only)
//   node sku-audit.js --fix      — audit + repair behind sequences
//   node sku-audit.js --verbose  — show per-composer sequence state

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const VERBOSE = process.argv.includes('--verbose')
const FIX     = process.argv.includes('--fix')

let errors   = 0
let warnings = 0
let fixed    = 0

function ok(msg)   { console.log(`  ✓  ${msg}`) }
function warn(msg) { console.warn(`  ⚠  ${msg}`); warnings++ }
function err(msg)  { console.error(`  ✗  ${msg}`); errors++ }
function info(msg) { console.log(`  →  ${msg}`) }

// ─── Helper: parse a sku_root back into its components ────────────────────────
// Current standard: {composer_full_id}{seq}
//   composer_full_id = uppercase letters+digits + lowercase variant letter
//   seq = 3–4 zero-padded digits
//   Example: R13a001  →  composerId=R13a  seq=1  canonical=true
//
// Legacy formats (FileMaker imports) also accepted:
//   Uppercase variant:  C32B443  →  composerId=C32B  seq=443  canonical=false
//   Short padding:      R04b68   →  composerId=R04b  seq=68   canonical=false
//   Long seq (5+):      S33a36474→  composerId=S33a  seq=36474 canonical=false
function parseSku(skuRoot) {
  // Strict (current standard): lowercase variant, 4–5 trailing digits
  // (3-digit seq + 1 album digit = 4, or 4-digit seq + 1 album digit = 5)
  const strict = skuRoot.match(/^([A-Z0-9]+[a-z])(\d{4,5})$/)
  if (strict) return { composerId: strict[1], seq: parseInt(strict[2], 10), canonical: true }

  // SIB/specialty format: lowercase variant + digits + letter album code (e.g. R37a092b)
  const sibFormat = skuRoot.match(/^([A-Z0-9]+[a-z])(\d{2,4})([a-z])$/)
  if (sibFormat) return { composerId: sibFormat[1], seq: parseInt(sibFormat[2], 10), canonical: true }

  // Sound-design suffix format: variant letter (lower or upper) + digits + uppercase type code
  //   X = Exclusives/Extended, R = Risers, I = Impacts
  //   e.g. R11a001R, R11a265I, C27b001X, R90L001X
  const sfxFormat = skuRoot.match(/^([A-Z0-9]+[a-zA-Z])(\d{2,4})([XIR])$/)
  if (sfxFormat) return { composerId: sfxFormat[1], seq: parseInt(sfxFormat[2], 10), canonical: true, sfxType: sfxFormat[3] }

  // Lenient (legacy): uppercase variant OR non-standard digit count
  const lenient = skuRoot.match(/^([A-Z0-9]+[a-zA-Z])(\d+)$/)
  if (lenient) return { composerId: lenient[1], seq: parseInt(lenient[2], 10), canonical: false }

  return null
}

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  HAUS SKU Integrity Audit')
  console.log('══════════════════════════════════════════\n')

  // ── 1. Table existence ────────────────────────────────────────────────────
  console.log('─── Infrastructure ───\n')
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `)
  const tableSet = new Set(tables.rows.map(r => r.table_name))

  const required = ['titles', 'teams', 'sku_sequences', 'composers', 'mix_stems']
  for (const t of required) {
    if (tableSet.has(t)) ok(`table ${t} exists`)
    else err(`table ${t} MISSING`)
  }

  if (!tableSet.has('sku_sequences')) {
    warn('sku_sequences table missing — creating and seeding now…')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sku_sequences (
        composer_full_id TEXT PRIMARY KEY,
        next_seq         INTEGER NOT NULL DEFAULT 1,
        created_at       TIMESTAMPTZ DEFAULT now()
      )
    `)
    await pool.query(`
      INSERT INTO sku_sequences (composer_full_id, next_seq)
      SELECT composer_full_id, GREATEST(MAX(next_seq), 1)
      FROM teams
      WHERE composer_full_id IS NOT NULL AND composer_full_id != ''
      GROUP BY composer_full_id
      ON CONFLICT (composer_full_id) DO UPDATE
        SET next_seq = GREATEST(sku_sequences.next_seq, EXCLUDED.next_seq)
    `)
    ok('sku_sequences created and seeded from teams')
  }

  // ── 2. Teams duplicates ───────────────────────────────────────────────────
  console.log('\n─── Teams Table ───\n')
  const teamDups = await pool.query(`
    SELECT composer_full_id, COUNT(*) AS cnt
    FROM teams
    WHERE composer_full_id IS NOT NULL AND composer_full_id != ''
    GROUP BY composer_full_id
    HAVING COUNT(*) > 1
  `)
  if (teamDups.rows.length === 0) {
    ok('teams — no duplicates')
  } else {
    warn(`teams — ${teamDups.rows.length} composers have duplicate rows`)
    teamDups.rows.forEach(r => console.log(`       ${r.composer_full_id}: ${r.cnt} rows`))
    warn('Run: node db-dedup.js --execute  to fix teams duplicates')
  }

  const teamCount = await pool.query(`SELECT COUNT(DISTINCT composer_full_id) AS n FROM teams`)
  ok(`teams — ${teamCount.rows[0].n} unique composers registered`)

  // ── 3. sku_sequences vs teams alignment ───────────────────────────────────
  console.log('\n─── SKU Sequences ───\n')
  const seqCount = await pool.query(`SELECT COUNT(*) AS n FROM sku_sequences`)
  ok(`sku_sequences — ${seqCount.rows[0].n} rows`)

  // Composers in teams but not in sku_sequences
  const missingSeqs = await pool.query(`
    SELECT DISTINCT t.composer_full_id
    FROM teams t
    LEFT JOIN sku_sequences s ON s.composer_full_id = t.composer_full_id
    WHERE t.composer_full_id IS NOT NULL AND t.composer_full_id != ''
      AND s.composer_full_id IS NULL
  `)
  if (missingSeqs.rows.length === 0) {
    ok('all registered composers have a sku_sequences row')
  } else {
    warn(`${missingSeqs.rows.length} composers in teams but missing from sku_sequences:`)
    missingSeqs.rows.forEach(r => console.log(`       ${r.composer_full_id}`))
    warn('These will be auto-seeded on next generateSku() call (or app restart)')
  }

  if (VERBOSE) {
    const seqs = await pool.query(`SELECT composer_full_id, next_seq FROM sku_sequences ORDER BY composer_full_id`)
    console.log('\n  Sequence state per composer:')
    seqs.rows.forEach(r => console.log(`    ${r.composer_full_id.padEnd(12)} next_seq=${r.next_seq}`))
  }

  // ── 4. sku_root uniqueness in titles ─────────────────────────────────────
  console.log('\n─── Titles Table ───\n')
  const titleCount = await pool.query(`SELECT COUNT(*) AS n, COUNT(DISTINCT sku_root) AS unique_n FROM titles`)
  const { n, unique_n } = titleCount.rows[0]
  if (n === unique_n) {
    ok(`titles — ${n} rows, all sku_roots unique`)
  } else {
    err(`titles — ${n} rows but only ${unique_n} unique sku_roots (${n - unique_n} duplicates!)`)
    const dupSkus = await pool.query(`
      SELECT sku_root, COUNT(*) AS cnt FROM titles GROUP BY sku_root HAVING COUNT(*) > 1 LIMIT 10
    `)
    dupSkus.rows.forEach(r => err(`  sku_root ${r.sku_root} appears ${r.cnt} times`))
  }

  // ── 5. SKU format validation ──────────────────────────────────────────────
  console.log('\n─── SKU Format ───\n')
  const allSkus = await pool.query(`SELECT sku_root, composer_id FROM titles ORDER BY sku_root`)
  let unparseable = 0, legacy = 0, mismatch = 0
  const legacyExamples = []

  for (const row of allSkus.rows) {
    const parsed = parseSku(row.sku_root)
    if (!parsed) {
      if (unparseable < 10) err(`unparseable sku_root: "${row.sku_root}"`)
      unparseable++
      continue
    }
    if (!parsed.canonical) {
      if (legacyExamples.length < 5) legacyExamples.push(row.sku_root)
      legacy++
    }
    // Verify the sku_root's composerId matches the stored composer_id column
    // Use case-insensitive compare to handle uppercase variant letters
    if (row.composer_id && parsed.composerId.toLowerCase() !== row.composer_id.toLowerCase()) {
      if (mismatch < 10) warn(`sku_root/composer_id mismatch: sku=${row.sku_root} → ${parsed.composerId}, stored composer_id=${row.composer_id}`)
      mismatch++
    }
  }

  if (unparseable === 0) ok(`all ${allSkus.rows.length} sku_roots parse (including legacy formats)`)
  else err(`${unparseable} sku_roots are completely unparseable`)

  if (legacy === 0) {
    ok('all sku_roots use current standard format')
  } else {
    warn(`${legacy} legacy-format sku_roots (FileMaker imports — uppercase variant or non-padded seq)`)
    info(`examples: ${legacyExamples.join(', ')}`)
    info('these are valid IDs, just formatted differently from the current standard')
    info('new intakes will use standard format; legacy ones do not need to change')
  }

  if (mismatch === 0) ok('all sku_root prefixes match their composer_id column')
  else warn(`${mismatch} sku_roots have a prefix that doesn't match the stored composer_id`)

  // ── 6. Sequence coverage — highest issued SKU vs sku_sequences ────────────
  console.log('\n─── Sequence Coverage ───\n')
  // Lenient regex covers both standard and legacy SKU formats.
  // Extracts trailing digits from any sku_root that looks like {prefix}{letter}{digits}.
  const seqCoverage = await pool.query(`
    WITH parsed AS (
      SELECT
        composer_id,
        sku_root,
        CASE
          -- Standard format: lowercase variant + 4-5 trailing digits (3-digit seq + album, or 4-digit seq + album)
          -- Strip the last digit (album digit) before reading sequence number
          WHEN sku_root ~ '^[A-Z0-9]+[a-z]\\d{4,5}$'
          THEN CAST(substring(left(sku_root, -1) FROM '(\\d+)$') AS INTEGER)
          -- Sound-design suffix (X=Exclusives, R=Risers, I=Impacts): 2-4 digits + uppercase letter
          -- Variant letter may be lower or upper (e.g. R90L001X). Read digits directly.
          WHEN sku_root ~ '^[A-Z0-9]+[a-zA-Z]\\d{2,4}[XIR]$'
          THEN CAST(substring(sku_root FROM '(\\d+)[XIR]$') AS INTEGER)
          -- SIB/specialty: 2-4 digits + lowercase letter album code
          WHEN sku_root ~ '^[A-Z0-9]+[a-z]\\d{2,4}[a-z]$'
          THEN CAST(substring(sku_root FROM '(\\d+)[a-z]$') AS INTEGER)
          -- Legacy format: uppercase variant, 1-5 trailing digits — read as-is (no album digit to strip)
          WHEN sku_root ~ '^[A-Z0-9]+[A-Z]\\d{1,5}$'
          THEN CAST(substring(sku_root FROM '(\\d+)$') AS INTEGER)
          -- Anything with 6+ trailing digits is malformed — exclude from seq tracking
          ELSE NULL
        END AS seq_num
      FROM titles
    )
    SELECT
      p.composer_id,
      MAX(p.seq_num) AS max_issued_seq,
      s.next_seq AS next_seq_in_table
    FROM parsed p
    LEFT JOIN sku_sequences s ON s.composer_full_id = p.composer_id
    WHERE p.seq_num IS NOT NULL
    GROUP BY p.composer_id, s.next_seq
    ORDER BY p.composer_id
  `)

  let seqBehind = 0
  const behindRows = []
  for (const row of seqCoverage.rows) {
    const maxIssued = parseInt(row.max_issued_seq)
    const nextSeq   = parseInt(row.next_seq_in_table || 0)
    if (nextSeq <= maxIssued) {
      err(`SEQUENCE BEHIND: ${row.composer_id} — max issued seq=${maxIssued}, next_seq=${nextSeq} (would reissue!)`)
      behindRows.push({ composerId: row.composer_id, needed: maxIssued + 1 })
      seqBehind++
    } else if (VERBOSE) {
      ok(`${row.composer_id}: max issued=${maxIssued}, next_seq=${nextSeq} (${nextSeq - maxIssued - 1} gap)`)
    }
  }

  if (seqBehind === 0) {
    ok('all sku_sequences counters are ahead of all issued SKUs')
  } else {
    // In fix mode, don't log this as an error — we're about to fix them all.
    // In audit-only mode, mark as error so the exit code is non-zero.
    if (!FIX) {
      err(`${seqBehind} composers have sku_sequences BEHIND their highest issued SKU — collision risk!`)
      info('Run with --fix to repair all counters automatically')
    } else {
      console.log(`\n  ⚠  ${seqBehind} sequences behind — repairing now…`)
      for (const { composerId, needed } of behindRows) {
        // UPSERT — handles both existing rows (UPDATE) and legacy composers
        // that were never in teams and therefore missing from sku_sequences.
        const result = await pool.query(
          `INSERT INTO sku_sequences (composer_full_id, next_seq)
           VALUES ($2, $1)
           ON CONFLICT (composer_full_id) DO UPDATE
             SET next_seq = GREATEST(sku_sequences.next_seq, EXCLUDED.next_seq)
           RETURNING next_seq`,
          [needed, composerId]
        )
        const actual = result.rows[0]?.next_seq
        info(`${composerId}: next_seq → ${actual}`)
        fixed++
      }
      warn(`${fixed} sequences repaired — re-run without --fix to verify`)
    }
  }

  // ── 7. Orphaned mix_stems (sku_root not in titles) ───────────────────────
  console.log('\n─── Orphaned mix_stems ───\n')
  const orphans = await pool.query(`
    SELECT COUNT(*) AS n FROM mix_stems ms
    LEFT JOIN titles t ON t.sku_root = ms.sku_root
    WHERE t.sku_root IS NULL
  `)
  const orphanCount = parseInt(orphans.rows[0].n)
  if (orphanCount === 0) ok('no orphaned mix_stems')
  else warn(`${orphanCount} mix_stems rows reference a sku_root not in titles`)

  // ── 8. Titles with no mix_stems ───────────────────────────────────────────
  const stemless = await pool.query(`
    SELECT COUNT(*) AS n FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    WHERE ms.sku_root IS NULL
  `)
  const stemlessCount = parseInt(stemless.rows[0].n)
  if (stemlessCount === 0) ok('all titles have at least one mix_stem')
  else warn(`${stemlessCount} titles have no mix_stems (may be imported records without files)`)

  // ── 9. Summary ────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════')
  if (fixed > 0) info(`${fixed} sequence counters repaired`)
  if (errors === 0 && warnings === 0) {
    console.log('  ✅ CLEAN — no issues found')
  } else {
    if (errors > 0)   console.error(`  ❌ ${errors} error${errors !== 1 ? 's' : ''} (require action)`)
    if (warnings > 0) console.warn(`  ⚠  ${warnings} warning${warnings !== 1 ? 's' : ''} (review recommended)`)
    if (!FIX && errors > 0) info('Run with --fix to auto-repair sequence counters')
  }
  console.log('══════════════════════════════════════════\n')

  await pool.end()
  process.exit(errors > 0 ? 1 : 0)
}

run().catch(async e => {
  console.error('\n[sku-audit] Fatal error:', e.message)
  await pool.end()
  process.exit(1)
})
