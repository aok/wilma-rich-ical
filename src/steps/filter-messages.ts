import type { WilmaStudent } from '../wilma.js'

export function filterMessages(
  students: WilmaStudent[],
  processedIds: number[]
): { students: WilmaStudent[]; newMessageIds: number[] } {
  const processed = new Set(processedIds)
  const newMessageIds: number[] = []

  const filtered = students.map(s => ({
    ...s,
    summary: {
      ...s.summary,
      recentMessages: s.summary.recentMessages.filter(msg => {
        if (processed.has(msg.wilmaId)) return false
        newMessageIds.push(msg.wilmaId)
        return true
      }),
    },
  }))

  return { students: filtered, newMessageIds }
}
