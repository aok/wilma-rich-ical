import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { addDays, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import type { WilmaStudent, WilmaMessage } from '../wilma.js'
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
      "note": "lyhyt suomenkielinen kuvaus"
    }
  ],
  "syntheticEvents": [
    {
      "date": "YYYY-MM-DD",
      "start": "HH:MM tai null",
      "end": "HH:MM tai null",
      "eventKey": "lyhyt-kebab-tunniste",
      "summary": "lyhyt suomenkielinen kuvaus"
    }
  ],
  "urgentNotices": [
    "lyhyt suomenkielinen kiireellinen ilmoitus"
  ]
}

Käytä annotations kun viesti viittaa lukujärjestyksessä olevaan tuntiin.
Käytä syntheticEvents kun viesti kertoo jostain muusta tapahtumasta. Jos viestissä on kellonajat, anna ne start/end-kenttiin (HH:MM). eventKey on lyhyt kebab-case-tunniste tapahtumalle (esim. "heureka-retki", "uimahalli-kaynti") — sama tapahtuma eri viesteissä saa SAMAN eventKey:n.
Käytä urgentNotices VAIN jos viesti sisältää välittömän toiminnan vaativan varoituksen — esim. oppilas on vaarassa hylätä kurssin poissaolojen takia, tai huomisen lukujärjestys muuttuu kriittisesti. ÄLÄ käytä urgentNotices rutiini-ilmoituksiin kuten kuukausitiedotteet, poissaolokoosteviestit, rekrytointi-ilmoitukset, tapahtumamuistutukset tai lomakkeiden palautuspyynnöt.
Jos viestissä ei ole toimintaa vaativaa tietoa, palauta tyhjät taulukot.

Tärkeät säännöt annotations-kentälle:
- matchDate: valitse AINOASTAAN jokin annetussa lukujärjestyksessä esiintyvistä päivämääristä. Älä johda päivämäärää viestin sisällöstä.
- matchSubject: kopioi TÄSMÄLLEEN sama merkkijono kuin lukujärjestyksessä — älä muuta, käännä tai lyhennä sitä.`

function scheduleFromDate(
  childSchedule: Record<string, ScheduleEntry[]>,
  fromDate: string,
): { date: string; start: string; end: string; subject: string }[] {
  const endDate = formatInTimeZone(addDays(parseISO(fromDate), 28), 'Europe/Helsinki', 'yyyy-MM-dd')
  const dates = Object.keys(childSchedule).filter(d => d >= fromDate && d <= endDate).sort()
  return dates.flatMap(date =>
    childSchedule[date].map(e => ({ date: e.date, start: e.start, end: e.end, subject: e.subject }))
  )
}

async function processMessage(
  childName: string,
  msg: WilmaMessage,
  childSchedule: Record<string, ScheduleEntry[]>,
  provider: string,
  modelId: string,
): Promise<{
  annotations: Omit<ScheduleAnnotation, 'student' | 'expires' | 'sourceMessageId'>[]
  syntheticEvents: (Omit<SyntheticEvent, 'student' | 'expires' | 'sourceMessageId' | 'eventKey'> & { eventKey?: string })[]
  urgentNotices: string[]
}> {
  const messageDate = msg.sentAt.slice(0, 10)
  const schedule = scheduleFromDate(childSchedule, messageDate)
  const prompt = `Viestin päivämäärä: ${messageDate}\nOpiskelija: ${childName}\nViesti: ${msg.body}\nLukujärjestys (4 viikkoa eteenpäin):\n${JSON.stringify(schedule, null, 2)}`

  const { text } = await generateText({
    model: getModel(provider, modelId),
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0,
  })

  try {
    const json = text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    const parsed = JSON.parse(json)
    return { annotations: parsed.annotations ?? [], syntheticEvents: parsed.syntheticEvents ?? [], urgentNotices: parsed.urgentNotices ?? [] }
  } catch {
    return { annotations: [], syntheticEvents: [], urgentNotices: [] }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function processNewMessages(
  students: WilmaStudent[],
  provider: string,
  modelId: string,
  allSchedules: Record<string, Record<string, ScheduleEntry[]>>,
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
        const result = await processMessage(childName, msg, childSchedule, provider, modelId)
        callCount++
        processedIds.push(msg.wilmaId)
        for (const a of result.annotations) {
          allAnnotations.push({ ...a, student: childName, expires: formatInTimeZone(addDays(parseISO(a.matchDate), 1), 'Europe/Helsinki', 'yyyy-MM-dd'), sourceMessageId: msg.wilmaId })
        }
        for (const e of result.syntheticEvents) {
          allSyntheticEvents.push({
            student: childName,
            date: e.date,
            ...(e.start ? { start: e.start } : {}),
            ...(e.end ? { end: e.end } : {}),
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
