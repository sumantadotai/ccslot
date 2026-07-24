## What this changes

<!-- One or two sentences. Link the issue if there is one: Closes #123 -->

## Why

<!-- The problem it solves. Skip if the "what" already says it. -->

## Checklist

- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org) — `feat(cli): …`, `fix(core): …`
- [ ] `pnpm test` and `pnpm typecheck` pass
- [ ] A test covers the change (or it is docs/CI only)
- [ ] `pnpm changeset` added — required for anything that ships in `src/`
- [ ] Nothing new in `NEVER_SHARE` got shared, and no credentials are read or written

## Platforms checked

- [ ] macOS
- [ ] Linux
- [ ] Windows

<!-- CI runs the suite on all three across Node 22 and 24, so an unchecked box
     is fine — it just tells the reviewer what you verified by hand. -->
