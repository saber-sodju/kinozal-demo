/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Media } from '../types'
import type { PlayerAdapter, PlayerEvent } from './types'

/**
 * Rutube через встроенный плеер и его postMessage API:
 * команды player:play / player:pause / player:setCurrentTime,
 * события player:ready, player:changeState, player:currentTime, player:durationChange.
 */
export class RutubePlayer implements PlayerAdapter {
  readonly canSetRate = false
  private iframe: HTMLIFrameElement | null = null
  private listeners: ((e: PlayerEvent) => void)[] = []
  private onMessage = (e: MessageEvent) => this.handle(e)
  private state = 'init'
  private time = 0
  private timeAt = 0
  private duration: number | null = null
  private inAd = false
  private ready = false

  onEvent(cb: (e: PlayerEvent) => void): void {
    this.listeners.push(cb)
  }

  private emit(e: PlayerEvent): void {
    this.listeners.forEach((cb) => cb(e))
  }

  private send(type: string, data: Record<string, unknown> = {}): void {
    this.iframe?.contentWindow?.postMessage(JSON.stringify({ type, data }), '*')
  }

  private setTime(t: number): void {
    this.time = t
    this.timeAt = performance.now()
  }

  async mount(container: HTMLElement, media: Media): Promise<void> {
    const iframe = document.createElement('iframe')
    iframe.src = media.url
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
    iframe.className = 'h-full w-full border-0 bg-black'
    this.iframe = iframe
    window.addEventListener('message', this.onMessage)
    container.appendChild(iframe)

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        if (!this.ready) {
          this.emit({
            type: 'warning',
            message: 'Плеер Rutube не запустился. Посмотри, что он пишет: возможно, видео недоступно в твоей стране или удалено.',
          })
        }
        resolve()
      }, 15000)
      const check = window.setInterval(() => {
        if (this.ready) {
          window.clearTimeout(timeout)
          window.clearInterval(check)
          resolve()
        }
      }, 100)
    })
  }

  private handle(e: MessageEvent): void {
    if (!this.iframe || e.source !== this.iframe.contentWindow) return
    let msg: any = e.data
    if (typeof msg === 'string') {
      try {
        msg = JSON.parse(msg)
      } catch {
        return
      }
    }
    const type: string | undefined = msg?.type
    const data = msg?.data ?? {}
    switch (type) {
      case 'player:ready':
        this.ready = true
        this.state = 'ready'
        this.emit({ type: 'ready' })
        break
      case 'player:durationChange':
        if (data.duration > 0) {
          this.duration = data.duration
          this.emit({ type: 'duration', duration: data.duration })
        }
        break
      case 'player:currentTime':
        if (typeof data.time === 'number') this.setTime(data.time)
        break
      case 'player:changeState': {
        const st: string = data.state ?? data.status ?? ''
        if (st === 'advert') {
          if (!this.inAd) {
            this.inAd = true
            this.emit({ type: 'ad' })
          }
          return
        }
        if (this.inAd && st !== 'advert') {
          this.inAd = false
          this.emit({ type: 'ready' })
        }
        if (st === 'playing') {
          this.state = 'playing'
          this.timeAt = performance.now()
          this.emit({ type: 'playing' })
          this.emit({ type: 'ready' })
        } else if (st === 'pause' || st === 'paused' || st === 'stopped') {
          this.state = 'paused'
          this.emit({ type: 'paused' })
        } else if (st === 'ended' || st === 'completed') {
          this.state = 'ended'
          this.emit({ type: 'ended' })
        } else if (st === 'buffering' || st === 'loading') {
          this.emit({ type: 'buffering' })
        }
        break
      }
      case 'player:playComplete':
        this.state = 'ended'
        this.emit({ type: 'ended' })
        break
      case 'player:error':
        this.emit({ type: 'error', message: 'Плеер Rutube не смог воспроизвести видео.' })
        break
    }
  }

  async play(): Promise<boolean> {
    this.send('player:play')
    return true
  }

  pause(): void {
    this.send('player:pause')
  }

  seek(seconds: number): void {
    const t = Math.max(0, seconds)
    this.setTime(t)
    this.send('player:setCurrentTime', { time: t })
  }

  getTime(): number {
    if (this.state === 'playing' && !this.inAd) return this.time + (performance.now() - this.timeAt) / 1000
    return this.time
  }

  getDuration(): number | null {
    return this.duration
  }

  isPlaying(): boolean {
    return this.state === 'playing'
  }

  setRate(): void {
    /* скорость через API не меняется — догоняем через seek */
  }

  setVolume(volume: number): void {
    this.send('player:setVolume', { volume: Math.min(1, Math.max(0, volume)) })
  }

  destroy(): void {
    window.removeEventListener('message', this.onMessage)
    this.iframe?.remove()
    this.iframe = null
    this.listeners = []
  }
}
