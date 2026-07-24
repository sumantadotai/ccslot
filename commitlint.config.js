/**
 * Conventional Commits, enforced by husky locally and by CI on every PR commit.
 * Types beyond the defaults: none — the standard set is enough for a CLI this size.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [1, 'always', ['core', 'cli', 'docs', 'ci', 'tests', 'deps', 'assets']],
    'body-max-line-length': [1, 'always', 100],
  },
}
