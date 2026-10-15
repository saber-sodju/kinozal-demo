import { Emitter } from './emitter'
import type { PlayerAdapter, PlayerEvent } from './players'
import type { RoomClient } from './roomClient'
import type { Playback } from './types'

const TICK_MS = 400
const SOFT_DRIFT = 0.35 // с: подстраиваем скорость
const SETTLED = 0.12 // с: считаем синхронными
const HARD_DRIFT = 2 // с: прыгаем seek-ом (для HTML5)
const HARD_DRIFT_NO_RATE = 1 // с: для YouTube/Vimeo, где нет плавной скорости
const STUCK_MS = 4000 // плеер «не играет», хотя должен — вероятно, реклама/загрузка

export type SyncHealth = 'synced' | 'catching_up' | 'loading'

/**
 * Связывает плеер с серверным состоянием: применяет команды, корректирует дрейф,
 * отправляет свои команды и отчёты о буферизации.
 */
export class SyncController extends Emitter {
  private client: RoomClient
  private player: PlayerAdapter | null = null
  private state: Playback | null = null
  private timer = 0
  private unlocked = false
  private playerReady = false
  private reportedStatus = ''
  private reportedDuration = false
  private notPlayingSince = 0
  private lastSeekAt = 0
  private lastLocalCmd = 0
  /** После новой команды или входа — подгоняем точно (seek), а не плавно. */
  private snapPending = true
  health: SyncHealth = 'loading'

  constructor(client: RoomClient) {
    super()
    this.client = client
    this.timer = window.setInterval(() => this.tick(), TICK_MS)
  }

  destroy(): void {
    window.clearInterval(this.timer)
    this.player = null
  }

  /** Пользователь кликнул по странице — браузер разрешит звук. */
  unlock(): void {
    this.unlocked = true
    this.snapPending = true
    this.tick()
  }

  isUnlocked(): boolean {
    return this.unlocked
  }

  attach(player: PlayerAdapter | null): void {
    this.player = player
    this.playerReady = false
    this.reportedStatus = ''
    this.reportedDuration = false
    this.notPlayingSince = 0
    this.snapPending = true
    if (player) player.onEvent((e) => this.onPlayerEvent(e))
  }

  setState(state: Playback): void {
    const mediaChanged = this.state?.media?.url !== state.media?.url
    if (state.version !== this.state?.version) this.snapPending = true
    this.state = state
    if (mediaChanged) this.reportedDuration = false
    this.tick()
  }

  getState(): Playback | null {
    return this.state
  }

  /** Где «должно» быть видео сейчас по часам сервера. */
  expectedPosition(): number {
    const s = this.state
    if (!s) return 0
    if (s.status !== 'playing') return s.position
    return s.position + ((this.client.serverNow() - s.ref_time) / 1000) * s.rate
  }

  // ---------- команды пользователя ----------

  private command(action: 'play' | 'pause' | 'seek', position: number): void {
    const s = this.state
    if (!s?.media) return
    // Оптимистично применяем у себя, сервер пришлёт подтверждение.
    this.state = {
      ...s,
      status: action === 'play' ? 'playing' : action === 'pause' ? 'paused' : s.status,
      position,
      ref_time: this.client.serverNow(),
    }
    this.lastLocalCmd = Date.now()
    this.snapPending = true
    this.client.send({ type: 'playback.cmd', action, position, base_version: s.version })
    this.tick()
    this.emit('local')
  }

  play(): void {
    this.command('play', this.currentTime())
  }

  pause(): void {
    this.command('pause', this.currentTime())
  }

  toggle(): void {
    if (this.state?.status === 'playing') this.pause()
    else this.play()
  }

  seek(seconds: number): void {
    const d = this.duration()
    this.command('seek', Math.max(0, d ? Math.min(seconds, d - 0.5) : seconds))
  }

  seekBy(delta: number): void {
    this.seek(this.currentTime() + delta)
  }

  currentTime(): number {
    // Сразу после своей команды плеер ещё не успел прыгнуть — верим состоянию.
    if (this.player && this.playerReady && Date.now() - this.lastLocalCmd > 1500) return this.player.getTime()
    return Math.max(0, this.expectedPosition())
  }

  duration(): number | null {
    return this.player?.getDuration() ?? this.state?.media?.duration_s ?? null
  }

  // ---------- отчёты и события плеера ----------

  private report(status: string, extra: Record<string, unknown> = {}): void {
    if (status === this.reportedStatus && !extra.force) return
    this.reportedStatus = status
    this.client.send({ type: 'playback.report', status, version: this.state?.version, ...extra })
  }

  private onPlayerEvent(e: PlayerEvent): void {
    switch (e.type) {
      case 'ready':
        this.playerReady = true
        this.report('ready')
        this.tick()
        break
      case 'playing':
        this.notPlayingSince = 0
        this.report('ready')
        break
      case 'buffering':
        if (this.state?.status === 'playing') this.report('buffering')
        break
      case 'ended':
        this.report('ended', { force: true })
        break
      case 'duration':
        if (!this.reportedDuration) {
          this.reportedDuration = true
          this.client.send({
            type: 'playback.report',
            status: this.reportedStatus || 'ready',
            duration: e.duration,
            version: this.state?.version,
          })
        }
        this.emit('duration', e.duration)
        break
      case 'error':
        this.report('error')
        this.emit('error', e.message)
        break
      case 'ad':
        this.report('ad')
        break
      case 'blocked':
        this.unlocked = false
        this.emit('blocked')
        break
    }
  }

  // ---------- коррекция дрейфа ----------

  private setHealth(h: SyncHealth): void {
    if (h !== this.health) {
      this.health = h
      this.emit('health', h)
    }
  }

  private tick(): void {
    const p = this.player
    const s = this.state
    if (!p || !s?.media || !this.playerReady) {
      this.setHealth('loading')
      return
    }
    const expected = this.expectedPosition()
    const duration = this.duration()

    if (s.status !== 'playing' || !this.unlocked) {
      if (p.isPlaying()) p.pause()
      p.setRate(1)
      // Пока зритель не нажал «присоединиться», плеер просто ждёт — догоним после клика.
      const off = Math.abs(p.getTime() - s.position)
      if (s.status === 'paused' && off > (this.snapPending ? 0.08 : 0.5) && Date.now() - this.lastSeekAt > 800) {
        p.seek(s.position)
        this.lastSeekAt = Date.now()
      } else if (s.status === 'paused' && off <= 0.08) {
        this.snapPending = false
      }
      this.setHealth('synced')
      return
    }

    // Старт назначен чуть в будущем — ждём на нуле.
    if (expected < 0) {
      if (p.isPlaying()) p.pause()
      if (p.getTime() > 0.5) p.seek(0)
      this.setHealth('synced')
      return
    }

    if (duration && expected >= duration - 0.25) {
      this.setHealth('synced')
      return
    }

    if (!p.isPlaying()) {
      void p.play().then((ok) => {
        if (!ok) {
          this.unlocked = false
          this.emit('blocked')
        }
      })
      if (!this.notPlayingSince) this.notPlayingSince = Date.now()
      if (Date.now() - this.notPlayingSince > STUCK_MS) this.report('buffering')
    } else {
      this.notPlayingSince = 0
      if (this.reportedStatus === 'buffering') this.report('ready')
    }

    const drift = p.getTime() - expected
    const abs = Math.abs(drift)
    const hard = this.snapPending ? SOFT_DRIFT : p.canSetRate ? HARD_DRIFT : HARD_DRIFT_NO_RATE
    if (this.snapPending && abs <= SOFT_DRIFT && p.isPlaying()) this.snapPending = false

    if (abs > hard) {
      if (Date.now() - this.lastSeekAt > 1500) {
        p.setRate(1)
        p.seek(expected)
        this.lastSeekAt = Date.now()
        // Один точный прыжок на команду; остаток (время загрузки после seek) добираем скоростью.
        this.snapPending = false
      }
      this.setHealth('catching_up')
    } else if (p.canSetRate && abs > SOFT_DRIFT) {
      const step = abs > 0.6 ? 0.1 : 0.05
      p.setRate(drift > 0 ? 1 - step : 1 + step)
      this.setHealth('catching_up')
    } else if (abs < SETTLED || !p.canSetRate) {
      p.setRate(1)
      this.setHealth('synced')
    }
  }
}
