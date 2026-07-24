# ccslot

Run multiple Claude Code accounts on one machine. **Separate logins, shared brain.**

Claude Code keeps everything in `~/.claude` — login, project history, skills, settings.
Two accounts means one seat two people are fighting over, so switching means
`/logout` → `/login` → browser → approve → lose your session.

`ccslot` gives each account its own config dir via `CLAUDE_CONFIG_DIR`, then symlinks
`projects`, `skills`, `plans` and `settings.json` back to the original. Only the auth is separate.

```bash
npx ccslot add work
source ~/.zshrc
ccwork          # second account, same history, same skills
claude          # original account, still logged in
```

Both can run at the same time, in two terminals. `/resume` works across them,
because the conversation history lives in the shared `projects/`.

## Commands

```
ccslot add <name>      create ~/.claude-<name>, symlink shared paths, add a shell alias
ccslot list            list slots
ccslot view <name>     show what a slot shares and what is its own
ccslot delete <name>   remove the slot dir and its alias (shared targets untouched)
```

```
--share a,b,c   override shared paths for this run
--prefix p      alias prefix (default cc, so "work" -> ccwork)
--rc <file>     shell rc file to write the alias into
--no-alias      skip writing the alias
-y, --yes       delete without confirming
```

## Config

Optional `~/.ccslotrc.json`:

```json
{
  "share": ["projects", "skills", "plans", "settings.json"],
  "aliasPrefix": "cc"
}
```

| Shared | Why |
| --- | --- |
| `projects` | `/resume` works across accounts |
| `skills` | write a skill once, every account has it |
| `plans` | plans made in one account readable from another |
| `settings.json` | one place for permissions, hooks, preferences |

Everything else — `sessions`, `history.jsonl`, `.claude.json`, `plugins` — stays per slot.
Those are written by live sessions, so sharing them means two processes fighting over one file.

`ccslot` **refuses** to share `.credentials.json` even if you put it in `share`.
Sharing auth defeats the entire point.

## Where the login actually lives

On macOS, Claude Code stores credentials in the Keychain with a separate entry per
config dir — not in the config folder at all. The accounts aren't taking turns with
one auth file, they're in genuinely different drawers.

`ccslot delete` leaves the Keychain entry behind. Remove it in Keychain Access if you care.

## Gotchas

- **Same repo, two accounts, at once.** They share `projects/`, so two live sessions in
  one repo are two processes writing near the same place. Nothing has corrupted in practice,
  but if you want it guaranteed safe, drop `projects` from `share` and lose cross-account `/resume`.
- **MCP servers need re-authorizing per slot.** OAuth connections are stored per config dir,
  same as your login. That's the isolation you asked for, pointed at something less convenient.
- **Backup tools and symlinks.** If you sync `~/.claude`, check whether your tool follows
  symlinks — some back up the same data once per slot.
- **Use accounts you're entitled to.** Your own, or one your employer gave you. This isn't
  a way to farm accounts around limits.

## Doing it by hand

There's no magic here. `ccslot add two` is:

```bash
mkdir -p ~/.claude-two
ln -s ~/.claude/projects      ~/.claude-two/projects
ln -s ~/.claude/skills        ~/.claude-two/skills
ln -s ~/.claude/plans         ~/.claude-two/plans
ln -s ~/.claude/settings.json ~/.claude-two/settings.json
echo "alias cctwo='CLAUDE_CONFIG_DIR=\"\$HOME/.claude-two\" claude'" >> ~/.zshrc
```

The package exists so you don't get one path wrong at 11pm.

## License

MIT
