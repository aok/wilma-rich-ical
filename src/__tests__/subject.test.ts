import { describe, it, expect } from 'vitest'
import { subjectKey } from '../subject.js'
import sykConfig from '../schools/syk.js'

describe('subjectKey', () => {
  it('strips the teaching group suffix', () => {
    expect(subjectKey('SA1a7.a')).toBe('SA1')
    expect(subjectKey('uBIy3.b')).toBe('uBI')
    expect(subjectKey('uETy3.ab')).toBe('uET')
  })

  it('strips the grade suffix so a code survives the annual bump', () => {
    expect(subjectKey('ÄIa6')).toBe(subjectKey('ÄIa7'))
    expect(subjectKey('uMAy2')).toBe(subjectKey('uMAy3'))
  })

  it('strips a bare grade number', () => {
    expect(subjectKey('MA6')).toBe('MA')
    expect(subjectKey('MA7')).toBe('MA')
  })

  it('keeps a language level that is part of the subject name', () => {
    expect(subjectKey('SA1a7')).toBe('SA1')
    expect(subjectKey('VaEA2a7')).toBe('VaEA2')
    expect(subjectKey('uRA1y3')).toBe('uRA1')
    expect(subjectKey('uVaEA2y3')).toBe('uVaEA2')
  })

  it('leaves codes without a grade suffix alone', () => {
    expect(subjectKey('uVaTI8MOK.1')).toBe('uVaTI8MOK')
    expect(subjectKey('Varattu')).toBe('Varattu')
  })
})

describe('syk subject map', () => {
  const names = sykConfig.subjectNames!

  it('is keyed on stems, so no key carries a grade marker', () => {
    const withGrade = Object.keys(names).filter(key => /[ay]\d+$/.test(key))
    expect(withGrade).toEqual([])
  })

  it('resolves this year and last year codes to the same name', () => {
    expect(names[subjectKey('ÄIa6')]).toBe('Äidinkieli ja kirjallisuus')
    expect(names[subjectKey('ÄIa7')]).toBe('Äidinkieli ja kirjallisuus')
    expect(names[subjectKey('uMAy2')]).toBe('Matematiikka')
    expect(names[subjectKey('uMAy3')]).toBe('Matematiikka')
  })

  it('covers the codes seen at the start of the 2026 autumn term', () => {
    const seen = [
      'MA7', 'MUa7', 'RUa7', 'SA1a7.a', 'VaEA2a7.a', 'YOa7', 'ÄIa7',
      'uBIy3.b', 'uETy3.ab', 'uKEy3.b', 'uMAy3', 'uMUy3', 'uRA1y3.b', 'uRUy3', 'uVaEA2y3', 'uVaTI8MOK.1', 'uÄIy3',
    ]
    const unmapped = seen.filter(code => !names[subjectKey(code)])
    expect(unmapped).toEqual([])
  })

  it('names the elective MOK course despite its mid-code grade', () => {
    expect(names[subjectKey('uVaTI8MOK.1')]).toBe('Teatteri, MOK')
  })

  it('filters out reserved slots', () => {
    expect(sykConfig.filter!({ subject: 'Varattu' })).toBe(false)
    expect(sykConfig.filter!({ subject: 'Matematiikka' })).toBe(true)
  })
})
