# ccslot

## 0.2.0

### Minor Changes

- [`92e2e7b`](https://github.com/sumantadotai/ccslot/commit/92e2e7b3aabe529b98ce6e0120006b6a7466b5db) Thanks [@sumantadotai](https://github.com/sumantadotai)! - Initial release: add / list / view / delete Claude Code account slots.

- [`786c259`](https://github.com/sumantadotai/ccslot/commit/786c25930bd615620e2eb8d5389eeaa6179059dc) Thanks [@sumantadotai](https://github.com/sumantadotai)! - Launch slots directly: `ccslot <name> [args…]`, `ccslot run <name>`, and `eval "$(ccslot use <name>)"` to switch the current shell. Slot names that shadow commands are now refused.

- [`995bd75`](https://github.com/sumantadotai/ccslot/commit/995bd75b0625d39c45138ed2bd9fc6697d2d8f79) Thanks [@sumantadotai](https://github.com/sumantadotai)! - Rewrite in TypeScript. The single `src/core.js` is now a set of typed modules
  (`slots`, `claude`, `links`, `shell`, `paths`, `validate`) compiled with `tsc` to `dist/`,
  and the package ships type declarations. Still zero runtime dependencies; the CLI behaves
  exactly as before.

- [`8ddc0aa`](https://github.com/sumantadotai/ccslot/commit/8ddc0aa0714b853215aea7525e3c4f7e2fda5f0d) Thanks [@sumantadotai](https://github.com/sumantadotai)! - Detect a missing Claude Code CLI instead of failing with `ENOENT`.

  `ccslot <slot>`, `ccslot run` and `ccslot add` now check that `claude` is on your PATH and,
  when it is not, print the official install commands for your platform plus a link to
  https://code.claude.com/docs/en/overview. The new `ccslot install` (alias `ccslot doctor`)
  reports where `claude` was found, or offers to open that page.

  Node 22 is now the minimum — Node 20 is end-of-life.

### Patch Changes

- [`61ef238`](https://github.com/sumantadotai/ccslot/commit/61ef238840ec95aa57d73d403519eea2ba327641) Thanks [@sumantadotai](https://github.com/sumantadotai)! - Cross-platform support: Windows junction/hard-link fallback when symlinks are not permitted, `claude.cmd` launching via shell, PowerShell/cmd/fish syntax for `use`, and no bogus rc file on Windows. CI now runs the suite on Linux, macOS and Windows across Node 18-24.

- [`b31de30`](https://github.com/sumantadotai/ccslot/commit/b31de30b06270d44035ba9c9f19e9fe7f0cd297f) Thanks [@sumantadotai](https://github.com/sumantadotai)! - Tests now run on Vitest.
