import { NAME_RE, NEVER_SHARE, RESERVED } from './constants.js'
import { UserError } from './errors.js'

export function assertName(name: string | undefined): string {
  if (!name || !NAME_RE.test(name)) {
    throw new UserError(
      `invalid slot name ${JSON.stringify(name ?? '')} — use letters, digits, dot, dash, underscore`
    )
  }
  if (RESERVED.has(name)) {
    throw new UserError(`"${name}" is a ccslot command — pick another slot name`)
  }
  return name
}

export function assertShare(items: string[]): string[] {
  for (const item of items) {
    if (item.includes('/') || item.includes('\\') || item === '.' || item === '..') {
      throw new UserError(`shared path must be a top-level name inside ~/.claude, got ${item}`)
    }
    if (NEVER_SHARE.has(item)) {
      throw new UserError(
        `refusing to share ${item} — it is per-account state (credentials, or a file live sessions write to)`
      )
    }
  }
  return items
}
