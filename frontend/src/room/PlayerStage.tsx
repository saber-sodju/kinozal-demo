import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertIcon,
  BackIcon,
  ExpandIcon,
  FilmIcon,
  ForwardIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  TheaterIcon,
  VolumeIcon,
  VolumeOffIcon,
} from '../components/Icons'
import { IconButton, Spinner } from '../components/ui'
import { formatTime } from '../lib/format'
import { createPlayer, type PlayerAdapter } from '../lib/players'
import type { SyncController, SyncHealth } from '../lib/sync'
import type { ChatMessage, Media, Playback } from '../lib/types'
import type { FloatingReaction } from './useRoom'

interface Props {
  sync: SyncController | null
  playback: Playback | null
  canControl: boolean
  hasQueue: boolean
  health: SyncHealth
  volume: number
  movieMuted: boolean
  ducked: boolean
  floating: FloatingReaction[]
  locked: boolean
  theater: boolean
  overlayMessages: ChatMessage[]
  onUnlock: () => void
  onVolume: (v: number) => void
  onToggleMute: () => void
  onTheater: () => void
  onPickMedia: () => void
  onNext: () => void
  stageRef: React.RefObject<HTMLDivElement | null>
  isFullscreen: boolean
  onFullscreen: () => void
  bottomSlot?: ReactNode
}

function mediaKey(m: Media | null | undefined): string {
  return m ? `${m.source}|${m.external_id}|${m.url}` : ''
}

export function PlayerStage(props: Props) {
  const { sync, playback, canControl, health, locked } = props
  const media = playback?.media ?? null
  const key = mediaKey(media)
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<PlayerAdapter | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [idle, setIdle] = useState(false)
  const idleTimer = useRef(0)

  // Монтируем адаптер плеера при смене видео.
  useEffect(() => {
    const host = hostRef.current
    if (!sync || !host || !media) return
    setReady(false)
    setError('')
    setDuration(media.duration_s ?? null)
    const player = createPlayer(media.source)
    playerRef.current = player
    player.onEvent((e) => {
      if (e.type === 'ready') setReady(true)
      if (e.type === 'duration') setDuration(e.duration)
      if (e.type === 'error') setError(e.message)
    })
    sync.attach(player)
    void player.mount(host, media)
    return () => {
      sync.attach(null)
      player.destroy()
      playerRef.current = null
      host.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, key])

  // Громкость фильма (с приглушением во время речи).
  const effectiveVolume = props.movieMuted ? 0 : props.volume * (props.ducked ? 0.3 : 1)
  useEffect(() => {
    if (ready) playerRef.current?.setVolume(effectiveVolume)
  }, [effectiveVolume, ready])

  // Таймлайн.
  useEffect(() => {
    if (!sync) return
    const t = window.setInterval(() => {
      setTime(sync.currentTime())
      const d = sync.duration()
      if (d) setDuration(d)
    }, 250)
    return () => window.clearInterval(t)
  }, [sync])

  const playing = playback?.status === 'playing'
  const showControls = !idle || !playing

  function poke() {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 2800)
  }

  function commitSeek() {
    if (drag !== null) sync?.seek(drag)
    setDrag(null)
  }

  const shownTime = drag ?? time
  const fill = duration ? Math.min(100, (shownTime / duration) * 100) : 0

  return (
    <div
      ref={props.stageRef}
      onMouseMove={poke}
      onTouchStart={poke}
      className={`group/stage relative w-full overflow-hidden bg-black ${props.isFullscreen ? 'h-full' : 'aspect-video'} ${!showControls ? 'cursor-none' : ''}`}
    >
      <div ref={hostRef} className="absolute inset-0 [&>*]:h-full [&>*]:w-full" />

      {/* Перехват кликов: управление идёт через синхронизацию, а не напрямую в плеер. */}
      {media && !error && (
        <button
          className="absolute inset-0 z-10 cursor-default"
          aria-label={playing ? 'Пауза' : 'Смотреть'}
          onClick={() => canControl && sync?.toggle()}
          onDoubleClick={props.onFullscreen}
          tabIndex={-1}
        />
      )}

      {/* Плавающие реакции */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
        {props.floating.map((r) => (
          <span
            key={r.id}
            className="reaction-float absolute bottom-16 flex flex-col items-center"
            style={{ left: `${r.x}%`, ['--drift' as string]: `${(r.x % 7) * 6 - 18}px` }}
          >
            <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
            <span className="mt-0.5 rounded bg-black/50 px-1.5 text-[10px] text-white/80">{r.name}</span>
          </span>
        ))}
      </div>

      {/* Пустое состояние */}
      {!media && (
        <div className="film-grain absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <FilmIcon size={44} className="text-accent/70" />
          <p className="font-display text-2xl font-bold">Что смотрим?</p>
          <p className="max-w-sm text-sm text-muted">{canControl ? 'Выбери фильм из каталога или вставь ссылку.' : 'Ведущий скоро что-нибудь включит.'}</p>
          {canControl && (
            <button onClick={props.onPickMedia} className="mt-1 h-11 rounded-xl bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-strong">
              Выбрать видео
            </button>
          )}
        </div>
      )}

      {/* Ошибка источника */}
      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
          <AlertIcon size={36} className="text-danger" />
          <p className="max-w-md font-semibold">{error}</p>
          {canControl && (
            <button onClick={props.onPickMedia} className="mt-2 h-10 rounded-xl bg-surface-3 px-4 text-sm font-semibold hover:bg-white/15">
              Выбрать другое видео
            </button>
          )}
        </div>
      )}

      {/* Загрузка */}
      {media && !ready && !error && !locked && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <Spinner size={36} />
        </div>
      )}

      {/* Ждём всех */}
      {playback?.waiting && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm backdrop-blur">
          Ждём, пока все загрузятся…
        </div>
      )}

      {/* Индикатор синхронизации */}
      {media && ready && !locked && (
        <div className={`pointer-events-none absolute right-3 top-3 z-30 rounded-lg bg-black/55 px-2.5 py-1 text-xs backdrop-blur transition-opacity ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          {health === 'catching_up' ? <span className="text-accent">● догоняем</span> : <span className="text-ok">● синхронно</span>}
        </div>
      )}

      {/* Большая кнопка на паузе */}
      {media && ready && !playing && !locked && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
            <PlayIcon size={34} className="ml-1" />
          </span>
        </div>
      )}

      {/* Чат поверх видео в полноэкранном режиме */}
      {props.isFullscreen && props.overlayMessages.length > 0 && (
        <div className="pointer-events-none absolute bottom-24 left-4 z-30 flex max-w-sm flex-col gap-1.5">
          {props.overlayMessages.map((m) => (
            <div key={m.id} className="fade-in rounded-lg bg-black/65 px-3 py-1.5 text-sm backdrop-blur">
              {m.kind === 'system' ? (
                <span className="text-muted">{m.body}</span>
              ) : (
                <>
                  <span className="font-semibold" style={{ color: m.author_color ?? undefined }}>{m.author_name}: </span>
                  {m.body}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Присоединиться (нужен клик для звука) */}
      {locked && media && (
        <button onClick={props.onUnlock} className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_0_60px_rgba(245,181,68,0.5)]">
            <PlayIcon size={32} className="ml-1" />
          </span>
          <span className="text-lg font-semibold">Нажми, чтобы присоединиться к просмотру</span>
          <span className="text-sm text-muted">Браузер не даёт включать звук без твоего клика</span>
        </button>
      )}

      {/* Панель управления */}
      {media && (
        <div
          className={`absolute inset-x-0 bottom-0 z-30 px-3 pb-2 transition-opacity duration-300 sm:px-4 ${
            media.source === 'vk' ? 'bg-black pt-3' : 'bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-10'
          } ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="w-14 text-right text-xs tabular-nums text-white/85">{formatTime(shownTime)}</span>
            <input
              type="range"
              className="slider flex-1"
              min={0}
              max={duration ?? 0}
              step={0.5}
              value={Math.min(shownTime, duration ?? 0)}
              disabled={!canControl || !duration}
              style={{ ['--fill' as string]: `${fill}%` }}
              aria-label="Перемотка"
              onChange={(e) => setDrag(Number(e.target.value))}
              onPointerUp={commitSeek}
              onKeyUp={commitSeek}
              onBlur={() => drag !== null && commitSeek()}
            />
            <span className="w-14 text-xs tabular-nums text-white/60">{formatTime(duration)}</span>
          </div>
          <div className="mt-1 flex items-center gap-0.5 sm:gap-1">
            <IconButton label={playing ? 'Пауза (пробел)' : 'Смотреть (пробел)'} onClick={() => sync?.toggle()} disabled={!canControl}>
              {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
            </IconButton>
            <span className="hidden sm:contents">
              <IconButton label="Назад 10 с (←)" onClick={() => sync?.seekBy(-10)} disabled={!canControl}>
                <BackIcon size={22} />
              </IconButton>
              <IconButton label="Вперёд 10 с (→)" onClick={() => sync?.seekBy(10)} disabled={!canControl}>
                <ForwardIcon size={22} />
              </IconButton>
            </span>
            {props.hasQueue && canControl && (
              <IconButton label="Следующее в очереди" onClick={props.onNext}>
                <NextIcon size={20} />
              </IconButton>
            )}
            <div className="group/vol flex items-center">
              <IconButton label={props.movieMuted ? 'Включить звук (M)' : 'Выключить звук (M)'} onClick={props.onToggleMute}>
                {props.movieMuted || props.volume === 0 ? <VolumeOffIcon size={21} /> : <VolumeIcon size={21} />}
              </IconButton>
              <input
                type="range"
                className="slider w-0 opacity-0 transition-all duration-200 group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100"
                min={0}
                max={1}
                step={0.02}
                value={props.movieMuted ? 0 : props.volume}
                style={{ ['--fill' as string]: `${(props.movieMuted ? 0 : props.volume) * 100}%` }}
                onChange={(e) => props.onVolume(Number(e.target.value))}
                aria-label="Громкость фильма"
              />
              {props.ducked && <span className="ml-2 hidden text-xs text-accent sm:inline">тише — говорят</span>}
            </div>
            <p className="ml-2 hidden min-w-0 flex-1 truncate text-sm text-white/75 md:block">{media.title}</p>
            <div className="ml-auto flex items-center">
              {!props.isFullscreen && (
                <span className="hidden lg:contents">
                  <IconButton label="Режим кинотеатра (T)" onClick={props.onTheater} active={props.theater}>
                    <TheaterIcon size={20} />
                  </IconButton>
                </span>
              )}
              <IconButton label="Во весь экран (F)" onClick={props.onFullscreen}>
                <ExpandIcon size={20} />
              </IconButton>
            </div>
          </div>
          {props.isFullscreen && props.bottomSlot}
        </div>
      )}
    </div>
  )
}
