/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Media } from '../types'
import type { PlayerAdapter, PlayerEvent } from './types'

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<any> | null = null

function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => {
      apiPromise = null
      reject(new Error('Не удалось загрузить плеер YouTube (блокировщик рекламы?).'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

const ERRORS: Record<number, string> = {
  2: 'Неверная ссылка на YouTube-видео.',
  5: 'Плеер YouTube не смог воспроизвести это видео.',
  100: 'Видео удалено или стало приватным.',
  101: 'Владелец запретил встраивание этого видео.',
  150: 'Владелец запретил встраивание этого видео.',
}

/** YouTube через официальный IFrame Player API. */
export class YouTubePlayer implements PlayerAdapter {
  readonly canSetRate = false
  private player: any = null
  private listeners: ((e: PlayerEvent) => void)[] = []
  private state = -1

  onEvent(cb: (e: PlayerEvent) => void): void {
    this.listeners.push(cb)
  }

  private emit(e: PlayerEvent): void {
    this.listeners.forEach((cb) => cb(e))
  }

  async mount(container: HTMLElement, media: Media): Promise<void> {
    let YT: any
    try {
      YT = await loadYouTubeApi()
    } catch (err) {
      this.emit({ type: 'error', message: (err as Error).message })
      return
    }
    const host = document.createElement('div')
    container.appendChild(host)
    await new Promise<void>((resolve) => {
      this.player = new YT.Player(host, {
        videoId: media.external_id,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,
          disablekb: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          fs: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            const iframe: HTMLIFrameElement = this.player.getIframe()
            iframe.style.width = '100%'
            iframe.style.height = '100%'
            iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture')
            this.emit({ type: 'ready' })
            resolve()
          },
          onStateChange: (e: any) => {
            this.state = e.data
            if (e.data === 1) {
              this.emit({ type: 'playing' })
              this.emit({ type: 'ready' })
              const d = this.getDuration()
              if (d) this.emit({ type: 'duration', duration: d })
            } else if (e.data === 2) this.emit({ type: 'paused' })
            else if (e.data === 3) this.emit({ type: 'buffering' })
            else if (e.data === 0) this.emit({ type: 'ended' })
          },
          onError: (e: any) => {
            this.emit({ type: 'error', message: ERRORS[e.data] ?? 'Ошибка плеера YouTube.' })
            resolve()
          },
        },
      })
    })
  }

  async play(): Promise<boolean> {
    this.player?.playVideo?.()
    return true
  }

  pause(): void {
    this.player?.pauseVideo?.()
  }

  seek(seconds: number): void {
    this.player?.seekTo?.(Math.max(0, seconds), true)
  }

  getTime(): number {
    return this.player?.getCurrentTime?.() ?? 0
  }

  getDuration(): number | null {
    const d = this.player?.getDuration?.()
    return d && d > 0 ? d : null
  }

  isPlaying(): boolean {
    return this.state === 1 || this.state === 3
  }

  setRate(): void {
    /* дискретные скорости — догоняем через seek */
  }

  setVolume(volume: number): void {
    this.player?.setVolume?.(Math.round(volume * 100))
  }

  destroy(): void {
    try {
      this.player?.destroy?.()
    } catch {
      /* уже уничтожен */
    }
    this.player = null
    this.listeners = []
  }
}
