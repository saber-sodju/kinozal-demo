/// <reference types="chrome" />
/**
 * Kinora Sync — скрипт страницы. Работает во всех фреймах; к комнате подключается
 * только фрейм, который выбрал фоновый скрипт (тот, где самое большое видео).
 */
import { RoomClient } from '../lib/roomClient'
import { SyncController } from '../lib/sync'
import type { Playback } from '../lib/types'
import { ExistingVideoPlayer, largestVideo } from './videoAdapter'

interface Attached {
  slug: string
  client: RoomClient
  sync: SyncController
  player: ExistingVideoPlayer
  pill: Pill
  watch: number
  members: number
  playback: Playback | null
  pageUrl: string
}

let current: Attached | null = null

class Pill {
  private host: HTMLDivElement
  private text: HTMLSpanElement
  private dot: HTMLSpanElement

  constructor(onClose: () => void) {
    this.host = document.createElement('div')
    this.host.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;'
    const root = this.host.attachShadow({ mode: 'closed' })
    root.innerHTML = `
      <style>
        .p{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 12px;border-radius:14px;
          background:rgba(10,11,24,.86);backdrop-filter:blur(12px);color:#f3f4fa;font:600 13px/1.2 system-ui,sans-serif;
          border:1px solid rgba(124,155,255,.35);box-shadow:0 10px 30px -10px rgba(61,107,255,.7)}
        .d{width:8px;height:8px;border-radius:50%;background:#4ade9b}
        .b{all:unset;cursor:pointer;color:#a3a7c2;padding:0 4px;font-size:15px}
        .b:hover{color:#fff}
        .k{background:linear-gradient(90deg,#5cc8ff,#7c9bff,#b77bff);-webkit-background-clip:text;color:transparent;font-weight:800}
      </style>
      <div class="p"><span class="d"></span><span class="k">Kinora</span><span class="t"></span><button class="b" title="Отключить">×</button></div>`
    this.text = root.querySelector('.t') as HTMLSpanElement
    this.dot = root.querySelector('.d') as HTMLSpanElement
    ;(root.querySelector('.b') as HTMLButtonElement).onclick = onClose
    ;(document.body || document.documentElement).appendChild(this.host)
  }

  set(text: string, tone: 'ok' | 'warn' | 'err' = 'ok'): void {
    this.text.textContent = text
    this.dot.style.background = tone === 'ok' ? '#4ade9b' : tone === 'warn' ? '#f5b544' : '#ff6b7a'
  }

  remove(): void {
    this.host.remove()
  }
}

function render(): void {
  if (!current) return
  const { sync, client, members } = current
  if (client.status !== 'open') return current.pill.set('· переподключаюсь…', 'warn')
  if (!sync.isUnlocked()) return current.pill.set('· нажми play на видео, чтобы присоединиться', 'warn')
  const status = sync.health === 'catching_up' ? 'догоняем' : 'синхронно'
  current.pill.set(`· ${status} · в комнате ${members}`, sync.health === 'catching_up' ? 'warn' : 'ok')
}

/** Связывает видео сайта с синхронизацией: команды комнаты → видео, кнопки сайта → комната. */
function wire(player: ExistingVideoPlayer, sync: SyncController): void {
  sync.attach(player)
  player.onUserAction((action, time) => {
    if (!sync.isUnlocked()) sync.unlock()
    if (action === 'play') sync.play()
    else if (action === 'pause') sync.pause()
    else sync.seek(time)
  })
  void player.mount()
}

function attachPlayer(video: HTMLVideoElement): void {
  if (!current) return
  current.player.destroy()
  const player = new ExistingVideoPlayer(video)
  current.player = player
  wire(player, current.sync)
}

function detach(): void {
  if (!current) return
  window.clearInterval(current.watch)
  current.player.destroy()
  current.sync.destroy()
  current.client.close()
  current.pill.remove()
  current = null
  chrome.runtime.sendMessage({ type: 'kinora:detached' }).catch(() => {})
}

function attach(msg: { slug: string; token: string; base: string; pageUrl: string; title: string }): { ok: boolean; error?: string } {
  const video = largestVideo()
  if (!video) return { ok: false, error: 'На странице не нашлось видео. Открой фильм и запусти его, потом подключи снова.' }
  detach()

  const client = new RoomClient(msg.slug, { base: msg.base, token: () => msg.token })
  const sync = new SyncController(client)
  const player = new ExistingVideoPlayer(video)
  const pill = new Pill(() => detach())
  const state: Attached = { slug: msg.slug, client, sync, player, pill, watch: 0, members: 1, playback: null, pageUrl: msg.pageUrl }
  current = state

  wire(player, sync)
  // Пользователь сам нажал «Подключить» — разрешаем управлять видео (если браузер не против).
  sync.unlock()

  let claimed = false
  client.on('welcome', (m: { playback: Playback; members: { connected: boolean }[] }) => {
    state.playback = m.playback
    state.members = m.members.filter((x) => x.connected).length
    sync.setState(m.playback)
    // Если в комнате ещё не эта страница — делаем её общим видео (только один раз).
    if (!claimed && (!m.playback.media || m.playback.media.source !== 'external')) {
      claimed = true
      client.send({
        type: 'media.external',
        url: msg.pageUrl,
        title: msg.title,
        duration: Number.isFinite(video.duration) ? video.duration : null,
      })
    }
    render()
  })
  client.on('playback.state', (m: { playback: Playback }) => {
    state.playback = m.playback
    if (m.playback.media && m.playback.media.source !== 'external') {
      pill.set('· в комнате включили другое видео', 'warn')
      return
    }
    sync.setState(m.playback)
  })
  client.on('presence', (m: { members: { connected: boolean }[] }) => {
    state.members = m.members.filter((x) => x.connected).length
    render()
  })
  client.on('status', render)
  client.on('fatal', (reason: string) => {
    pill.set(reason === 'kicked' ? '· тебя удалили из комнаты' : '· комната недоступна', 'err')
  })
  sync.on('health', render)
  sync.on('blocked', render)

  // Сайты часто меняют <video> (реклама, следующая серия) — следим и переключаемся.
  state.watch = window.setInterval(() => {
    if (!current) return
    const best = largestVideo()
    if (best && best !== current.player.video && (!document.contains(current.player.video) || best.duration > 120)) {
      attachPlayer(best)
    }
    render()
  }, 2000)

  client.connect()
  render()
  return { ok: true }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'kinora:attach') {
    sendResponse(attach(msg))
  } else if (msg?.type === 'kinora:detach') {
    detach()
    sendResponse({ ok: true })
  } else if (msg?.type === 'kinora:status') {
    sendResponse(current ? { attached: true, slug: current.slug, members: current.members } : { attached: false })
  }
  return false
})
