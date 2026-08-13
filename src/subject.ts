// Wilma subject codes carry the grade and the teaching group: "ÄIa7.a" is
// äidinkieli, 7th grade, group a. Stripping both leaves a stable key that
// survives the annual grade bump, so school subject maps only list stems.
//
// SYK marks the grade as "a<n>" (alakoulu) or "y<n>" (yläkoulu), except for
// maths, which is plain "MA<n>". The bare form is only tried when there is no
// marked one, because trailing digits are otherwise part of the subject name
// itself — "SA1a7" is Saksa A1, not Saksa grade 1. That makes the result a
// stem rather than a fixed point: apply this to raw Wilma codes, not to a
// stem it already returned.
export function subjectKey(code: string): string {
  const base = code.replace(/\..+$/, '')
  const marked = base.replace(/[ay]\d+$/, '')
  return marked === base ? base.replace(/\d+$/, '') : marked
}
