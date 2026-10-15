import type { Media } from '../types'

export type PlayerEvent =
  | { type: 'ready' }
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'buffering' }
  | { type: 'ended' }
  | { type: 'duration'; duration: number }
  | { type: 'error'; message: string }
  | { type: 'ad' }
  | { type: 'blocked' }
  /** Плеер не готов, но это не конец: пользователь может сам что-то нажать внутри плеера */
  | { type: 'warning'; message: string }

/**
 * Единый интерфейс для всех источников. Синхронизация работает только через него,
 * поэтому новый источник = новый класс, остальной код не меняется.
 */
export interface PlayerAdapter {
  /** Плавная подстройка скорости для догона (у YouTube и Vimeo её нет — там seek). */
  readonly canSetRate: boolean
  mount(container: HTMLElement, media: Media): Promise<void>
  play(): Promise<boolean>
  pause(): void
  seek(seconds: number): void
  getTime(): number
  getDuration(): number | null
  isPlaying(): boolean
  setRate(rate: number): void
  setVolume(volume: number): void
  onEvent(cb: (e: PlayerEvent) => void): void
  destroy(): void
}
