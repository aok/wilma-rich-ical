import { describe, it, expect, afterEach } from 'vitest'
import { timestamp } from '../logger.js'

const ORIGINAL_TZ = process.env['TZ']

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env['TZ']
  else process.env['TZ'] = ORIGINAL_TZ
})

describe('timestamp', () => {
  const summerNoonUtc = new Date('2026-08-13T09:00:00Z')

  it('formats in the configured timezone, not UTC', () => {
    process.env['TZ'] = 'Europe/Helsinki'
    expect(timestamp(summerNoonUtc)).toBe('2026-08-13 12:00:00')
  })

  it('follows a TZ change made after module load', () => {
    process.env['TZ'] = 'UTC'
    expect(timestamp(summerNoonUtc)).toBe('2026-08-13 09:00:00')
  })
})
