#!/bin/bash
# ============================================================
# setup_haus_db.sh
# Run this once on your Mac to set up the HAUS Music database
# Usage: bash setup_haus_db.sh
# ============================================================

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)/HAUS Workspace.app/Contents/Resources/haus-workspace"
DB_NAME="haus_music"
DB_USER="postgres"
DB_PASS="postgres123"
MIGRATION_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== HAUS Music Database Setup ==="
echo ""

# ── 1. Install pg npm package ────────────────────────────────
echo "→ Installing pg driver..."
cd "$APP_DIR"
npm install pg --save 2>&1 | tail -3
echo "  pg installed."
echo ""

# ── 2. Check PostgreSQL is running ───────────────────────────
echo "→ Checking PostgreSQL..."
if ! pg_isready -U "$DB_USER" -q 2>/dev/null; then
  echo "  PostgreSQL not running. Starting..."
  brew services start postgresql@18 2>/dev/null || \
  brew services start postgresql    2>/dev/null || \
  pg_ctl start 2>/dev/null || \
  { echo "  ERROR: Could not start PostgreSQL. Start it manually and re-run."; exit 1; }
  sleep 2
fi
echo "  PostgreSQL is running."
echo ""

# ── 3. Create database ───────────────────────────────────────
echo "→ Creating database '$DB_NAME'..."
psql -U "$DB_USER" -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  psql -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"
echo "  Database ready."
echo ""

# ── 4. Run migrations in order ───────────────────────────────
echo "→ Running migrations..."
for f in $(ls "$MIGRATION_DIR"/migration_*.sql 2>/dev/null | sort); do
  echo "  Running $(basename $f)..."
  psql -U "$DB_USER" -d "$DB_NAME" -f "$f" -q
done
echo "  Migrations complete."
echo ""

# ── 5. Seed RMO table ────────────────────────────────────────
if [ -f "$MIGRATION_DIR/seed_rmo.sql" ]; then
  echo "→ Seeding RMO data..."
  psql -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_DIR/seed_rmo.sql" -q
  echo "  RMO seeded."
fi

# ── 6. Seed lots ─────────────────────────────────────────────
if [ -f "$MIGRATION_DIR/seed_lots_from_csv.sql" ]; then
  echo "→ Seeding lots..."
  psql -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_DIR/seed_lots_from_csv.sql" -q
  echo "  Lots seeded."
fi

if [ -f "$MIGRATION_DIR/seed_nimbus_genre_lots.sql" ]; then
  psql -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_DIR/seed_nimbus_genre_lots.sql" -q
fi

echo ""
echo "=== Done! ==="
echo ""
echo "Open HAUS Workspace and go to Settings → Database."
echo "Connection string: postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
echo ""
