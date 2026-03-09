import { parseISO, format } from 'date-fns'
import type { WilmaStudentSummary, SubjectNames, ExamDetail } from './wilma.js'
import type { ScheduleAnnotation, ScheduleEntry, SyntheticEvent } from './memory.js'

function icalEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function foldLine(line: string): string {
  const parts: string[] = []
  let current = ''
  let len = 0
  for (const char of line) {
    const charBytes = new TextEncoder().encode(char).length
    if (len + charBytes > 75) {
      parts.push(current)
      current = ' ' + char
      len = 1 + charBytes
    } else {
      current += char
      len += charBytes
    }
  }
  parts.push(current)
  return parts.join('\r\n')
}

function makeUid(prefix: string, date: string, subject: string): string {
  const slug = subject.toLowerCase().replace(/[^a-zäöå0-9]+/g, '-').replace(/-+$/, '')
  return `${prefix}-${date}-${slug}@wilma-rich-ical`
}

function normalizeSubject(s: string): string {
  return s.toLowerCase().trim()
}

const ACTIVITY_ICONS: Record<string, string> = {
  uinti: '🏊',
  luistelu: '⛸️',
  hiihto: '🎿',
  ulkoliikunta: '⚽️',
  sisäliikunta: '🏀',
}


function scheduleUid(entry: ScheduleEntry): string {
  const slug = entry.subject.toLowerCase().replace(/[^a-zäöå0-9]+/g, '-').replace(/-+$/, '')
  return `sched-${entry.date}-${entry.start.replace(':', '')}-${slug}@wilma-rich-ical`
}

function allDayEvent(uid: string, date: string, summary: string, description?: string): string {
  const d = date.replace(/-/g, '')
  const nextDay = format(new Date(parseISO(date).getTime() + 86400000), 'yyyyMMdd')
  const stamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'")
  const lines = [
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${nextDay}`,
    `DTSTAMP:${stamp}`,
    foldLine(`SUMMARY:${icalEscape(summary)}`),
  ]
  if (description) {
    lines.push(foldLine(`DESCRIPTION:${icalEscape(description)}`))
  }
  lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  return lines.join('\r\n')
}

function timedEvent(
  uid: string,
  date: string,
  start: string,
  end: string,
  summary: string,
  description?: string
): string {
  const d = date.replace(/-/g, '')
  const startTime = start.replace(':', '') + '00'
  const endTime = end.replace(':', '') + '00'
  const stamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'")
  const lines = [
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    `DTSTART;TZID=Europe/Helsinki:${d}T${startTime}`,
    `DTEND;TZID=Europe/Helsinki:${d}T${endTime}`,
    `DTSTAMP:${stamp}`,
    foldLine(`SUMMARY:${icalEscape(summary)}`),
  ]
  if (description) {
    lines.push(foldLine(`DESCRIPTION:${icalEscape(description)}`))
  }
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

function vcalendarHeader(childName: string) {
  return [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//wilma-rich-ical//EN',
  `X-WR-CALNAME:Wilma ${childName}`,
  'X-WR-TIMEZONE:Europe/Helsinki',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Helsinki',
  'BEGIN:STANDARD',
  'DTSTART:19701025T040000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0200',
  'TZNAME:EET',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0300',
  'TZNAME:EEST',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
  ].join('\r\n')
}

function baseCode(code: string): string {
  return code.replace(/\..+$/, '')
}

function subjectMatches(entry: ScheduleEntry, subject: string, subjectCode?: string): boolean {
  if (subjectCode && entry.subjectCode && baseCode(normalizeSubject(entry.subjectCode)) === baseCode(normalizeSubject(subjectCode))) return true
  return normalizeSubject(entry.subject) === normalizeSubject(subject)
}

function findNextClass(
  scheduleCache: Record<string, ScheduleEntry[]>,
  subject: string,
  afterDate: string,
  subjectCode?: string,
): ScheduleEntry | undefined {
  const dates = Object.keys(scheduleCache).sort()
  for (const date of dates) {
    if (date <= afterDate) continue
    const match = scheduleCache[date].find(e => subjectMatches(e, subject, subjectCode))
    if (match) return match
  }
  return undefined
}

function findFirstClassOnDate(
  scheduleCache: Record<string, ScheduleEntry[]>,
  subject: string,
  date: string,
  subjectCode?: string,
): ScheduleEntry | undefined {
  const entries = scheduleCache[date]
  if (!entries) return undefined
  return entries.find(e => subjectMatches(e, subject, subjectCode))
}

function displayName(entry: ScheduleEntry, subjectNames: SubjectNames): string {
  if (entry.subjectCode) {
    if (subjectNames[entry.subjectCode]) return subjectNames[entry.subjectCode]
    const baseCode = entry.subjectCode.replace(/\..+$/, '')
    if (subjectNames[baseCode]) return subjectNames[baseCode]
  }
  return entry.subject
}

export function buildFeed(
  childName: string,
  scheduleCache: Record<string, ScheduleEntry[]>,
  summary: WilmaStudentSummary,
  annotations: ScheduleAnnotation[],
  syntheticEvents: SyntheticEvent[],
  subjectNames: SubjectNames = {},
  examDetails: ExamDetail[] = [],
): string {
  const childAnnotations = annotations.filter(a => a.student === childName)
  const childSynthetics = syntheticEvents.filter(e => e.student === childName)

  const entryNotes = new Map<string, string[]>()
  const entryIcons = new Map<string, string[]>()
  function addNote(entry: ScheduleEntry, note: string, icon?: string) {
    const key = scheduleUid(entry)
    if (!entryNotes.has(key)) entryNotes.set(key, [])
    entryNotes.get(key)!.push(note)
    if (icon) {
      if (!entryIcons.has(key)) entryIcons.set(key, [])
      entryIcons.get(key)!.push(icon)
    }
  }

  for (const a of childAnnotations) {
    const entries = scheduleCache[a.matchDate]
    if (!entries) continue
    for (const entry of entries) {
      if (normalizeSubject(entry.subject) === normalizeSubject(a.matchSubject)) {
        const icon = a.activity ? ACTIVITY_ICONS[a.activity] : undefined
        addNote(entry, a.note, icon)
      }
    }
  }

  for (const hw of summary.recentHomework) {
    const entry = findNextClass(scheduleCache, hw.subject, hw.date, hw.subjectCode)
    if (entry) addNote(entry, hw.homework, '📚')
  }

  for (const exam of summary.upcomingExams) {
    const entry = findFirstClassOnDate(scheduleCache, exam.subject, exam.date)
    if (!entry) continue
    const detail = examDetails.find(d => d.date === exam.date && normalizeSubject(d.subject) === normalizeSubject(exam.subject))
    const topic = detail?.topic || detail?.name || ''
    addNote(entry, topic ? `KOE: ${topic}` : 'KOE', '📝')
  }

  const events: string[] = []

  const dates = Object.keys(scheduleCache).sort()
  for (const date of dates) {
    for (const entry of scheduleCache[date]) {
      const uid = scheduleUid(entry)
      const name = displayName(entry, subjectNames)
      const notes = entryNotes.get(uid)
      const icons = entryIcons.get(uid)
      const prefix = icons ? icons.join('') + ' ' : ''
      const suffix = notes ? ': ' + notes.join('; ') : ''
      const summary = `${prefix}${name}${suffix}`

      events.push(timedEvent(
        uid,
        entry.date,
        entry.start,
        entry.end,
        summary,
      ))
    }
  }

  for (const se of childSynthetics) {
    const uid = makeUid('evt', se.date, se.eventKey || se.summary)
    if (se.start && se.end) {
      events.push(timedEvent(uid, se.date, se.start, se.end, se.summary))
    } else {
      events.push(allDayEvent(uid, se.date, se.summary))
    }
  }

  const parts = [vcalendarHeader(childName), ...events, 'END:VCALENDAR']
  return parts.join('\r\n') + '\r\n'
}
