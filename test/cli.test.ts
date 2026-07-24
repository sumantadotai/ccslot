// End-to-end tests: run the compiled bin (dist/cli.js — `pnpm test` builds first)
// against a fake HOME and a stub `claude` on PATH.
// These are the ones that catch platform problems the unit tests cannot — .cmd
// resolution on Windows, exit-code forwarding, argument pass-through.
import { test, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const IS_WINDOWS = process.platform === 'win32'
const BIN = fileURLToPath(new URL('../dist/cli.js', import.meta.url))

/** A stub `claude` that reports the config dir and args it saw, then exits 7. */
function stubClaude(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  if (IS_WINDOWS) {
    fs.writeFileSync(
      path.join(dir, 'claude.cmd'),
      '@echo off\r\necho [claude] dir=%CLAUDE_CONFIG_DIR% args=%*\r\nexit /b 7\r\n'
    )
  } else {
    const p = path.join(dir, 'claude')
    fs.writeFileSync(p, '#!/bin/sh\necho "[claude] dir=$CLAUDE_CONFIG_DIR args=$*"\nexit 7\n')
    fs.chmodSync(p, 0o755)
  }
  return dir
}

function sandbox() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ccslot-cli-'))
  const home = path.join(root, 'home')
  const base = path.join(home, '.claude')
  fs.mkdirSync(path.join(base, 'projects'), { recursive: true })
  fs.mkdirSync(path.join(base, 'skills'), { recursive: true })
  fs.mkdirSync(path.join(base, 'plans'), { recursive: true })
  fs.writeFileSync(path.join(base, 'settings.json'), '{}')
  fs.writeFileSync(path.join(home, '.zshrc'), '')
  const binDir = stubClaude(path.join(root, 'bin'))

  // Windows spells it Path; spreading process.env keeps that casing, so reuse the real
  // key rather than adding a second one that differs only in case.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'

  const spawnWith = (dirs: string, args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home, // os.homedir() reads this on Windows
        SHELL: IS_WINDOWS ? '' : '/bin/zsh',
        [pathKey]: dirs,
      },
    })

  const run = (...args: string[]) => spawnWith(binDir + path.delimiter + process.env[pathKey], args)
  // An empty PATH, not the real one — otherwise a dev with Claude Code installed
  // would never see the not-installed path this exercises.
  const empty = path.join(root, 'empty')
  fs.mkdirSync(empty, { recursive: true })
  const runWithoutClaude = (...args: string[]) => spawnWith(empty, args)

  return { root, home, base, run, runWithoutClaude }
}

test('add creates a slot and reports what it shared', () => {
  const { run, base } = sandbox()
  const r = run('add', 'work')

  expect(r.status, r.stderr).toBe(0)
  expect(r.stdout).toMatch(/shared {2}projects/)
  expect(r.stdout).toMatch(/shared {2}settings\.json/)
  expect(r.stdout).toMatch(/next: ccslot work/)
  expect(fs.existsSync(path.join(base, 'projects'))).toBe(true)
})

test('bare slot name launches claude with CLAUDE_CONFIG_DIR and forwards the exit code', () => {
  const { run, home } = sandbox()
  run('add', 'work')
  const r = run('work')

  expect(r.status, `expected the stub's exit code to propagate\n${r.stderr}`).toBe(7)
  expect(r.stdout).toMatch(/\[claude\] dir=/)
  expect(r.stdout).toContain(path.join(home, '.claude-work'))
})

test('args after the slot name reach claude untouched', () => {
  const { run } = sandbox()
  run('add', 'personal')
  const r = run('personal', '--resume', '-p', 'hello')

  expect(r.status).toBe(7)
  expect(r.stdout).toMatch(/args=.*--resume/)
  expect(r.stdout).toMatch(/-p hello/)
})

test('run <name> -- <args> works the same', () => {
  const { run } = sandbox()
  run('add', 'work')
  const r = run('run', 'work', '--', '--resume')

  expect(r.status).toBe(7)
  expect(r.stdout).toMatch(/args=.*--resume/)
})

test('two slots launch with different config dirs', () => {
  const { run, home } = sandbox()
  run('add', 'work')
  run('add', 'personal')

  expect(run('work').stdout).toContain(path.join(home, '.claude-work'))
  expect(run('personal').stdout).toContain(path.join(home, '.claude-personal'))
})

test('list shows every slot, view shows its links', () => {
  const { run } = sandbox()
  run('add', 'work')
  run('add', 'personal')

  const l = run('list')
  expect(l.status, l.stderr).toBe(0)
  expect(l.stdout).toMatch(/personal/)
  expect(l.stdout).toMatch(/work/)

  const v = run('view', 'work')
  expect(v.status, v.stderr).toBe(0)
  expect(v.stdout).toMatch(/shared:/)
  expect(v.stdout).toMatch(/projects ->/)
})

test('use prints a single eval-able line when piped', () => {
  const { run, home } = sandbox()
  run('add', 'work')
  const r = run('use', 'work')

  expect(r.status, r.stderr).toBe(0)
  const lines = r.stdout.trim().split('\n')
  expect(lines, `expected one line, got:\n${r.stdout}`).toHaveLength(1)
  expect(lines[0]).toMatch(IS_WINDOWS ? /CLAUDE_CONFIG_DIR/ : /^export CLAUDE_CONFIG_DIR=/)
  expect(lines[0]).toContain(path.join(home, '.claude-work'))
})

test('use --shell emits the right syntax for each shell', () => {
  const { run } = sandbox()
  run('add', 'work')

  expect(run('use', 'work', '--shell', 'fish').stdout).toMatch(/^set -gx CLAUDE_CONFIG_DIR/)
  expect(run('use', 'work', '--shell', 'powershell').stdout).toMatch(/^\$env:CLAUDE_CONFIG_DIR = /)
  expect(run('use', 'work', '--shell', 'cmd').stdout).toMatch(/^set CLAUDE_CONFIG_DIR=/)
})

test('delete removes the slot but leaves the base config intact', () => {
  const { run, home, base } = sandbox()
  run('add', 'work')
  fs.writeFileSync(path.join(base, 'projects', 'keep.jsonl'), 'precious')

  const r = run('delete', 'work', '-y')

  expect(r.status, r.stderr).toBe(0)
  expect(fs.existsSync(path.join(home, '.claude-work'))).toBe(false)
  expect(fs.readFileSync(path.join(base, 'projects', 'keep.jsonl'), 'utf8')).toBe('precious')
  expect(fs.existsSync(path.join(base, 'settings.json'))).toBe(true)
  expect(run('list').stdout).toMatch(/no slots yet/)
})

test('errors exit non-zero with a usable message', () => {
  const { run } = sandbox()

  const unknown = run('nosuch')
  expect(unknown.status).toBe(1)
  expect(unknown.stderr).toMatch(/unknown command or slot/)

  const reserved = run('add', 'list')
  expect(reserved.status).toBe(1)
  expect(reserved.stderr).toMatch(/is a ccslot command/)

  const ghost = run('run', 'ghost')
  expect(ghost.status).toBe(1)
  expect(ghost.stderr).toMatch(/no such slot/)

  const noArgs = run()
  expect(noArgs.status).toBe(1)
  expect(noArgs.stdout).toMatch(/ccslot add <name>/)
})

test('launching without Claude Code installed explains how to install it', () => {
  const { run, runWithoutClaude } = sandbox()
  run('add', 'work')

  const r = runWithoutClaude('work')
  expect(r.status).toBe(127)
  expect(r.stderr).toMatch(/Claude Code is not installed/)
  expect(r.stderr).toMatch(/code\.claude\.com\/docs/)
  expect(r.stderr).toMatch(IS_WINDOWS ? /install\.ps1/ : /install\.sh/)
  expect(r.stderr).toMatch(/npm install -g @anthropic-ai\/claude-code/)
})

test('add still succeeds without Claude Code, but warns', () => {
  const { runWithoutClaude, home } = sandbox()
  const r = runWithoutClaude('add', 'work')

  expect(r.status, r.stderr).toBe(0)
  expect(fs.existsSync(path.join(home, '.claude-work'))).toBe(true)
  expect(r.stderr).toMatch(/Claude Code is not installed/)
})

test('install reports the claude it found, or how to get one', () => {
  const { run, runWithoutClaude } = sandbox()

  const ok = run('install')
  expect(ok.status, ok.stderr).toBe(0)
  expect(ok.stdout).toMatch(/Claude Code is installed/)

  // Non-TTY stdin, so the "open the docs?" prompt declines rather than hanging.
  const missing = runWithoutClaude('doctor')
  expect(missing.status).toBe(127)
  expect(missing.stderr).toMatch(/Claude Code is not installed/)
})

test('--help exits zero', () => {
  const { run } = sandbox()
  const r = run('--help')

  expect(r.status).toBe(0)
  expect(r.stdout).toMatch(/ccslot use <name>/)
})
