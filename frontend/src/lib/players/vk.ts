/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Media } from '../types'
import type { PlayerAdapter, PlayerEvent } from './types'

declare global {
  interface Window {
    VK?: any
  }
}

let apiPromise: Promise<any> | null = null

function loadVkApi(): Promise<any> {
  if (window.VK?.VideoPlayer) return Promise.resolve(window.VK)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://vk.ru/js/api/videoplayer.js'
    script.onload = () => (window.VK?.VideoPlayer ? resolve(window.VK) : reject(new Error('Плеер VK не загрузился.')))
    script.onerror = () => {
      apiPromise = null
      reject(new Error('Не удалось загрузить плеер VK (блокировщик рекламы?).'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

/**
 * VK Видео через официальный плеер с JS API (postMessage).
 * Время приходит ~4 раза в секунду — между событиями досчитываем его сами.
 */
export class VkPlayer implements PlayerAdapter {
  readonly canSetRate = false
  private player: any = null
  private iframe: HTMLIFrameElement | null = null
  private listeners: ((e: PlayerEvent) => void)[] = []
  private state = 'uninited'
  private time = 0
  private timeAt = 0
  private duration: number | null = null
  private inAd = false

  onEvent(cb: (e: PlayerEvent) => void): void {
    this.listeners.push(cb)
  }

  private emit(e: PlayerEvent): void {
    this.listeners.forEach((cb) => cb(e))
  }

  private setTime(t: number): void {
    this.time = t
    this.timeAt = performance.now()
  }

  async mount(container: HTMLElement, media: Media): Promise<void> {
    let VK: any
    try {
      VK = await loadVkApi()
    } catch (err) {
      this.emit({ type: 'error', message: (err as Error).message })
      return
    }
    const iframe = document.createElement('iframe')
    const src = new URL(media.url)
    src.searchParams.set('js_api', '1')
    src.searchParams.set('hd', '2')
    iframe.src = src.toString()
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
    iframe.className = 'h-full w-full border-0 bg-black'
    container.appendChild(iframe)
    this.iframe = iframe

    const player = VK.VideoPlayer(iframe)
    this.player = player
    const E = VK.VideoPlayer.Events

    const syncDuration = (d: any) => {
      const dur = Number(d?.duration)
      if (dur > 0 && dur !== this.duration) {
        this.duration = dur
        this.emit({ type: 'duration', duration: dur })
      }
    }

    await new Promise<void>((resolve) => {
      // Плеер не запустился — не закрываем его своей ошибкой: VK мог показать проверку
      // «я не робот» или своё сообщение. Даём их увидеть и нажать, а плеер продолжаем ждать.
      const timeout = window.setTimeout(() => {
        this.emit({
          type: 'warning',
          message:
            'Плеер VK не запустился. Посмотри, что он пишет: если просит подтвердить, что ты не робот, — нажми там «Продолжить». ' +
            'Если пишет, что видео недоступно, — автор запретил показывать его на других сайтах.',
        })
        resolve()
      }, 12000)
      player.on(E.INITED, (d: any) => {
        window.clearTimeout(timeout)
        this.state = 'unstarted'
        syncDuration(d)
        this.emit({ type: 'ready' })
        resolve()
      })
    })

    player.on(E.TIMEUPDATE, (d: any) => {
      if (typeof d?.time === 'number') this.setTime(d.time)
      syncDuration(d)
    })
    player.on(E.SEEKED, (d: any) => typeof d?.time === 'number' && this.setTime(d.time))
    const onPlaying = (d: any) => {
      this.state = 'playing'
      if (typeof d?.time === 'number') this.setTime(d.time)
      syncDuration(d)
      this.emit({ type: 'playing' })
      this.emit({ type: 'ready' })
    }
    player.on(E.STARTED, onPlaying)
    player.on(E.RESUMED, onPlaying)
    player.on(E.PAUSED, (d: any) => {
      this.state = 'paused'
      if (typeof d?.time === 'number') this.setTime(d.time)
      this.emit({ type: 'paused' })
    })
    player.on(E.ENDED, () => {
      this.state = 'ended'
      this.emit({ type: 'ended' })
    })
    player.on(E.ERROR, (d: any) => {
      this.state = 'error'
      this.emit({ type: 'error', message: `Плеер VK не смог воспроизвести видео${d?.errorCode ? ` (код ${d.errorCode})` : ''}.` })
    })
    player.on(E.ADSTARTED, () => {
      this.inAd = true
      this.emit({ type: 'ad' })
    })
    player.on(E.ADCOMPLETED, () => {
      this.inAd = false
      this.emit({ type: 'ready' })
    })
    if (E.AUTOPLAY_SOUND_PROHIBITED) player.on(E.AUTOPLAY_SOUND_PROHIBITED, () => this.emit({ type: 'blocked' }))
  }

  async play(): Promise<boolean> {
    this.player?.play()
    return true
  }

  pause(): void {
    this.player?.pause()
  }

  seek(seconds: number): void {
    const t = Math.max(0, seconds)
    this.setTime(t)
    this.player?.seek(t)
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
    /* VK не умеет менять скорость через API — догоняем через seek */
  }

  setVolume(volume: number): void {
    this.player?.setVolume(Math.min(1, Math.max(0, volume)))
    if (volume > 0) this.player?.unmute()
    else this.player?.mute()
  }

  destroy(): void {
    try {
      this.player?.destroy()
    } catch {
      /* уже уничтожен */
    }
    this.iframe?.remove()
    this.player = null
    this.iframe = null
    this.listeners = []
  }
}
