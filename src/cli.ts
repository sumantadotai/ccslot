#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { CLAUDE_DOCS, DEFAULT_SHARE } from './constants.js'
import { UserError } from './errors.js'
import { findClaude, installHelp, openSpec } from './claude.js'
import { loadConfig } from './paths.js'
import { detectShell, evalHint, shellRc } from './shell.js'
import { add, exists, exportLine, launchSpec, list, remove, view } from './slots.js'
import type { ShellName } from './types.js'

const USAGE = `ccslot — multiple Claude Code accounts on one machine

  ccslot add <name>          create ~/.claude-<name>, symlink shared paths, add a shell alias
  ccslot list                list slots
  ccslot view <name>         show what a slot shares and what is its own
  ccslot delete <name>       remove the slot dir and its alias (shared targets untouched)

  ccslot <name> [args...]    launch Claude Code as that slot
  ccslot run <name> [args…]  same, explicit — use when a slot shares a name with a command
  ccslot use <name>          switch the CURRENT shell — needs eval, run it bare to see how
  ccslot install             check for Claude Code and show how to install it

Shell for \`use\` is detected from $SHELL; force it with
  --shell zsh|bash|fish|powershell|cmd

Options (add / delete only)
  --share a,b,c   override shared paths for this run (default: ${DEFAULT_SHARE.join(',')})
  --prefix p      alias prefix (default: cc, so "work" -> ccwork)
  --rc <file>     shell rc file to write the alias into
  --no-alias      skip writing the alias
  -y, --yes       delete without confirming

Config (~/.ccslotrc.json, optional)
  { "share": ["projects","skills","plans","settings.json"], "aliasPrefix": "cc" }

Auth is never shared. On macOS it lives in the Keychain, keyed per config dir.`

const argv = process.argv.slice(2)

function fail(msg: string): never {
  console.error(`ccslot: ${msg}`)
  process.exit(1)
}

/** The one place that explains a missing Claude Code, so every path says the same thing. */
function claudeMissingReport(): string {
  const { docs, steps } = installHelp()
  const width = Math.max(...steps.map(([label]) => label.length))
  return [
    '',
    '  Claude Code is not installed (no `claude` on your PATH).',
    '  ccslot only manages its config dirs — it needs the CLI itself.',
    '',
    ...steps.map(([label, cmd]) => `  ${label.padEnd(width)}   ${cmd}`),
    '',
    `  docs   ${docs}`,
    '',
    '  Run `ccslot install` to open that page and see these commands again.',
    '',
  ].join('\n')
}

function launch(name: string, args: string[]): void {
  const spec = launchSpec(name, args)
  // Fail before spawning: ENOENT from a shell (Windows) is not reliably distinguishable.
  if (!findClaude({ command: spec.command })) {
    console.error(claudeMissingReport())
    process.exit(127)
  }
  const child = spawn(spec.command, spec.args, {
    stdio: 'inherit',
    env: spec.env,
    shell: spec.shell,
  })
  child.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT') fail(e.message)
    console.error(claudeMissingReport())
    process.exit(127)
  })
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
}

interface Flags {
  noAlias?: boolean
  yes?: boolean
  share?: string[]
  prefix?: string
  rc?: string
  shell?: ShellName
}

async function main(): Promise<void> {
  const cmd = argv[0]

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    console.log(USAGE)
    process.exit(cmd ? 0 : 1)
  }

  // `ccslot run <name> [args…]` and `ccslot <name> [args…]` pass everything after the
  // slot name straight to claude, so flags like --resume are never parsed by us.
  if (cmd === 'run') {
    const name = argv[1]
    if (!name) fail('usage: ccslot run <name> [args…]')
    const rest = argv.slice(2)
    launch(name, rest[0] === '--' ? rest.slice(1) : rest)
  } else if (exists(cmd)) {
    launch(cmd, argv.slice(1))
  } else {
    await runCommand(cmd, argv.slice(1))
  }
}

async function runCommand(cmd: string, rest: string[]): Promise<void> {
  const flags: Flags = {}
  const positional: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string
    if (a === '--no-alias') flags.noAlias = true
    else if (a === '-y' || a === '--yes') flags.yes = true
    else if (a === '--share')
      flags.share = rest[++i]
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (a === '--prefix') flags.prefix = rest[++i]
    else if (a === '--rc') flags.rc = rest[++i]
    else if (a === '--shell') flags.shell = rest[++i] as ShellName
    else if (a === '--fish') flags.shell = 'fish'
    else if (a === '--powershell') flags.shell = 'powershell'
    else if (a === '--cmd') flags.shell = 'cmd'
    else if (a.startsWith('-')) fail(`unknown option: ${a}`)
    else positional.push(a)
  }
  const name = positional[0] as string

  switch (cmd) {
    case 'add': {
      const r = add(name, {
        share: flags.share,
        aliasPrefix: flags.prefix,
        rc: flags.rc,
        writeAlias: !flags.noAlias,
      })
      console.log(`created ${r.dir}`)
      for (const l of r.linked) {
        console.log(`  shared  ${l.name}${l.kind === 'symlink' ? '' : ` (${l.kind})`}`)
      }
      for (const m of r.missing) console.log(`  skipped ${m} (not present in ~/.claude)`)
      if (r.aliasAdded) console.log(`alias ${r.alias} added to ${r.rc}`)
      else if (!flags.noAlias && r.rc) console.log(`alias ${r.alias} already in ${r.rc}`)
      console.log(`\nnext: ccslot ${name}`)
      if (r.rc) console.log(`or:   source ${r.rc} && ${r.alias}`)
      // The slot is valid either way — this is a warning, not a failure.
      if (!findClaude()) console.error(claudeMissingReport())
      break
    }
    case 'list': {
      const slots = list()
      if (!slots.length) {
        console.log('no slots yet — try: ccslot add work')
        break
      }
      const current = process.env['CLAUDE_CONFIG_DIR']
      for (const s of slots) {
        const broken = s.shared.filter((x) => x.broken).length
        console.log(
          `${s.dir === current ? '*' : ' '} ${s.name.padEnd(14)} ${s.alias.padEnd(14)} ` +
            `${s.shared.length} shared${broken ? ` (${broken} BROKEN)` : ''}`
        )
      }
      break
    }
    case 'view': {
      if (!name) fail('usage: ccslot view <name>')
      const s = view(name)
      console.log(`${s.name}\n  dir    ${s.dir}\n  alias  ${s.alias}\n  env    ${s.env}`)
      console.log('  shared:')
      for (const x of s.shared) {
        console.log(
          `    ${x.broken ? 'BROKEN ' : ''}${x.name} -> ${x.target}${
            x.kind === 'symlink' ? '' : ` (${x.kind})`
          }`
        )
      }
      console.log('  own:')
      for (const x of s.own) console.log(`    ${x}`)
      break
    }
    case 'use': {
      const shell = flags.shell ?? detectShell()
      if (!name) fail(`usage: ${evalHint('<name>', shell)}`)
      const line = exportLine(name, { shell })
      // Piped into eval, stdout is not a TTY — emit the line. Interactively it would
      // do nothing, so show how to actually run it instead.
      if (process.stdout.isTTY) {
        console.log(`# a child process cannot change its parent shell, so this needs eval:\n`)
        console.log(`  ${evalHint(name, shell)}\n`)
        console.log(`# or just launch directly:\n\n  ccslot ${name}\n`)
        console.log(`# the line eval would run (${shell}):\n\n  ${line}`)
      } else {
        console.log(line)
      }
      break
    }
    case 'delete':
    case 'rm': {
      if (!name) fail('usage: ccslot delete <name>')
      const s = view(name)
      if (!(await confirm(`delete ${s.dir} and alias ${s.alias}?`, flags.yes))) {
        console.log('aborted')
        break
      }
      const r = remove(name, { rc: flags.rc, aliasPrefix: flags.prefix })
      console.log(`removed ${r.dir}`)
      console.log(
        r.aliasRemoved ? `removed alias ${r.alias} from ${r.rc}` : `no alias ${r.alias} in ${r.rc}`
      )
      console.log(
        'note: the Keychain entry for this config dir is left alone (Keychain Access can remove it)'
      )
      break
    }
    case 'install':
    case 'doctor': {
      const found = findClaude()
      if (found) {
        console.log(`claude   ${found}`)
        console.log(
          `docs     ${CLAUDE_DOCS}\n\nClaude Code is installed — you're set. Try: ccslot add work`
        )
        break
      }
      console.error(claudeMissingReport())
      if (await confirm(`open ${CLAUDE_DOCS} in your browser?`, flags.yes)) {
        const o = openSpec(CLAUDE_DOCS)
        spawn(o.command, o.args, { stdio: 'ignore', shell: o.shell, detached: true }).unref()
      }
      process.exit(127)
    }
    case 'config': {
      console.log(JSON.stringify({ ...loadConfig(), rc: shellRc() }, null, 2))
      break
    }
    default:
      fail(`unknown command or slot: ${cmd}\n\n${USAGE}`)
  }
}

async function confirm(question: string, yes?: boolean): Promise<boolean> {
  if (yes) return true
  if (!process.stdin.isTTY) return false
  const rl = (await import('node:readline/promises')).createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const answer = await rl.question(`${question} [y/N] `)
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

try {
  await main()
} catch (e) {
  if (e instanceof UserError) fail(e.message)
  throw e
}
