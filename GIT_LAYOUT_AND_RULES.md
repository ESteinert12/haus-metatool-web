# Git layout — THREE working copies of ONE repo (found 2026-09-09)

All three point at `github.com/ESteinert12/haus-metatool-web`:

    ~/Documents/Claude/Projects/ATMOSPHERE   <-- THE LIVE APP. npm start runs this.
    ~/Documents/GitHub/haus-metatool-web
    ~/…/haus-workspace

They FORKED at commit 69518c8:
  - ATMOSPHERE added ebd542e, 4ca0e5d, 5d1062e and (2026-09-09) 113d35b
  - origin added cc7a6e1 and the merge 6abbca1

So the same work has been committed twice from different copies with
different hashes. As of 2026-09-09 ATMOSPHERE is 4 ahead / 2 behind.

## Where the code actually is
Everything from 2026-09-09 exists ONLY in ATMOSPHERE:
/api/b2/create-stems, the shell/exec guard, the b2/stream range fix,
the applescript kill switch. api.js there is 241,600 bytes vs 180,576 in the
other two.

Someone was editing index.html in haus-workspace and haus-metatool-web at
19:34-19:35 on 2026-09-09 (CSS work). **Those edits will never reach the
running app** — the server runs from ATMOSPHERE.

## RULE: Claude must NEVER run git in this repo
The Cowork bridge mounts the folder without delete permission. Every git
command Claude runs CREATES a .lock file and then CANNOT REMOVE IT:

    warning: unable to unlink '.../.git/index.lock': Operation not permitted

Each leftover lock breaks the NEXT git command a human runs. This cost about
an hour on 2026-09-09. Reads (`git log`, `git status`, `git show`) are safe —
they take no lock. ANYTHING that writes is not: commit, add, merge, checkout,
pull, fetch, rebase, stash.

If it happens anyway, clear ALL locks, not just index.lock — the one that
actually blocked the commit on 2026-09-09 was **HEAD.lock**, and chasing
index.lock alone wasted most of that hour:

    find ~/Documents/Claude/Projects/ATMOSPHERE/.git -maxdepth 2 -name '*.lock' -delete

## Before any merge
`_BACKUP_2026_09_09/` holds hash-verified copies of api.js, index.html,
haus-api.js, middleware_auth.js. Do NOT `git checkout`, `git pull` or copy
another copy's api.js over ATMOSPHERE's without checking that backup first.

## Still to decide
Reconcile ATMOSPHERE with origin (4 ahead / 2 behind), and pick ONE working
copy going forward. ATMOSPHERE is the obvious choice: it is what runs.
