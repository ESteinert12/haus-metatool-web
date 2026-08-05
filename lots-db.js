/**
 * lots-db.js — LOTS Database Schema & Queries
 *
 * Schema migrations, prepared queries, and data access helpers for LOTS feature.
 * Run initializeLotsSchema() after database connection is established.
 */

// ════════════════════════════════════════════════════════════════════════════════
// SCHEMA INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════════

async function initializeLotsSchema() {
  console.log('[lots-db] initializing LOTS schema...')

  // Extend lots table with additional columns
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS sent_date DATE`).catch(() => {})
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS avid_bin TEXT`).catch(() => {})
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => {})
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS target_show TEXT`).catch(() => {})
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS brief TEXT`).catch(() => {})
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS fm_pk TEXT`).catch(() => {})
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS track_limit INT`).catch(() => {})
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {})
  await pgQ(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS project_id INT`).catch(e => console.error('[lots-db] lots.project_id:', e.message))

  // Back-fill created_at from lot_name date prefix (YYMMDD) for legacy lots
  await pgQ(`
    UPDATE lots SET created_at = TO_TIMESTAMP(SUBSTRING(lot_name FROM '^(\\d{6})'), 'YYMMDD')
    WHERE created_at IS NULL AND lot_name ~ '^\\d{6}'
  `).catch(() => {})

  console.log('[lots-db] schema initialized ✓')
}

// ════════════════════════════════════════════════════════════════════════════════
// LOTS TABLE QUERIES
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get all lots, optionally filtered by type and/or client
 * @param {string} lotType - Optional lot type filter (e.g., 'TV', 'FILM')
 * @param {string} clientName - Optional client filter
 * @returns {Promise<Array>} Lot records
 */
async function lotsGetAll(lotType, clientName) {
  let sql = `SELECT * FROM lots WHERE 1=1`
  const params = []

  if (lotType) {
    sql += ` AND lot_type=$${params.length + 1}`
    params.push(lotType)
  }

  if (clientName) {
    sql += ` AND lot_client=$${params.length + 1}`
    params.push(clientName)
  }

  sql += ` ORDER BY created_at DESC`
  return await pgQ(sql, params)
}

/**
 * Get single lot by ID
 */
async function lotsGetById(lotId) {
  const rows = await pgQ(`SELECT * FROM lots WHERE lot_id=$1`, [lotId])
  return rows.length > 0 ? rows[0] : null
}

/**
 * Get single lot by name
 */
async function lotsGetByName(lotName) {
  const rows = await pgQ(`SELECT * FROM lots WHERE lot_name=$1`, [lotName])
  return rows.length > 0 ? rows[0] : null
}

/**
 * Create new lot
 */
async function lotsCreate(lotName, lotType, lotClient, clientName, trackLimit) {
  const result = await pgQ(
    `INSERT INTO lots (lot_name, lot_type, lot_client, client, status, created_at, track_limit)
     VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
     RETURNING lot_id, lot_name, lot_type, lot_client, client, status, created_at`,
    [lotName, lotType, lotClient, clientName, trackLimit || null]
  )
  return result[0]
}

/**
 * Update lot metadata
 */
async function lotsUpdate(lotId, updates) {
  const fields = []
  const values = []
  let paramIdx = 1

  for (const [key, value] of Object.entries(updates)) {
    if (['lot_client', 'client', 'sent_date', 'avid_bin', 'notes', 'track_limit', 'status', 'project_id'].includes(key)) {
      fields.push(`${key}=$${paramIdx++}`)
      values.push(value)
    }
  }

  if (fields.length === 0) return

  values.push(lotId)
  const sql = `UPDATE lots SET ${fields.join(', ')} WHERE lot_id=$${paramIdx} RETURNING *`

  const result = await pgQ(sql, values)
  return result[0]
}

/**
 * Delete lot
 */
async function lotsDelete(lotId) {
  await pgQ(`DELETE FROM tracks WHERE lot_id=$1`, [lotId])
  await pgQ(`DELETE FROM lots WHERE lot_id=$1`, [lotId])
}

/**
 * Archive lot (soft delete)
 */
async function lotsArchive(lotId) {
  return await pgQ(`UPDATE lots SET status='archived' WHERE lot_id=$1 RETURNING *`, [lotId])
}

/**
 * Restore archived lot
 */
async function lotsRestore(lotId) {
  return await pgQ(`UPDATE lots SET status='active' WHERE lot_id=$1 RETURNING *`, [lotId])
}

// ════════════════════════════════════════════════════════════════════════════════
// LOT-TRACK RELATIONSHIP QUERIES
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get all tracks in a lot
 */
async function lotsGetTracks(lotId, limit = 50) {
  return await pgQ(
    `SELECT sku, title, primary_genre, secondary_genre, mood, mmw_tags, notes
     FROM tracks WHERE lot_id=$1 ORDER BY sku LIMIT $2`,
    [lotId, limit]
  )
}

/**
 * Count tracks in a lot
 */
async function lotsCountTracks(lotId) {
  const result = await pgQ(`SELECT COUNT(*) as cnt FROM tracks WHERE lot_id=$1`, [lotId])
  return result[0]?.cnt || 0
}

/**
 * Add track to lot
 */
async function lotsAddTrack(lotId, skuRoot) {
  return await pgQ(
    `UPDATE tracks SET lot_id=$1, lot_added_date=NOW() WHERE sku=$2 RETURNING *`,
    [lotId, skuRoot]
  )
}

/**
 * Remove track from lot
 */
async function lotsRemoveTrack(lotId, skuRoot) {
  return await pgQ(
    `UPDATE tracks SET lot_id=NULL WHERE sku=$1 AND lot_id=$2 RETURNING *`,
    [skuRoot, lotId]
  )
}

/**
 * Move track between lots
 */
async function lotsMoveTrack(skuRoot, toLotId) {
  return await pgQ(
    `UPDATE tracks SET lot_id=$1, lot_moved_date=NOW() WHERE sku=$2 RETURNING *`,
    [toLotId, skuRoot]
  )
}

/**
 * Get track history (which lots a track has been in)
 */
async function lotsGetTrackHistory(skuRoot) {
  return await pgQ(
    `SELECT lot_id, lot_name, lot_added_date, lot_moved_date
     FROM tracks_lot_history WHERE sku=$1 ORDER BY lot_added_date DESC`,
    [skuRoot]
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// BATCH OPERATIONS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get lot counts (tracks per lot)
 */
async function lotsBatchCounts(lotIds) {
  if (lotIds.length === 0) return {}

  const placeholders = lotIds.map((_, i) => `$${i + 1}`).join(',')
  const result = await pgQ(
    `SELECT lot_id, COUNT(*) as track_count FROM tracks WHERE lot_id IN (${placeholders}) GROUP BY lot_id`,
    lotIds
  )

  const counts = {}
  result.forEach(row => { counts[row.lot_id] = row.track_count })
  return counts
}

/**
 * Get multiple lots with track counts
 */
async function lotsBatchWithCounts(lotIds) {
  if (lotIds.length === 0) return []

  const placeholders = lotIds.map((_, i) => `$${i + 1}`).join(',')
  const lots = await pgQ(
    `SELECT * FROM lots WHERE lot_id IN (${placeholders})`,
    lotIds
  )

  const counts = await lotsBatchCounts(lotIds)

  lots.forEach(lot => {
    lot.track_count = counts[lot.lot_id] || 0
  })

  return lots
}

/**
 * Get all lots for client with counts
 */
async function lotsForClientWithCounts(clientName) {
  const lots = await pgQ(
    `SELECT * FROM lots WHERE lot_client=$1 ORDER BY created_at DESC`,
    [clientName]
  )

  for (const lot of lots) {
    lot.track_count = await lotsCountTracks(lot.lot_id)
  }

  return lots
}

// ════════════════════════════════════════════════════════════════════════════════
// STATISTICS & REPORTING
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get lots created this week
 */
async function lotsCreatedThisWeek() {
  return await pgQ(`
    SELECT COUNT(*) as cnt FROM lots
    WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
  `)
}

/**
 * Get lots by status
 */
async function lotsByStatus() {
  return await pgQ(`
    SELECT status, COUNT(*) as cnt FROM lots GROUP BY status
  `)
}

/**
 * Get lots with track count >= limit
 */
async function lotsAtCapacity(trackLimit) {
  return await pgQ(`
    SELECT l.*, COUNT(t.sku) as track_count
    FROM lots l
    LEFT JOIN tracks t ON l.lot_id = t.lot_id
    WHERE l.track_limit IS NOT NULL
      AND COUNT(t.sku) >= l.track_limit
    GROUP BY l.lot_id
  `)
}

/**
 * Get empty lots (no tracks)
 */
async function lotsEmpty() {
  return await pgQ(`
    SELECT l.* FROM lots l
    LEFT JOIN tracks t ON l.lot_id = t.lot_id
    WHERE t.sku IS NULL
    GROUP BY l.lot_id
  `)
}

/**
 * Get lots awaiting review (oldest tracks not yet reviewed)
 */
async function lotsAwaitingReview() {
  return await pgQ(`
    SELECT DISTINCT l.*, COUNT(t.sku) as unreviewed_tracks
    FROM lots l
    JOIN tracks t ON l.lot_id = t.lot_id
    WHERE t.primary_genre IS NULL OR t.mood IS NULL
    GROUP BY l.lot_id
    ORDER BY MIN(t.created_at) ASC
  `)
}

// ════════════════════════════════════════════════════════════════════════════════
// SEARCH & FILTER
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Search lots by name (case-insensitive)
 */
async function lotsSearch(query) {
  return await pgQ(
    `SELECT * FROM lots WHERE lot_name ILIKE $1 OR lot_client ILIKE $1 ORDER BY lot_name ASC`,
    [`%${query}%`]
  )
}

/**
 * Get active lots only
 */
async function lotsActive() {
  return await pgQ(`SELECT * FROM lots WHERE status='active' ORDER BY lot_name DESC`)
}

/**
 * Get archived lots only
 */
async function lotsArchived() {
  return await pgQ(`SELECT * FROM lots WHERE status='archived' ORDER BY lot_name DESC`)
}

/**
 * Get lots with no project assignment
 */
async function lotsUnassignedToProject() {
  return await pgQ(`SELECT * FROM lots WHERE project_id IS NULL ORDER BY lot_name`)
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORT / BACKFILL
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get lot data for CSV export
 */
async function lotsExportCSV() {
  return await pgQ(`
    SELECT
      lot_id,
      lot_name,
      lot_type,
      lot_client,
      client,
      sent_date,
      avid_bin,
      notes,
      track_limit,
      created_at
    FROM lots
    WHERE status='active'
    ORDER BY lot_name
  `)
}

/**
 * Backfill lot metadata from CSV data
 */
async function lotsBackfillFromCSV(csvData) {
  const results = { updated: 0, skipped: 0, errors: [] }

  for (const row of csvData) {
    try {
      const lot = await lotsGetByName(row.lot_name)
      if (!lot) {
        results.skipped++
        continue
      }

      const updates = {}
      if (row.lot_client) updates.lot_client = row.lot_client
      if (row.client) updates.client = row.client
      if (row.avid_bin) updates.avid_bin = row.avid_bin
      if (row.notes) updates.notes = row.notes

      if (Object.keys(updates).length > 0) {
        await lotsUpdate(lot.lot_id, updates)
        results.updated++
      } else {
        results.skipped++
      }
    } catch (e) {
      results.errors.push({ row, error: e.message })
    }
  }

  return results
}

// ════════════════════════════════════════════════════════════════════════════════
// CLEANUP & MAINTENANCE
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Delete all archived lots
 */
async function lotsCleanupArchived() {
  const archived = await pgQ(`SELECT lot_id FROM lots WHERE status='archived'`)
  for (const lot of archived) {
    await lotsDelete(lot.lot_id)
  }
  return archived.length
}

/**
 * Delete orphaned lots (no tracks, not in any project)
 */
async function lotsCleanupOrphaned() {
  const orphaned = await pgQ(`
    SELECT l.lot_id FROM lots l
    LEFT JOIN tracks t ON l.lot_id = t.lot_id
    LEFT JOIN projects p ON l.project_id = p.project_id
    WHERE t.sku IS NULL AND p.project_id IS NULL
  `)

  for (const lot of orphaned) {
    await lotsDelete(lot.lot_id)
  }

  return orphaned.length
}

/**
 * Purge all LOTS data (caution!)
 */
async function lotsPurgeAll() {
  const lotsCount = await pgQ(`SELECT COUNT(*) as cnt FROM lots`)
  const tracksCount = await pgQ(`SELECT COUNT(*) as cnt FROM tracks WHERE lot_id IS NOT NULL`)

  await pgQ(`DELETE FROM tracks WHERE lot_id IS NOT NULL`)
  await pgQ(`DELETE FROM lots`)

  return { lots: lotsCount[0].cnt, tracks: tracksCount[0].cnt }
}
