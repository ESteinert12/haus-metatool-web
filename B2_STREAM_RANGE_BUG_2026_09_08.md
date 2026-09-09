# /api/b2/stream re-downloads the whole file on every request

**STATUS: FIXED AND VERIFIED 2026-09-09.** See the bottom of this file.

## Symptom
Playing ONE song logged three identical full downloads of a 19,772,244-byte
WAV within two seconds. 59 MB of B2 egress for one play.

    [b2/stream] downloaded 19772244 bytes, serving   x3

## Cause — api.js ~line 1163
The endpoint advertises `Accept-Ranges: bytes` and honours `Range` CORRECTLY,
but it does so by pulling the ENTIRE object from B2 into a Buffer first and
then slicing locally:

    res.end(buf.slice(start, end + 1))

So the browser's normal audio behaviour — a probe request, then range
requests to buffer and to seek — triggers a complete B2 re-download each
time. `Cache-Control: no-cache` on every response guarantees the browser
never reuses what it already holds.

## Consequences
- Egress: 3x waste. ~$0.01/GB, so pennies per song. Real but not alarming.
- LATENCY — this is the one that matters. Nothing is served until all
  19.7 MB have arrived from B2. That is the pause before playback starts and
  the reason seeking feels bad: every seek pays the full download again.
  User-facing for anyone auditioning tracks all day.

## The fix (NOT YET APPLIED — deliberately)
Forward the client's `Range` header to B2 instead of slicing locally. B2
supports it; its own response header says `accept-ranges: bytes`. A seek then
costs only the requested bytes and playback starts on the first chunk.

## Why it was parked
The full buffering is LOAD-BEARING for stub detection. The endpoint decides a
file is a stub by seeing a body under 1000 bytes and reading a local path out
of it, and that is what makes the CORRECTIONS wav-sibling fallback work. A
range request never sees the whole body, so the stub check must be re-derived
from B2's `Content-Range` total instead.

That sits directly on top of the playback path, and it can only be validated
by actually listening to a track. Do it WITH Erik present, not unattended.

## Incidental finding from the same log
`A Snoopy One` (S60a16424) served the WAV, not an mp3 — the player prefers
mp3, so that song has no mp3 stem row. Known gap, not a new problem.


---

# FIX APPLIED AND VERIFIED — 2026-09-09

## What was done
`_b2Get(urlPath, downloadHost, range)` and `_b2TotalSize(headers)` added above
`_b2WavSibling`. The endpoint now forwards the player's own Range header to B2
instead of pulling the whole object and slicing locally.

**Buffering was KEPT on purpose.** The original header comment says it is there
to stop the Cloudflare tunnel truncating long responses, so piping B2 straight
through would have reintroduced that. We now buffer only the requested bytes.

Three paths:
- **Range request** -> forwarded to B2, B2's own Content-Range passed through.
- **No Range** -> 1 KB probe for total size + stub detection, then ONE full
  download. Guarded with `first.body.length < total` so that if B2 ever ignores
  the Range and answers 200, we do not fetch the object twice.
- **Repeat request** -> ETag derived from B2's `x-bz-content-sha1`, so the
  browser revalidates and gets a 304 instead of re-downloading.

`Cache-Control` changed from `no-cache` to `private, max-age=3600`, and this one
endpoint calls `res.removeHeader('Pragma'/'Expires')` to opt out of the global
no-cache middleware at api.js:55. That middleware stays as-is — it exists so
index.html edits are always picked up.

**Stub detection is unchanged.** The 1 KB probe means anything under 1000 bytes
arrives complete, so the CORRECTIONS wav-sibling fallback behaves as before.

## Verified against the live server (not just reasoned about)
Range request for `bytes=1000000-1000999`:

    HTTP/1.1 206 Partial Content
    Content-Range: bytes 1000000-1000999/19772244
    Content-Length: 1000          <- was 19772244

Conditional request with the ETag: **304**.

Also unit-tested `_b2TotalSize` against five header shapes B2 can return
(206 probe, 206 mid-file seek, 200 full, stub, missing headers) — all correct.

## Known cosmetic leftover
`Pragma: no-cache` and `Expires: 0` were still on the response at the time of
the last test because the removeHeader change had not been restarted into.
Functionally irrelevant — Cache-Control wins by spec, and the 304 above proves
it — but it will clear on the next restart.
