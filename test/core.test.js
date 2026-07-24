import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  add,
  list,
  view,
  remove,
  exists,
  launchSpec,
  exportLine,
  evalHint,
  detectShell,
  shellRc,
  assertShare,
  UserError,
} from '../src/core.js'

const IS_WINDOWS = process.platform === 'win32'

function fakeHome() {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ccslot-'))
  const base = path.join(home, '.claude')
  fs.mkdirSync(path.join(base, 'projects'), { recursive: true })
  fs.mkdirSync(path.join(base, 'skills'), { recursive: true })
  fs.writeFileSync(path.join(base, 'settings.json'), '{"model":"opus"}')
  const rc = path.join(home, '.zshrc')
  fs.writeFileSync(rc, '# existing\n')
  return { home, base, rc }
}

test('add links shared paths, skips missing, writes alias once', () => {
  const { home, base, rc } = fakeHome()
  const r = add('work', { home, rc })

  assert.deepEqual(
    r.linked.map((l) => l.name),
    ['projects', 'skills', 'settings.json']
  )
  assert.deepEqual(r.missing, ['plans']) // not present in base
  assert.equal(r.aliasAdded, true)
  assert.match(
    fs.readFileSync(rc, 'utf8'),
    /alias ccwork='CLAUDE_CONFIG_DIR="\$HOME\/\.claude-work" claude'/
  )
  assert.throws(() => add('work', { home, rc }), UserError) // refuses to clobber
})

test('shared paths really are shared storage, both directions', () => {
  const { home, base, rc } = fakeHome()
  const { dir } = add('work', { home, rc })

  // slot -> base
  fs.writeFileSync(path.join(dir, 'projects', 'a.jsonl'), 'from-slot')
  assert.equal(fs.readFileSync(path.join(base, 'projects', 'a.jsonl'), 'utf8'), 'from-slot')

  // base -> slot
  fs.writeFileSync(path.join(base, 'skills', 'b.md'), 'from-base')
  assert.equal(fs.readFileSync(path.join(dir, 'skills', 'b.md'), 'utf8'), 'from-base')

  // shared file reads through
  assert.equal(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'), '{"model":"opus"}')
})

test('list and view report shared vs own', () => {
  const { home, rc } = fakeHome()
  const r = add('work', { home, rc })
  fs.writeFileSync(path.join(r.dir, '.credentials.json'), '{}') // per-slot, a real file

  assert.deepEqual(
    list(home).map((s) => s.name),
    ['work']
  )
  const v = view('work', home)
  assert.deepEqual(
    v.shared.map((s) => s.name),
    ['projects', 'settings.json', 'skills']
  )
  assert.deepEqual(v.own, ['.credentials.json'])
  assert.equal(
    v.shared.every((s) => !s.broken),
    true
  )
})

test('view classifies a hard-linked file as shared, not as the slot\'s own', () => {
  // This is the Windows fallback for files when symlinks are not permitted; hard links
  // exist on all three platforms, so the classification is testable everywhere.
  const { home, base, rc } = fakeHome()
  const { dir } = add('work', { home, rc, share: ['projects'] })
  fs.linkSync(path.join(base, 'settings.json'), path.join(dir, 'settings.json'))

  const v = view('work', home)
  const entry = v.shared.find((s) => s.name === 'settings.json')
  assert.equal(entry.kind, 'hardlink')
  assert.equal(v.own.includes('settings.json'), false)
})

test('view flags broken links', { skip: IS_WINDOWS && 'junction removal is racy on CI runners' }, () => {
  const { home, base, rc } = fakeHome()
  add('work', { home, rc })
  fs.rmSync(path.join(base, 'skills'), { recursive: true })
  assert.equal(view('work', home).shared.find((s) => s.name === 'skills').broken, true)
})

test('delete removes the slot and alias but NEVER the shared targets', () => {
  const { home, base, rc } = fakeHome()
  const { dir } = add('work', { home, rc })
  fs.writeFileSync(path.join(base, 'projects', 'keep.jsonl'), 'precious')

  const out = remove('work', { home, rc })

  assert.equal(out.aliasRemoved, true)
  assert.equal(fs.existsSync(dir), false)
  assert.equal(fs.readFileSync(path.join(base, 'projects', 'keep.jsonl'), 'utf8'), 'precious')
  assert.equal(fs.readFileSync(path.join(base, 'settings.json'), 'utf8'), '{"model":"opus"}')
  assert.equal(fs.existsSync(path.join(base, 'skills')), true)
  assert.doesNotMatch(fs.readFileSync(rc, 'utf8'), /ccwork/)
})

test('delete does not follow a hard-linked file either', () => {
  const { home, base, rc } = fakeHome()
  const { dir } = add('work', { home, rc, share: ['projects'] })
  fs.linkSync(path.join(base, 'settings.json'), path.join(dir, 'settings.json'))

  remove('work', { home, rc })
  assert.equal(fs.readFileSync(path.join(base, 'settings.json'), 'utf8'), '{"model":"opus"}')
})

test('refuses to share credentials or per-session state', () => {
  assert.throws(() => assertShare(['.credentials.json']), UserError)
  assert.throws(() => assertShare(['sessions']), UserError)
  assert.throws(() => assertShare(['../evil']), UserError)
  assert.throws(() => assertShare(['..\\evil']), UserError)
  assert.deepEqual(assertShare(['projects']), ['projects'])
})

test('rejects bad slot names and names that shadow commands', () => {
  const { home, rc } = fakeHome()
  assert.throws(() => add('../evil', { home, rc }), UserError)
  assert.throws(() => add('..\\evil', { home, rc }), UserError)
  assert.throws(() => add('', { home, rc }), UserError)
  for (const n of ['list', 'add', 'use', 'run', 'delete']) {
    assert.throws(() => add(n, { home, rc }), UserError, `expected ${n} to be reserved`)
  }
})

test('exists() gates bare-name launch and never matches a command', () => {
  const { home, rc } = fakeHome()
  add('work', { home, rc })
  assert.equal(exists('work', home), true)
  assert.equal(exists('personal', home), false)
  assert.equal(exists('list', home), false)
  assert.equal(exists('../etc', home), false)
})

test('launchSpec sets CLAUDE_CONFIG_DIR, inherits the env, and passes args through', () => {
  const { home, rc } = fakeHome()
  const { dir } = add('work', { home, rc })
  const spec = launchSpec('work', ['--resume', '-p', 'hi'], { home, platform: 'linux' })

  assert.equal(spec.command, 'claude')
  assert.deepEqual(spec.args, ['--resume', '-p', 'hi'])
  assert.equal(spec.shell, false)
  assert.equal(spec.env.CLAUDE_CONFIG_DIR, dir)
  // Windows spells it Path, so compare through a case-insensitive lookup.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH')
  assert.equal(spec.env[pathKey], process.env[pathKey])
  assert.throws(() => launchSpec('nope', [], { home }), UserError)
})

test('launchSpec uses a shell on Windows and quotes args for cmd', () => {
  // claude ships as claude.cmd on Windows; CreateProcess cannot exec a .cmd directly.
  const { home, rc } = fakeHome()
  add('work', { home, rc })
  const spec = launchSpec('work', ['-p', 'hello world', 'plain', 'a&b'], {
    home,
    platform: 'win32',
  })

  assert.equal(spec.shell, true)
  assert.deepEqual(spec.args, ['-p', '"hello world"', 'plain', '"a&b"'])
})

test('shellRc and detectShell per platform', () => {
  const home = '/home/u'
  assert.equal(detectShell('/bin/zsh', 'linux'), 'zsh')
  assert.equal(detectShell('/usr/bin/fish', 'darwin'), 'fish')
  assert.equal(detectShell('/bin/bash', 'linux'), 'bash')
  assert.equal(shellRc(home, '/bin/bash', 'linux'), path.join(home, '.bashrc'))
  assert.equal(shellRc(home, '/usr/bin/fish', 'darwin'), path.join(home, '.config', 'fish', 'config.fish'))
  // No dotfile on Windows we can safely append to — add() must skip the alias there.
  assert.equal(shellRc(home, '', 'win32'), null)
})

test('add on Windows skips the alias instead of writing a bogus rc file', () => {
  const { home } = fakeHome()
  const r = add('work', { home, rc: null })
  assert.equal(r.rc, null)
  assert.equal(r.aliasAdded, false)
  assert.equal(r.linked.length, 3)
})

test('delete tolerates a slot that never had an alias', () => {
  const { home } = fakeHome()
  add('work', { home, rc: null })
  const out = remove('work', { home, rc: null })
  assert.equal(out.aliasRemoved, false)
  assert.equal(fs.existsSync(out.dir), false)
})

test('exportLine and evalHint cover every supported shell', () => {
  const { home, rc } = fakeHome()
  const { dir } = add('work', { home, rc })

  assert.equal(exportLine('work', { home, shell: 'zsh' }), `export CLAUDE_CONFIG_DIR='${dir}'`)
  assert.equal(exportLine('work', { home, shell: 'bash' }), `export CLAUDE_CONFIG_DIR='${dir}'`)
  assert.equal(exportLine('work', { home, shell: 'fish' }), `set -gx CLAUDE_CONFIG_DIR '${dir}'`)
  assert.equal(exportLine('work', { home, shell: 'powershell' }), `$env:CLAUDE_CONFIG_DIR = '${dir}'`)
  assert.equal(exportLine('work', { home, shell: 'cmd' }), `set CLAUDE_CONFIG_DIR=${dir}`)

  assert.match(evalHint('work', 'zsh'), /^eval "\$\(ccslot use work\)"$/)
  assert.match(evalHint('work', 'fish'), /\| source$/)
  assert.match(evalHint('work', 'powershell'), /Invoke-Expression$/)
  assert.throws(() => exportLine('nope', { home }), UserError)
})

test('exportLine survives a home directory containing a single quote', { skip: IS_WINDOWS && 'no POSIX sh' }, () => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ccslot-o'brien-"))
  fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true })
  const { dir } = add('work', { home, rc: path.join(home, '.zshrc') })

  const line = exportLine('work', { home, shell: 'zsh' })
  assert.match(line, /'\\''/) // escaped, not left to break the eval
  const echoed = execFileSync('/bin/sh', ['-c', `${line}; printf %s "$CLAUDE_CONFIG_DIR"`], {
    encoding: 'utf8',
  })
  assert.equal(echoed, dir)
})

test('PowerShell quoting doubles an embedded single quote', () => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ccslot-o'brien-"))
  fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true })
  add('work', { home, rc: null })

  const line = exportLine('work', { home, shell: 'powershell' })
  assert.match(line, /''/)
  assert.equal(line.startsWith("$env:CLAUDE_CONFIG_DIR = '"), true)
  assert.equal(line.endsWith("'"), true)
})
