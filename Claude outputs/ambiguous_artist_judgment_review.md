# ambiguous_artist judgment review — 83 multi-candidate names

For each name, my pick based on reading the actual MusicBrainz disambiguation
text (not just votes/album count, which are often sparse or misleading —
see Meduza, Rob Thomas, Steam, Tyla below for cases where raw numbers point
the wrong way and the description settles it). Nothing has been merged into
`rmo_clean_names.json` yet — this is the review step before that.

**HIGH CONFIDENCE (58) — recommend auto-resolving these:**

| KSL name | Chosen candidate | Why |
|---|---|---|
| Adam Cohen | Canadian singer-songwriter | Leonard Cohen's son, 4 albums vs 1 |
| Agent Orange | California surf-punk | the known band |
| Alice Cooper | the singer (solo) | 97 votes vs 57, the dominant entity |
| Ashra | electronic spin-off of Ash Ra Tempel | Manuel Göttsching's known project |
| ATC | German Euro-dance group | "Around the World" |
| Black Coffee | house DJ Nkosinathi Maphumulo | globally famous SA DJ |
| Broken Bells | Danger Mouse & James Mercer | clear name match |
| Buddha Bar | "Artist from Amazon" entry | the other candidate is literally tagged "DO NOT USE" |
| Cannons | electro pop, Los Angeles | "Fire for You" |
| Cybotron | Detroit techno (Juan Atkins & Richard Davis) | foundational electro act, clearly dominant over the Australian band |
| David Rose | songwriter/pianist/orchestra leader | classic "The Stripper" composer |
| Dirty Honey | LA blues/hard rock band | the other "candidate" is an EP, not a separate artist |
| DJ Krush | Japan producer/DJ | legendary, 18 albums |
| Dogs | French rock band | 10 albums vs 3 |
| Double Trouble | assoc. w/ Stevie Ray Vaughan | famous blues backing band |
| Excision | dubstep producer | well known |
| Feed Me | Jon Gooch, UK electronic | the other is an unlabeled "?" with 1 album |
| Fergie | American singer | Black Eyed Peas, clearly dominant |
| Gary Stewart | US country musician | outlaw country singer, 12 albums vs 3/1 |
| Gigi | Indonesian pop rock band | 20 albums vs next-highest 2 — overwhelming margin |
| H.E.R | US R&B artist | matches the real artist directly |
| John Paul Young | Australian pop singer | "Love Is in the Air" |
| John Williams | American score composer and conductor | matches this project's earlier-resolved composer; 100 albums, 8 votes vs 70/6 |
| Lakeside | US funk band | "Fantastic Voyage," 10 albums vs 6 |
| MAGIC! | Canadian reggae-pop band | "Rude," has votes (2) despite fewer albums than the Japanese act |
| Marc Antoine | French jazz guitarist | well-known smooth jazz player |
| Mark Knight | UK house DJ, founded Toolroom Records | the dance-music Mark Knight |
| Maxwell | US soul/R&B singer-songwriter | higher votes (7 vs 4), matches the famous Maxwell |
| Meduza | Italian production trio | **fewer albums (1) than the metal bands, but this is the actual Billboard-charting EDM act ("Piece of Your Heart") — volume is misleading here** |
| Mike Jones | US rapper | "Back Then," edges the jazz pianist on votes (1 vs 0) with equal album count |
| MK | US house producer Marc Kinchen | the Western-pop-context "MK" (co-produced "Piece of Your Heart" w/ Meduza above), despite fewer albums than the Japanese DJ |
| Mr. President | German Euro-Dance trio | "Coco Jamboo," 6 albums, clearly the famous one |
| No Mercy | US pop/dance trio | "Where Do You Go" |
| Olive | UK dance/breakbeat/trip-hop group | "You're Not Alone," has votes (4) |
| OMI | Jamaican reggae/pop (Omar Pasley) | disambiguation text literally names "Cheerleader" |
| Pepper | dub rock band, Hawaii | 10 albums vs 1 |
| Pete Rodriguez | boogaloo artist | "I Like It Like That" — matches a specific known hit |
| Phoenix | French indie band | 31 votes, overwhelming |
| Proleter | French swing-hop producer | 6 albums vs 2 |
| Rob Thomas | Matchbox Twenty's Rob Thomas | **0 votes shown vs the didgeridoo artist's 2 — but votes are sparse/noisy across this whole dataset, and 6 albums (solo + band) matches his real discography far better** |
| Rockwell | R&B, "Somebody's Watching Me" | Motown one-hit, has votes |
| Sergio Vargas | Dominican merengue singer | 25 albums, has a vote |
| Sigma | UK drum & bass duo | "Nobody to Love," has a vote |
| Stax | jazz | marginal but has 1 vote vs 0 |
| Steam | 60s US pop-rock | **only 1 album listed vs the contra-dance band's 3, but this is "Na Na Hey Hey Kiss Him Goodbye" — real-world fame overrides the raw count** |
| Temples | English psychedelic rock | the known modern psych band |
| The Carter Family | the original (1927–1943) | the historically-referenced lineup |
| The Highwaymen | country supergroup | Cash/Nelson/Jennings/Kristofferson, has votes (4 vs 0) |
| The Phantoms | Nashville rock band | 4 albums vs next-highest 2 |
| The Sundays | the unlabeled "?" entry | **3 albums matches the real band's exact studio discography (3 albums) despite the missing disambiguation label** |
| The Urge | US alternative rock band | 90s St. Louis ska-funk band, 7 albums vs 1 |
| The Wanted | English-Irish pop boy band | "Glad You Came," ties on votes but has one more album |
| Thomas Schumacher | the unlabeled "?" entry | 4 albums vs 1, matches the known German techno producer |
| Twenty 4 Seven | euro house | "Slave to the Music," strong margin + votes |
| Tyla | South African singer | **fewer albums (2) than the English rock musician's 20, but she has more votes (5 vs 2) and is the globally famous current pop star — likely who the catalog actually means** |
| Walk The Moon | indie rock (2008+) | "Shut Up and Dance," has votes |
| Zebra | US hard rock band | "Who's Behind the Door," highest votes of the set |

**LOW/MODERATE CONFIDENCE — included above but worth a second look:**
DNA (chose the UK dance "Tom's Diner" one over the historically-important
US No Wave group — genuinely a coin flip between "bigger hit" and "more
historically cited"), plus Meduza, MK, Rob Thomas, Steam, Tyla, and The
Sundays — all called out inline above with bold caveats, since for each of
these the raw votes/album-count actually point the *other* way and I'm
overriding that with a real-world fame judgment.

**GENUINE TIES — staying flagged for your review (25):**

A few of these likely mean the real artist isn't even among the candidates
MusicBrainz returned (the original fuzzy name search missed them) — I've
noted those specifically, since re-resolving them needs a fresh, differently
-worded MB search, not just a pick among what's here.

| KSL name | Candidates | Note |
|---|---|---|
| Artful Dodger | Late 70s rock band vs UK garage act | both plausible, no real signal either way |
| Bauer | 5 candidates, all 0 votes | no signal |
| Bizet | classical rock / new wave | **likely means the real 19th-c. composer Georges Bizet, who isn't an "album" artist on MB at all — same issue as Bach/Brahms in the no-studio-album bucket** |
| Blackwater | 6 candidates, all 0 votes | no signal |
| Christmas | German punk / Canadian rock / 80s Boston indie | no signal |
| Cosmic | 3 obscure candidates | no signal |
| David Foster | 3 obscure candidates (guitarist/bassist/multi-instrumentalist) | **none of these is the famous Canadian producer David Foster — he's missing from this candidate set entirely** |
| David Hudson | unlabeled "?" (14 albums) vs funk/soul (1) | possibly the Aboriginal Australian didgeridoo player of that name — needs confirming, didn't want to guess |
| FISHER | US pop/rock duo vs trance/EDM Kathy Fisher | **neither is the famous Australian house DJ FISHER ("Losing It") — he's missing from this candidate set** |
| Forrest Gump | Chilean / Colombian punk | no signal, and genuinely odd this is even a KSL entry |
| Karizma | fusion group / house producer / Serbian glam | genre mismatch, no clear winner |
| LFO | Mark Bell & Gez Varley (IDM) vs Lyte Funkie Ones (pop-rap) | **both are legitimately famous acts under the same initialism — real ambiguity, not a data gap** |
| Limes | garage blues / hip-hop producer | no signal |
| Machine Gun Kelly | Italian hard rock / US band | **neither is the rapper/musician MGK — he's missing from this candidate set** |
| Meadowlark | UK folk / US flute-guitar duo | no signal |
| Mike Sherm | unlabeled "?" vs Long Beach rapper | real Mike Sherm is a Vallejo, CA rapper — neither label matches exactly |
| Muzak | 2 Italian acts | no signal |
| REM | Malaysian singer / Hungarian black metal | **neither is R.E.M. — likely a punctuation mismatch ("R.E.M." elsewhere in the catalog)** |
| Revolution #9 | 3 obscure bands | the KSL name evokes the Beatles track; none of these candidates is a strong match |
| Sebastian | Danish rock singer (24 albums, local fame) vs French electro SebastiAn (2 albums, international fame) | genuine fame-vs-volume conflict, didn't want to guess |
| The Outlaws | 3 obscure candidates | **neither is the Southern rock band ("Green Grass and High Tides") — missing from this candidate set** |
| The Sandals | Polish streetpunk vs 60s US surf rock | the surf rock one ("Theme from Endless Summer") is historically notable despite fewer albums — close enough to fame-vs-volume conflict that I didn't want to guess |
| The Volcanos | 2 obscure surf/rock bands | no signal |
| Yaz | Yaz Caramanli vs French rapper | **neither is Yazoo (Alison Moyet & Vince Clarke) — missing from this candidate set** |
| Zimmer | French DJ vs "aka Henry OK" | no signal |

## Recommendation
Merge the 58 high-confidence picks (treat the 5 moderate ones as included,
flagged for awareness) into the resolved set and generate their RMO/album
additions the same way the composer pass did. Leave all 25 ties for you —
several of them need a fresh MusicBrainz search with a better query, not
just a pick among what's here, since the real artist may not be in the
candidate list at all.
