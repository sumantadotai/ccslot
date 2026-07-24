#!/usr/bin/env node
import { add, list, view, remove, loadConfig, UserError, DEFAULT_SHARE } from '../src/core.js'

const USAGE = `ccslot — multiple Claude Code accounts on one machine

  ccslot add <name>      create ~/.claude-<name>, symlink shared paths, add shell alias
  ccslot list            list slots
  ccslot view <name>     show one slot: what is shared, what is its own
  ccslot delete <name>   remove the slot dir and its alias (shared targets untouched)

Options
  --share a,b,c   override shared paths for this run (default: ${DEFAULT_SHARE.join(',')})
  --prefix p      alias prefix (default: cc, so "work" -> ccwork)
  --rc <file>     shell rc file to write the alias into
  --no-alias      skip writing the alias
  -y, --yes       delete without confirming

Config (~/.ccslotrc.json, optional)
  { "share": ["projects","skills","plans","settings.json"], "aliasPrefix": "cc" }

Auth is never shared. On macOS it lives in the Keychain, keyed per config dir.`

const argv = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--no-alias') flags.noAlias = true
  else if (a === '-y' || a === '--yes') flags.yes = true
  else if (a === '--share') flags.share = argv[++i]?.split(',').map((s) => s.trim()).filter(Boolean)
  else if (a === '--prefix') flags.prefix = argv[++i]
  else if (a === '--rc') flags.rc = argv[++i]
  else if (a === '-h' || a === '--help') flags.help = true
  else if (a.startsWith('-')) fail(`unknown option: ${a}`)
  else positional.push(a)
}

const [cmd, name] = positional
if (flags.help || !cmd) {
  console.log(USAGE)
  process.exit(cmd ? 0 : 1)
}

function fail(msg) {
  console.error(`ccslot: ${msg}`)
  process.exit(1)
}

async function confirm(question) {
  if (flags.yes || !process.stdin.isTTY) return flags.yes === true
  const rl = (await import('node:readline/promises')).createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const answer = await rl.question(`${question} [y/N] `)
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

try {
  switch (cmd) {
    case 'add': {
      const r = add(name, {
        share: flags.share,
        aliasPrefix: flags.prefix,
        rc: flags.rc,
        writeAlias: !flags.noAlias,
      })
      console.log(`created ${r.dir}`)
      for (const l of r.linked) console.log(`  shared  ${l}`)
      for (const m of r.missing) console.log(`  skipped ${m} (not present in ~/.claude)`)
      if (r.aliasAdded) console.log(`alias ${r.alias} added to ${r.rc}`)
      else if (!flags.noAlias) console.log(`alias ${r.alias} already in ${r.rc}`)
      console.log(`\nnext: source ${r.rc} && ${r.alias}`)
      console.log(`or:   CLAUDE_CONFIG_DIR="${r.dir}" claude`)
      break
    }
    case 'list': {
      const slots = list()
      if (!slots.length) {
        console.log('no slots yet — try: ccslot add work')
        break
      }
      for (const s of slots) {
        const broken = s.shared.filter((x) => x.broken).length
        console.log(
          `${s.name.padEnd(14)} ${s.alias.padEnd(14)} ${s.shared.length} shared${broken ? ` (${broken} BROKEN)` : ''}`
        )
      }
      break
    }
    case 'view': {
      if (!name) fail('usage: ccslot view <name>')
      const s = view(name)
      console.log(`${s.name}\n  dir    ${s.dir}\n  alias  ${s.alias}\n  env    ${s.env}`)
      console.log('  shared:')
      for (const x of s.shared) console.log(`    ${x.broken ? 'BROKEN ' : ''}${x.name} -> ${x.target}`)
      console.log('  own:')
      for (const x of s.own) console.log(`    ${x}`)
      break
    }
    case 'delete':
    case 'rm': {
      if (!name) fail('usage: ccslot delete <name>')
      const s = view(name)
      if (!(await confirm(`delete ${s.dir} and alias ${s.alias}?`))) {
        console.log('aborted')
        break
      }
      const r = remove(name, { rc: flags.rc, aliasPrefix: flags.prefix })
      console.log(`removed ${r.dir}`)
      console.log(r.aliasRemoved ? `removed alias ${r.alias} from ${r.rc}` : `no alias ${r.alias} in ${r.rc}`)
      console.log('note: the Keychain entry for this config dir is left alone (Keychain Access can remove it)')
      break
    }
    case 'config': {
      console.log(JSON.stringify(loadConfig(), null, 2))
      break
    }
    default:
      fail(`unknown command: ${cmd}\n\n${USAGE}`)
  }
} catch (e) {
  if (e instanceof UserError) fail(e.message)
  throw e
}
