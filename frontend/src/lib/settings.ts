/** Личные настройки зрителя — хранятся только в этом браузере. */
export interface Prefs {
  micDeviceId: string
  pushToTalk: boolean
  duckMovie: boolean
  volume: number
}

const KEY = 'kinozal.prefs'
const DEFAULTS: Prefs = { micDeviceId: '', pushToTalk: false, duckMovie: true, volume: 0.9 }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* без сохранения */
  }
  return next
}

export const PTT_KEY = 'KeyV'
