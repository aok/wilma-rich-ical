import { copyFileSync, existsSync, statSync, truncateSync } from 'node:fs'

const MAX_BYTES = 8 * 1024 * 1024

// Truncates in place rather than renaming: launchd and systemd hold the log
// file open, and a rename would leave them writing to an unlinked inode.
export function rotateIfLarge(path: string, maxBytes = MAX_BYTES): boolean {
  if (!existsSync(path) || statSync(path).size < maxBytes) return false
  copyFileSync(path, `${path}.1`)
  truncateSync(path, 0)
  return true
}
