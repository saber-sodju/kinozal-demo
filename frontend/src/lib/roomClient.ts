import { getToken } from './api'
import { Emitter } from './emitter'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export type FatalReason = 'session' | 'kicked' | 'not_found' | 'replaced'

const FATAL_CODES: Record<number, FatalReason> = {
  4000: 'replaced',
  4001: 'session',
  4003: 'kicked',
  4004: 'not_found',
}

/**
 * WebSocket-клиент комнаты: переподключение с паузами 1→2→4→…15 с
 * и оценка разницы часов с сервером (как NTP: берём замер с наименьшим RTT).
 */
export class RoomClient extends Emitter {
  status: ConnectionStatus = 'connecting'
  private ws: WebSocket | null = null
  private slug: string
  private attempt = 0
  private stopped = false
  private reconnectTimer = 0
  private pingTimer = 0
  private samples: { offset: number; rtt: number }[] = []
  private clockOffset = 0
  lastMessageId = 0

  constructor(slug: string) {
    super()
    this.slug = slug
  }

  connect(): void {
    this.stopped = false
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const params = new URLSearchParams({ token: getToken() ?? '', last_msg_id: String(this.lastMessageId) })
    const ws = new WebSocket(`${proto}://${location.host}/ws/rooms/${this.slug}?${params}`)
    this.ws = ws
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')

    ws.onopen = () => {
      this.attempt = 0
      this.setStatus('open')
      this.startClockSync()
    }
    ws.onmessage = (ev) => {
      let msg: { type: string; [k: string]: unknown }
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.type === 'pong') return this.onPong(msg as unknown as { t0: number; server_time: number })
      if (msg.type === 'welcome' || msg.type === 'playback.state') {
        // Первая грубая оценка часов, пока нет точных замеров.
        if (this.samples.length === 0) this.clockOffset = (msg.server_time as number) - Date.now()
      }
      if (msg.type === 'chat.message') {
        const id = (msg.message as { id: number }).id
        if (id > this.lastMessageId) this.lastMessageId = id
      }
      if (msg.type === 'welcome') {
        const msgs = msg.messages as { id: number }[]
        if (msgs.length) this.lastMessageId = Math.max(this.lastMessageId, msgs[msgs.length - 1].id)
      }
      this.emit(msg.type, msg)
    }
    ws.onclose = (ev) => {
      window.clearInterval(this.pingTimer)
      if (this.ws !== ws) return
      this.ws = null
      const fatal = FATAL_CODES[ev.code]
      if (fatal) {
        this.stopped = true
        this.setStatus('closed')
        this.emit('fatal', fatal)
        return
      }
      if (this.stopped) return
      this.attempt += 1
      const delay = Math.min(15000, 1000 * 2 ** (this.attempt - 1))
      this.setStatus('reconnecting')
      this.reconnectTimer = window.setTimeout(() => this.connect(), delay)
    }
  }

  close(): void {
    this.stopped = true
    window.clearTimeout(this.reconnectTimer)
    window.clearInterval(this.pingTimer)
    this.ws?.close(1000)
    this.ws = null
  }

  send(msg: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(msg))
    return true
  }

  /** Текущее время сервера в мс. */
  serverNow(): number {
    return Date.now() + this.clockOffset
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s
    this.emit('status', s)
  }

  private startClockSync(): void {
    this.samples = []
    let burst = 0
    const ping = () => this.send({ type: 'ping', t0: Date.now() })
    ping()
    window.clearInterval(this.pingTimer)
    this.pingTimer = window.setInterval(() => {
      burst += 1
      ping()
      if (burst === 5) {
        window.clearInterval(this.pingTimer)
        this.pingTimer = window.setInterval(ping, 20000)
      }
    }, 200)
  }

  private onPong(msg: { t0: number; server_time: number }): void {
    const t1 = Date.now()
    const rtt = t1 - msg.t0
    const offset = msg.server_time + rtt / 2 - t1
    this.samples.push({ offset, rtt })
    if (this.samples.length > 12) this.samples.shift()
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a))
    this.clockOffset = best.offset
    this.emit('latency', Math.round(best.rtt))
  }
}
