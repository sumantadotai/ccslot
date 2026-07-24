/**
 * Anything the user can fix by typing something different. The CLI prints these
 * as a one-line `ccslot: …`; everything else keeps its stack trace.
 */
export class UserError extends Error {
  override name = 'UserError'
}
