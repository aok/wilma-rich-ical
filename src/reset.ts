import { unlinkSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { readMemory, writeMemory } from './memory.js'

export function resetMessages(memoryPath: string): void {
  const mem = readMemory(memoryPath)
  mem.processed_message_ids = []
  mem.message_annotations = []
  mem.synthetic_events = []
  mem.urgent_notices = []
  writeMemory(memoryPath, mem)
  console.log('Cleared message data. Schedule cache preserved.')
  console.log('Restart the service to reprocess messages.')
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
