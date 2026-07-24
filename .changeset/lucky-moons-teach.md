---
'ccslot': minor
---

Rewrite in TypeScript. The single `src/core.js` is now a set of typed modules
(`slots`, `claude`, `links`, `shell`, `paths`, `validate`) compiled with `tsc` to `dist/`,
and the package ships type declarations. Still zero runtime dependencies; the CLI behaves
exactly as before.
