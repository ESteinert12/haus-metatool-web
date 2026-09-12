# Palette and button states (measured 2026-09-12)

There was no colour documentation anywhere, and none of these are in `:root` --
`:root` only defines a generic light theme (--bg, --blue, --green, --red). Every
HAUS colour is inline, hundreds of times. This file is the record until they are
promoted to CSS variables (worth doing gradually, per screen -- NOT a bulk
find-and-replace).

## In use, by count in index.html
| Hex | Uses | Role |
|---|---|---|
| `#6F927E` | 88 | sage, DARK — hover state, labels |
| `#8FAF9B` | 50 | sage, MID — primary buttons at rest |
| `#1A2226` | 47 | near-black text |
| `#C17A5E` | 34 | terracotta — AVID / warning actions |
| `#C0C9CD` | 34 | cool grey — footers, secondary buttons, CLICK state |
| `#6F9276` | 28 | **deliberate one-off, NOT a typo for #6F927E.** Erik chose
|   |   | it so text would pop against that particular background. Leave it. |
| `#3A4F56` | 21 | slate text |
| `#E7F0EA` | 18 | pale sage fill |
| `#0B2A5B` | 11 | navy — sidebar and title bar |
| `#E6B271` | 9  | amber — Skip |
| `#9D7E3C` | -- | gold — Import & Ship |

Near-duplicates that exist and may want consolidating one day: greens
`#4A7C59` / `#22C55E`, reds `#C0392B` / `#EF4444`.

## Button convention
    rest     #8FAF9B   (sage, white text)
    hover    #6F927E   (dark sage)
    held     #C0C9CD   (cool grey)
    release  #6F927E   (back to hover -- the pointer is still over the button)

The hover half was already the convention in 13 places. The cool-grey CLICK
state is new as of 2026-09-12 (Erik: "Hover to Dark sage and cool grey on
click") and is so far applied only to the Choose Lot buttons. Roll it out to
other sage buttons as screens are touched.
