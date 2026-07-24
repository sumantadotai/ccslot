import { test, expect } from 'vitest'
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
  findClaude,
  installHelp,
  openSpec,
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
  const { home, rc } = fakeHome()
  const r = add('work', { home, rc })

  expect(r.linked.map((l) => l.name)).toEqual(['projects', 'skills', 'settings.json'])
  expect(r.missing).toEqual(['plans']) // not present in base
  expect(r.aliasAdded).toBe(true)
  expect(fs.readFileSync(rc, 'utf8')).toMatch(
    /alias ccwork='CLAUDE_CONFIG_DIR="\$HOME\/\.claude-work" claude'/
  )
  expect(() => add('work', { home, rc })).toThrow(UserError) // refuses to clobber
})

test('shared paths really are shared storage, both directions', () => {
  const { home, base, rc } = fakeHome()
  const { dir } = add('work', { home, rc })

  // slot -> base
  fs.writeFileSync(path.join(dir, 'projects', 'a.jsonl'), 'from-slot')
  expect(fs.readFileSync(path.join(base, 'projects', 'a.jsonl'), 'utf8')).toBe('from-slot')

  // base -> slot
  fs.writeFileSync(path.join(base, 'skills', 'b.md'), 'from-base')
  expect(fs.readFileSync(path.join(dir, 'skills', 'b.md'), 'utf8')).toBe('from-base')

  // shared file reads through
  expect(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).toBe('{"model":"opus"}')
})

test('list and view report shared vs own', () => {
  const { home, rc } = fakeHome()
  const r = add('work', { home, rc })
  fs.writeFileSync(path.join(r.dir, '.credentials.json'), '{}') // per-slot, a real file

  expect(list(home).map((s) => s.name)).toEqual(['work'])

  const v = view('work', home)
  expect(v.shared.map((s) => s.name)).toEqual(['projects', 'settings.json', 'skills'])
  expect(v.own).toEqual(['.credentials.json'])
  expect(v.shared.every((s) => !s.broken)).toBe(true)
})

test("view classifies a hard-linked file as shared, not as the slot's own", () => {
  // This is the Windows fallback for files when symlinks are not permitted; hard links
  // exist on all three platforms, so the classification is testable everywhere.
  const { home, base, rc } = fakeHome()
  const { dir } = add('work', { home, rc, share: ['projects'] })
  fs.linkSync(path.join(base, 'settings.json'), path.join(dir, 'settings.json'))

  const v = view('work', home)
  expect(v.shared.find((s) => s.name === 'settings.json').kind).toBe('hardlink')
  expect(v.own).not.toContain('settings.json')
})

test('view flags broken links', () => {
  const { home, base, rc } = fakeHome()
  add('work', { home, rc })
  fs.rmSync(path.join(base, 'skills'), { recursive: true })
  expect(view('work', home).shared.find((s) => s.name === 'skills').broken).toBe(true)
})

test('delete removes the slot and alias but NEVER the shared targets', () => {
  const { home, base, rc } = fakeHome()
  const { dir } = add('work', { home, rc })
  fs.writeFileSync(path.join(base, 'projects', 'keep.jsonl'), 'precious')

  const out = remove('work', { home, rc })

  expect(out.aliasRemoved).toBe(true)
  expect(fs.existsSync(dir)).toBe(false)
  expect(fs.readFileSync(path.join(base, 'projects', 'keep.jsonl'), 'utf8')).toBe('precious')
  expect(fs.readFileSync(path.join(base, 'settings.json'), 'utf8')).toBe('{"model":"opus"}')
  expect(fs.existsSync(path.join(base, 'skills'))).toBe(true)
  expect(fs.readFileSync(rc, 'utf8')).not.toMatch(/ccwork/)
})

test('delete does not follow a hard-linked file either', () => {
  const { home, base, rc } = fakeHome()
  const { dir } = add('work', { home, rc, share: ['projects'] })
  fs.linkSync(path.join(base, 'settings.json'), path.join(dir, 'settings.json'))

  remove('work', { home, rc })
  expect(fs.readFileSync(path.join(base, 'settings.json'), 'utf8')).toBe('{"model":"opus"}')
})

test('refuses to share credentials or per-session state', () => {
  expect(() => assertShare(['.credentials.json'])).toThrow(UserError)
  expect(() => assertShare(['sessions'])).toThrow(UserError)
  expect(() => assertShare(['../evil'])).toThrow(UserError)
  expect(() => assertShare(['..\\evil'])).toThrow(UserError)
  expect(assertShare(['projects'])).toEqual(['projects'])
})

test('rejects bad slot names and names that shadow commands', () => {
  const { home, rc } = fakeHome()
  expect(() => add('../evil', { home, rc })).toThrow(UserError)
  expect(() => add('..\\evil', { home, rc })).toThrow(UserError)
  expect(() => add('', { home, rc })).toThrow(UserError)
  for (const n of ['list', 'add', 'use', 'run', 'delete']) {
    expect(() => add(n, { home, rc }), `expected ${n} to be reserved`).toThrow(UserError)
  }
})

test('exists() gates bare-name launch and never matches a command', () => {
  const { home, rc } = fakeHome()
  add('work', { home, rc })
  expect(exists('work', home)).toBe(true)
  expect(exists('personal', home)).toBe(false)
  expect(exists('list', home)).toBe(false)
  expect(exists('../etc', home)).toBe(false)
})

test('launchSpec sets CLAUDE_CONFIG_DIR, inherits the env, and passes args through', () => {
  const { home, rc } = fakeHome()
  const { dir } = add('work', { home, rc })
  const spec = launchSpec('work', ['--resume', '-p', 'hi'], { home, platform: 'linux' })

  expect(spec.command).toBe('claude')
  expect(spec.args).toEqual(['--resume', '-p', 'hi'])
  expect(spec.shell).toBe(false)
  expect(spec.env.CLAUDE_CONFIG_DIR).toBe(dir)
  // Windows spells it Path, so compare through a case-insensitive lookup.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH')
  expect(spec.env[pathKey]).toBe(process.env[pathKey])
  expect(() => launchSpec('nope', [], { home })).toThrow(UserError)
})

test('launchSpec uses a shell on Windows and quotes args for cmd', () => {
  // claude ships as claude.cmd on Windows; CreateProcess cannot exec a .cmd directly.
  const { home, rc } = fakeHome()
  add('work', { home, rc })
  const spec = launchSpec('work', ['-p', 'hello world', 'plain', 'a&b'], {
    home,
    platform: 'win32',
  })

  expect(spec.shell).toBe(true)
  expect(spec.args).toEqual(['-p', '"hello world"', 'plain', '"a&b"'])
})

test('shellRc and detectShell per platform', () => {
  const home = '/home/u'
  expect(detectShell('/bin/zsh', 'linux')).toBe('zsh')
  expect(detectShell('/usr/bin/fish', 'darwin')).toBe('fish')
  expect(detectShell('/bin/bash', 'linux')).toBe('bash')
  expect(shellRc(home, '/bin/bash', 'linux')).toBe(path.join(home, '.bashrc'))
  expect(shellRc(home, '/usr/bin/fish', 'darwin')).toBe(
    path.join(home, '.config', 'fish', 'config.fish')
  )
  // No dotfile on Windows we can safely append to — add() must skip the alias there.
  expect(shellRc(home, '', 'win32')).toBe(null)
})

test('add on Windows skips the alias instead of writing a bogus rc file', () => {
  const { home } = fakeHome()
  const r = add('work', { home, rc: null })
  expect(r.rc).toBe(null)
  expect(r.aliasAdded).toBe(false)
  expect(r.linked).toHaveLength(3)
})

test('delete tolerates a slot that never had an alias', () => {
  const { home } = fakeHome()
  add('work', { home, rc: null })
  const out = remove('work', { home, rc: null })
  expect(out.aliasRemoved).toBe(false)
  expect(fs.existsSync(out.dir)).toBe(false)
})

test('exportLine and evalHint cover every supported shell', () => {
  const { home, rc } = fakeHome()
  const { dir } = add('work', { home, rc })

  expect(exportLine('work', { home, shell: 'zsh' })).toBe(`export CLAUDE_CONFIG_DIR='${dir}'`)
  expect(exportLine('work', { home, shell: 'bash' })).toBe(`export CLAUDE_CONFIG_DIR='${dir}'`)
  expect(exportLine('work', { home, shell: 'fish' })).toBe(`set -gx CLAUDE_CONFIG_DIR '${dir}'`)
  expect(exportLine('work', { home, shell: 'powershell' })).toBe(
    `$env:CLAUDE_CONFIG_DIR = '${dir}'`
  )
  expect(exportLine('work', { home, shell: 'cmd' })).toBe(`set CLAUDE_CONFIG_DIR=${dir}`)

  expect(evalHint('work', 'zsh')).toBe('eval "$(ccslot use work)"')
  expect(evalHint('work', 'fish')).toMatch(/\| source$/)
  expect(evalHint('work', 'powershell')).toMatch(/Invoke-Expression$/)
  expect(() => exportLine('nope', { home })).toThrow(UserError)
})

test.skipIf(IS_WINDOWS)('exportLine survives a home directory containing a single quote', () => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ccslot-o'brien-"))
  fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true })
  const { dir } = add('work', { home, rc: path.join(home, '.zshrc') })

  const line = exportLine('work', { home, shell: 'zsh' })
  expect(line).toMatch(/'\\''/) // escaped, not left to break the eval
  const echoed = execFileSync('/bin/sh', ['-c', `${line}; printf %s "$CLAUDE_CONFIG_DIR"`], {
    encoding: 'utf8',
  })
  expect(echoed).toBe(dir)
})

test('PowerShell quoting doubles an embedded single quote', () => {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ccslot-o'brien-"))
  fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true })
  add('work', { home, rc: null })

  const line = exportLine('work', { home, shell: 'powershell' })
  expect(line).toMatch(/''/)
  expect(line.startsWith("$env:CLAUDE_CONFIG_DIR = '")).toBe(true)
  expect(line.endsWith("'")).toBe(true)
})

test('findClaude walks PATH, and honours PATHEXT on Windows', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ccslot-path-'))
  const other = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ccslot-path2-'))
  const PATH = [other, dir].join(path.delimiter)

  expect(findClaude({ env: { PATH }, platform: 'linux' })).toBe(null)

  fs.writeFileSync(path.join(dir, 'claude'), '')
  expect(findClaude({ env: { PATH }, platform: 'linux' })).toBe(path.join(dir, 'claude'))

  // Windows: the bare name is not executable, only claude.cmd is — and the env var is Path.
  expect(findClaude({ env: { Path: PATH, PATHEXT: '.EXE;.CMD' }, platform: 'win32' })).toBe(null)
  fs.writeFileSync(path.join(dir, 'claude.CMD'), '')
  expect(findClaude({ env: { Path: PATH, PATHEXT: '.EXE;.CMD' }, platform: 'win32' })).toBe(
    path.join(dir, 'claude.CMD')
  )
})

test('findClaude survives an unset or unreadable PATH', () => {
  expect(findClaude({ env: {}, platform: 'linux' })).toBe(null)
  expect(findClaude({ env: { PATH: '/nope/nowhere' }, platform: 'linux' })).toBe(null)
})

test('installHelp gives the right installer per platform and always the docs URL', () => {
  for (const p of ['darwin', 'linux', 'win32']) {
    const h = installHelp(p)
    expect(h.docs).toBe('https://code.claude.com/docs/en/overview')
    expect(h.steps.some(([, cmd]) => cmd.includes('@anthropic-ai/claude-code'))).toBe(true)
    expect(h.steps[0][1]).toMatch(p === 'win32' ? /install\.ps1/ : /install\.sh/)
  }
})

test('openSpec picks the platform opener', () => {
  expect(openSpec('u', 'darwin').command).toBe('open')
  expect(openSpec('u', 'linux').command).toBe('xdg-open')
  const win = openSpec('u', 'win32')
  expect(win.command).toBe('start')
  expect(win.shell).toBe(true) // start is a cmd.exe builtin
})
