import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_SHARE } from './constants.js'
import { UserError } from './errors.js'
import type { Config, Paths } from './types.js'
import { assertShare } from './validate.js'

export function paths(home: string = os.homedir()): Paths {
  return {
    home,
    base: path.join(home, '.claude'),
    config: path.join(home, '.ccslotrc.json'),
    slotDir: (name: string) => path.join(home, `.claude-${name}`),
  }
}

/** Config file is optional. Unknown keys are ignored, bad JSON is an error worth surfacing. */
export function loadConfig(home: string = os.homedir()): Config {
  const { config } = paths(home)
  let raw: string
  try {
    raw = fs.readFileSync(config, 'utf8')
  } catch {
    return { share: DEFAULT_SHARE, aliasPrefix: 'cc' }
  }
  let parsed: Partial<Config>
  try {
    parsed = JSON.parse(raw) as Partial<Config>
  } catch (e) {
    throw new UserError(`${config} is not valid JSON: ${(e as Error).message}`)
  }
  return {
    share: assertShare(parsed.share ?? DEFAULT_SHARE),
    aliasPrefix: parsed.aliasPrefix ?? 'cc',
  }
}
