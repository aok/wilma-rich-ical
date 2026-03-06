import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { config } from './config.js'
import { startServer } from './server.js'
import { startTunnel } from './tunnel.js'
import { runRefresh } from './refresh.js'
import { log, logError } from './logger.js'

function writeUrls(baseUrl: string) {
  const lines = Object.entries(config.childTokens)
    .map(([name, token]) => `${name}: ${baseUrl}/feed/${token}/calendar.ics`)
  writeFileSync('calendar-urls.txt', lines.join('\n') + '\n')
  log(`Calendar URLs written to calendar-urls.txt`)
}

export function start() {
  startServer(config.port)

  startTunnel(config.port, config.tunnelHostname)
    .then((tunnelUrl) => {
      writeUrls(tunnelUrl)
      if (!config.tunnelHostname) {
        log('URLs change on restart. Set TUNNEL_HOSTNAME for stable URLs (see README).')
      }
    })
    .catch((err) => {
      logError('[tunnel] Failed to start tunnel', err)
      writeUrls(`http://localhost:${config.port}`)
    })

  async function refresh() {
    try { await runRefresh() }
    catch (err) { logError('[refresh] Uncaught error', err) }
  }

  refresh()
  setInterval(refresh, config.refreshInterval * 60_000)
  log(`wilma-rich-ical running. Refresh every ${config.refreshInterval}min, port ${config.port}`)
}
