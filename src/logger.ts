import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

const FORMAT = 'yyyy-MM-dd HH:mm:ss'

// TZ is read per call, not captured: dotenv may load it after this module.
export function timestamp(now = new Date()): string {
  const tz = process.env['TZ']
  return tz ? formatInTimeZone(now, tz, FORMAT) : format(now, FORMAT)
}

export const log = (msg: string) => console.log(`${timestamp()} ${msg}`)

export const logError = (msg: string, err?: unknown) => {
  const detail = err instanceof Error ? err.message : err != null ? String(err) : ''
  console.error(`${timestamp()} ${msg}${detail ? ': ' + detail : ''}`)
}
