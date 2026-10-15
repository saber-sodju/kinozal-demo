import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CheckIcon, ExternalIcon, PlayIcon } from '../components/Icons'
import { Modal } from '../components/Modal'
import { NameForm } from '../components/NameForm'
import { Poster } from '../components/PosterCard'
import { useToast } from '../components/Toasts'
import { Badge, Button, Spinner } from '../components/ui'
import { api, storedSession, verifySession } from '../lib/api'
import { createRoom } from '../lib/createRoom'
import { SOURCE_NAMES, formatDuration } from '../lib/format'
import type { Capabilities, CatalogItem } from '../lib/types'

export function FilmPage() {
  const { id } = useParams()
  const [item, setItem] = useState<CatalogItem | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [error, setError] = useState('')
  const [askName, setAskName] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    api<{ item: CatalogItem; capabilities: Capabilities }>(`/api/catalog/${id}`)
      .then((d) => {
        setItem(d.item)
        setCaps(d.capabilities)
      })
      .catch((err) => setError(err.message))
  }, [id])

  async function watchTogether() {
    if (!item) return
    setBusy(true)
    try {
      const session = storedSession() ? await verifySession() : null
      if (!session) {
        setAskName(true)
        return
      }
      const slug = await createRoom({ catalog_id: item.id, name: item.title })
      navigate(`/r/${slug}?invite=1`)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted">
        {error} <Link to="/catalog" className="text-accent">В каталог</Link>
      </div>
    )
  if (!item) return <div className="flex justify-center py-32"><Spinner size={28} /></div>

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-[420px] overflow-hidden" aria-hidden>
        {item.poster_url && <img src={item.poster_url} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-2xl" />}
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/80 to-bg" />
      </div>
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[280px_1fr]">
        <Poster src={item.poster_url} title={item.title} className="aspect-[2/3] w-full max-w-[280px] rounded-2xl shadow-2xl ring-1 ring-white/10" />
        <div>
          <Link to="/catalog" className="text-sm text-muted hover:text-text">← Каталог</Link>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl">{item.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-muted">
            {[item.year, formatDuration(item.duration_s)].filter(Boolean).join(' · ')}
            {item.tags.slice(0, 4).map((t) => <Badge key={t}>{t}</Badge>)}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" onClick={watchTogether} disabled={busy}>
              <PlayIcon size={16} /> Смотреть вместе
            </Button>
            {item.page_url && (
              <a href={item.page_url} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface-2 px-5 text-sm font-semibold hover:bg-surface-3">
                Страница фильма <ExternalIcon size={16} />
              </a>
            )}
          </div>
          {item.description && <p className="mt-8 max-w-2xl leading-relaxed text-text/85">{item.description}</p>}

          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-faint">Источник</h2>
          <div className="mt-3 max-w-2xl rounded-2xl border border-white/5 bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{SOURCE_NAMES[item.source]}</p>
                <p className="mt-1 text-sm text-muted">
                  {item.license_url ? (
                    <a href={item.license_url} target="_blank" rel="noreferrer" className="underline decoration-white/20 hover:text-text">{item.license}</a>
                  ) : (
                    item.license
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="ok"><CheckIcon size={14} /> Синхронизация</Badge>
                {caps?.can_set_rate && <Badge tone="ok"><CheckIcon size={14} /> Плавный догон</Badge>}
                {!caps?.may_have_ads && <Badge tone="ok"><CheckIcon size={14} /> Без рекламы</Badge>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {askName && (
        <Modal title="Сначала представься" onClose={() => setAskName(false)}>
          <NameForm
            submitLabel="Создать комнату"
            onDone={async () => {
              setAskName(false)
              await watchTogether()
            }}
          />
        </Modal>
      )}
    </div>
  )
}
