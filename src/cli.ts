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
} else if (!command) {
  const { start } = await import('./index.js')
  start()
} else {
  console.error(`Unknown command: ${command}`)
  console.error('Usage: wilma-icald [setup|restart|stop]')
  process.exit(1)
}
