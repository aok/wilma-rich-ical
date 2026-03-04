import { spawn, type ChildProcess } from 'node:child_process'
import { log, logError } from './logger.js'

let child: ChildProcess | null = null

function shutdown() {
  if (child) {
    child.kill()
    child = null
  }
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export async function startTunnel(port: number, hostname?: string): Promise<string> {
  if (hostname) {
    log(`[tunnel] Using configured hostname: ${hostname}`)
    return `https://${hostname}`
  }

  return new Promise((resolve, reject) => {
    const args = ['tunnel', '--url', `http://localhost:${port}`]
    log('[tunnel] Starting quick tunnel...')
    child = spawn('cloudflared', args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let resolved = false
    const urlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

    function onData(data: Buffer) {
      const text = data.toString()
      if (!resolved) {
        const match = text.match(urlPattern)
        if (match) {
          resolved = true
          resolve(match[0])
        }
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)

    attachLogging(child)

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true
        reject(new Error(`cloudflared failed to start: ${err.message}`))
      }
    })

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true
        reject(new Error(`cloudflared exited with code ${code} before producing a URL`))
      } else {
        logError(`[tunnel] cloudflared exited unexpectedly (code ${code})`)
      }
    })
  })
}

function attachLogging(proc: ChildProcess) {
  proc.stdout?.on('data', (data: Buffer) => {
    for (const line of data.toString().trimEnd().split('\n')) {
      log(`[tunnel] ${line}`)
    }
  })
  proc.stderr?.on('data', (data: Buffer) => {
    for (const line of data.toString().trimEnd().split('\n')) {
      log(`[tunnel] ${line}`)
    }
  })
}
