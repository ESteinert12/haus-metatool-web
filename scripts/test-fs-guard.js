#!/usr/bin/env node
// Unit tests for the /api/fs/* path guard in api.js.
//
//   node scripts/test-fs-guard.js
//
// api.js starts a listening server on require, so this lifts just the guard
// block out of the source and evaluates it in isolation. The slice markers are
// asserted below — if either one moves, this fails loudly rather than silently
// testing nothing.
//
// Fixture lives under ~/haus-fs-guard-test because the home directory is
// deliberately NOT a root: a fixture under /tmp would sit inside a real root
// and the "escapes the roots" cases would pass for the wrong reason.

const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm')

const REPO = path.join(__dirname, '..')
const src = fs.readFileSync(path.join(REPO, 'api.js'), 'utf8')
const START = 'const FS_ROOT_KEYS', END = 'const _DENIED'
const a = src.indexOf(START), b = src.indexOf(END)
if (a < 0 || b < 0 || b <= a) {
  console.error(`Could not slice the guard out of api.js (looked for "${START}" .. "${END}"). Update this test.`)
  process.exit(2)
}

const FX = path.join(os.homedir(), 'haus-fs-guard-test')
const WORK = path.join(FX, 'work'), APPDIR = path.join(FX, 'appdir')
fs.rmSync(FX, { recursive: true, force: true })
for (const d of [path.join(WORK, 'sub'), path.join(WORK, '.hidden'), path.join(FX, 'outside'), APPDIR]) fs.mkdirSync(d, { recursive: true })
process.env.HAUS_FS_EXTRA_ROOTS = WORK

// __dirname inside the guard is the app directory — point it at the fixture so
// the app-dir read case is verifiable without reading out of the real repo.
const ctx = { fs, path, os, console, __dirname: APPDIR, process, module: { exports: {} } }
vm.createContext(ctx)
vm.runInContext(src.slice(a, b) + '\nmodule.exports = { _safeRead, _safeWrite, _readRoots, _writeRoots }', ctx, { filename: 'api.js:fs-guard' })
const g = ctx.module.exports

const home = os.homedir(), dl = path.join(home, 'Downloads')
fs.mkdirSync(dl, { recursive: true })
const SECRET = path.join(home, 'haus-fs-guard-secret.csv')
fs.writeFileSync(path.join(WORK, 'a.wav'), 'x')
fs.writeFileSync(path.join(WORK, 'sub', 'b.csv'), 'x')
fs.writeFileSync(path.join(WORK, '.env'), 'SECRET=1')
fs.writeFileSync(path.join(WORK, '.hidden', 'c.csv'), 'x')
fs.writeFileSync(path.join(FX, 'outside', 'd.csv'), 'x')
fs.writeFileSync(path.join(APPDIR, 'migration_099.sql'), '-- x')
fs.writeFileSync(SECRET, 'x')
const DL_FIXTURE = path.join(dl, 'haus-fs-guard-export.csv')
fs.writeFileSync(DL_FIXTURE, 'x')
try { fs.symlinkSync(path.join(FX, 'outside', 'd.csv'), path.join(WORK, 'link')) } catch {}

let pass = 0, fail = 0
const t = (name, got, want) => {
  const ok = (!!got) === want
  ok ? pass++ : fail++
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(got)}, wanted ${want ? 'allow' : 'deny'})`}`)
}

console.log('\nread  roots:', g._readRoots().join('  |  '))
console.log('write roots:', g._writeRoots().join('  |  '), '\n')

console.log('READ — allowed')
t('working folder file',              g._safeRead(path.join(WORK, 'a.wav')), true)
t('working folder, nested',           g._safeRead(path.join(WORK, 'sub', 'b.csv')), true)
t('~/Downloads (the pasted CSV)',     g._safeRead(DL_FIXTURE), true)
t('app dir migration .sql',           g._safeRead(path.join(APPDIR, 'migration_099.sql')), true)
t('os.tmpdir()',                      g._safeRead(path.join(os.tmpdir(), 't.txt')), true)
t('literal /tmp (macOS != tmpdir)',   g._safeRead('/tmp/t.txt'), true)

console.log('\nREAD — denied outside the roots')
t('home file outside Downloads',      g._safeRead(SECRET), false)
t('~/.ssh/id_rsa',                    g._safeRead(path.join(home, '.ssh', 'id_rsa')), false)
t('~/.haus-workspace-cfg.json',       g._safeRead(path.join(home, '.haus-workspace-cfg.json')), false)
t('~/Documents/anything',             g._safeRead(path.join(home, 'Documents', 'x.csv')), false)
t('dotfile inside a root',            g._safeRead(path.join(WORK, '.env')), false)
t('dotfolder inside a root',          g._safeRead(path.join(WORK, '.hidden', 'c.csv')), false)
t('traversal out of a root',          g._safeRead(path.join(WORK, '..', 'outside', 'd.csv')), false)
t('symlink escaping a root',          g._safeRead(path.join(WORK, 'link')), false)
t('/etc/passwd',                      g._safeRead('/etc/passwd'), false)
t('empty string',                     g._safeRead(''), false)
t('non-string',                       g._safeRead(null), false)

console.log('\nWRITE')
t('working folder',                   g._safeWrite(path.join(WORK, 'out.csv')), true)
t('~/Downloads (lot export)',         g._safeWrite(path.join(dl, 'lot_IP_DATA.csv')), true)
t('os.tmpdir()',                      g._safeWrite(path.join(os.tmpdir(), 'x.txt')), true)
t('/tmp/gen_ip.py (Excel export)',    g._safeWrite('/tmp/gen_ip.py'), true)
t('/tmp/ip_data.json (Excel export)', g._safeWrite('/tmp/ip_data.json'), true)
t('app dir is NOT writable',          g._safeWrite(path.join(APPDIR, 'x.js')), false)
t('home outside Downloads',           g._safeWrite(path.join(home, 'x.csv')), false)
t('dotfile inside a root',            g._safeWrite(path.join(WORK, '.env')), false)

fs.rmSync(FX, { recursive: true, force: true })
fs.rmSync(SECRET, { force: true })
fs.rmSync(DL_FIXTURE, { force: true })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
