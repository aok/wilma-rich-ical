import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { addDays, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import type { WilmaStudent, WilmaMessage, SubjectNames } from '../wilma.js'
import { firstName } from '../wilma.js'
import type { ScheduleAnnotation, ScheduleEntry, SyntheticEvent, UrgentNotice } from '../memory.js'
import { log, logError } from '../logger.js'

const THROTTLE_MS = 2000

function getModel(provider: string, modelId: string) {
  if (provider === 'openai') return createOpenAI()(modelId)
  return createAnthropic()(modelId)
}

const SYSTEM_PROMPT = `Olet koulujen viestien analysoija. Tehtäväsi on poimia opettajan viestistä tuleviin tapahtumiin liittyvää tietoa.

Palauta VAIN JSON-objekti tässä muodossa:
{
  "annotations": [
    {
      "matchDate": "YYYY-MM-DD",
      "matchSubject": "täsmälleen sama aineen nimi kuin lukujärjestyksessä",
      "note": "lyhyt suomenkielinen kuvaus",
      "activity": "uinti | luistelu | hiihto | ulkoliikunta | sisäliikunta | null"
    }
  ],
  "syntheticEvents": [
    {
      "date": "YYYY-MM-DD",
      "start": "HH:MM",
      "end": "HH:MM",
      "eventKey": "lyhyt-kebab-tunniste",
      "summary": "lyhyt suomenkielinen kuvaus"
    }
  ],
  "urgentNotices": [
    "lyhyt suomenkielinen kiireellinen ilmoitus"
  ]
}

Käytä annotations kun viesti viittaa lukujärjestyksessä olevaan tuntiin.
Käytä syntheticEvents kun viesti kertoo tapahtumasta joka EI ole lukujärjestyksessä — myös silloin kun viestissä mainitaan päivämääriä joilla ei ole kyseistä ainetta lukujärjestyksessä. Esim. jos viesti kertoo uinnista torstaina mutta lukujärjestyksessä on liikuntaa vain maanantaisin, luo torstain uinnille syntheticEvent ja maanantain liikunnalle annotation. eventKey on lyhyt kebab-case-tunniste tapahtumalle (esim. "heureka-retki", "uimahalli-kaynti") — sama tapahtuma eri viesteissä saa SAMAN eventKey:n. TÄRKEÄÄ: Jos viestissä mainitaan kellonaikoja (esim. "klo 13.40", "klo 10-14", "paluu n. klo 18"), poimi ne start- ja end-kenttiin muodossa HH:MM. Jätä start ja end pois jos kellonaikoja ei mainita.
Käytä urgentNotices VAIN jos viesti sisältää välittömän toiminnan vaativan varoituksen — esim. oppilas on vaarassa hylätä kurssin poissaolojen takia, tai huomisen lukujärjestys muuttuu kriittisesti. ÄLÄ käytä urgentNotices rutiini-ilmoituksiin kuten kuukausitiedotteet, poissaolokoosteviestit, rekrytointi-ilmoitukset, tapahtumamuistutukset tai lomakkeiden palautuspyynnöt.
Jos viestissä ei ole toimintaa vaativaa tietoa, palauta tyhjät taulukot.

Tärkeät säännöt annotations-kentälle:
- matchDate: valitse AINOASTAAN jokin annetussa lukujärjestyksessä esiintyvistä päivämääristä. Älä johda päivämäärää viestin sisällöstä.
- matchSubject: kopioi TÄSMÄLLEEN lukujärjestyksen subject-kentän arvo — älä käytä displayName-arvoa. Esim. jos lukujärjestyksessä on {"subject": "LPa6 5kevät", "displayName": "Liikunta"}, anna matchSubject: "LPa6 5kevät". displayName kertoo aineen selkokielisen nimen jotta ymmärrät mihin aineeseen viesti viittaa.
- Aikarajaus: Luo annotations vain niille tunneille joihin viesti OIKEASTI viittaa. Esim. viikkoviesti "tulevan viikon juttuja" koskee vain seuraavaa viikkoa, EI kaikkia tulevia viikkoja. Luo annotations pidemmälle vain jos viesti sanoo niin (esim. "koko huhtikuun ajan", "kevätlukukaudella joka viikko").

Liikuntaviestit: Jos viesti kertoo liikuntatuntien sisällöstä, luo annotation JOKAISELLE lukujärjestyksen liikuntatunnille johon tieto pätee. Aseta activity-kenttään yksi: "uinti", "luistelu", "hiihto", "ulkoliikunta" tai "sisäliikunta". note-kenttään kirjoita lyhyt kuvaus ja mahdolliset tarvikkeet (esim. "Ota uimapuku ja pyyhe"). Jätä activity null:ksi jos kyse ei ole liikunnasta.`

function resolveDisplayName(entry: ScheduleEntry, subjectNames: SubjectNames): string | undefined {
  if (entry.subjectCode) {
    if (subjectNames[entry.subjectCode]) return subjectNames[entry.subjectCode]
    const base = entry.subjectCode.replace(/\..+$/, '')
    if (subjectNames[base]) return subjectNames[base]
  }
  return undefined
}

function scheduleFromDate(
  childSchedule: Record<string, ScheduleEntry[]>,
  fromDate: string,
  subjectNames: SubjectNames,
): { date: string; start: string; end: string; subject: string; displayName?: string }[] {
  const endDate = formatInTimeZone(addDays(parseISO(fromDate), 56), 'Europe/Helsinki', 'yyyy-MM-dd')
  const dates = Object.keys(childSchedule).filter(d => d >= fromDate && d <= endDate).sort()
  return dates.flatMap(date =>
    childSchedule[date].map(e => {
      const dn = resolveDisplayName(e, subjectNames)
      return { date: e.date, start: e.start, end: e.end, subject: e.subject, ...(dn ? { displayName: dn } : {}) }
    })
  )
}

function existingSyntheticsInWindow(
  synthetics: SyntheticEvent[],
  childName: string,
  fromDate: string,
): { date: string; eventKey: string; summary: string; start?: string; end?: string }[] {
  const endDate = formatInTimeZone(addDays(parseISO(fromDate), 56), 'Europe/Helsinki', 'yyyy-MM-dd')
  return synthetics
    .filter(e => e.student === childName && e.date >= fromDate && e.date <= endDate)
    .map(e => ({ date: e.date, eventKey: e.eventKey, summary: e.summary, ...(e.start ? { start: e.start } : {}), ...(e.end ? { end: e.end } : {}) }))
}

async function processMessage(
  childName: string,
  msg: WilmaMessage,
  childSchedule: Record<string, ScheduleEntry[]>,
  provider: string,
  modelId: string,
  subjectNames: SubjectNames,
  existingSynthetics: SyntheticEvent[],
  logPath?: string,
): Promise<{
  annotations: Omit<ScheduleAnnotation, 'student' | 'expires' | 'sourceMessageId'>[]
  syntheticEvents: (Omit<SyntheticEvent, 'student' | 'expires' | 'sourceMessageId' | 'eventKey'> & { eventKey?: string })[]
  urgentNotices: string[]
}> {
  const messageDate = msg.sentAt.slice(0, 10)
  const schedule = scheduleFromDate(childSchedule, messageDate, subjectNames)
  const existing = existingSyntheticsInWindow(existingSynthetics, childName, messageDate)
  const existingSection = existing.length > 0 ? `\nOlemassa olevat tapahtumat (käytä samaa eventKey:tä jos viesti liittyy samaan tapahtumaan):\n${JSON.stringify(existing, null, 2)}` : ''
  const prompt = `Viestin päivämäärä: ${messageDate}\nOpiskelija: ${childName}\nViesti: ${msg.body}\nLukujärjestys (8 viikkoa eteenpäin):\n${JSON.stringify(schedule, null, 2)}${existingSection}`

  const { text } = await generateText({
    model: getModel(provider, modelId),
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0,
  })

  try {
    const json = text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(json)
    const annotations: typeof parsed.annotations = []
    const syntheticEvents: typeof parsed.syntheticEvents = [...(parsed.syntheticEvents ?? [])]
    for (const a of parsed.annotations ?? []) {
      const hasMatch = schedule.some(s => s.date === a.matchDate && s.subject === a.matchSubject)
      if (hasMatch) {
        annotations.push(a)
      } else {
        syntheticEvents.push({ date: a.matchDate, summary: a.note, ...(a.activity ? { eventKey: a.activity } : {}) })
      }
    }
    const result = { annotations, syntheticEvents, urgentNotices: parsed.urgentNotices ?? [] }
    debugLog(logPath, { ts: new Date().toISOString(), child: childName, msgId: msg.wilmaId, prompt, response: text, parsed: result })
    return result
  } catch {
    debugLog(logPath, { ts: new Date().toISOString(), child: childName, msgId: msg.wilmaId, prompt, response: text, error: 'parse_failed' })
    return { annotations: [], syntheticEvents: [], urgentNotices: [] }
  }
}

function debugLog(path: string | undefined, entry: Record<string, unknown>) {
  if (!path) return
  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, JSON.stringify(entry) + '\n')
  } catch {}
}

function isTime(v: unknown): v is string {
  return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function processNewMessages(
  students: WilmaStudent[],
  provider: string,
  modelId: string,
  allSchedules: Record<string, Record<string, ScheduleEntry[]>>,
  subjectNames: SubjectNames = {},
  existingSynthetics: SyntheticEvent[] = [],
  debugLogPath?: string,
): Promise<{ annotations: ScheduleAnnotation[]; syntheticEvents: SyntheticEvent[]; urgentNotices: UrgentNotice[]; processedIds: number[] }> {
  const allAnnotations: ScheduleAnnotation[] = []
  const allSyntheticEvents: SyntheticEvent[] = []
  const allUrgentNotices: UrgentNotice[] = []
  const processedIds: number[] = []
  let callCount = 0

  for (const student of students) {
    const childName = firstName(student.student.name)
    const childSchedule = allSchedules[childName] ?? {}
    for (const msg of student.summary.recentMessages) {
      if (!msg.body) continue
      if (callCount > 0) await sleep(THROTTLE_MS)
      try {
        const result = await processMessage(childName, msg, childSchedule, provider, modelId, subjectNames, [...existingSynthetics, ...allSyntheticEvents], debugLogPath)
        callCount++
        processedIds.push(msg.wilmaId)
        for (const a of result.annotations) {
          allAnnotations.push({ ...a, student: childName, expires: formatInTimeZone(addDays(parseISO(a.matchDate), 1), 'Europe/Helsinki', 'yyyy-MM-dd'), sourceMessageId: msg.wilmaId })
        }
        for (const e of result.syntheticEvents) {
          const start = isTime(e.start) ? e.start : undefined
          const end = isTime(e.end) ? e.end : undefined
          allSyntheticEvents.push({
            student: childName,
            date: e.date,
            ...(start ? { start } : {}),
            ...(end ? { end } : {}),
            eventKey: e.eventKey || e.summary.toLowerCase().replace(/[^a-zäöå0-9]+/g, '-').replace(/-+$/, ''),
            summary: e.summary,
            expires: formatInTimeZone(addDays(parseISO(e.date), 1), 'Europe/Helsinki', 'yyyy-MM-dd'),
            sourceMessageId: msg.wilmaId,
          })
        }
        for (const notice of result.urgentNotices) {
          allUrgentNotices.push({
            student: childName,
            message: notice,
            expires: formatInTimeZone(addDays(new Date(), 3), 'Europe/Helsinki', 'yyyy-MM-dd'),
            sourceMessageId: msg.wilmaId,
          })
        }
      } catch (err) {
        logError(`[refresh] Failed to process message ${msg.wilmaId} for ${childName}, will retry next cycle`, err)
      }
    }
  }

  if (processedIds.length > 0) {
    log(`[refresh] Processed ${processedIds.length} message(s) successfully`)
  }

  return { annotations: allAnnotations, syntheticEvents: allSyntheticEvents, urgentNotices: allUrgentNotices, processedIds }
}
