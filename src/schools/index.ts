export interface SchoolConfig {
  subjectNames?: Record<string, string>
  filter?: (lesson: { subject: string }) => boolean
}

import syk from './syk.js'

const schools: Record<string, SchoolConfig> = { syk }

export function getSchoolConfig(id: string | undefined): SchoolConfig {
  if (!id) return {}
  return schools[id.toLowerCase()] ?? {}
}
