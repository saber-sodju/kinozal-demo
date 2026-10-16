import type { PlayerAdapter, PlayerEvent } from '../lib/players/types'

/** Адаптер для <video>, который уже есть на чужой странице (его не создаём и не удаляем). */
export class ExistingVideoPlayer implements PlayerAdapter {
  readonly canSetRate = true
  readonly video: HTMLVideoElement
  private listeners: ((e: PlayerEvent) => void)[] = []
  private handlers: [string, EventListener][] = []
  private userCb: ((action: 'play' | 'pause' | 'seek', time: number) => void) | null = null
  private lastProgrammatic = 0
  private ourSeekTarget: number | null = null

  constructor(video: HTMLVideoElement) {
    this.video = video
  }

  onEvent(cb: (e: PlayerEvent) => void): void {
    this.listeners.push(cb)
  }

  private emit(e: PlayerEvent): void {
    this.listeners.forEach((cb) => cb(e))
  }

  /** Действия зрителя кнопками самого сайта (не наши команды синхронизации). */
  onUserAction(cb: (action: 'play' | 'pause' | 'seek', time: number) => void): void {
    this.userCb = cb
  }

  private mark(): void {
    this.lastProgrammatic = performance.now()
  }

  private byUser(): boolean {
    return performance.now() - this.lastProgrammatic > 700
  }

  async mount(): Promise<void> {
    const v = this.video
    const on = (type: string, fn: () => void) => {
      v.addEventListener(type, fn)
      this.handlers.push([type, fn])
    }
    on('waiting', () => this.emit({ type: 'buffering' }))
    on('canplay', () => this.emit({ type: 'ready' }))
    on('playing', () => this.emit({ type: 'playing' }))
    on('pause', () => this.emit({ type: 'paused' }))
    on('play', () => this.byUser() && this.userCb?.('play', v.currentTime))
    on('pause', () => this.byUser() && !v.ended && this.userCb?.('pause', v.currentTime))
    // Свою перемотку узнаём по точке, куда перематывали. Ловим её в самом начале (seeking),
    // иначе, пока сайт догружает новое место, коррекция дрейфа успеет вернуть видео назад.
    on('seeking', () => {
      const ours = this.ourSeekTarget !== null && Math.abs(v.currentTime - this.ourSeekTarget) < 1.5
      if (!ours) this.userCb?.('seek', v.currentTime)
    })
    on('seeked', () => {
      this.ourSeekTarget = null
    })
    on('ended', () => this.emit({ type: 'ended' }))
    on('durationchange', () => {
      if (Number.isFinite(v.duration) && v.duration > 0) this.emit({ type: 'duration', duration: v.duration })
    })
    if (v.readyState >= 2) this.emit({ type: 'ready' })
    if (Number.isFinite(v.duration) && v.duration > 0) this.emit({ type: 'duration', duration: v.duration })
  }

  async play(): Promise<boolean> {
    this.mark()
    try {
      await this.video.play()
      return true
    } catch (err) {
      return !(err instanceof DOMException && err.name === 'NotAllowedError')
    }
  }

  pause(): void {
    if (!this.video.paused) this.mark()
    this.video.pause()
  }

  seek(seconds: number): void {
    this.mark()
    this.ourSeekTarget = Math.max(0, seconds)
    this.video.currentTime = Math.max(0, seconds)
  }

  getTime(): number {
    return this.video.currentTime
  }

  getDuration(): number | null {
    const d = this.video.duration
    return Number.isFinite(d) && d > 0 ? d : null
  }

  isPlaying(): boolean {
    return !this.video.paused && !this.video.ended
  }

  setRate(rate: number): void {
    if (this.video.playbackRate !== rate) this.video.playbackRate = rate
  }

  setVolume(): void {
    /* громкость оставляем за сайтом и самим зрителем */
  }

  destroy(): void {
    for (const [type, fn] of this.handlers) this.video.removeEventListener(type, fn)
    this.handlers = []
    this.listeners = []
    this.video.playbackRate = 1
  }
}

/** Самое большое видимое видео на странице (обычно это и есть фильм). */
export function largestVideo(doc: Document = document): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null
  let bestScore = 0
  for (const v of Array.from(doc.querySelectorAll('video'))) {
    const r = v.getBoundingClientRect()
    let score = r.width * r.height
    if (score < 100 * 60) continue
    if (Number.isFinite(v.duration) && v.duration > 120) score *= 2 // длинное видео — скорее фильм, чем реклама
    if (!v.paused) score *= 1.5
    if (score > bestScore) {
      best = v
      bestScore = score
    }
  }
  return best
}
