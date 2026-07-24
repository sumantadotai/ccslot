import React, { useState } from 'react'
import Layout from '@theme/Layout'
import useBaseUrl from '@docusaurus/useBaseUrl'
import styles from './index.module.css'

const INSTALL = 'npx ccslot add work'

function CopyCommand({ command }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.install}>
      <code className={styles.installCode}>
        <span className={styles.prompt}>$</span> {command}
      </code>
      <button
        type="button"
        className={styles.copy}
        aria-label={`Copy "${command}" to the clipboard`}
        onClick={() => {
          navigator.clipboard?.writeText(command)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  )
}

function Terminal({ title = '~/code', children }) {
  return (
    <div className={styles.terminal}>
      <div className={styles.termBar}>
        <span className={styles.dot} data-c="r" />
        <span className={styles.dot} data-c="y" />
        <span className={styles.dot} data-c="g" />
        <span className={styles.termTitle}>{title}</span>
      </div>
      <pre className={styles.termBody}>{children}</pre>
    </div>
  )
}

const L = {
  cmd: (t) => <span className={styles.tCmd}>{t}</span>,
  dim: (t) => <span className={styles.tDim}>{t}</span>,
  hi: (t) => <span className={styles.tHi}>{t}</span>,
}

function Section({ id, kicker, title, children, className = '' }) {
  return (
    <section id={id} className={`${styles.section} ${className}`}>
      <div className={styles.wrap}>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        {title && <h2 className={styles.h2}>{title}</h2>}
        {children}
      </div>
    </section>
  )
}

const COMMANDS = [
  ['ccslot add <name>', 'create ~/.claude-<name>, link the shared paths, add a shell alias'],
  ['ccslot list', 'list slots — * marks the one active in this shell'],
  ['ccslot view <name>', 'what a slot shares, and what is its own'],
  ['ccslot delete <name>', 'remove the slot dir and its alias — shared targets untouched'],
  ['ccslot <name> [args…]', 'launch Claude Code as that slot'],
  ['ccslot run <name> [args…]', 'the same, explicit form'],
  ['ccslot use <name>', 'switch the current shell (needs eval)'],
  ['ccslot install', 'check for Claude Code, and show how to install it'],
]

const SHARED = [
  ['projects', '/resume works across accounts'],
  ['skills', 'write a skill once, every account has it'],
  ['plans', 'plans made in one account readable from another'],
  ['settings.json', 'one place for permissions, hooks, preferences'],
]

const PRIVATE = [
  ['the login', 'macOS Keychain, keyed per config dir — never a shared file'],
  ['MCP auth', 'a different Jira or Drive identity per slot'],
  ['sessions, history.jsonl', 'live sessions write these; sharing means two processes, one file'],
  ['.claude.json, plugins', 'per-account state that updates independently'],
]

export default function Home() {
  return (
    <Layout
      title="Multiple Claude Code accounts on one machine"
      description="ccslot gives each Claude Code account its own config dir and shares your projects, skills, plans and settings between them. Separate logins, shared brain."
    >
      {/* ---------------------------------------------------------------- hero */}
      <header className={styles.hero}>
        <div className={styles.grain} aria-hidden="true" />
        <div className={styles.wrap}>
          <img
            src={useBaseUrl('/img/logo.svg')}
            alt=""
            className={styles.heroLogo}
            width={72}
            height={72}
          />
          <h1 className={styles.h1}>ccslot</h1>
          <p className={styles.lede}>
            Multiple Claude Code accounts on one machine.
            <br />
            <em>Separate logins, shared brain.</em>
          </p>

          <CopyCommand command={INSTALL} />

          <p className={styles.subtle}>
            zero dependencies · macOS, Linux, Windows · Node 22+ · MIT
          </p>

          <div className={styles.heroLinks}>
            <a className={styles.btn} href="https://github.com/sumantadotai/ccslot">
              GitHub
            </a>
            <a className={styles.btnGhost} href="https://www.npmjs.com/package/ccslot">
              npm
            </a>
            <a className={styles.btnGhost} href="#commands">
              Commands
            </a>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- problem */}
      <Section kicker="the problem" title="One folder, one seat">
        <div className={styles.two}>
          <div>
            <p>
              Claude Code keeps everything in <code>~/.claude</code> — your login, but also
              your project history, your skills, your settings, your saved plans.
            </p>
            <p>
              That's fine until you have two accounts. Then it's one seat two people are
              fighting over, and switching means <code>/logout</code> → <code>/login</code> →
              browser → approve → and the session you were mid-way through is gone.
            </p>
            <p className={styles.muted}>Do that four times a day and you go looking for a better way.</p>
          </div>
          <Terminal title="the old way">
            {L.dim('/logout\n')}
            {L.dim('/login\n')}
            {L.dim('… browser opens, pick account, approve …\n\n')}
            {L.hi('# twenty minutes later, in reverse\n')}
          </Terminal>
        </div>
      </Section>

      {/* ----------------------------------------------------------------- fix */}
      <Section kicker="the fix" title="Separate the auth, share the rest" className={styles.alt}>
        <p className={styles.wide}>
          Claude Code reads <code>CLAUDE_CONFIG_DIR</code>. Point it somewhere else and you get
          a blank install. <strong>ccslot</strong> creates that directory, then symlinks the
          parts worth sharing back to the original — so the second account has its own identity
          and the same brain.
        </p>

        <div className={styles.diagram}>
          <div className={styles.dirCard}>
            <div className={styles.dirName}>~/.claude</div>
            <ul className={styles.dirList}>
              <li>projects</li>
              <li>skills</li>
              <li>plans</li>
              <li>settings.json</li>
            </ul>
            <div className={styles.dirTag}>the original</div>
          </div>

          <div className={styles.arrows} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className={styles.dirCard}>
            <div className={styles.dirName}>~/.claude-work</div>
            <ul className={styles.dirList}>
              <li data-link="yes">projects</li>
              <li data-link="yes">skills</li>
              <li data-link="yes">plans</li>
              <li data-link="yes">settings.json</li>
              <li data-own="yes">its own login</li>
            </ul>
            <div className={styles.dirTag}>a slot</div>
          </div>
        </div>
        <p className={styles.caption}>
          Linked names read and write the originals. Everything else Claude Code writes stays
          inside the slot.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- usage */}
      <Section kicker="in practice" title="Two accounts, both live">
        <div className={styles.two}>
          <Terminal>
            {L.hi('$ ')}
            {L.cmd('npx ccslot add work\n')}
            {L.dim('  created ~/.claude-work\n')}
            {L.dim('    shared  projects\n')}
            {L.dim('    shared  skills\n')}
            {L.dim('    shared  plans\n')}
            {L.dim('    shared  settings.json\n')}
            {L.dim('  alias ccwork added to ~/.zshrc\n\n')}
            {L.hi('$ ')}
            {L.cmd('ccslot list\n')}
            {L.hi('  * ')}
            {L.cmd('work        ccwork      4 shared\n')}
            {L.dim('    personal    ccpersonal  4 shared\n\n')}
            {L.hi('$ ')}
            {L.cmd('ccslot personal --resume\n')}
            {L.dim('  resuming a conversation started\n')}
            {L.dim('  under the other account…\n')}
          </Terminal>
          <div>
            <p>
              Two terminals, two accounts, neither aware of the other's login. The part that
              still makes me happy is <code>/resume</code>: a conversation started under one
              account, picked up under a different one, in the same repo.
            </p>
            <p>
              The history lives in the shared <code>projects/</code>, so it doesn't matter which
              identity wrote it. Hit your limit mid-task? Switch accounts, resume, keep going.
            </p>
            <p className={styles.muted}>Adding a third takes about eight seconds.</p>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------- commands */}
      <Section id="commands" kicker="reference" title="Commands" className={styles.alt}>
        <dl className={styles.defs}>
          {COMMANDS.map(([cmd, desc]) => (
            <div className={styles.defRow} key={cmd}>
              <dt>{cmd}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>

        <h3 className={styles.h3}>Don't have Claude Code yet?</h3>
        <p>
          ccslot manages Claude Code's config dirs — it doesn't ship Claude Code. If{' '}
          <code>claude</code> isn't on your PATH, anything that would launch it stops with
          instructions instead of an <code>ENOENT</code>, and <code>ccslot install</code> will
          offer to open the{' '}
          <a href="https://code.claude.com/docs/en/overview">official docs</a> for you.
        </p>
        <Terminal title="ccslot install">
          {L.dim('  Claude Code is not installed (no `claude` on your PATH).\n')}
          {L.dim('  ccslot only manages its config dirs — it needs the CLI itself.\n\n')}
          {L.cmd('  install Claude Code   ')}
          {L.hi('curl -fsSL https://claude.ai/install.sh | bash\n')}
          {L.cmd('  or with npm           ')}
          {L.hi('npm install -g @anthropic-ai/claude-code\n')}
          {L.cmd('  then log in           ')}
          {L.hi('claude\n\n')}
          {L.dim('  docs   https://code.claude.com/docs/en/overview\n')}
        </Terminal>
        <p className={styles.caption}>
          On Windows the first line is <code>irm https://claude.ai/install.ps1 | iex</code>.
        </p>

        <h3 className={styles.h3}>Three ways to run as a slot</h3>
        <Terminal title="pick one">
          {L.hi('$ ')}
          {L.cmd('ccslot work --resume')}
          {L.dim('        # launch directly, args pass through\n')}
          {L.hi('$ ')}
          {L.cmd('ccwork --resume')}
          {L.dim('             # the alias ccslot wrote for you\n')}
          {L.hi('$ ')}
          {L.cmd('eval "$(ccslot use work)"')}
          {L.dim('   # switch this whole shell\n')}
        </Terminal>
        <p className={styles.caption}>
          <code>use</code> needs the <code>eval</code> because a child process cannot change its
          parent shell's environment — no CLI can. Run it bare and it prints the exact line for
          your shell; fish, PowerShell and cmd each get their own syntax.
        </p>
      </Section>

      {/* ------------------------------------------------------------------ mcp */}
      <Section id="mcp" kicker="the bonus nobody expects" title="A second identity for your MCP servers">
        <p className={styles.wide}>
          OAuth-based MCP connections are stored <strong>per config dir</strong>, exactly like
          your Claude login. So a slot isn't only a second Claude account — it's a second set of
          credentials for everything Claude connects to.
        </p>

        <div className={styles.mcpGrid}>
          <div className={styles.mcpCard}>
            <div className={styles.mcpName}>~/.claude-work</div>
            <ul className={styles.mcpList}>
              <li>
                <span>Jira</span> <b>you@company.com</b>
              </li>
              <li>
                <span>Drive</span> <b>work account</b>
              </li>
              <li>
                <span>Linear</span> <b>company workspace</b>
              </li>
            </ul>
          </div>
          <div className={styles.mcpCard}>
            <div className={styles.mcpName}>~/.claude-client</div>
            <ul className={styles.mcpList}>
              <li>
                <span>Jira</span> <b>you@client.io</b>
              </li>
              <li>
                <span>Drive</span> <b>personal</b>
              </li>
              <li>
                <span>Linear</span> <b>client workspace</b>
              </li>
            </ul>
          </div>
        </div>

        <p className={styles.caption}>
          Same MCP server, different identity, no re-authorizing when you switch — while skills
          and history stay shared across both. Useful for contractors, anyone in two orgs, or
          keeping a personal Notion well away from a company one.
        </p>
        <p className={styles.wide}>
          The cost is the flip side of the same coin: <strong>each new slot authorizes its MCP
          servers once.</strong> That's the isolation doing its job, just pointed at something
          less convenient than your login.
        </p>
      </Section>

      {/* --------------------------------------------------------------- shared */}
      <Section kicker="the line" title="What crosses, and what never does" className={styles.alt}>
        <div className={styles.two}>
          <div>
            <h3 className={styles.h3}>Shared</h3>
            <dl className={styles.defs}>
              {SHARED.map(([k, v]) => (
                <div className={styles.defRow} key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className={styles.h3}>Per slot</h3>
            <dl className={styles.defs}>
              {PRIVATE.map(([k, v]) => (
                <div className={styles.defRow} key={k}>
                  <dt data-private="yes">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className={styles.caption}>
          ccslot <strong>refuses</strong> to share <code>.credentials.json</code> even if you put
          it in your config. Sharing auth defeats the entire point.
        </p>
      </Section>

      {/* -------------------------------------------------------------- gotchas */}
      <Section kicker="before you commit" title="Things that will bite you">
        <ol className={styles.gotchas}>
          <li>
            <strong>Same repo, two accounts, at once.</strong> They share <code>projects/</code>,
            so two live sessions in one repo are two processes writing near the same place.
            Nothing has corrupted in practice — but if you want it guaranteed, drop{' '}
            <code>projects</code> from the shared list and lose cross-account{' '}
            <code>/resume</code>.
          </li>
          <li>
            <strong>Windows without Developer Mode.</strong> Symlinks need a privilege there, so
            ccslot falls back to junctions for directories and hard links for files. Same
            behaviour; <code>ccslot view</code> tells you which kind you got.
          </li>
          <li>
            <strong>Backup tools and symlinks.</strong> If you sync <code>~/.claude</code>, check
            whether your tool follows symlinks — some back up the same data once per slot.
          </li>
          <li>
            <strong>Use accounts you're entitled to.</strong> Your own, or one your employer gave
            you. This isn't a way to farm accounts around limits.
          </li>
        </ol>
      </Section>

      {/* ----------------------------------------------------------------- coda */}
      <section className={styles.coda}>
        <div className={styles.wrap}>
          <p className={styles.codaLine}>
            The whole thing is one environment variable and four symlinks.
          </p>
          <CopyCommand command={INSTALL} />
          <p className={styles.subtle}>
            <a href="https://github.com/sumantadotai/ccslot">source</a> ·{' '}
            <a href="https://www.npmjs.com/package/ccslot">npm</a> ·{' '}
            <a href="https://github.com/sumantadotai/ccslot/issues/new?template=bug_report.yml">
              file a bug
            </a>{' '}
            ·{' '}
            <a href="https://github.com/sumantadotai/ccslot/blob/main/CONTRIBUTING.md">
              contributing
            </a>
          </p>
        </div>
      </section>
    </Layout>
  )
}
