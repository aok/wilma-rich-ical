#!/usr/bin/env node
export {}

const command = process.argv[2]

if (command === 'setup') {
  const { main } = await import('./setup.js')
  await main()
} else if (command === 'restart') {
  const { serviceRestart } = await import('./service.js')
  serviceRestart()
} else if (command === 'stop') {
  const { serviceStop } = await import('./service.js')
  serviceStop()
} else if (command === 'status') {
  await import('dotenv/config')
  const { printStatus } = await import('./status.js')
  printStatus()
} else if (command === 'reset') {
  await import('dotenv/config')
  const sub = process.argv[3]
  const { resetMessages, resetCache, resetTokens } = await import('./reset.js')
  const { config } = await import('./config.js')
  if (sub === 'messages') {
    resetMessages(config.memoryPath)
  } else if (sub === 'cache') {
    resetCache(config.memoryPath)
  } else if (sub === 'tokens') {
    resetTokens('.env')
  } else {
    console.error(`Unknown reset target: ${sub}`)
    console.error('Usage: wilma-icald reset [messages|cache|tokens]')
    process.exit(1)
  }
} else if (!command) {
  const { start } = await import('./index.js')
  start()
} else {
  console.error(`Unknown command: ${command}`)
  console.error('Usage: wilma-icald [setup|status|reset|restart|stop]')
  process.exit(1)
}
