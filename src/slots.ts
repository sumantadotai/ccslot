import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NAME_RE, RESERVED } from './constants.js'
import { UserError } from './errors.js'
import { isHardLinkOf, isLink, linkShared } from './links.js'
import { loadConfig, paths } from './paths.js'
import { aliasLine, appendAlias, detectShell, removeAlias, shellRc } from './shell.js'
import type {
  AddResult,
  LaunchSpec,
  RemoveResult,
  ShellName,
  SharedEntry,
  SlotView,
} from './types.js'
import { assertName, assertShare } from './validate.js'

export function add(
  name: string,
  {
    home = os.homedir(),
    share,
    aliasPrefix,
    rc,
    writeAlias = true,
  }: {
    home?: string
    share?: string[]
    aliasPrefix?: string
    /** undefined = detect from $SHELL; null = do not touch any rc file. */
    rc?: string | null
    writeAlias?: boolean
  } = {}
): AddResult {
  assertName(name)
  const cfg = loadConfig(home)
  const shared = assertShare(share ?? cfg.share)
  const { base, slotDir } = paths(home)
  const dir = slotDir(name)

  if (fs.existsSync(dir) || isLink(dir)) throw new UserError(`already exists: ${dir}`)
  if (!fs.existsSync(base)) {
    throw new UserError(`no base config at ${base} — run \`claude\` and sign in once first`)
  }

  fs.mkdirSync(dir, { recursive: true })
  const linked: AddResult['linked'] = []
  const missing: string[] = []
  for (const item of shared) {
    const target = path.join(base, item)
    if (!fs.existsSync(target)) {
      missing.push(item)
      continue
    }
    linked.push({ name: item, kind: linkShared(target, path.join(dir, item)) })
  }

  const alias = `${aliasPrefix ?? cfg.aliasPrefix}${name}`
  const rcFile = rc === undefined ? shellRc(home) : rc
  const aliasAdded =
    writeAlias && rcFile ? appendAlias(rcFile, aliasLine(alias, name, rcFile)) : false

  return { dir, alias, linked, missing, rc: rcFile, aliasAdded }
}

export function exists(name: string | undefined, home: string = os.homedir()): boolean {
  if (!name || !NAME_RE.test(name) || RESERVED.has(name)) return false
  try {
    return fs.statSync(paths(home).slotDir(name)).isDirectory()
  } catch {
    return false
  }
}

export function list(home: string = os.homedir()): SlotView[] {
  return fs
    .readdirSync(home)
    .filter((e) => e.startsWith('.claude-'))
    .map((e) => e.slice('.claude-'.length))
    .filter((n) => exists(n, home))
    .sort()
    .map((name) => view(name, home))
}

export function view(name: string, home: string = os.homedir()): SlotView {
  assertName(name)
  const { slotDir, base } = paths(home)
  const dir = slotDir(name)
  if (!fs.existsSync(dir)) throw new UserError(`no such slot: ${name} (${dir} not found)`)

  const shared: SharedEntry[] = []
  const own: string[] = []
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry)
    const target = path.join(base, entry)
    if (isLink(p)) {
      shared.push({
        name: entry,
        kind: 'symlink',
        target: fs.readlinkSync(p),
        broken: !fs.existsSync(p),
      })
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
export function launchSpec(
  name: string,
  args: string[] = [],
  {
    home = os.homedir(),
    command = 'claude',
    platform = process.platform,
  }: { home?: string; command?: string; platform?: NodeJS.Platform | string } = {}
): LaunchSpec {
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
function quoteForCmd(arg: string): string {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg
}

/** Line for `eval "$(ccslot use work)"` and its per-shell equivalents. */
export function exportLine(
  name: string,
  { home = os.homedir(), shell }: { home?: string; shell?: ShellName } = {}
): string {
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

export function remove(
  name: string,
  {
    home = os.homedir(),
    rc,
    aliasPrefix,
  }: { home?: string; rc?: string | null; aliasPrefix?: string } = {}
): RemoveResult {
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
