import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ShellName } from './types.js'

/**
 * Which shell syntax to emit. Windows has no rc file we can safely append to, so
 * `add` skips aliases there and `ccslot <name>` is the supported path.
 */
export function detectShell(
  shell: string = process.env.SHELL ?? '',
  platform: NodeJS.Platform | string = process.platform
): ShellName {
  if (platform === 'win32') return process.env.PSModulePath ? 'powershell' : 'cmd'
  if (shell.includes('fish')) return 'fish'
  if (shell.includes('bash')) return 'bash'
  return 'zsh'
}

/** null on Windows: there is no dotfile we can append an alias to without guessing. */
export function shellRc(
  home: string = os.homedir(),
  shell: string = process.env.SHELL ?? '',
  platform: NodeJS.Platform | string = process.platform
): string | null {
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

export function aliasLine(alias: string, name: string, rc: string): string {
  return rc.endsWith('.fish')
    ? `alias ${alias} 'CLAUDE_CONFIG_DIR="$HOME/.claude-${name}" claude'`
    : `alias ${alias}='CLAUDE_CONFIG_DIR="$HOME/.claude-${name}" claude'`
}

export function appendAlias(rc: string, line: string): boolean {
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

export function removeAlias(rc: string, alias: string): boolean {
  let existing: string
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

/** How to actually apply `ccslot use <name>`, per shell. */
export function evalHint(name: string, shell: ShellName = detectShell()): string {
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
