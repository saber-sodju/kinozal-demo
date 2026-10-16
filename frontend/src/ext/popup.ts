/// <reference types="chrome" />
interface State {
  session: { name: string } | null
  attached: { slug: string } | null
  site: string
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on)
const err = (text = '') => ($('err').textContent = text)

function send<T>(msg: Record<string, unknown>): Promise<T> {
  return chrome.runtime.sendMessage(msg)
}

async function busy<T>(btn: HTMLButtonElement, fn: () => Promise<T>): Promise<T | undefined> {
  btn.disabled = true
  err()
  try {
    return await fn()
  } catch (e) {
    err((e as Error).message)
  } finally {
    btn.disabled = false
  }
}

async function refresh(): Promise<void> {
  const st = await send<State>({ type: 'state' })
  show('login', !st.session)
  show('connect', !!st.session && !st.attached)
  show('attached', !!st.session && !!st.attached)
  if (st.attached) $('roomLink').textContent = `${st.site}/r/${st.attached.slug}`
}

$('loginBtn').addEventListener('click', () =>
  busy($('loginBtn'), async () => {
    const name = $<HTMLInputElement>('name').value.trim()
    if (!name) throw new Error('Напиши имя.')
    await send({ type: 'login', name })
    await refresh()
  }),
)

$('attachBtn').addEventListener('click', () =>
  busy($('attachBtn'), async () => {
    const r = await send<{ ok: boolean; error?: string }>({ type: 'attach', link: $<HTMLInputElement>('link').value })
    if (!r?.ok) throw new Error(r?.error || 'Не получилось подключить вкладку.')
    await refresh()
  }),
)

$('createBtn').addEventListener('click', () =>
  busy($('createBtn'), async () => {
    const r = await send<{ ok: boolean; error?: string; link?: string }>({ type: 'create' })
    if (!r?.ok) throw new Error(r?.error || 'Не получилось создать комнату.')
    if (r.link) await navigator.clipboard.writeText(r.link).catch(() => {})
    await refresh()
  }),
)

$('copyBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('roomLink').textContent || '').catch(() => {})
  $('copyBtn').textContent = 'Скопировано ✓'
  window.setTimeout(() => ($('copyBtn').textContent = 'Скопировать ссылку'), 1500)
})

$('openBtn').addEventListener('click', () => chrome.tabs.create({ url: $('roomLink').textContent || '' }))

$('detachBtn').addEventListener('click', () =>
  busy($('detachBtn'), async () => {
    await send({ type: 'detach' })
    await refresh()
  }),
)

$('name').addEventListener('keydown', (e) => e.key === 'Enter' && $('loginBtn').click())
$('link').addEventListener('keydown', (e) => e.key === 'Enter' && $('attachBtn').click())

void refresh()
