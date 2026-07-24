import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const DEFAULT_SHARE = ['projects', 'skills', 'plans', 'settings.json']

/**
 * Never symlink these. Credentials must stay per-slot or the whole point is
 * defeated; the rest are written concurrently by running sessions.
 */
export const NEVER_SHARE = new Set([
  '.credentials.json',
  '.claude.json',
  'sessions',
  'history.jsonl',
  'statsig',
  'plugins',
  'todos',
  'shell-snapshots',
  'ide',
])

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i

export class UserError extends Error {}

export function assertName(name) {
  if (!name || !NAME_RE.test(name)) {
    throw new UserError(
      `invalid slot name ${JSON.stringify(name ?? '')} — use letters, digits, dot, dash, underscore`
    )
  }
  return name
}

export function assertShare(items) {
  for (const item of items) {
    if (item.includes('/') || item.includes('\\') || item === '.' || item === '..') {
      throw new UserError(`shared path must be a top-level name inside ~/.claude, got ${item}`)
    }
    if (NEVER_SHARE.has(item)) {
      throw new UserError(
        `refusing to share ${item} — it is per-account state (credentials or a file live sessions write to)`
      )
    }
  }
  return items
}

export function paths(home = os.homedir()) {
  return {
    home,
    base: path.join(home, '.claude'),
    config: path.join(home, '.ccslotrc.json'),
    slotDir: (name) => path.join(home, `.claude-${name}`),
  }
}

/** Config file is optional. Unknown keys are ignored, bad JSON is an error worth surfacing. */
export function loadConfig(home = os.homedir()) {
  const { config } = paths(home)
  let raw
  try {
    raw = fs.readFileSync(config, 'utf8')
  } catch {
    return { share: DEFAULT_SHARE, aliasPrefix: 'cc' }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new UserError(`${config} is not valid JSON: ${e.message}`)
  }
  return {
    share: assertShare(parsed.share ?? DEFAULT_SHARE),
    aliasPrefix: parsed.aliasPrefix ?? 'cc',
  }
}

/** ponytail: $SHELL is good enough; pass --rc to override when it isn't. */
export function shellRc(home = os.homedir(), shell = process.env.SHELL ?? '') {
  return path.join(home, shell.includes('fish') ? '.config/fish/config.fish' : shell.includes('bash') ? '.bashrc' : '.zshrc')
}

export function aliasLine(alias, name, rc) {
  return rc.endsWith('.fish')
    ? `alias ${alias} 'CLAUDE_CONFIG_DIR="$HOME/.claude-${name}" claude'`
    : `alias ${alias}='CLAUDE_CONFIG_DIR="$HOME/.claude-${name}" claude'`
}

function appendAlias(rc, line) {
  let existing = ''
  try {
    existing = fs.readFileSync(rc, 'utf8')
  } catch {
    /* rc does not exist yet */
  }
  if (existing.split('\n').some((l) => l.trim() === line)) return false
  fs.mkdirSync(path.dirname(rc), { recursive: true })
  fs.appendFileSync(rc, (existing && !existing.endsWith('\n') ? '\n' : '') + line + '\n')
  return true
}

function removeAlias(rc, alias) {
  let existing
  try {
    existing = fs.readFileSync(rc, 'utf8')
  } catch {
    return false
  }
  const kept = existing
    .split('\n')
    .filter((l) => !new RegExp(`^\\s*alias ${alias}[= ]`).test(l))
  if (kept.length === existing.split('\n').length) return false
  fs.writeFileSync(rc, kept.join('\n'))
  return true
}

export function add(name, { home = os.homedir(), share, aliasPrefix, rc, writeAlias = true } = {}) {
  assertName(name)
  const cfg = loadConfig(home)
  share = assertShare(share ?? cfg.share)
  const { base, slotDir } = paths(home)
  const dir = slotDir(name)

  if (fs.existsSync(dir) || isSymlink(dir)) {
    throw new UserError(`already exists: ${dir}`)
  }
  if (!fs.existsSync(base)) {
    throw new UserError(`no base config at ${base} — run \`claude\` and sign in once first`)
  }

  fs.mkdirSync(dir, { recursive: true })
  const linked = []
  const missing = []
  for (const item of share) {
    const target = path.join(base, item)
    if (!fs.existsSync(target)) {
      missing.push(item)
      continue
    }
    fs.symlinkSync(target, path.join(dir, item))
    linked.push(item)
  }

  const alias = `${aliasPrefix ?? cfg.aliasPrefix}${name}`
  const rcFile = rc ?? shellRc(home)
  const aliasAdded = writeAlias ? appendAlias(rcFile, aliasLine(alias, name, rcFile)) : false

  return { dir, alias, linked, missing, rc: rcFile, aliasAdded }
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

export function list(home = os.homedir()) {
  const { home: h } = paths(home)
  return fs
    .readdirSync(h)
    .filter((e) => e.startsWith('.claude-'))
    .map((e) => e.slice('.claude-'.length))
    .filter((n) => NAME_RE.test(n))
    .filter((n) => {
      try {
        return fs.statSync(paths(home).slotDir(n)).isDirectory()
      } catch {
        return false
      }
    })
    .sort()
    .map((name) => view(name, home))
}

export function view(name, home = os.homedir()) {
  assertName(name)
  const { slotDir } = paths(home)
  const dir = slotDir(name)
  if (!fs.existsSync(dir)) throw new UserError(`no such slot: ${name} (${dir} not found)`)

  const shared = []
  const own = []
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry)
    if (!isSymlink(p)) {
      own.push(entry)
      continue
    }
    const target = fs.readlinkSync(p)
    shared.push({ name: entry, target, broken: !fs.existsSync(p) })
  }
  const cfg = loadConfig(home)
  return {
    name,
    dir,
    alias: `${cfg.aliasPrefix}${name}`,
    env: `CLAUDE_CONFIG_DIR="${dir}"`,
    shared: shared.sort((a, b) => a.name.localeCompare(b.name)),
    own: own.sort(),
  }
}

export function remove(name, { home = os.homedir(), rc, aliasPrefix } = {}) {
  assertName(name)
  const { slotDir, base } = paths(home)
  const dir = slotDir(name)
  if (path.resolve(dir) === path.resolve(base)) {
    throw new UserError('refusing to delete the base ~/.claude directory')
  }
  if (!fs.existsSync(dir)) throw new UserError(`no such slot: ${name} (${dir} not found)`)

  // fs.rm unlinks symlinks rather than following them, so shared targets survive.
  fs.rmSync(dir, { recursive: true, force: true })

  const cfg = loadConfig(home)
  const alias = `${aliasPrefix ?? cfg.aliasPrefix}${name}`
  const rcFile = rc ?? shellRc(home)
  return { dir, alias, rc: rcFile, aliasRemoved: removeAlias(rcFile, alias) }
}
