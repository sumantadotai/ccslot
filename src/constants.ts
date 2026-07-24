export const IS_WINDOWS = process.platform === 'win32'

export const DEFAULT_SHARE = ['projects', 'skills', 'plans', 'settings.json']

/**
 * Never link these. Credentials must stay per-slot or the whole point is defeated —
 * on Linux they are a real file (.credentials.json) right here in the config dir,
 * so this list is load-bearing there, not just belt-and-braces. The rest are written
 * by live sessions, and two Claude Code processes should not share them.
 */
export const NEVER_SHARE: ReadonlySet<string> = new Set([
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

/** Subcommands shadow slot names in `ccslot <name>`, so a slot may not be called one. */
export const RESERVED: ReadonlySet<string> = new Set([
  'add',
  'list',
  'view',
  'delete',
  'rm',
  'use',
  'run',
  'config',
  'help',
  'install',
  'doctor',
])

export const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i

export const CLAUDE_DOCS = 'https://code.claude.com/docs/en/overview'
