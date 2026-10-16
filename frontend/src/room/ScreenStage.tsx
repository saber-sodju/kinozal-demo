import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ExpandIcon, PlayIcon, ScreenIcon, VolumeIcon, VolumeOffIcon } from '../components/Icons'
import { IconButton, Spinner } from '../components/ui'
import type { ScreenShare } from '../lib/screen'
import type { FloatingReaction } from './useRoom'

/** Экран, когда кто-то показывает вкладку: видео трансляции вместо плеера. */
export function ScreenStage({
  screen,
  canStop,
  volume,
  movieMuted,
  ducked,
  locked,
  floating,
  stageRef,
  isFullscreen,
  onUnlock,
  onVolume,
  onToggleMute,
  onFullscreen,
  bottomSlot,
}: {
  screen: ScreenShare
  canStop: boolean
  volume: number
  movieMuted: boolean
  ducked: boolean
  locked: boolean
  floating: FloatingReaction[]
  stageRef: React.RefObject<HTMLDivElement | null>
  isFullscreen: boolean
  onUnlock: () => void
  onVolume: (v: number) => void
  onToggleMute: () => void
  onFullscreen: () => void
  bottomSlot?: ReactNode
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [waitedLong, setWaitedLong] = useState(false)
  const stream = screen.sharing ? screen.localStream : screen.remoteStream

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (v.srcObject !== stream) v.srcObject = stream
    if (stream && !locked) void v.play().catch(() => {})
  }, [stream, locked])

  useEffect(() => {
    setWaitedLong(false)
    if (stream) return
    const t = window.setTimeout(() => setWaitedLong(true), 15000)
    return () => window.clearTimeout(t)
  }, [stream, screen.sharerId])

  // Свою вкладку показывающий не слышит дважды — локальное превью без звука.
  const effectiveVolume = screen.sharing || movieMuted ? 0 : volume * (ducked ? 0.3 : 1)
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = Math.min(1, effectiveVolume)
  }, [effectiveVolume, stream])

  const who = screen.sharing ? 'Ты показываешь вкладку' : `${screen.sharerName || 'Участник'} показывает вкладку`

  return (
    <div ref={stageRef} className={`relative w-full overflow-hidden bg-black ${isFullscreen ? 'h-full' : 'aspect-video'}`}>
      <video ref={videoRef} playsInline muted={screen.sharing} className="absolute inset-0 h-full w-full bg-black object-contain" />

      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
        {floating.map((r) => (
          <span key={r.id} className="reaction-float absolute bottom-16 flex flex-col items-center" style={{ left: `${r.x}%` }}>
            <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
            <span className="mt-0.5 rounded bg-black/50 px-1.5 text-[10px] text-white/80">{r.name}</span>
          </span>
        ))}
      </div>

      {!stream && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <Spinner size={34} />
          <p className="font-semibold">Подключаемся к трансляции…</p>
          {waitedLong && (
            <div className="max-w-sm text-sm text-muted">
              Долго не подключается — возможно, сеть блокирует прямое соединение.
              <button onClick={() => screen.retry()} className="ml-1 font-semibold text-accent hover:text-accent-strong">
                Попробовать снова
              </button>
            </div>
          )}
        </div>
      )}

      {locked && stream && !screen.sharing && (
        <button onClick={onUnlock} className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-white shadow-[0_0_70px_rgba(91,110,255,0.65)]">
            <PlayIcon size={32} className="ml-1" />
          </span>
          <span className="text-lg font-semibold">Нажми, чтобы смотреть трансляцию</span>
        </button>
      )}

      <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 text-xs backdrop-blur">
        <span className="live-dot h-2 w-2 rounded-full bg-danger" />
        <ScreenIcon size={14} /> {who}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 sm:px-4">
        <div className="flex items-center gap-1">
          {!screen.sharing && (
            <div className="group/vol flex items-center">
              <IconButton label={movieMuted ? 'Включить звук' : 'Выключить звук'} onClick={onToggleMute}>
                {movieMuted || volume === 0 ? <VolumeOffIcon size={21} /> : <VolumeIcon size={21} />}
              </IconButton>
              <input
                type="range"
                className="slider w-24"
                min={0}
                max={1}
                step={0.02}
                value={movieMuted ? 0 : volume}
                style={{ ['--fill' as string]: `${(movieMuted ? 0 : volume) * 100}%` }}
                onChange={(e) => onVolume(Number(e.target.value))}
                aria-label="Громкость трансляции"
              />
            </div>
          )}
          {screen.sharing && !screen.hasAudio() && (
            <span className="text-xs text-accent">Звук не передаётся — при выборе вкладки включи «Поделиться звуком»</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {canStop && (
              <button
                onClick={() => screen.stop()}
                className="btn-press mr-1 h-9 rounded-xl bg-danger/20 px-3 text-sm font-semibold text-danger hover:bg-danger/30"
              >
                Остановить показ
              </button>
            )}
            <IconButton label="Во весь экран" onClick={onFullscreen}>
              <ExpandIcon size={20} />
            </IconButton>
          </div>
        </div>
        {isFullscreen && bottomSlot}
      </div>
    </div>
  )
}
