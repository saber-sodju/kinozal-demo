import type { Session } from './types'

const TOKEN_KEY = 'kinozal.token'
const SESSION_KEY = 'kinozal.session'

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* приватный режим — живём без сохранения */
  }
}

let memoryToken: string | null = readStorage(TOKEN_KEY)

export function getToken(): string | null {
  return memoryToken
}

export function storedSession(): Session | null {
  const raw = readStorage(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

function saveSession(token: string | null, session: Session | null): void {
  memoryToken = token
  writeStorage(TOKEN_KEY, token)
  writeStorage(SESSION_KEY, session ? JSON.stringify(session) : null)
  window.dispatchEvent(new Event('kinozal:session'))
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Нет связи с сервером. Проверь интернет.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Что-то пошло не так.'
    throw new ApiError(res.status, detail)
  }
  return data as T
}

/** Проверяет сохранённую сессию на сервере. null — нужно спросить имя. */
export async function verifySession(): Promise<Session | null> {
  if (!getToken()) return null
  try {
    const { session } = await api<{ session: Session }>('/api/sessions/me')
    saveSession(getToken(), session)
    return session
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) saveSession(null, null)
    return null
  }
}

export async function createSession(name: string, color?: string): Promise<Session> {
  const { token, session } = await api<{ token: string; session: Session }>('/api/sessions', {
    body: { name, color },
  })
  saveSession(token, session)
  return session
}

export async function updateSession(name: string, color?: string): Promise<Session> {
  const { session } = await api<{ session: Session }>('/api/sessions/me', { method: 'PATCH', body: { name, color } })
  saveSession(getToken(), session)
  return session
}
