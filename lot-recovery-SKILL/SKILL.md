# Lot Recovery Skill

Scan a lot and compare against shipping folder to find missing, orphaned, or mismatched songs.

## Usage

```bash
lot-recovery <lot_id>
```

## Examples

```bash
# Check Texas Wives 6 (lot_id 7610)
lot-recovery 7610

# Check any lot by ID
lot-recovery 7583
```

## Report Includes

- Songs in shipping folder but not in database
- Songs in database but not in shipping folder
- Orphaned songs (lot_id=null that might belong to this lot)
- Summary: how many songs match vs. are broken

## Output

Shows a detailed report without making changes. Use the report to decide if you need to:
1. Insert missing songs
2. Reassign orphaned songs
3. Fix mismatched records

## Requirements

- Node.js with pg module
- DATABASE_URL environment variable set (or uses default Neon connection)
- Access to Dropbox shipping folder
