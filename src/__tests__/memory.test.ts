import { describe, it, expect } from 'vitest'
import { pruneExpired } from '../memory.js'
import type { Memory, ScheduleEntry } from '../memory.js'

const TZ = 'Europe/Helsinki'
const TODAY = new Date('2026-08-13T09:00:00Z')

function entry(date: string): ScheduleEntry[] {
  return [{ date, start: '08:15', end: '09:00', subject: 'Matematiikka', teacher: 'Latvala Marjo' }]
}

const BASE: Memory = {
  processed_message_ids: [],
  message_annotations: [],
  synthetic_events: [],
  urgent_notices: [],
  schedule_cache: {},
}

describe('pruneExpired', () => {
  it('drops cached schedule days older than a week', () => {
    const memory: Memory = {
      ...BASE,
      schedule_cache: {
        'Oiva:2026-02-23': entry('2026-02-23'),
        'Oiva:2026-08-05': entry('2026-08-05'),
        'Oiva:2026-08-06': entry('2026-08-06'),
        'Oiva:2026-08-13': entry('2026-08-13'),
      },
    }
    const pruned = pruneExpired(memory, TODAY, TZ)
    expect(Object.keys(pruned.schedule_cache).sort()).toEqual(['Oiva:2026-08-06', 'Oiva:2026-08-13'])
  })

  it('keeps future days', () => {
    const memory: Memory = {
      ...BASE,
      schedule_cache: { 'Tuovi:2026-08-29': entry('2026-08-29') },
    }
    expect(Object.keys(pruneExpired(memory, TODAY, TZ).schedule_cache)).toEqual(['Tuovi:2026-08-29'])
  })

  it('prunes each child independently', () => {
    const memory: Memory = {
      ...BASE,
      schedule_cache: {
        'Oiva:2026-03-05': entry('2026-03-05'),
        'Tuovi:2026-08-13': entry('2026-08-13'),
      },
    }
    expect(Object.keys(pruneExpired(memory, TODAY, TZ).schedule_cache)).toEqual(['Tuovi:2026-08-13'])
  })

  it('drops annotations, synthetics and notices past their expiry', () => {
    const memory: Memory = {
      ...BASE,
      message_annotations: [
        { student: 'Oiva', matchDate: '2026-08-10', matchSubject: 'MA', note: 'old', expires: '2026-08-12', sourceMessageId: 1 },
        { student: 'Oiva', matchDate: '2026-08-14', matchSubject: 'MA', note: 'live', expires: '2026-08-14', sourceMessageId: 2 },
      ],
      synthetic_events: [
        { student: 'Oiva', date: '2026-08-10', eventKey: 'old', summary: 'old', expires: '2026-08-12', sourceMessageId: 3 },
      ],
      urgent_notices: [
        { student: 'Oiva', message: 'live', expires: '2026-08-13', sourceMessageId: 4 },
      ],
    }
    const pruned = pruneExpired(memory, TODAY, TZ)
    expect(pruned.message_annotations.map(a => a.note)).toEqual(['live'])
    expect(pruned.synthetic_events).toEqual([])
    expect(pruned.urgent_notices).toHaveLength(1)
  })
})
