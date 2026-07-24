import fs from 'node:fs'
import { IS_WINDOWS } from './constants.js'
import type { LinkKind } from './types.js'

/**
 * Link one shared path, working on every platform.
 *
 * POSIX: plain symlink. Windows: symlinks need SeCreateSymbolicLinkPrivilege (admin or
 * Developer Mode), so on EPERM fall back to a junction for directories — those need no
 * privilege — and a hard link for files. Both give the shared-storage behaviour we want.
 */
export function linkShared(target: string, linkPath: string): LinkKind {
  const isDir = fs.statSync(target).isDirectory()
  try {
    fs.symlinkSync(target, linkPath, isDir ? 'dir' : 'file')
    return 'symlink'
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (!IS_WINDOWS || (code !== 'EPERM' && code !== 'EACCES')) throw e
    if (isDir) {
      fs.symlinkSync(target, linkPath, 'junction')
      return 'junction'
    }
    fs.linkSync(target, linkPath)
    return 'hardlink'
  }
}

export function isLink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

/** Hard links (the Windows file fallback) are not symlinks — same inode is the tell. */
export function isHardLinkOf(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a)
    const sb = fs.statSync(b)
    return sa.ino !== 0 && sa.ino === sb.ino && sa.dev === sb.dev
  } catch {
    return false
  }
}
