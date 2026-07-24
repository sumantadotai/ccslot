# Contributing

Small project, short rules.

## Setup

```bash
pnpm install        # installs husky hooks too
pnpm build          # tsc -> dist/
pnpm test           # builds, then vitest (~3s)
pnpm typecheck      # tsc --noEmit over src + test
pnpm test:watch
pnpm test:coverage  # writes coverage/ (also posted to the CI job summary)
pnpm docs:dev       # the docs site at localhost:3000
pnpm format         # prettier over the repo
```

`pre-commit` runs lint-staged: prettier over the staged files, then the tests related to
them. `commit-msg` runs commitlint. CI re-checks formatting, so a bypassed hook only
delays the news.

Node 22+. Node 20 is end-of-life and CI does not test it.

Source is TypeScript under `src/` (strict, `tsc` to `dist/`, no bundler). `src/cli.ts` is the
binary; everything else is a small focused module re-exported from `src/index.ts`. The CLI
tests spawn the compiled `dist/cli.js`, which is why `pnpm test` builds first.

## Reporting a bug

Open a [bug report](https://github.com/sumantadotai/ccslot/issues/new?template=bug_report.yml).
Include your OS, `node -v`, and the output of `ccslot view <name>` — it shows how the slot
is actually linked, which is the answer to most reports. If `claude` itself is the problem,
run `ccslot install` first; that checks whether the CLI is on your PATH and points at the
[official docs](https://code.claude.com/docs/en/overview).

## Commits

[Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint through
a husky `commit-msg` hook and again in CI:

```
feat(cli): add ccslot install
fix(core): fall back to a junction when symlinks need a privilege
docs: explain per-slot MCP identities
chore(deps): bump vitest
```

Types: `feat` `fix` `docs` `test` `refactor` `perf` `build` `ci` `chore` `revert`.
Scopes (optional): `core` `cli` `docs` `ci` `tests` `deps` `assets`.

If a hook is in your way, `git commit --no-verify` exists —
CI will just catch it later.

## Pull requests

- One change per PR.
- Add a test. The suite is the reason this thing can claim to work on three platforms.
- Run `pnpm changeset` for anything that changes `src/` — that is what versions
  and publishes the package. Docs- or CI-only PRs do not need one.
- Never widen what gets shared between slots without a very good reason, and never touch
  `NEVER_SHARE`. Sharing auth defeats the entire point of the tool.

CI runs the suite on macOS, Linux and Windows across Node 22 and 24, plus a coverage job.
Green everywhere or it does not merge.

## Releasing

Maintainers only: merging to `main` opens a Changesets "version packages" PR. Merging that
PR publishes to npm and pushes the docs site to GitHub Pages.
