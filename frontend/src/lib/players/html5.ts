import type Hls from 'hls.js'
import { api } from '../api'
import type { Media } from '../types'
import type { PlayerAdapter, PlayerEvent } from './types'

/** Прямые файлы (Internet Archive, .mp4/.webm, HLS) через обычный <video>. */
export class Html5Player implements PlayerAdapter {
  readonly canSetRate = true
  private video: HTMLVideoElement | null = null
  private hls: Hls | null = null
  private listeners: ((e: PlayerEvent) => void)[] = []
  private refreshed = false

  onEvent(cb: (e: PlayerEvent) => void): void {
    this.listeners.push(cb)
  }

  private emit(e: PlayerEvent): void {
    this.listeners.forEach((cb) => cb(e))
  }

  async mount(container: HTMLElement, media: Media): Promise<void> {
    const video = document.createElement('video')
    video.playsInline = true
    video.preload = 'auto'
    video.className = 'h-full w-full bg-black object-contain'
    if (media.poster_url) video.poster = media.poster_url
    container.appendChild(video)
    this.video = video

    video.addEventListener('waiting', () => this.emit({ type: 'buffering' }))
    video.addEventListener('stalled', () => this.emit({ type: 'buffering' }))
    video.addEventListener('canplay', () => this.emit({ type: 'ready' }))
    video.addEventListener('playing', () => this.emit({ type: 'playing' }))
    video.addEventListener('pause', () => this.emit({ type: 'paused' }))
    video.addEventListener('ended', () => this.emit({ type: 'ended' }))
    video.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(video.duration)) this.emit({ type: 'duration', duration: video.duration })
    })
    video.addEventListener('error', () => {
      // Ссылки Telegram временные: при ошибке один раз берём свежую и продолжаем с того же места.
      if (media.source === 'telegram' && media.page_url && !this.refreshed) {
        this.refreshed = true
        void this.refresh(media.page_url)
        return
      }
      const code = video.error?.code
      this.emit({
        type: 'error',
        message:
          code === 4
            ? 'Браузер не может проиграть этот файл (формат или доступ запрещён источником).'
            : 'Не удалось загрузить видео с источника.',
      })
    })

    const isHls = /\.m3u8($|\?)/i.test(media.url)
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
      const { default: HlsCtor } = await import('hls.js')
      if (!HlsCtor.isSupported()) {
        this.emit({ type: 'error', message: 'Этот браузер не поддерживает HLS-потоки.' })
        return
      }
      const hls = new HlsCtor()
      hls.on(HlsCtor.Events.ERROR, (_e, data) => {
        if (data.fatal) this.emit({ type: 'error', message: 'Поток недоступен (источник не разрешает воспроизведение на других сайтах?).' })
      })
      hls.loadSource(media.url)
      hls.attachMedia(video)
      this.hls = hls
    } else {
      video.src = media.url
    }
  }

  private async refresh(pageUrl: string): Promise<void> {
    const video = this.video
    if (!video) return
    const at = video.currentTime
    try {
      const r = await api<{ ok: boolean; media?: Media; reason?: string }>('/api/media/resolve', { body: { url: pageUrl } })
      if (!r.ok || !r.media || this.video !== video) throw new Error(r.reason)
      video.src = r.media.url
      video.currentTime = at
    } catch (err) {
      this.emit({ type: 'error', message: (err as Error).message || 'Не удалось обновить ссылку на видео Telegram.' })
    }
  }

  async play(): Promise<boolean> {
    if (!this.video) return false
    try {
      await this.video.play()
      return true
    } catch (err) {
      return !(err instanceof DOMException && err.name === 'NotAllowedError')
    }
  }

  pause(): void {
    this.video?.pause()
  }

  seek(seconds: number): void {
    if (this.video) this.video.currentTime = Math.max(0, seconds)
  }

  getTime(): number {
    return this.video?.currentTime ?? 0
  }

  getDuration(): number | null {
    const d = this.video?.duration
    return d && Number.isFinite(d) ? d : null
  }

  isPlaying(): boolean {
    const v = this.video
    return !!v && !v.paused && !v.ended
  }

  setRate(rate: number): void {
    if (this.video && this.video.playbackRate !== rate) this.video.playbackRate = rate
  }

  setVolume(volume: number): void {
    if (this.video) this.video.volume = Math.min(1, Math.max(0, volume))
  }

  destroy(): void {
    this.hls?.destroy()
    if (this.video) {
      this.video.pause()
      this.video.removeAttribute('src')
      this.video.load()
      this.video.remove()
    }
    this.video = null
    this.listeners = []
  }
}
