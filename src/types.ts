/** Shared types. Kept in one place so the modules below stay about behaviour. */

/** Shells we can emit syntax for. */
export type ShellName = 'zsh' | 'bash' | 'fish' | 'powershell' | 'cmd'

/** How a shared path is attached to a slot. Windows falls back when symlinks need a privilege. */
export type LinkKind = 'symlink' | 'junction' | 'hardlink'

export interface Config {
  share: string[]
  aliasPrefix: string
}

export interface Paths {
  home: string
  base: string
  config: string
  slotDir: (name: string) => string
}

export interface LinkedEntry {
  name: string
  kind: LinkKind
}

export interface SharedEntry extends LinkedEntry {
  target: string
  broken: boolean
}

export interface AddResult {
  dir: string
  alias: string
  linked: LinkedEntry[]
  /** Names in `share` that do not exist in ~/.claude yet — skipped, not an error. */
  missing: string[]
  rc: string | null
  aliasAdded: boolean
}

export interface SlotView {
  name: string
  dir: string
  alias: string
  env: string
  shared: SharedEntry[]
  own: string[]
}

export interface RemoveResult {
  dir: string
  alias: string
  rc: string | null
  aliasRemoved: boolean
}

export interface LaunchSpec {
  command: string
  args: string[]
  shell: boolean
  env: NodeJS.ProcessEnv
  dir: string
}

export interface OpenSpec {
  command: string
  args: string[]
  shell: boolean
}

export interface InstallHelp {
  docs: string
  /** [label, command] pairs, printed as an aligned block. */
  steps: [label: string, command: string][]
}
