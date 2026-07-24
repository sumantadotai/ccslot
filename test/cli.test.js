// End-to-end tests: run the real bin against a fake HOME and a stub `claude` on PATH.
// These are the ones that catch platform problems the unit tests cannot — .cmd
// resolution on Windows, exit-code forwarding, argument pass-through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const IS_WINDOWS = process.platform === 'win32'
const BIN = fileURLToPath(new URL('../bin/ccslot.js', import.meta.url))

/** A stub `claude` that reports the config dir and args it saw, then exits 7. */
function stubClaude(dir) {
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

  const run = (...args) =>
    spawnSync(process.execPath, [BIN, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home, // os.homedir() reads this on Windows
        SHELL: IS_WINDOWS ? '' : '/bin/zsh',
        PATH: binDir + path.delimiter + process.env.PATH,
      },
    })

  return { root, home, base, run }
}

test('add creates a slot and reports what it shared', () => {
  const { run, base } = sandbox()
  const r = run('add', 'work')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /shared {2}projects/)
  assert.match(r.stdout, /shared {2}settings\.json/)
  assert.match(r.stdout, /next: ccslot work/)
  assert.equal(fs.existsSync(path.join(base, 'projects')), true)
})

test('bare slot name launches claude with CLAUDE_CONFIG_DIR and forwards the exit code', () => {
  const { run, home } = sandbox()
  run('add', 'work')
  const r = run('work')

  assert.equal(r.status, 7, `expected the stub's exit code to propagate\n${r.stderr}`)
  assert.match(r.stdout, /\[claude\] dir=/)
  assert.match(r.stdout, new RegExp(escape(path.join(home, '.claude-work'))))
})

test('args after the slot name reach claude untouched', () => {
  const { run } = sandbox()
  run('add', 'personal')
  const r = run('personal', '--resume', '-p', 'hello')

  assert.equal(r.status, 7)
  assert.match(r.stdout, /args=.*--resume/)
  assert.match(r.stdout, /-p hello/)
})

test('run <name> -- <args> works the same', () => {
  const { run } = sandbox()
  run('add', 'work')
  const r = run('run', 'work', '--', '--resume')
  assert.equal(r.status, 7)
  assert.match(r.stdout, /args=.*--resume/)
})

test('two slots launch with different config dirs', () => {
  const { run, home } = sandbox()
  run('add', 'work')
  run('add', 'personal')

  assert.match(run('work').stdout, new RegExp(escape(path.join(home, '.claude-work'))))
  assert.match(run('personal').stdout, new RegExp(escape(path.join(home, '.claude-personal'))))
})

test('list shows every slot, view shows its links', () => {
  const { run } = sandbox()
  run('add', 'work')
  run('add', 'personal')

  const l = run('list')
  assert.equal(l.status, 0, l.stderr)
  assert.match(l.stdout, /personal/)
  assert.match(l.stdout, /work/)

  const v = run('view', 'work')
  assert.equal(v.status, 0, v.stderr)
  assert.match(v.stdout, /shared:/)
  assert.match(v.stdout, /projects ->/)
})

test('use prints a single eval-able line when piped', () => {
  const { run, home } = sandbox()
  run('add', 'work')
  const r = run('use', 'work')

  assert.equal(r.status, 0, r.stderr)
  const lines = r.stdout.trim().split('\n')
  assert.equal(lines.length, 1, `expected one line, got:\n${r.stdout}`)
  assert.match(lines[0], IS_WINDOWS ? /CLAUDE_CONFIG_DIR/ : /^export CLAUDE_CONFIG_DIR=/)
  assert.match(lines[0], new RegExp(escape(path.join(home, '.claude-work'))))
})

test('use --shell emits the right syntax for each shell', () => {
  const { run } = sandbox()
  run('add', 'work')
  assert.match(run('use', 'work', '--shell', 'fish').stdout, /^set -gx CLAUDE_CONFIG_DIR/)
  assert.match(run('use', 'work', '--shell', 'powershell').stdout, /^\$env:CLAUDE_CONFIG_DIR = /)
  assert.match(run('use', 'work', '--shell', 'cmd').stdout, /^set CLAUDE_CONFIG_DIR=/)
})

test('delete removes the slot but leaves the base config intact', () => {
  const { run, home, base } = sandbox()
  run('add', 'work')
  fs.writeFileSync(path.join(base, 'projects', 'keep.jsonl'), 'precious')

  const r = run('delete', 'work', '-y')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(fs.existsSync(path.join(home, '.claude-work')), false)
  assert.equal(fs.readFileSync(path.join(base, 'projects', 'keep.jsonl'), 'utf8'), 'precious')
  assert.equal(fs.existsSync(path.join(base, 'settings.json')), true)
  assert.match(run('list').stdout, /no slots yet/)
})

test('errors exit non-zero with a usable message', () => {
  const { run } = sandbox()

  const unknown = run('nosuch')
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /unknown command or slot/)

  const reserved = run('add', 'list')
  assert.equal(reserved.status, 1)
  assert.match(reserved.stderr, /is a ccslot command/)

  const ghost = run('run', 'ghost')
  assert.equal(ghost.status, 1)
  assert.match(ghost.stderr, /no such slot/)

  const noArgs = run()
  assert.equal(noArgs.status, 1)
  assert.match(noArgs.stdout, /ccslot add <name>/)
})

test('--help exits zero', () => {
  const { run } = sandbox()
  const r = run('--help')
  assert.equal(r.status, 0)
  assert.match(r.stdout, /ccslot use <name>/)
})

function escape(s) {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
