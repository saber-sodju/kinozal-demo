/// <reference types="chrome" />
/**
 * Kinora Sync — фоновый скрипт: вход (гостевая сессия), создание комнаты
 * и выбор фрейма вкладки, где лежит видео.
 */
declare const __SITE__: string
const SITE = __SITE__

interface Session {
  id: string
  name: string
  color: string
}

async function stored(): Promise<{ token?: string; session?: Session }> {
  return chrome.storage.local.get(['token', 'session'])
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { token } = await stored()
  const res = await fetch(SITE + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Сервер Kinora не ответил.')
  return data as T
}

async function currentSession(): Promise<Session | null> {
  const { token } = await stored()
  if (!token) return null
  try {
    const { session } = await api<{ session: Session }>('/api/sessions/me')
    await chrome.storage.local.set({ session })
    return session
  } catch {
    await chrome.storage.local.remove(['token', 'session'])
    return null
  }
}

function slugFrom(link: string): string | null {
  const m = link.trim().match(/\/r\/([A-Za-z0-9]{6,20})/) || link.trim().match(/^([A-Za-z0-9]{6,20})$/)
  return m ? m[1] : null
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('Не нашёл активную вкладку.')
  return tab
}

/** Находит фрейм с самым большим видео (часто плеер сидит во вложенном фрейме). */
async function bestFrame(tabId: number): Promise<number | null> {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      let best = 0
      for (const v of Array.from(document.querySelectorAll('video'))) {
        const r = v.getBoundingClientRect()
        let a = r.width * r.height
        if (Number.isFinite(v.duration) && v.duration > 120) a *= 2
        if (!v.paused) a *= 1.5
        best = Math.max(best, a)
      }
      return best
    },
  })
  let frameId: number | null = null
  let best = 0
  for (const r of results) {
    if (typeof r.result === 'number' && r.result > best) {
      best = r.result
      frameId = r.frameId
    }
  }
  return best > 6000 ? frameId : null
}

async function attach(tab: chrome.tabs.Tab, slug: string): Promise<{ ok: boolean; error?: string }> {
  const { token } = await stored()
  if (!token) return { ok: false, error: 'Сначала представься.' }
  const frameId = await bestFrame(tab.id!)
  if (frameId === null) return { ok: false, error: 'На странице не нашлось видео. Открой фильм, запусти его и подключи снова.' }
  const res = await chrome.tabs.sendMessage(
    tab.id!,
    { type: 'kinora:attach', slug, token, base: SITE, pageUrl: tab.url, title: tab.title },
    { frameId },
  )
  if (res?.ok) {
    await chrome.storage.session.set({ [`tab:${tab.id}`]: { slug, frameId } })
  }
  return res ?? { ok: false, error: 'Страница не ответила. Обнови её (F5) и попробуй снова.' }
}

async function handle(msg: { type: string; [k: string]: unknown }): Promise<unknown> {
  switch (msg.type) {
    case 'state': {
      const session = await currentSession()
      const tab = await activeTab().catch(() => null)
      const key = tab ? `tab:${tab.id}` : ''
      const attached = key ? (await chrome.storage.session.get(key))[key] ?? null : null
      return { session, attached, site: SITE, tabTitle: tab?.title ?? '' }
    }
    case 'login': {
      const { token, session } = await api<{ token: string; session: Session }>('/api/sessions', {
        body: { name: String(msg.name).slice(0, 32) },
      })
      await chrome.storage.local.set({ token, session })
      return { session }
    }
    case 'attach': {
      const slug = slugFrom(String(msg.link ?? ''))
      if (!slug) return { ok: false, error: 'Вставь ссылку на комнату Kinora (…/r/…).' }
      return attach(await activeTab(), slug)
    }
    case 'create': {
      const tab = await activeTab()
      const { slug } = await api<{ slug: string }>('/api/rooms', { body: { name: (tab.title || 'Kinora').slice(0, 60) } })
      const res = await attach(tab, slug)
      return { ...res, slug, link: `${SITE}/r/${slug}` }
    }
    case 'detach': {
      const tab = await activeTab()
      const key = `tab:${tab.id}`
      const saved = (await chrome.storage.session.get(key))[key]
      if (saved) await chrome.tabs.sendMessage(tab.id!, { type: 'kinora:detach' }, { frameId: saved.frameId }).catch(() => {})
      await chrome.storage.session.remove(key)
      return { ok: true }
    }
    case 'kinora:detached':
      return { ok: true }
  }
  return null
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'kinora:detached' && sender.tab?.id) {
    void chrome.storage.session.remove(`tab:${sender.tab.id}`)
    return false
  }
  handle(msg)
    .then(sendResponse)
    .catch((err: Error) => sendResponse({ ok: false, error: err.message }))
  return true // ответ асинхронный
})

// Вкладку закрыли или ушли на другую страницу — забываем подключение.
chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(`tab:${tabId}`))
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) void chrome.storage.session.remove(`tab:${tabId}`)
})
