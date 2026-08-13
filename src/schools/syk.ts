import type { SchoolConfig } from './index.js'

// Keys are grade-stripped subject stems (see subjectKey): "ÄIa6", "ÄIa7" and
// "ÄIa8.b" all resolve to "ÄI". The "u" prefix marks yläkoulu courses, which
// are named separately because the same stem differs between the two schools.
const config: SchoolConfig = {
  filter: (lesson) => lesson.subject !== 'Varattu',
  subjectNames: {
    'ÄI': 'Äidinkieli ja kirjallisuus',
    'MA': 'Matematiikka',
    'SA1': 'Saksa A1',
    'RA1': 'Ranska A1',
    'VaEA2': 'Englanti A2',
    'RU': 'Ruotsi B1',
    'HY': 'Yhteiskuntaoppi ja historia',
    'YH': 'Yhteiskuntaoppi',
    'YO': 'Ympäristöoppi',
    'ET': 'Elämänkatsomustieto',
    'KU': 'Kuvataide',
    'MU': 'Musiikki',
    'LP': 'Liikunta',
    'KÄS': 'Käsityö',
    'TI': 'Teatteri',

    'uÄI': 'Äidinkieli ja kirjallisuus',
    'uMA': 'Matematiikka',
    'uRA1': 'Ranska A1',
    'uVaEA2': 'Englanti A2',
    'uRU': 'Ruotsi B1',
    'uHI': 'Historia',
    'uGE': 'Maantieto',
    'uBI': 'Biologia',
    'uFY': 'Fysiikka',
    'uKE': 'Kemia',
    'uTT': 'Terveystieto',
    'uET': 'Elämänkatsomustieto',
    'uKU': 'Kuvataide',
    'uMU': 'Musiikki',
    'uKO': 'Kotitalous',
    'uTS': 'Käsityö',
    'uLT': 'Liikunta',
    'uOP': 'Opinto-ohjaus',

    // "Va" marks a valinnainen. The A2 languages above are keyed as stems
    // because they run for years, but one-off electives are keyed on the full
    // grade-bearing code on purpose: the offering changes annually, so a new
    // code means a different course and should not inherit an old name.
    // These match via the base-code lookup in displayName, not the stem.
    'uVaTI8MOK': 'Teatteri, MOK',
    'uVaHI8': 'Historiaa luonnossa',
    // Wilma's own placeholder — the school is expected to give this course a
    // real name later, at which point this entry needs replacing, not removing.
    'VaVAa7': 'Valinnainen kurssi',
  },
}

export default config
