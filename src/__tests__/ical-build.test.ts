import { describe, it, expect } from 'vitest'
import { buildFeed } from '../ical-build.js'
import type { ScheduleAnnotation, ScheduleEntry, SyntheticEvent } from '../memory.js'
import type { WilmaStudentSummary } from '../wilma.js'

const EMPTY_SUMMARY: WilmaStudentSummary = {
  today: '2026-03-05',
  tomorrow: '2026-03-06',
  todaySchedule: [],
  tomorrowSchedule: [],
  upcomingExams: [],
  recentHomework: [],
  recentNews: [],
  recentMessages: [],
}

const SCHEDULE_CACHE: Record<string, ScheduleEntry[]> = {
  '2026-03-05': [
    { date: '2026-03-05', start: '08:15', end: '09:00', subject: 'Matematiikka', teacher: 'Latvala Marjo' },
    { date: '2026-03-05', start: '09:15', end: '10:00', subject: 'Äidinkieli', teacher: 'Latvala Marjo' },
  ],
  '2026-03-06': [
    { date: '2026-03-06', start: '08:15', end: '09:00', subject: 'Englanti', teacher: 'Smith Jane' },
  ],
}

describe('buildFeed', () => {
  it('returns valid iCal with schedule events', () => {
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, [], [])
    expect(result).toContain('BEGIN:VCALENDAR')
    expect(result).toContain('END:VCALENDAR')
    expect(result).toContain('SUMMARY:Matematiikka')
    expect(result).toContain('SUMMARY:Äidinkieli')
    expect(result).toContain('SUMMARY:Englanti')
  })

  it('generates timed events with correct DTSTART/DTEND', () => {
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, [], [])
    expect(result).toContain('DTSTART;TZID=Europe/Helsinki:20260305T081500')
    expect(result).toContain('DTEND;TZID=Europe/Helsinki:20260305T090000')
  })

  it('annotates a matching schedule event with a note', () => {
    const annotations: ScheduleAnnotation[] = [{
      student: 'Alice',
      matchDate: '2026-03-05',
      matchSubject: 'Matematiikka',
      note: 'Tuo harppi tunnille',
      expires: '2026-03-06',
      sourceMessageId: 100,
    }]
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, annotations, [])
    expect(result).toContain('SUMMARY:Matematiikka: Tuo harppi tunnille')
  })

  it('does not annotate events for a different child', () => {
    const annotations: ScheduleAnnotation[] = [{
      student: 'Bob',
      matchDate: '2026-03-05',
      matchSubject: 'Matematiikka',
      note: 'Should not appear',
      expires: '2026-03-06',
      sourceMessageId: 101,
    }]
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, annotations, [])
    expect(result).not.toContain('Should not appear')
  })

  it('attaches homework to the next class of that subject', () => {
    const cache: Record<string, ScheduleEntry[]> = {
      '2026-03-05': [
        { date: '2026-03-05', start: '08:15', end: '09:00', subject: 'Matematiikka', teacher: 'Latvala Marjo' },
      ],
      '2026-03-07': [
        { date: '2026-03-07', start: '10:15', end: '11:00', subject: 'Matematiikka', teacher: 'Latvala Marjo' },
      ],
    }
    const summary: WilmaStudentSummary = {
      ...EMPTY_SUMMARY,
      recentHomework: [
        { subject: 'Matematiikka', homework: 'Sivut 42-43', date: '2026-03-05' },
      ],
    }
    const result = buildFeed('Alice', cache, summary, [], [])
    const march7event = result.split('BEGIN:VEVENT').find(e => e.includes('DTSTART;TZID=Europe/Helsinki:20260307'))!
    expect(march7event).toContain('SUMMARY:📚 Matematiikka: Sivut 42-43')
    const march5event = result.split('BEGIN:VEVENT').find(e => e.includes('DTSTART;TZID=Europe/Helsinki:20260305'))!
    expect(march5event).not.toContain('📚')
  })

  it('attaches exam to the first class of that subject on exam date', () => {
    const cache: Record<string, ScheduleEntry[]> = {
      '2026-03-10': [
        { date: '2026-03-10', start: '08:15', end: '09:00', subject: 'Äidinkieli', teacher: 'Latvala Marjo' },
        { date: '2026-03-10', start: '10:15', end: '11:00', subject: 'Englanti', teacher: 'Smith Jane' },
      ],
    }
    const summary: WilmaStudentSummary = {
      ...EMPTY_SUMMARY,
      upcomingExams: [
        { subject: 'Englanti', date: '2026-03-10' },
      ],
    }
    const result = buildFeed('Alice', cache, summary, [], [])
    const englishEvent = result.split('BEGIN:VEVENT').find(e => e.includes('DTSTART;TZID=Europe/Helsinki:20260310T101500'))!
    expect(englishEvent).toContain('SUMMARY:📝 Englanti: KOE')
    const finnishEvent = result.split('BEGIN:VEVENT').find(e => e.includes('DTSTART;TZID=Europe/Helsinki:20260310T081500'))!
    expect(finnishEvent).not.toContain('📝')
  })

  it('adds synthetic events without times as all-day events', () => {
    const synthetics: SyntheticEvent[] = [{
      student: 'Alice',
      date: '2026-03-12',
      eventKey: 'suomenlinna-retki',
      summary: 'Retki Suomenlinnaan',
      expires: '2026-03-13',
      sourceMessageId: 200,
    }]
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, [], synthetics)
    expect(result).toContain('SUMMARY:Retki Suomenlinnaan')
    expect(result).toContain('DTSTART;VALUE=DATE:20260312')
  })

  it('adds synthetic events with times as timed events', () => {
    const synthetics: SyntheticEvent[] = [{
      student: 'Alice',
      date: '2026-03-12',
      start: '13:30',
      end: '17:00',
      eventKey: 'suomenlinna-retki',
      summary: 'Retki Suomenlinnaan klo 13:30-17:00',
      expires: '2026-03-13',
      sourceMessageId: 200,
    }]
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, [], synthetics)
    expect(result).toContain('SUMMARY:Retki Suomenlinnaan klo 13:30-17:00')
    expect(result).toContain('DTSTART;TZID=Europe/Helsinki:20260312T133000')
    expect(result).toContain('DTEND;TZID=Europe/Helsinki:20260312T170000')
  })

  it('uses eventKey for deterministic UIDs', () => {
    const synthetics: SyntheticEvent[] = [{
      student: 'Alice',
      date: '2026-03-12',
      eventKey: 'suomenlinna-retki',
      summary: 'Retki Suomenlinnaan',
      expires: '2026-03-13',
      sourceMessageId: 200,
    }]
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, [], synthetics)
    expect(result).toContain('UID:evt-2026-03-12-suomenlinna-retki@wilma-rich-ical')
  })

  it('subject matching is case-insensitive', () => {
    const annotations: ScheduleAnnotation[] = [{
      student: 'Alice',
      matchDate: '2026-03-05',
      matchSubject: 'matematiikka',
      note: 'Case test note',
      expires: '2026-03-06',
      sourceMessageId: 102,
    }]
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, annotations, [])
    expect(result).toContain('Matematiikka: Case test note')
  })

  it('includes child name in calendar name', () => {
    const result = buildFeed('Alice', SCHEDULE_CACHE, EMPTY_SUMMARY, [], [])
    expect(result).toContain('X-WR-CALNAME:Wilma Alice')
  })

  it('resolves display name from subjectNames map', () => {
    const cache: Record<string, ScheduleEntry[]> = {
      '2026-03-05': [
        { date: '2026-03-05', start: '08:15', end: '09:00', subject: 'ÄIa6 5kevät', subjectCode: 'ÄIa6', teacher: 'Latvala Marjo' },
      ],
    }
    const subjectNames = { 'ÄIa6': 'Äidinkieli ja kirjallisuus' }
    const result = buildFeed('Alice', cache, EMPTY_SUMMARY, [], [], subjectNames)
    expect(result).toContain('SUMMARY:Äidinkieli ja kirjallisuus')
    expect(result).not.toContain('ÄIa6')
  })

  it('falls back to entry subject when no subjectNames mapping', () => {
    const cache: Record<string, ScheduleEntry[]> = {
      '2026-03-05': [
        { date: '2026-03-05', start: '08:15', end: '09:00', subject: 'ÄIa6 5kevät', subjectCode: 'ÄIa6', teacher: 'Latvala Marjo' },
      ],
    }
    const result = buildFeed('Alice', cache, EMPTY_SUMMARY, [], [])
    expect(result).toContain('SUMMARY:ÄIa6 5kevät')
  })

  it('matches homework to schedule by subjectCode', () => {
    const cache: Record<string, ScheduleEntry[]> = {
      '2026-03-05': [
        { date: '2026-03-05', start: '08:15', end: '09:00', subject: 'MAa6 5kevät', subjectCode: 'MAa6', teacher: 'Latvala Marjo' },
      ],
      '2026-03-07': [
        { date: '2026-03-07', start: '10:15', end: '11:00', subject: 'MAa6 5kevät', subjectCode: 'MAa6', teacher: 'Latvala Marjo' },
      ],
    }
    const subjectNames = { 'MAa6': 'Matematiikka' }
    const summary: WilmaStudentSummary = {
      ...EMPTY_SUMMARY,
      recentHomework: [
        { subject: 'Matematiikka', subjectCode: 'MAa6', homework: 'Sivut 42-43', date: '2026-03-05' },
      ],
    }
    const result = buildFeed('Alice', cache, summary, [], [], subjectNames)
    const march7event = result.split('BEGIN:VEVENT').find(e => e.includes('DTSTART;TZID=Europe/Helsinki:20260307'))!
    expect(march7event).toContain('SUMMARY:📚 Matematiikka: Sivut 42-43')
  })

  it('produces valid output with empty schedule cache', () => {
    const result = buildFeed('Alice', {}, EMPTY_SUMMARY, [], [])
    expect(result).toContain('BEGIN:VCALENDAR')
    expect(result).toContain('END:VCALENDAR')
    expect(result).not.toContain('BEGIN:VEVENT')
  })
})
