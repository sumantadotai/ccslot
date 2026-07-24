---
'ccslot': minor
---

Detect a missing Claude Code CLI instead of failing with `ENOENT`.

`ccslot <slot>`, `ccslot run` and `ccslot add` now check that `claude` is on your PATH and,
when it is not, print the official install commands for your platform plus a link to
https://code.claude.com/docs/en/overview. The new `ccslot install` (alias `ccslot doctor`)
reports where `claude` was found, or offers to open that page.

Node 22 is now the minimum — Node 20 is end-of-life.
