import { config } from './config.js'
import { readMemory, writeMemory, pruneExpired } from './memory.js'
import type { ScheduleAnnotation, ScheduleEntry, SyntheticEvent, UrgentNotice } from './memory.js'
import { fetchAllStudents, fetchSchedule, firstName } from './wilma.js'
import { filterMessages } from './steps/filter-messages.js'
import { processNewMessages } from './steps/process-messages.js'
import { buildFeed } from './ical-build.js'
import { feedCache } from './server.js'
import { log, logError } from './logger.js'

function scheduleChanged(
  oldCache: Record<string, ScheduleEntry[]>,
  newEntries: Record<string, Record<string, ScheduleEntry[]>>,
  children: string[],
): boolean {
  for (const child of children) {
    const childSchedule = newEntries[child]
    if (!childSchedule) continue
    for (const [date, entries] of Object.entries(childSchedule)) {
      const cached = oldCache[`${child}:${date}`]
      if (!cached) continue
      const oldSubjects = cached.map(e => e.subject).sort().join(',')
      const newSubjects = entries.map(e => e.subject).sort().join(',')
      if (oldSubjects !== newSubjects) return true
    }
  }
  return false
}

export async function runRefresh(): Promise<void> {
  const today = new Date()
  const memory = readMemory(config.memoryPath)

  log('[refresh] Fetching Wilma data...')
  const [{ students, errors }, { schedule, subjectNames, exams }] = await Promise.all([
    fetchAllStudents(memory.processed_message_ids),
    fetchSchedule(config.childSchools),
  ])

  if (errors.length > 0) {
    logError('[refresh] Wilma partial failure', errors.join('; '))
  }

  if (students.length === 0) {
    logError('[refresh] All Wilma profiles failed, skipping refresh')
    return
  }

  const hasScheduleChange = scheduleChanged(memory.schedule_cache, schedule, config.children)
  if (hasScheduleChange) {
    log('[refresh] Schedule change detected (jakso change?), reprocessing recent messages')
  }

  const updatedScheduleCache = { ...memory.schedule_cache }
  for (const childName of config.children) {
    const childSchedule = schedule[childName]
    if (!childSchedule) continue
    for (const [date, entries] of Object.entries(childSchedule)) {
      const key = `${childName}:${date}`
      updatedScheduleCache[key] = entries
    }
  }

  const processedIds = hasScheduleChange ? [] : memory.processed_message_ids

  const { students: filteredStudents } = filterMessages(
    students,
    processedIds
  )

  const allChildSchedules: Record<string, Record<string, ScheduleEntry[]>> = {}
  for (const [key, entries] of Object.entries(updatedScheduleCache)) {
    const [name, date] = key.split(':')
    if (!allChildSchedules[name]) allChildSchedules[name] = {}
    allChildSchedules[name][date] = entries
  }

  const messagesWithBody = filteredStudents.flatMap(s => s.summary.recentMessages).filter(m => m.body)
  if (messagesWithBody.length > 0) {
    log(`[refresh] Processing ${messagesWithBody.length} new message(s)...`)
  }

  const result = await processNewMessages(filteredStudents, config.llm.provider, config.llm.model, allChildSchedules)
  const { annotations: newAnnotations, syntheticEvents: newSyntheticEvents, urgentNotices: newUrgentNotices, processedIds: successfulIds } = result

  for (const notice of newUrgentNotices) {
    log(`[refresh] ⚠️ URGENT ${notice.student}: ${notice.message}`)
  }

  const baseAnnotations = hasScheduleChange ? [] : memory.message_annotations
  const baseSynthetics = hasScheduleChange ? [] : memory.synthetic_events

  const updatedMemory = pruneExpired({
    ...memory,
    schedule_cache: updatedScheduleCache,
    message_annotations: [
      ...baseAnnotations.filter(
        a => !newAnnotations.some(n => n.sourceMessageId === a.sourceMessageId)
      ),
      ...newAnnotations,
    ],
    synthetic_events: [
      ...baseSynthetics.filter(
        e => !newSyntheticEvents.some(n => n.sourceMessageId === e.sourceMessageId)
      ),
      ...newSyntheticEvents,
    ],
    urgent_notices: [
      ...memory.urgent_notices.filter(
        n => !newUrgentNotices.some(u => u.sourceMessageId === n.sourceMessageId)
      ),
      ...newUrgentNotices,
    ],
  }, today, config.tz)

  log('[refresh] Building feeds...')
  for (const childName of config.children) {
    const token = config.childTokens[childName]

    const student = students.find(s => firstName(s.student.name) === childName)
    if (!student) {
      logError(`[refresh] No Wilma data for ${childName}, skipping feed`)
      continue
    }

    const childCache: Record<string, ScheduleEntry[]> = {}
    for (const [key, entries] of Object.entries(updatedMemory.schedule_cache)) {
      const [name, date] = key.split(':')
      if (name === childName) childCache[date] = entries
    }

    try {
      const feed = buildFeed(
        childName,
        childCache,
        student.summary,
        updatedMemory.message_annotations,
        updatedMemory.synthetic_events,
        subjectNames,
        exams[childName] ?? [],
      )
      feedCache.set(token, feed)
      log(`[refresh] Feed updated for ${childName}`)
    } catch (err) {
      logError(`[refresh] Feed build failed for ${childName}`, err)
    }
  }

  writeMemory(config.memoryPath, {
    ...updatedMemory,
    processed_message_ids: [...new Set([...updatedMemory.processed_message_ids, ...successfulIds])],
  })

  log('[refresh] Done.')
}
