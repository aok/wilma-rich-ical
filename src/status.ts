import { existsSync } from 'node:fs'
import { readMemory } from './memory.js'
import { config } from './config.js'

export function printStatus(): void {
  if (!existsSync(config.memoryPath)) {
    console.log('No memory file found. Waiting for first refresh cycle.\n')
    printFeedUrls()
    return
  }

  const mem = readMemory(config.memoryPath)

  console.log('=== Children ===\n')
  for (const child of config.children) {
    console.log(`  ${child}:`)

    const dates = Object.keys(mem.schedule_cache)
      .filter(k => k.startsWith(`${child}:`))
      .map(k => k.split(':')[1]!)
      .sort()

    if (dates.length > 0) {
      console.log(`    Schedule: ${dates[0]} → ${dates[dates.length - 1]!} (${dates.length} days)`)
    } else {
      console.log('    Schedule: (empty)')
    }

    const annotations = mem.message_annotations.filter(a => a.student === child).length
    const synthetics = mem.synthetic_events.filter(e => e.student === child).length
    const notices = mem.urgent_notices.filter(n => n.student === child).length
    console.log(`    Annotations: ${annotations}, Synthetic events: ${synthetics}, Notices: ${notices}`)
    console.log()
  }

  console.log('=== Messages ===\n')
  if (mem.processed_message_ids.length > 0) {
    console.log(`  Processed: ${mem.processed_message_ids.length} messages`)
    console.log(`  IDs: ${mem.processed_message_ids.join(', ')}`)
  } else {
    console.log('  No processed messages.')
  }
  console.log()

  printFeedUrls()
}

function printFeedUrls(): void {
  console.log('=== Feed URLs ===\n')
  const base = config.tunnelHostname
    ? `https://${config.tunnelHostname}`
    : `http://localhost:${config.port}`
  for (const child of config.children) {
    console.log(`  ${child}: ${base}/feed/${config.childTokens[child]}/calendar.ics`)
  }
  console.log()
}
