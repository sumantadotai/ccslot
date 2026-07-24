import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const IS_WINDOWS = process.platform === 'win32'

export const DEFAULT_SHARE = ['projects', 'skills', 'plans', 'settings.json']

/**
 * Never link these. Credentials must stay per-slot or the whole point is defeated —
 * on Linux they are a real file (.credentials.json) right here in the config dir,
 * so this list is load-bearing there, not just belt-and-braces. The rest are written
 * by live sessions, and two Claude Code processes should not share them.
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

/** Subcommands shadow slot names in `ccslot <name>`, so a slot may not be called one. */
export const RESERVED = new Set(['add', 'list', 'view', 'delete', 'rm', 'use', 'run', 'config', 'help'])

export class UserError extends Error {}

export function assertName(name) {
  if (!name || !NAME_RE.test(name)) {
    throw new UserError(
      `invalid slot name ${JSON.stringify(name ?? '')} — use letters, digits, dot, dash, underscore`
    )
  }
  if (RESERVED.has(name)) {
    throw new UserError(`"${name}" is a ccslot command — pick another slot name`)
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
        `refusing to share ${item} — it is per-account state (credentials, or a file live sessions write to)`
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

/**
 * Which shell syntax to emit. Windows has no rc file we can safely append to, so
 * `add` skips aliases there and `ccslot <name>` is the supported path.
 */
export function detectShell(shell = process.env.SHELL ?? '', platform = process.platform) {
  if (platform === 'win32') return process.env.PSModulePath ? 'powershell' : 'cmd'
  if (shell.includes('fish')) return 'fish'
  if (shell.includes('bash')) return 'bash'
  return 'zsh'
}

/** null on Windows: there is no dotfile we can append an alias to without guessing. */
export function shellRc(home = os.homedir(), shell = process.env.SHELL ?? '', platform = process.platform) {
  switch (detectShell(shell, platform)) {
    case 'powershell':
    case 'cmd':
      return null
    case 'fish':
      return path.join(home, '.config', 'fish', 'config.fish')
    case 'bash':
      return path.join(home, '.bashrc')
    default:
      return path.join(home, '.zshrc')
  }
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
  const lines = existing.split('\n')
  const kept = lines.filter((l) => !new RegExp(`^\\s*alias ${alias}[= ]`).test(l))
  if (kept.length === lines.length) return false
  fs.writeFileSync(rc, kept.join('\n'))
  return true
}

/**
 * Link one shared path, working on every platform.
 *
 * POSIX: plain symlink. Windows: symlinks need SeCreateSymbolicLinkPrivilege (admin or
 * Developer Mode), so on EPERM fall back to a junction for directories — those need no
 * privilege — and a hard link for files. Both give the shared-storage behaviour we want.
 */
export function linkShared(target, linkPath) {
  const isDir = fs.statSync(target).isDirectory()
  try {
    fs.symlinkSync(target, linkPath, isDir ? 'dir' : 'file')
    return 'symlink'
  } catch (e) {
    if (!IS_WINDOWS || (e.code !== 'EPERM' && e.code !== 'EACCES')) throw e
    if (isDir) {
      fs.symlinkSync(target, linkPath, 'junction')
      return 'junction'
    }
    fs.linkSync(target, linkPath)
    return 'hardlink'
  }
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

/** Hard links (the Windows file fallback) are not symlinks — same inode is the tell. */
function isHardLinkOf(a, b) {
  try {
    const sa = fs.statSync(a)
    const sb = fs.statSync(b)
    return sa.ino !== 0 && sa.ino === sb.ino && sa.dev === sb.dev
  } catch {
    return false
  }
}

export function add(name, { home = os.homedir(), share, aliasPrefix, rc, writeAlias = true } = {}) {
  assertName(name)
  const cfg = loadConfig(home)
  share = assertShare(share ?? cfg.share)
  const { base, slotDir } = paths(home)
  const dir = slotDir(name)

  if (fs.existsSync(dir) || isLink(dir)) throw new UserError(`already exists: ${dir}`)
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
    linked.push({ name: item, kind: linkShared(target, path.join(dir, item)) })
  }

  const alias = `${aliasPrefix ?? cfg.aliasPrefix}${name}`
  const rcFile = rc === undefined ? shellRc(home) : rc
  const aliasAdded = writeAlias && rcFile ? appendAlias(rcFile, aliasLine(alias, name, rcFile)) : false

  return { dir, alias, linked, missing, rc: rcFile, aliasAdded }
}

export function exists(name, home = os.homedir()) {
  if (!NAME_RE.test(name ?? '') || RESERVED.has(name)) return false
  try {
    return fs.statSync(paths(home).slotDir(name)).isDirectory()
  } catch {
    return false
  }
}

export function list(home = os.homedir()) {
  return fs
    .readdirSync(home)
    .filter((e) => e.startsWith('.claude-'))
    .map((e) => e.slice('.claude-'.length))
    .filter((n) => exists(n, home))
    .sort()
    .map((name) => view(name, home))
}

export function view(name, home = os.homedir()) {
  assertName(name)
  const { slotDir, base } = paths(home)
  const dir = slotDir(name)
  if (!fs.existsSync(dir)) throw new UserError(`no such slot: ${name} (${dir} not found)`)

  const shared = []
  const own = []
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry)
    const target = path.join(base, entry)
    if (isLink(p)) {
      shared.push({ name: entry, kind: 'symlink', target: fs.readlinkSync(p), broken: !fs.existsSync(p) })
    } else if (isHardLinkOf(p, target)) {
      shared.push({ name: entry, kind: 'hardlink', target, broken: false })
    } else {
      own.push(entry)
    }
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

/**
 * What `ccslot run <name>` should exec. Returned rather than spawned so it can be
 * asserted on without launching a real Claude Code.
 *
 * Windows ships `claude` as claude.cmd, which CreateProcess cannot run directly —
 * hence shell: true there, and only there.
 */
export function launchSpec(name, args = [], { home = os.homedir(), command = 'claude', platform = process.platform } = {}) {
  assertName(name)
  const dir = paths(home).slotDir(name)
  if (!fs.existsSync(dir)) {
    throw new UserError(`no such slot: ${name} — create it with \`ccslot add ${name}\``)
  }
  const win = platform === 'win32'
  return {
    command,
    args: win ? args.map(quoteForCmd) : args,
    shell: win,
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir },
    dir,
  }
}

/** cmd.exe splits on spaces, so anything with whitespace or a shell metachar needs quoting. */
function quoteForCmd(arg) {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg
}

/** Line for `eval "$(ccslot use work)"` and its per-shell equivalents. */
export function exportLine(name, { home = os.homedir(), shell } = {}) {
  assertName(name)
  const dir = paths(home).slotDir(name)
  if (!fs.existsSync(dir)) {
    throw new UserError(`no such slot: ${name} — create it with \`ccslot add ${name}\``)
  }
  switch (shell ?? detectShell()) {
    case 'powershell':
      return `$env:CLAUDE_CONFIG_DIR = '${dir.replaceAll("'", "''")}'`
    case 'cmd':
      return `set CLAUDE_CONFIG_DIR=${dir}`
    case 'fish':
      return `set -gx CLAUDE_CONFIG_DIR '${dir.replaceAll("'", `'\\''`)}'`
    default:
      return `export CLAUDE_CONFIG_DIR='${dir.replaceAll("'", `'\\''`)}'`
  }
}

export function evalHint(name, shell = detectShell()) {
  switch (shell) {
    case 'powershell':
      return `ccslot use ${name} | Out-String | Invoke-Expression`
    case 'cmd':
      return `for /f "tokens=*" %i in ('ccslot use ${name}') do @%i`
    case 'fish':
      return `ccslot use ${name} | source`
    default:
      return `eval "$(ccslot use ${name})"`
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

  // fs.rm unlinks symlinks and junctions rather than following them, and removing a
  // hard link leaves the other name intact — so shared targets survive on every platform.
  fs.rmSync(dir, { recursive: true, force: true })

  const cfg = loadConfig(home)
  const alias = `${aliasPrefix ?? cfg.aliasPrefix}${name}`
  const rcFile = rc === undefined ? shellRc(home) : rc
  return { dir, alias, rc: rcFile, aliasRemoved: rcFile ? removeAlias(rcFile, alias) : false }
}
