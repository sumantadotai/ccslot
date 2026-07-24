import fs from 'node:fs'
import path from 'node:path'
import { CLAUDE_DOCS } from './constants.js'
import type { InstallHelp, OpenSpec } from './types.js'

/**
 * Where `claude` lives, or null. A PATH walk rather than shelling out to
 * which/where: no child process, works the same on all three platforms, and it
 * can be tested against a fake PATH.
 */
export function findClaude({
  env = process.env,
  platform = process.platform,
  command = 'claude',
}: {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform | string
  command?: string
} = {}): string | null {
  // Windows spells it Path, and an extension-less file there is not executable.
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  const exts =
    platform === 'win32'
      ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']
  for (const dir of (env[pathKey] ?? '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const p = path.join(dir, command + ext)
      try {
        if (fs.statSync(p).isFile()) return p
      } catch {
        // not there, or not readable — keep walking
      }
    }
  }
  return null
}

/** The install commands we print when `claude` is missing. Docs page is the source of truth. */
export function installHelp(platform: NodeJS.Platform | string = process.platform): InstallHelp {
  const native =
    platform === 'win32'
      ? 'irm https://claude.ai/install.ps1 | iex'
      : 'curl -fsSL https://claude.ai/install.sh | bash'
  return {
    docs: CLAUDE_DOCS,
    steps: [
      ['install Claude Code', native],
      ['or with npm', 'npm install -g @anthropic-ai/claude-code'],
      ['then log in', 'claude'],
    ],
  }
}

/** How to open a URL in the default browser, per platform. */
export function openSpec(
  url: string,
  platform: NodeJS.Platform | string = process.platform
): OpenSpec {
  if (platform === 'darwin') return { command: 'open', args: [url], shell: false }
  // `start` is a cmd.exe builtin, and its first argument is the window title.
  if (platform === 'win32') return { command: 'start', args: ['', url], shell: true }
  return { command: 'xdg-open', args: [url], shell: false }
}
