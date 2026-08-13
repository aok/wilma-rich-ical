import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotateIfLarge } from '../log-rotate.js'

let dir: string
let logPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wilma-rotate-'))
  logPath = join(dir, 'wilma.log')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('rotateIfLarge', () => {
  it('leaves a small file alone', () => {
    writeFileSync(logPath, 'short\n')
    expect(rotateIfLarge(logPath, 1024)).toBe(false)
    expect(readFileSync(logPath, 'utf8')).toBe('short\n')
  })

  it('copies to .1 and truncates when over the limit', () => {
    writeFileSync(logPath, 'x'.repeat(2048))
    expect(rotateIfLarge(logPath, 1024)).toBe(true)
    expect(statSync(logPath).size).toBe(0)
    expect(statSync(`${logPath}.1`).size).toBe(2048)
  })

  it('keeps an open append handle writing to the same file', () => {
    writeFileSync(logPath, 'x'.repeat(2048))
    const fd = openSync(logPath, 'a')
    try {
      rotateIfLarge(logPath, 1024)
      writeSync(fd, 'after rotation\n')
    } finally {
      closeSync(fd)
    }
    expect(readFileSync(logPath, 'utf8')).toBe('after rotation\n')
  })

  it('does nothing when the file does not exist', () => {
    expect(rotateIfLarge(join(dir, 'missing.log'), 1024)).toBe(false)
  })
})
