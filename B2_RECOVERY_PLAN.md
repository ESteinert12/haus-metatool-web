# B2 Stub Recovery Plan

**Full Audit Date:** 2026-08-10  
**Total Stubs:** 30,703 (18.7% of archive)

## Scope by Collection

| Collection | Stubs | % |
|-----------|-------|-----|
| STRATUS | 12,922 | 42% |
| CUMULUS | 7,789 | 25% |
| CIRRUS | 6,486 | 21% |
| NIMBUS | 3,506 | 11% |

## Recovery Phases

### Phase 1: SHIPPING (800 stubs, 2.6%) ✓ Ready Now
- **101 SKUs** in SHIPPING have matching stubs in B2
- **800 stub records** can be recovered immediately
- File: `B2_FIXABLE_FROM_SHIPPING.csv`

**Top SHIPPING composers to fix:**
- R48: Michael Toland
- R15: (need to check)
- R25: (need to check)
- C32: Hugo McLaughlin
- C52: (need to check)

### Phase 2: Old Dropbox (29,903 stubs, 97.4%)
Need to pull from old Dropbox account: ~15,000 unique SKUs

**Top 20 composers needing recovery:**
1. S33a: Peter Lobo - 3,473 stubs
2. R13a: - 1,679 stubs
3. R46a: Martin Briley - 1,332 stubs
4. R04b: - 1,004 stubs
5. R82a: Steve Mayone - 874 stubs
6. S60a: - 680 stubs
7. R73a: - 673 stubs
8. R48a: Michael Toland - 599 stubs
9. R85a: - 547 stubs
10. R53a: - 535 stubs

## Recovery Procedure

### For SHIPPING stubs:
1. Use `b2_upload_stubs.js` script (already exists)
2. Or manually upload 800 files from SHIPPING to B2
3. Replace stub files in B2 with real audio from SHIPPING

### For Old Dropbox stubs:
1. Access old Dropbox account
2. Download files for each affected composer
3. Upload to B2 (batch)
4. Update database b2_keys if paths changed

## Next Steps
1. Start Phase 1 (SHIPPING) - quick win, ~800 files
2. Inventory old Dropbox account for Phase 2 files
3. Create upload strategy for 29K+ remaining stubs
