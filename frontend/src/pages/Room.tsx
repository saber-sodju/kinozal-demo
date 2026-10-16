import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Logo } from '../components/Header'
import { Ambient } from '../components/Motion'
import { ChatIcon, CheckIcon, LinkIcon, ListIcon, UsersIcon } from '../components/Icons'
import { MediaPicker, type Pick } from '../components/MediaPicker'
import { Modal } from '../components/Modal'
import { NameForm } from '../components/NameForm'
import { useToast } from '../components/Toasts'
import { Avatar, Button, Spinner } from '../components/ui'
import { api, verifySession } from '../lib/api'
import { loadPrefs, PTT_KEY, savePrefs } from '../lib/settings'
import type { ChatMessage, RoomInfo, Session } from '../lib/types'
import { ChatPanel } from '../room/ChatPanel'
import { FsChat } from '../room/FsChat'
import { PeoplePanel } from '../room/PeoplePanel'
import { PlayerStage } from '../room/PlayerStage'
import { ScreenStage } from '../room/ScreenStage'
import { ScreenShare } from '../lib/screen'
import { QueuePanel } from '../room/QueuePanel'
import { useRoom } from '../room/useRoom'
import { VoiceBar } from '../room/VoiceBar'
import { NotFoundPage } from './NotFound'

interface RoomPreview {
  room: RoomInfo
  online: number
  media: { title: string; poster_url: string | null } | null
}

type Tab = 'chat' | 'people' | 'queue'

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function RoomPage() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const [preview, setPreview] = useState<RoomPreview | null | 'missing'>(null)
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const fromCreate = params.get('invite') === '1'
  const [joined, setJoined] = useState(false)
  const [startUnlocked, setStartUnlocked] = useState(false)

  useEffect(() => {
    api<RoomPreview>(`/api/rooms/${slug}`)
      .then(setPreview)
      .catch(() => setPreview('missing'))
    verifySession().then((s) => {
      setSession(s)
      // Создатель комнаты только что кликнул «Создать» — звук уже разрешён.
      if (s && fromCreate) {
        setStartUnlocked(true)
        setJoined(true)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  if (preview === 'missing') return <NotFoundPage title="Комната не найдена" text="Ссылка неверная, или комната истекла (через 7 дней без зрителей)." />
  if (preview === null || session === undefined) return <FullscreenSpinner />

  if (!joined) {
    return (
      <JoinScreen
        preview={preview}
        session={session}
        onJoin={(s) => {
          setSession(s)
          setStartUnlocked(true)
          setJoined(true)
        }}
      />
    )
  }

  return (
    <RoomView
      slug={slug}
      startUnlocked={startUnlocked}
      showInviteInitially={fromCreate}
      onInviteShown={() => {
        if (params.has('invite')) {
          params.delete('invite')
          setParams(params, { replace: true })
        }
      }}
      onSessionLost={() => {
        setSession(null)
        setJoined(false)
      }}
    />
  )
}

function FullscreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner size={32} />
    </div>
  )
}

function JoinScreen({ preview, session, onJoin }: { preview: RoomPreview; session: Session | null; onJoin: (s: Session) => void }) {
  const [editing, setEditing] = useState(!session)
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {preview.media?.poster_url && (
        <img src={preview.media.poster_url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-3xl" />
      )}
      <Ambient />
      <div className="pop-in relative w-full max-w-md rounded-3xl border border-white/10 bg-surface/80 p-7 shadow-[0_30px_80px_-20px_rgba(20,30,90,0.9)] backdrop-blur-xl">
        <Logo />
        <p className="mt-7 text-sm text-muted">Тебя пригласили в комнату</p>
        <h1 className="mt-1 font-display text-3xl font-bold leading-tight">{preview.room.name}</h1>
        <p className="mt-2 text-sm text-muted">
          {preview.media ? <>Сейчас: <span className="text-text">{preview.media.title}</span> · </> : null}
          {preview.online > 0 ? `в зале ${preview.online}` : 'пока никого'}
        </p>
        <div className="mt-7">
          {session && !editing ? (
            <div className="space-y-3">
              <Button size="lg" className="w-full" onClick={() => onJoin(session)}>
                <Avatar name={session.name} color={session.color} size={26} /> Войти как {session.name}
              </Button>
              <button onClick={() => setEditing(true)} className="w-full text-center text-sm text-muted hover:text-text">
                Сменить имя
              </button>
            </div>
          ) : (
            <NameForm submitLabel="Войти в комнату" onDone={onJoin} />
          )}
        </div>
      </div>
    </div>
  )
}

function RoomView({
  slug,
  startUnlocked,
  showInviteInitially,
  onInviteShown,
  onSessionLost,
}: {
  slug: string
  startUnlocked: boolean
  showInviteInitially: boolean
  onInviteShown: () => void
  onSessionLost: () => void
}) {
  const { state, send, reconnect, unlock, sync, voice, screen, voiceTick } = useRoom(slug, true, startUnlocked)
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('chat')
  const [theater, setTheater] = useState(false)
  const [volume, setVolume] = useState(() => loadPrefs().volume)
  const [movieMuted, setMovieMuted] = useState(false)
  const [invite, setInvite] = useState(showInviteInitially)
  const [adding, setAdding] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [overlay, setOverlay] = useState<ChatMessage[]>([])
  const [seenCount, setSeenCount] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  // Свой «полный экран» для телефонов, где браузер не умеет разворачивать что-либо кроме голого видео (iPhone).
  const [pseudoFs, setPseudoFs] = useState(false)
  // Телефон с открытой клавиатурой: прячем шапку и панель голоса, чтобы поле ввода было видно.
  const [kbOpen, setKbOpen] = useState(false)
  const fullscreen = isFullscreen || pseudoFs
  const [fsChatOpen, setFsChatOpen] = useState(false)

  const me = state.members.find((m) => m.id === state.you)
  const canControl = !!state.room && (state.room.control_mode === 'everyone' || me?.role === 'host' || me?.role === 'mod')
  const media = state.playback?.media ?? null
  const prefs = useMemo(loadPrefs, [voiceTick])
  const othersSpeaking = [...state.speaking].some((id) => id !== state.you)
  const ducked = prefs.duckMovie && othersSpeaking
  const textCount = state.messages.filter((m) => m.kind === 'text').length
  const unread = tab === 'chat' ? 0 : Math.max(0, textCount - seenCount)

  useEffect(() => {
    if (tab === 'chat') setSeenCount(textCount)
  }, [tab, textCount])

  useEffect(() => {
    if (showInviteInitially) onInviteShown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Фатальные ситуации соединения.
  useEffect(() => {
    if (state.fatal === 'session') onSessionLost()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.fatal])

  // Последние сообщения поверх видео (полный экран / кинотеатр).
  const lastMessage = state.messages[state.messages.length - 1]
  useEffect(() => {
    if (!lastMessage || Date.now() - lastMessage.created_at > 10000) return
    setOverlay((o) => [...o.slice(-2), lastMessage])
    const t = window.setTimeout(() => setOverlay((o) => o.filter((m) => m.id !== lastMessage.id)), 6000)
    return () => window.clearTimeout(t)
  }, [lastMessage])

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null }
    const onFs = () => {
      const el = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
      setIsFullscreen(!!el && el === stageRef.current)
    }
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs)
    }
  }, [])

  // Высота видимой области: на iPhone клавиатура не сжимает страницу — подстраиваемся сами.
  useEffect(() => {
    const vv = window.visualViewport
    let tallest = 0
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight
      tallest = Math.max(tallest, h)
      const el = document.activeElement
      const typing = !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
      setKbOpen(typing && window.matchMedia('(pointer: coarse)').matches && h < tallest * 0.8)
      document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`)
      if (vv && vv.offsetTop > 0) window.scrollTo(0, 0) // iOS сдвигает страницу при фокусе — возвращаем
    }
    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('resize', apply)
    document.addEventListener('focusin', apply)
    document.addEventListener('focusout', () => window.setTimeout(apply, 50))
    return () => {
      document.removeEventListener('focusin', apply)
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
      document.documentElement.style.removeProperty('--app-h')
    }
  }, [])

  // Пока открыт свой полноэкранный режим — страница под ним не прокручивается.
  useEffect(() => {
    if (!pseudoFs) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [pseudoFs])

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
    if (!el) return
    if (pseudoFs) {
      setPseudoFs(false)
      return
    }
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => {})
      else doc.webkitExitFullscreen?.()
      return
    }
    const touch = window.matchMedia('(pointer: coarse)').matches
    const request = touch ? undefined : el.requestFullscreen ?? el.webkitRequestFullscreen
    if (request) {
      try {
        await request.call(el)
        // На Android разворачиваем в горизонталь, если браузер позволяет.
        const orientation = window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        await orientation?.lock?.('landscape').catch(() => {})
        return
      } catch {
        /* не получилось — используем свой режим */
      }
    }
    setPseudoFs(true)
  }, [pseudoFs])

  const joinVoice = useCallback(async () => {
    const v = voice.current
    if (!v) return
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Голос работает только по защищённому адресу (https) или на localhost.', 'error')
      return
    }
    try {
      const p = loadPrefs()
      await v.join(p.micDeviceId, p.pushToTalk)
      toast(p.pushToTalk ? 'Ты в голосе. Держи V, чтобы говорить.' : 'Ты в голосе. Совет: надень наушники, чтобы не было эха.', 'ok')
    } catch (err) {
      const name = (err as DOMException).name
      toast(
        name === 'NotAllowedError'
          ? 'Нет доступа к микрофону. Разреши его в настройках браузера (значок замка в адресной строке).'
          : name === 'NotFoundError'
            ? 'Микрофон не найден. Подключи его и попробуй снова.'
            : 'Не удалось включить микрофон.',
        'error',
      )
    }
  }, [voice, toast])

  // Горячие клавиши.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pseudoFs) {
        setPseudoFs(false)
        return
      }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const s = sync.current
      if (e.code === PTT_KEY && voice.current?.joined && voice.current.pushToTalk) {
        voice.current.setPttHeld(true)
        return
      }
      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault()
        if (canControl) s?.toggle()
      } else if (e.code === 'ArrowLeft' && canControl) s?.seekBy(-10)
      else if (e.code === 'ArrowRight' && canControl) s?.seekBy(10)
      else if (e.code === 'KeyM') setMovieMuted((m) => !m)
      else if (e.code === 'KeyF') toggleFullscreen()
      else if (e.code === 'KeyT') setTheater((t) => !t)
      else if (e.code === 'KeyC') {
        e.preventDefault()
        setTheater(false)
        setTab('chat')
        window.setTimeout(() => chatInputRef.current?.focus(), 0)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === PTT_KEY) voice.current?.setPttHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [canControl, sync, voice, toggleFullscreen, pseudoFs])

  if (state.fatal && state.fatal !== 'session') {
    const texts = {
      kicked: ['Тебя удалили из комнаты', 'Ведущий убрал тебя из этой комнаты.'],
      replaced: ['Комната открыта в другой вкладке', 'Смотреть можно только в одной вкладке одновременно.'],
      not_found: ['Комната не найдена', 'Возможно, она истекла.'],
    } as const
    const [title, text] = texts[state.fatal]
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="text-muted">{text}</p>
        <div className="mt-2 flex gap-3">
          {state.fatal === 'replaced' && <Button onClick={reconnect}>Смотреть здесь</Button>}
          <Button variant="secondary" onClick={() => navigate('/')}>На главную</Button>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof ChatIcon; badge?: number }[] = [
    { id: 'chat', label: 'Чат', icon: ChatIcon, badge: unread },
    { id: 'people', label: 'Люди', icon: UsersIcon, badge: state.members.filter((m) => m.connected).length },
    { id: 'queue', label: 'Очередь', icon: ListIcon, badge: state.queue.length },
  ]

  const screenOn = !!state.room?.screen
  const canShare = ScreenShare.supported()
  const sharing = screen.current?.sharing ?? false

  async function toggleShare() {
    const sc = screen.current
    if (!sc) return
    if (sc.sharing) {
      sc.stop()
      return
    }
    try {
      await sc.start()
      toast('Показываешь вкладку. Если звука нет — выбери «Вкладку Chrome» и включи «Поделиться звуком».', 'ok')
    } catch (err) {
      if ((err as DOMException).name !== 'NotAllowedError') toast('Не удалось начать показ вкладки.', 'error')
    }
  }

  const voiceBar = (compact: boolean) => (
    <VoiceBar
      members={state.members}
      speaking={state.speaking}
      voice={voice.current}
      reactions={state.reactionSet}
      onReact={(emoji) => send({ type: 'reaction', emoji })}
      onJoinVoice={joinVoice}
      onInvite={() => setInvite(true)}
      sharing={sharing}
      onShareScreen={canShare ? toggleShare : undefined}
      compact={compact}
    />
  )

  return (
    <div className="flex flex-col max-lg:app-height max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:overflow-hidden lg:min-h-dvh">
      <Ambient />
      <header className={`glass sticky top-0 z-40 flex h-12 shrink-0 sm:h-14 ${kbOpen ? 'max-lg:hidden' : ''} items-center gap-3 border-b border-white/[0.06] px-4`}>
        <Logo className="shrink-0 [&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        <div className="mx-1 h-5 w-px bg-white/10" />
        <h1 className="min-w-0 truncate font-semibold">{state.room?.name ?? '…'}</h1>
        <ConnectionBadge status={state.connection} latency={state.latency} />
        <Link to="/" className="ml-auto shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-white/5 hover:text-text">
          Выйти
        </Link>
      </header>

      {state.connection === 'reconnecting' && (
        <div className="flex items-center justify-center gap-2 bg-accent/12 py-2 text-sm text-accent" role="status">
          <Spinner size={14} /> Связь потеряна, переподключаюсь… Видео продолжает идти.
        </div>
      )}

      <div
        className={`mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col lg:grid lg:gap-4 lg:p-4 ${theater ? '' : 'lg:grid-cols-[minmax(0,1fr)_370px]'}`}
      >
        <section className="min-w-0 shrink-0">
          <div
            className={
              pseudoFs
                ? 'app-height fixed inset-x-0 top-0 z-[80] flex w-screen items-stretch bg-black'
                : 'overflow-hidden ring-1 ring-white/[0.08] sm:rounded-2xl sm:shadow-[0_24px_70px_-24px_rgba(61,107,255,0.55)]'
            }
          >
            {screenOn && screen.current ? (
              <ScreenStage
                screen={screen.current}
                canStop={sharing || me?.role === 'host' || me?.role === 'mod'}
                volume={volume}
                movieMuted={movieMuted}
                ducked={ducked}
                locked={state.locked}
                floating={state.floating}
                stageRef={stageRef}
                isFullscreen={fullscreen}
                chatSlot={<FsChat messages={state.messages} you={state.you} onSend={(body) => send({ type: 'chat.send', body })} onOpenChange={setFsChatOpen} />}
                videoTop={fullscreen && fsChatOpen}
                onUnlock={unlock}
                onVolume={(v) => {
                  setVolume(v)
                  setMovieMuted(false)
                  savePrefs({ volume: v })
                }}
                onToggleMute={() => setMovieMuted((m) => !m)}
                onFullscreen={toggleFullscreen}
                bottomSlot={voiceBar(true)}
              />
            ) : (
            <PlayerStage
              sync={sync.current}
              playback={state.playback}
              canControl={canControl}
              hasQueue={state.queue.length > 0}
              health={state.health}
              volume={volume}
              movieMuted={movieMuted}
              ducked={ducked}
              floating={state.floating}
              locked={state.locked}
              theater={theater}
              overlayMessages={theater && !fullscreen ? overlay : []}
              onUnlock={unlock}
              onVolume={(v) => {
                setVolume(v)
                setMovieMuted(false)
                savePrefs({ volume: v })
              }}
              onToggleMute={() => setMovieMuted((m) => !m)}
              onTheater={() => setTheater((t) => !t)}
              onPickMedia={() => setAdding(true)}
              onShareScreen={canShare ? toggleShare : undefined}
              onNext={() => send({ type: 'playback.next' })}
              stageRef={stageRef}
              isFullscreen={fullscreen}
                chatSlot={<FsChat messages={state.messages} you={state.you} onSend={(body) => send({ type: 'chat.send', body })} onOpenChange={setFsChatOpen} />}
                videoTop={fullscreen && fsChatOpen}
              onFullscreen={toggleFullscreen}
              bottomSlot={voiceBar(true)}
            />
            )}
          </div>
          <div className={`px-3 py-2 lg:px-0 lg:py-3 ${kbOpen ? "max-lg:hidden" : ""}`}>{voiceBar(false)}</div>
        </section>

        <aside
          className={`flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/[0.07] bg-surface/70 backdrop-blur-xl lg:sticky lg:top-4 lg:h-[calc(100dvh-5.5rem)] lg:flex-none lg:rounded-2xl lg:border ${theater ? 'lg:hidden' : ''}`}
        >
          <div className="flex shrink-0 gap-1 border-b border-white/5 p-1.5" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition duration-200 ${
                  tab === t.id ? 'bg-white/[0.08] text-text shadow-[inset_0_0_0_1px_rgba(124,155,255,0.25)]' : 'text-muted hover:bg-white/[0.04] hover:text-text'
                }`}
              >
                <t.icon size={17} /> {t.label}
                {!!t.badge && (
                  <span className={`rounded-full px-1.5 text-[11px] font-bold ${t.id === 'chat' ? 'bg-brand text-white' : 'bg-white/10 text-muted'}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === 'chat' && (
              <ChatPanel messages={state.messages} you={state.you} inputRef={chatInputRef} onSend={(body) => send({ type: 'chat.send', body })} />
            )}
            {tab === 'people' && (
              <PeoplePanel members={state.members} you={state.you} room={state.room} speaking={state.speaking} voice={voice.current} send={send} />
            )}
            {tab === 'queue' && (
              <QueuePanel queue={state.queue} current={media} canControl={canControl} onAdd={() => setAdding(true)} send={send} />
            )}
          </div>
        </aside>
      </div>

      {invite && <InviteModal slug={slug} onClose={() => setInvite(false)} />}
      {adding && (
        <AddMediaModal
          hasMedia={!!media}
          onClose={() => setAdding(false)}
          onSubmit={(pick, mode) => {
            const ok = send({
              type: 'media.set',
              mode,
              ...(pick.kind === 'catalog' ? { catalog_id: pick.item.id } : { url: pick.url }),
            })
            if (ok) {
              setAdding(false)
              if (mode === 'queue') toast('Добавлено в очередь', 'ok')
            }
          }}
        />
      )}
    </div>
  )
}

function ConnectionBadge({ status, latency }: { status: string; latency: number | null }) {
  const ok = status === 'open'
  return (
    <span className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs sm:inline-flex ${ok ? 'bg-ok/10 text-ok' : 'bg-accent/10 text-accent'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-ok' : 'animate-pulse bg-accent'}`} />
      {ok ? (latency != null ? `${latency} мс` : 'онлайн') : status === 'connecting' ? 'подключение' : 'нет связи'}
    </span>
  )
}

function InviteModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const link = `${location.origin}/r/${slug}`
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* старый браузер — пусть выделит вручную */
    }
  }

  return (
    <Modal title="Позови друзей" onClose={onClose}>
      <p className="text-sm text-muted">Отправь ссылку — друзьям не нужна регистрация, только имя.</p>
      <div className="mt-4 flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.target.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 font-mono text-sm" aria-label="Ссылка-приглашение" />
        <Button onClick={copy} className="shrink-0">{copied ? <><CheckIcon size={16} /> Готово</> : <><LinkIcon size={16} /> Копировать</>}</Button>
      </div>
      {'share' in navigator && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => navigator.share({ title: 'Kinora', text: 'Смотрим вместе!', url: link }).catch(() => {})}>
          Поделиться…
        </Button>
      )}
      <p className="mt-4 text-xs text-faint">Комната приватная: войти можно только по этой ссылке.</p>
    </Modal>
  )
}

function AddMediaModal({ hasMedia, onClose, onSubmit }: { hasMedia: boolean; onClose: () => void; onSubmit: (pick: NonNullable<Pick>, mode: 'now' | 'queue') => void }) {
  const [pick, setPick] = useState<Pick>(null)
  return (
    <Modal title="Что смотрим?" onClose={onClose} wide>
      <MediaPicker value={pick} onChange={setPick} />
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/5 pt-5">
        {hasMedia && (
          <Button variant="secondary" disabled={!pick} onClick={() => pick && onSubmit(pick, 'queue')}>
            В очередь
          </Button>
        )}
        <Button disabled={!pick} onClick={() => pick && onSubmit(pick, 'now')}>
          Включить сейчас
        </Button>
      </div>
    </Modal>
  )
}
