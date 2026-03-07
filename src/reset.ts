import { unlinkSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { readMemory, writeMemory } from './memory.js'

export function resetMessages(memoryPath: string, last?: number): void {
  const mem = readMemory(memoryPath)
  if (last) {
    const sorted = [...mem.processed_message_ids].sort((a, b) => b - a)
    const toClear = new Set(sorted.slice(0, last))
    mem.processed_message_ids = mem.processed_message_ids.filter(id => !toClear.has(id))
    mem.message_annotations = mem.message_annotations.filter(a => !toClear.has(a.sourceMessageId))
    mem.synthetic_events = mem.synthetic_events.filter(e => !toClear.has(e.sourceMessageId))
    mem.urgent_notices = mem.urgent_notices.filter(n => !toClear.has(n.sourceMessageId))
    console.log(`Cleared ${toClear.size} most recent message(s). Schedule cache preserved.`)
  } else {
    mem.processed_message_ids = []
    mem.message_annotations = []
    mem.synthetic_events = []
    mem.urgent_notices = []
    console.log('Cleared all message data. Schedule cache preserved.')
  }
  writeMemory(memoryPath, mem)
  console.log('Restart the service to reprocess.')
}

export function resetSynthetics(memoryPath: string): void {
  const mem = readMemory(memoryPath)
  const sourceIds = new Set(mem.synthetic_events.map(e => e.sourceMessageId))
  mem.processed_message_ids = mem.processed_message_ids.filter(id => !sourceIds.has(id))
  mem.synthetic_events = []
  writeMemory(memoryPath, mem)
  console.log(`Cleared ${sourceIds.size} synthetic event(s). Their source messages will be reprocessed.`)
  console.log('Restart the service to reprocess.')
}

export function resetCache(memoryPath: string): void {
  unlinkSync(memoryPath)
  console.log(`Deleted ${memoryPath}. Everything will rebuild on next refresh.`)
}

export function resetTokens(envPath: string): void {
  const content = readFileSync(envPath, 'utf-8')
  const updated = content.replace(/^(TOKEN_\w+=).+$/gm, (_, prefix: string) => {
    return prefix + randomBytes(32).toString('hex')
  })
  writeFileSync(envPath, updated)
  console.log('Regenerated all feed tokens in .env')
  console.log('Restart the service for new tokens to take effect.')
}
