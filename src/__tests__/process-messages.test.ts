import { describe, it, expect } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { processNewMessages } from '../steps/process-messages.js'
import type { WilmaStudent } from '../wilma.js'
import type { ScheduleEntry } from '../memory.js'

function mockModel(responseText: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: responseText }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }),
  })
}

function student(messageBody: string): WilmaStudent {
  return {
    student: { studentNumber: '1', name: 'Oiva Esimerkki' },
    summary: {
      today: '2026-05-27',
      tomorrow: '2026-05-28',
      todaySchedule: [],
      tomorrowSchedule: [],
      upcomingExams: [],
      recentHomework: [],
      recentNews: [],
      recentMessages: [{ wilmaId: 42, subject: 'Liikunta', sentAt: '2026-05-27T08:00:00', senderName: 'Opettaja', body: messageBody }],
    },
  }
}

const schedules: Record<string, Record<string, ScheduleEntry[]>> = {
  Oiva: {
    '2026-05-28': [{ date: '2026-05-28', start: '10:00', end: '11:00', subject: 'LIIK', teacher: 'OP' }],
  },
}

describe('processNewMessages with mocked LLM (AI SDK runtime)', () => {
  it('maps an annotation matching the schedule', async () => {
    const llm = JSON.stringify({
      annotations: [{ matchDate: '2026-05-28', matchSubject: 'LIIK', note: 'Ota uimapuku', activity: 'uinti' }],
      syntheticEvents: [],
      urgentNotices: [],
    })
    const result = await processNewMessages([student('Uintia torstaina')], 'anthropic', 'm', schedules, {}, [], undefined, mockModel(llm))

    expect(result.processedIds).toEqual([42])
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toMatchObject({ student: 'Oiva', matchDate: '2026-05-28', matchSubject: 'LIIK', note: 'Ota uimapuku', activity: 'uinti', sourceMessageId: 42 })
  })

  it('builds a synthetic event with a derived eventKey when none is given', async () => {
    const llm = JSON.stringify({
      annotations: [],
      syntheticEvents: [{ date: '2026-05-30', start: '13:40', end: '18:00', summary: 'Heureka retki' }],
      urgentNotices: ['Kurssin hylkäys uhkaa'],
    })
    const result = await processNewMessages([student('Retki Heurekaan')], 'anthropic', 'm', schedules, {}, [], undefined, mockModel(llm))

    expect(result.syntheticEvents).toHaveLength(1)
    expect(result.syntheticEvents[0]).toMatchObject({ student: 'Oiva', date: '2026-05-30', start: '13:40', end: '18:00', eventKey: 'heureka-retki', summary: 'Heureka retki' })
    expect(result.urgentNotices).toHaveLength(1)
    expect(result.urgentNotices[0]).toMatchObject({ student: 'Oiva', message: 'Kurssin hylkäys uhkaa' })
  })

  it('demotes an unmatched annotation to a synthetic event', async () => {
    const llm = JSON.stringify({
      annotations: [{ matchDate: '2026-05-29', matchSubject: 'EI-OLE', note: 'Ei lukujärjestyksessä', activity: null }],
      syntheticEvents: [],
      urgentNotices: [],
    })
    const result = await processNewMessages([student('Jotain')], 'anthropic', 'm', schedules, {}, [], undefined, mockModel(llm))

    expect(result.annotations).toHaveLength(0)
    expect(result.syntheticEvents).toHaveLength(1)
    expect(result.syntheticEvents[0]).toMatchObject({ date: '2026-05-29', summary: 'Ei lukujärjestyksessä' })
  })

  it('returns empty results and still marks processed on unparseable output', async () => {
    const result = await processNewMessages([student('Jotain')], 'anthropic', 'm', schedules, {}, [], undefined, mockModel('not json at all'))

    expect(result.processedIds).toEqual([42])
    expect(result.annotations).toHaveLength(0)
    expect(result.syntheticEvents).toHaveLength(0)
    expect(result.urgentNotices).toHaveLength(0)
  })

  it('strips a markdown code fence around the JSON', async () => {
    const llm = '```json\n' + JSON.stringify({
      annotations: [{ matchDate: '2026-05-28', matchSubject: 'LIIK', note: 'Sisäliikunta', activity: 'sisäliikunta' }],
      syntheticEvents: [],
      urgentNotices: [],
    }) + '\n```'
    const result = await processNewMessages([student('Liikunta')], 'anthropic', 'm', schedules, {}, [], undefined, mockModel(llm))

    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toMatchObject({ matchSubject: 'LIIK', activity: 'sisäliikunta' })
  })
})
