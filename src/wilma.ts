import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { WilmaClient } from '@wilm-ai/wilma-client'
import type { ScheduleEntry } from './memory.js'

function revealPassword(obfuscated: string): string | null {
  try {
    const decoded = Buffer.from(obfuscated, 'base64').toString('utf-8')
    const prefix = 'wilmai::'
    if (!decoded.startsWith(prefix)) return null
    return decoded.slice(prefix.length)
  } catch {
    return null
  }
}

const execAsync = promisify(exec)

export function firstName(fullName: string): string {
  return fullName.split(' ')[0]
}

export interface WilmaMessage {
  wilmaId: number
  subject: string
  sentAt: string
  senderName: string | null
  body?: string
}

export interface WilmaStudentSummary {
  today: string
  tomorrow: string
  todaySchedule: Array<{ date: string; start: string; end: string; subject: string; teacher: string }>
  tomorrowSchedule: Array<{ date: string; start: string; end: string; subject: string; teacher: string }>
  upcomingExams: Array<{ subject: string; date: string; name?: string; topic?: string | null }>
  recentHomework: Array<{ subject: string; subjectCode?: string; homework: string; date: string; teacher?: string }>
  recentNews: Array<{ wilmaId: number; title: string; published: string | null }>
  recentMessages: WilmaMessage[]
}

export interface WilmaStudent {
  student: { studentNumber: string; name: string }
  summary: WilmaStudentSummary
}

interface WilmaOutput {
  generatedAt: string
  students: WilmaStudent[]
  error?: string
}

interface WilmaiProfile {
  id: string
  tenantUrl: string
  tenantName: string
  username: string
  passwordObfuscated: string
  students: Array<{ studentNumber: string; name: string }>
  lastStudentNumber?: string
  lastStudentName?: string
  lastUsedAt?: string
}

interface WilmaiConfig {
  profiles: WilmaiProfile[]
  lastProfileId: string
}


type ScheduleFilter = (lesson: { subject: string }) => boolean

const TENANT_FILTERS: Record<string, ScheduleFilter> = {
  'yvkoulut': (lesson) => lesson.subject !== 'Varattu',
}

function tenantFilter(tenantUrl: string): ScheduleFilter {
  for (const [key, filter] of Object.entries(TENANT_FILTERS)) {
    if (tenantUrl.includes(key)) return filter
  }
  return () => true
}

function wilmaConfigPath(): string {
  const base = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
  return join(base, 'wilmai', 'config.json')
}

function readWilmaConfig(): WilmaiConfig {
  return JSON.parse(readFileSync(wilmaConfigPath(), 'utf8')) as WilmaiConfig
}

function writeTempProfileConfig(profile: WilmaiProfile): string {
  const tmpConfig: WilmaiConfig = { profiles: [profile], lastProfileId: profile.id }
  const slug = profile.id.replace(/[^a-z0-9]/gi, '_')
  const tmpPath = join(tmpdir(), `wilmai-${slug}.json`)
  writeFileSync(tmpPath, JSON.stringify(tmpConfig))
  return tmpPath
}

async function runCli(command: string, configPath: string, retries = 1): Promise<string> {
  try {
    const { stdout } = await execAsync(command, {
      env: { ...process.env, WILMAI_CONFIG_PATH: configPath },
    })
    return stdout
  } catch (err) {
    if (retries > 0 && String(err).includes('403')) {
      return runCli(command, configPath, retries - 1)
    }
    throw err
  }
}

async function fetchMessageBody(
  configPath: string,
  messageId: number,
  studentName: string
): Promise<string | undefined> {
  try {
    const stdout = await runCli(
      `wilma messages read ${messageId} --student "${studentName}" --json`,
      configPath
    )
    const msg = JSON.parse(stdout)
    return msg.content as string
  } catch {
    return undefined
  }
}

async function fetchProfile(
  profile: WilmaiProfile,
  processedMessageIds: number[]
): Promise<WilmaOutput> {
  const configPath = writeTempProfileConfig(profile)
  try {
    const stdout = await runCli('wilma summary --all-students --days 30 --json', configPath)
    const data = JSON.parse(stdout) as WilmaOutput

    for (const student of data.students) {
      for (const msg of student.summary.recentMessages) {
        if (!processedMessageIds.includes(msg.wilmaId)) {
          msg.body = await fetchMessageBody(configPath, msg.wilmaId, student.student.name)
        }
      }
    }

    return data
  } catch (err) {
    console.error(`Wilma fetch failed for ${profile.tenantName}:`, err)
    return { generatedAt: new Date().toISOString(), students: [], error: `${profile.tenantName}: ${String(err)}` }
  }
}

export async function fetchAllStudents(
  processedMessageIds: number[]
): Promise<{ students: WilmaStudent[]; errors: string[] }> {
  const wilmaConfig = readWilmaConfig()
  const results = await Promise.all(
    wilmaConfig.profiles.map(profile => fetchProfile(profile, processedMessageIds))
  )
  const errors = results.filter(r => r.error).map(r => r.error!)
  return { students: results.flatMap(r => r.students), errors }
}

export type SubjectNames = Record<string, string>

export interface ExamDetail {
  subject: string
  date: string
  name: string
  topic: string | null
}

export async function fetchSchedule(): Promise<{
  schedule: Record<string, Record<string, ScheduleEntry[]>>
  subjectNames: SubjectNames
  exams: Record<string, ExamDetail[]>
}> {
  const wilmaConfig = readWilmaConfig()
  const schedule: Record<string, Record<string, ScheduleEntry[]>> = {}
  const subjectNames: SubjectNames = {}
  const exams: Record<string, ExamDetail[]> = {}

  for (const profile of wilmaConfig.profiles) {
    const password = revealPassword(profile.passwordObfuscated)
    if (!password) {
      console.error(`Failed to decrypt credentials for ${profile.tenantName}`)
      continue
    }

    for (const student of profile.students) {
      const name = firstName(student.name)
      if (!schedule[name]) schedule[name] = {}

      try {
        const client = await WilmaClient.login({
          baseUrl: profile.tenantUrl,
          username: profile.username,
          password,
          studentNumber: student.studentNumber,
        })

        const overview = await client.overview.get()

        for (const hw of overview.homework) {
          if (hw.subjectCode && hw.subject) subjectNames[hw.subjectCode] = hw.subject
        }
        for (const grade of overview.grades) {
          if (grade.subjectCode && grade.subject) subjectNames[grade.subjectCode] = grade.subject
        }
        exams[name] = []
        for (const exam of overview.upcomingExams) {
          if (exam.subjectCode && exam.subject) subjectNames[exam.subjectCode] = exam.subject
          exams[name].push({
            subject: exam.subjectCode || exam.subject,
            date: exam.date,
            name: exam.name,
            topic: exam.topic,
          })
        }

        const filter = tenantFilter(profile.tenantUrl)
        for (const lesson of overview.schedule) {
          if (!filter(lesson)) continue
          if (!schedule[name][lesson.date]) schedule[name][lesson.date] = []
          schedule[name][lesson.date].push({
            date: lesson.date,
            start: lesson.start,
            end: lesson.end,
            subject: lesson.subject,
            subjectCode: lesson.subjectCode,
            teacher: lesson.teacher,
            teacherCode: lesson.teacherCode,
          })
        }
      } catch (err) {
        console.error(`Schedule fetch failed for ${name} (${profile.tenantName}):`, err)
      }
    }
  }

  return { schedule, subjectNames, exams }
}
