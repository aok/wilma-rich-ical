import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { firstName } from './wilma.js'

interface WilmaiConfig {
  profiles: Array<{
    students: Array<{ studentNumber: string; name: string }>
  }>
}

function wilmaConfigPath(): string {
  const base = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
  return join(base, 'wilmai', 'config.json')
}

function discoverChildren(): string[] {
  const raw = JSON.parse(readFileSync(wilmaConfigPath(), 'utf8')) as WilmaiConfig
  const names = new Set<string>()
  for (const profile of raw.profiles) {
    for (const student of profile.students) {
      names.add(firstName(student.name))
    }
  }
  return [...names]
}

const children = discoverChildren()

const childTokens: Record<string, string> = {}
const tokenToChild: Record<string, string> = {}

for (const name of children) {
  const key = `TOKEN_${name.toUpperCase()}`
  const token = process.env[key]
  if (!token) throw new Error(`Missing ${key} — run \`pnpm setup\` to generate tokens`)
  childTokens[name] = token
  tokenToChild[token] = name
}

export const config = {
  children,
  childTokens,
  tokenToChild,
  llm: {
    provider: process.env['LLM_PROVIDER'] ?? 'anthropic',
    model: process.env['LLM_MODEL'] ?? 'claude-haiku-4-5-20251001',
  },
  port: Number(process.env['PORT'] ?? '3456'),
  refreshInterval: Number(process.env['REFRESH_INTERVAL'] ?? '30'),
  tz: process.env['TZ'] ?? 'Europe/Helsinki',
  memoryPath: process.env['MEMORY_PATH'] ?? 'data/memory.json',
  tunnelHostname: process.env['TUNNEL_HOSTNAME'] as string | undefined,
}
