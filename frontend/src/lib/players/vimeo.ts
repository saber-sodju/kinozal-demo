import type VimeoPlayerType from '@vimeo/player'
import type { Media } from '../types'
import type { PlayerAdapter, PlayerEvent } from './types'

/** Vimeo через официальный Player SDK. Методы SDK асинхронные — время кэшируем из событий. */
export class VimeoPlayer implements PlayerAdapter {
  readonly canSetRate = false
  private player: VimeoPlayerType | null = null
  private listeners: ((e: PlayerEvent) => void)[] = []
  private time = 0
  private duration: number | null = null
  private playing = false

  onEvent(cb: (e: PlayerEvent) => void): void {
    this.listeners.push(cb)
  }

  private emit(e: PlayerEvent): void {
    this.listeners.forEach((cb) => cb(e))
  }

  async mount(container: HTMLElement, media: Media): Promise<void> {
    const { default: Player } = await import('@vimeo/player')
    const host = document.createElement('div')
    host.className = 'h-full w-full [&_iframe]:h-full [&_iframe]:w-full'
    container.appendChild(host)
    const player = new Player(host, {
      id: Number(media.external_id),
      controls: false,
      dnt: true,
      playsinline: true,
      title: false,
      byline: false,
      portrait: false,
    })
    this.player = player
    player.on('timeupdate', (d: { seconds: number; duration: number }) => {
      this.time = d.seconds
      if (!this.duration && d.duration) {
        this.duration = d.duration
        this.emit({ type: 'duration', duration: d.duration })
      }
    })
    player.on('play', () => (this.playing = true))
    player.on('playing', () => {
      this.playing = true
      this.emit({ type: 'playing' })
      this.emit({ type: 'ready' })
    })
    player.on('pause', () => {
      this.playing = false
      this.emit({ type: 'paused' })
    })
    player.on('bufferstart', () => this.emit({ type: 'buffering' }))
    player.on('bufferend', () => this.emit({ type: 'ready' }))
    player.on('seeked', (d: { seconds: number }) => (this.time = d.seconds))
    player.on('ended', () => {
      this.playing = false
      this.emit({ type: 'ended' })
    })
    player.on('error', (e: { message?: string }) => this.emit({ type: 'error', message: e?.message || 'Ошибка плеера Vimeo.' }))
    try {
      await player.ready()
      this.duration = (await player.getDuration()) || null
      if (this.duration) this.emit({ type: 'duration', duration: this.duration })
      this.emit({ type: 'ready' })
    } catch {
      this.emit({ type: 'error', message: 'Видео Vimeo недоступно для встраивания.' })
    }
  }

  async play(): Promise<boolean> {
    if (!this.player) return false
    this.playing = true
    try {
      await this.player.play()
      return true
    } catch (err) {
      this.playing = false
      return !(err instanceof Error && err.name === 'NotAllowedError')
    }
  }

  pause(): void {
    this.playing = false
    this.player?.pause().catch(() => {})
  }

  seek(seconds: number): void {
    this.time = Math.max(0, seconds)
    this.player?.setCurrentTime(this.time).catch(() => {})
  }

  getTime(): number {
    return this.time
  }

  getDuration(): number | null {
    return this.duration
  }

  isPlaying(): boolean {
    return this.playing
  }

  setRate(): void {
    /* скорость доступна не для всех видео — догоняем через seek */
  }

  setVolume(volume: number): void {
    this.player?.setVolume(Math.min(1, Math.max(0, volume))).catch(() => {})
  }

  destroy(): void {
    this.player?.destroy().catch(() => {})
    this.player = null
    this.listeners = []
  }
}
