import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { add, list, view, remove, exists, launchSpec, exportLine, assertShare, UserError } from '../src/core.js'

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccslot-'))
  const base = path.join(home, '.claude')
  fs.mkdirSync(path.join(base, 'projects'), { recursive: true })
  fs.mkdirSync(path.join(base, 'skills'), { recursive: true })
  fs.writeFileSync(path.join(base, 'settings.json'), '{"model":"opus"}')
  fs.writeFileSync(path.join(home, '.zshrc'), '# existing\n')
  return { home, base, rc: path.join(home, '.zshrc') }
}

test('add symlinks shared paths, skips missing, writes alias once', () => {
  const { home, base, rc } = fakeHome()
  const r = add('work', { home, rc })

  assert.deepEqual(r.linked, ['projects', 'skills', 'settings.json'])
  assert.deepEqual(r.missing, ['plans']) // not present in base
  assert.equal(r.aliasAdded, true)
  assert.equal(fs.lstatSync(path.join(r.dir, 'projects')).isSymbolicLink(), true)
  assert.equal(fs.readFileSync(path.join(r.dir, 'settings.json'), 'utf8'), '{"model":"opus"}')
  assert.match(fs.readFileSync(rc, 'utf8'), /alias ccwork='CLAUDE_CONFIG_DIR="\$HOME\/\.claude-work" claude'/)

  // shared write lands in the base dir, which is the whole point
  fs.writeFileSync(path.join(r.dir, 'projects', 'a.jsonl'), 'x')
  assert.equal(fs.existsSync(path.join(base, 'projects', 'a.jsonl')), true)

  assert.throws(() => add('work', { home, rc }), UserError) // idempotent-ish: refuses
})

test('list and view report shared vs own', () => {
  const { home, rc } = fakeHome()
  const r = add('work', { home, rc })
  fs.writeFileSync(path.join(r.dir, '.credentials.json'), '{}') // per-slot, real file

  assert.deepEqual(list(home).map((s) => s.name), ['work'])
  const v = view('work', home)
  assert.deepEqual(v.shared.map((s) => s.name), ['projects', 'settings.json', 'skills'])
  assert.deepEqual(v.own, ['.credentials.json'])
  assert.equal(v.shared.every((s) => !s.broken), true)
})

test('view flags broken links', () => {
  const { home, base, rc } = fakeHome()
  add('work', { home, rc })
  fs.rmSync(path.join(base, 'skills'), { recursive: true })
  assert.equal(view('work', home).shared.find((s) => s.name === 'skills').broken, true)
})

test('delete removes slot and alias but never the shared targets', () => {
  const { home, base, rc } = fakeHome()
  const r = add('work', { home, rc })
  const out = remove('work', { home, rc })

  assert.equal(out.aliasRemoved, true)
  assert.equal(fs.existsSync(r.dir), false)
  assert.equal(fs.existsSync(path.join(base, 'projects')), true)
  assert.equal(fs.existsSync(path.join(base, 'settings.json')), true)
  assert.doesNotMatch(fs.readFileSync(rc, 'utf8'), /ccwork/)
})

test('refuses to share credentials or per-session state', () => {
  assert.throws(() => assertShare(['.credentials.json']), UserError)
  assert.throws(() => assertShare(['sessions']), UserError)
  assert.throws(() => assertShare(['../evil']), UserError)
  assert.deepEqual(assertShare(['projects']), ['projects'])
})

test('rejects bad slot names', () => {
  const { home, rc } = fakeHome()
  assert.throws(() => add('../evil', { home, rc }), UserError)
  assert.throws(() => add('', { home, rc }), UserError)
})

test('rejects slot names that shadow commands', () => {
  const { home, rc } = fakeHome()
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

test('launchSpec points CLAUDE_CONFIG_DIR at the slot and passes args through', () => {
  const { home, rc } = fakeHome()
  const { dir } = add('work', { home, rc })
  const spec = launchSpec('work', ['--resume', '-p', 'hi'], { home })

  assert.equal(spec.command, 'claude')
  assert.deepEqual(spec.args, ['--resume', '-p', 'hi'])
  assert.equal(spec.env.CLAUDE_CONFIG_DIR, dir)
  assert.equal(spec.env.PATH, process.env.PATH) // inherits the rest of the env
  assert.throws(() => launchSpec('nope', [], { home }), UserError)
})

test('exportLine is eval-safe and shell-specific', () => {
  const { home, rc } = fakeHome()
  const { dir } = add('work', { home, rc })

  assert.equal(exportLine('work', { home }), `export CLAUDE_CONFIG_DIR='${dir}'`)
  assert.equal(exportLine('work', { home, fish: true }), `set -gx CLAUDE_CONFIG_DIR '${dir}'`)
  assert.throws(() => exportLine('nope', { home }), UserError)
})

test('exportLine quotes a home directory containing a single quote', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccslot-o'brien-"))
  fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true })
  const rc = path.join(home, '.zshrc')
  const { dir } = add('work', { home, rc })

  const line = exportLine('work', { home })
  assert.match(line, /'\\''/) // the quote is escaped, not left to break the eval
  const echoed = execFileSync('/bin/sh', ['-c', `${line}; printf %s "$CLAUDE_CONFIG_DIR"`], {
    encoding: 'utf8',
  })
  assert.equal(echoed, dir)
})
