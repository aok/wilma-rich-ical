import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { formatInTimeZone } from 'date-fns-tz'
import { subDays } from 'date-fns'

export interface ScheduleAnnotation {
  student: string
  matchDate: string       // yyyy-MM-dd
  matchSubject: string
  note: string
  expires: string         // yyyy-MM-dd
  sourceMessageId: number
}

export interface SyntheticEvent {
  student: string
  date: string            // yyyy-MM-dd
  start?: string          // HH:MM (when the message includes a specific time)
  end?: string            // HH:MM
  eventKey: string        // short kebab-case identifier for deduplication
  summary: string
  expires: string         // yyyy-MM-dd
  sourceMessageId: number
}

export interface UrgentNotice {
  student: string
  message: string
  expires: string         // yyyy-MM-dd
  sourceMessageId: number
}

export interface ScheduleEntry {
  date: string
  start: string
  end: string
  subject: string
  subjectCode?: string
  teacher: string
  teacherCode?: string
}

export interface Memory {
  processed_message_ids: number[]
  message_annotations: ScheduleAnnotation[]
  synthetic_events: SyntheticEvent[]
  urgent_notices: UrgentNotice[]
  schedule_cache: Record<string, ScheduleEntry[]>
}

const DEFAULT: Memory = {
  processed_message_ids: [],
  message_annotations: [],
  synthetic_events: [],
  urgent_notices: [],
  schedule_cache: {},
}

export function readMemory(path: string): Memory {
  if (!existsSync(path)) return { ...DEFAULT, schedule_cache: {} }
  const data = JSON.parse(readFileSync(path, 'utf-8')) as Partial<Memory>
  return { ...DEFAULT, ...data }
}

export function writeMemory(path: string, data: Memory): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, path)
}

export function pruneExpired(memory: Memory, today: Date, tz: string): Memory {
  const todayStr = formatInTimeZone(today, tz, 'yyyy-MM-dd')
  const cutoff = formatInTimeZone(subDays(today, 7), tz, 'yyyy-MM-dd')

  const prunedCache: Record<string, ScheduleEntry[]> = {}
  for (const [date, entries] of Object.entries(memory.schedule_cache)) {
    if (date >= cutoff) prunedCache[date] = entries
  }

  return {
    ...memory,
    message_annotations: memory.message_annotations.filter(a => a.expires >= todayStr),
    synthetic_events: memory.synthetic_events.filter(e => e.expires >= todayStr),
    urgent_notices: memory.urgent_notices.filter(n => n.expires >= todayStr),
    schedule_cache: prunedCache,
  }
}
