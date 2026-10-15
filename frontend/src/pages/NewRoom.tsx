import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { MediaPicker, type Pick } from '../components/MediaPicker'
import { NameForm } from '../components/NameForm'
import { useToast } from '../components/Toasts'
import { Avatar, Button, Spinner, inputClass } from '../components/ui'
import { api, verifySession } from '../lib/api'
import { createRoom } from '../lib/createRoom'
import type { CatalogItem, Media, Session } from '../lib/types'

const STEPS = ['Кто ты', 'Что смотрим', 'Настройки']

export function NewRoomPage() {
  const [params] = useSearchParams()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [step, setStep] = useState(0)
  const [pick, setPick] = useState<Pick>(null)
  const [roomName, setRoomName] = useState('')
  const [mode, setMode] = useState<'everyone' | 'host_only'>('everyone')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    verifySession().then((s) => {
      setSession(s)
      if (s) setStep(1)
    })
    const film = params.get('film')
    if (film) {
      api<{ item: CatalogItem }>(`/api/catalog/${film}`).then((d) => setPick({ kind: 'catalog', item: d.item })).catch(() => {})
    }
    // Ссылка от Telegram-бота (/tgf/…) или любая другая, переданная в ?link=
    const link = params.get('link')
    if (link) {
      api<{ ok: boolean; media?: Media; reason?: string }>('/api/media/resolve', { body: { url: link } })
        .then((r) => (r.ok && r.media ? setPick({ kind: 'url', url: link, media: r.media }) : toast(r.reason ?? 'Ссылка не подошла', 'error')))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  async function submit() {
    setBusy(true)
    try {
      const slug = await createRoom({
        name: roomName.trim() || undefined,
        control_mode: mode,
        catalog_id: pick?.kind === 'catalog' ? pick.item.id : undefined,
        url: pick?.kind === 'url' ? pick.url : undefined,
      })
      navigate(`/r/${slug}?invite=1`)
    } catch (err) {
      toast((err as Error).message, 'error')
      setBusy(false)
    }
  }

  if (session === undefined) return <div className="flex justify-center py-32"><Spinner size={28} /></div>

  const pickedTitle = pick?.kind === 'catalog' ? pick.item.title : pick?.kind === 'url' ? pick.media.title : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Новая комната</h1>
      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Шаги">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => (i === 0 || session) && setStep(i)}
              disabled={i > 0 && !session}
              aria-current={step === i ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition ${
                step === i ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted hover:text-text disabled:opacity-50'
              }`}
            >
              <span className="font-semibold">{i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-2xl border border-white/5 bg-surface p-6 sm:p-8">
        {step === 0 && (
          <div className="max-w-md">
            <p className="mb-6 text-muted">Имя увидят друзья в комнате. Регистрация не нужна.</p>
            <NameForm
              onDone={(s) => {
                setSession(s)
                setStep(1)
              }}
            />
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="mb-5 text-muted">Выбери фильм или вставь ссылку. Можно пропустить и выбрать уже в комнате.</p>
            <MediaPicker value={pick} onChange={setPick} />
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5">
              <p className="text-sm text-muted">{pickedTitle ? <>Выбрано: <span className="text-text">{pickedTitle}</span></> : 'Пока ничего не выбрано'}</p>
              <div className="flex gap-2">
                {!pick && <Button variant="ghost" onClick={() => setStep(2)}>Решим потом</Button>}
                <Button onClick={() => setStep(2)} disabled={!pick}>Дальше</Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && session && (
          <div className="max-w-lg space-y-6">
            <div className="flex items-center gap-3">
              <Avatar name={session.name} color={session.color} />
              <p className="text-sm text-muted">Ты будешь ведущим комнаты.</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Название комнаты</span>
              <input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={60} placeholder={pickedTitle ?? `Кинозал ${session.name}`} className={inputClass} />
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Кто управляет просмотром</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ['everyone', 'Все', 'Для друзей: любой может ставить паузу и перематывать'],
                  ['host_only', 'Только ведущий', 'Ты и модераторы — для больших групп'],
                ] as const).map(([value, title, text]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-xl border p-4 transition ${mode === value ? 'border-accent bg-accent/8' : 'border-line hover:border-white/20'}`}
                  >
                    <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                    <span className="block font-semibold">{title}</span>
                    <span className="mt-1 block text-xs text-muted">{text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-muted">Комната приватная: попасть в неё можно только по ссылке.</p>
            <Button size="lg" className="w-full" onClick={submit} disabled={busy}>
              {busy ? <Spinner size={18} /> : 'Создать и войти'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
