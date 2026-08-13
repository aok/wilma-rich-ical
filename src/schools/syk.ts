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

    'uÄI': 'Äidinkieli ja kirjallisuus',
    'uMA': 'Matematiikka',
    'uRA1': 'Ranska A1',
    'uVaEA2': 'Englanti A2',
    'uRU': 'Ruotsi B1',
    'uHI': 'Historia',
    'uGE': 'Maantieto',
    'uBI': 'Biologia',
    'uFY': 'Fysiikka',
    'uTT': 'Terveystieto',
    'uET': 'Elämänkatsomustieto',
    'uKU': 'Kuvataide',
    'uMU': 'Musiikki',
    'uKO': 'Kotitalous',
    'uTS': 'Käsityö',
    'uLT': 'Liikunta',
    'uOP': 'Opinto-ohjaus',
  },
}

export default config
