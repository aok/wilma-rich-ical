import type { SchoolConfig } from './index.js'

const config: SchoolConfig = {
  filter: (lesson) => lesson.subject !== 'Varattu',
  subjectNames: {
    'ÄIa6': 'Äidinkieli ja kirjallisuus',
    'MA6': 'Matematiikka',
    'SA1a6': 'Saksa A1',
    'VaEA2a6': 'Englanti A2',
    'HYa6': 'Yhteiskuntaoppi ja historia',
    'YHa6': 'Yhteiskuntaoppi',
    'YOa6': 'Ympäristöoppi',
    'ETa6': 'Elämänkatsomustieto',
    'KUa6': 'Kuvataide',
    'MUa6': 'Musiikki',
    'LPa6': 'Liikunta',
    'KÄSa6': 'Käsityö',

    'uÄIy2': 'Äidinkieli ja kirjallisuus',
    'uMAy2': 'Matematiikka',
    'uRA1y2': 'Ranska A1',
    'uVaEA2y2': 'Englanti A2',
    'uRUy2': 'Ruotsi B1',
    'uHIy2': 'Historia',
    'uGEy2': 'Maantieto',
    'uBIy2': 'Biologia',
    'uFYy2': 'Fysiikka',
    'uTTy2': 'Terveystieto',
    'uETy2': 'Elämänkatsomustieto',
    'uKUy2': 'Kuvataide',
    'uKOy2': 'Kotitalous',
    'uTSy2': 'Käsityö',
    'uLTy2': 'Liikunta',
    'uOPy2': 'Opinto-ohjaus',
  },
}

export default config
