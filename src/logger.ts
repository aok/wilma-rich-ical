const ts = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

export const log = (msg: string) => console.log(`${ts()} ${msg}`)

export const logError = (msg: string, err?: unknown) => {
  const detail = err instanceof Error ? err.message : err != null ? String(err) : ''
  console.error(`${ts()} ${msg}${detail ? ': ' + detail : ''}`)
}
