import { createServer } from 'node:http'
import { log } from './logger.js'

export const feedCache = new Map<string, string>()

const TOKEN_RE = /^\/feed\/([0-9a-f]{64})\/calendar\.ics$/

export function startServer(port: number): void {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || !req.url) {
      res.writeHead(404).end()
      return
    }

    const match = TOKEN_RE.exec(req.url)
    if (!match) {
      res.writeHead(404).end()
      return
    }

    const feed = feedCache.get(match[1]!)
    if (!feed) {
      res.writeHead(404).end()
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    res.end(feed)
  })

  server.listen(port, '127.0.0.1', () => log(`Server listening on 127.0.0.1:${port}`))
}
