import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { SOURCE_NAMES, formatDuration } from '../lib/format'
import type { Capabilities, CatalogItem, Media } from '../lib/types'
import { AlertIcon, CheckIcon, SearchIcon } from './Icons'
import { Poster, PosterCard } from './PosterCard'
import { Badge, Button, Spinner, inputClass } from './ui'

export type Pick = { kind: 'catalog'; item: CatalogItem } | { kind: 'url'; url: string; media: Media } | null

interface ResolveResult {
  ok: boolean
  reason?: string
  media?: Media
  capabilities?: Capabilities
}

export function useCatalogSearch(query: string, tag = '') {
  const [items, setItems] = useState<CatalogItem[] | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, tag })
        const data = await api<{ items: CatalogItem[]; tags: string[] }>(`/api/catalog?${params}`)
        if (!cancelled) {
          setItems(data.items)
          setTags(data.tags)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, tag])
  return { items, tags, error }
}

/** Проверка ссылки: встраивается ли, синхронизируется ли, есть ли реклама. */
export function LinkChecker({ onResolved, compact = false }: { onResolved?: (url: string, media: Media | null) => void; compact?: boolean }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResolveResult | null>(null)

  async function check(e: FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const r = await api<ResolveResult>('/api/media/resolve', { body: { url } })
      setResult(r)
      onResolved?.(url, r.ok && r.media ? r.media : null)
    } catch (err) {
      setResult({ ok: false, reason: (err as Error).message })
      onResolved?.(url, null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={check} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=… или ссылка на .mp4"
          className={inputClass}
          aria-label="Ссылка на видео"
        />
        <Button type="submit" variant="secondary" disabled={busy || !url.trim()} className="shrink-0">
          {busy ? <Spinner size={16} /> : 'Проверить'}
        </Button>
      </form>
      {result && (
        <div className={`fade-in rounded-xl border p-4 ${result.ok ? 'border-ok/25 bg-ok/5' : 'border-danger/25 bg-danger/5'}`}>
          {result.ok && result.media ? (
            <div className="flex gap-4">
              {!compact && (
                <Poster src={result.media.poster_url} title={result.media.title} className="aspect-video w-36 shrink-0 rounded-lg" />
              )}
              <div className="min-w-0 space-y-2">
                <p className="line-clamp-2 font-semibold">{result.media.title}</p>
                <p className="text-xs text-muted">
                  {[SOURCE_NAMES[result.media.source], result.media.subtitle, formatDuration(result.media.duration_s)].filter(Boolean).join(' · ')}
                </p>
                <ul className="space-y-1 text-sm">
                  <Check ok text="Встраивание разрешено" />
                  <Check ok text="Синхронное воспроизведение" />
                  {result.capabilities?.may_have_ads && <Check warn text="Возможна реклама — у каждого своя, после неё плеер догонит" />}
                  {result.capabilities?.can_set_rate === false && <Check warn text="Догон рывками (плавная подстройка скорости недоступна)" />}
                </ul>
              </div>
            </div>
          ) : (
            <p className="flex items-start gap-2 text-sm text-[#ffd9da]">
              <AlertIcon size={18} className="mt-px shrink-0 text-danger" /> {result.reason}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Check({ ok, warn, text }: { ok?: boolean; warn?: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      {warn ? <AlertIcon size={16} className="mt-0.5 shrink-0 text-accent" /> : ok ? <CheckIcon size={16} className="mt-0.5 shrink-0 text-ok" /> : null}
      <span className={warn ? 'text-muted' : ''}>{text}</span>
    </li>
  )
}

/** Выбор видео: каталог или ссылка. */
export function MediaPicker({ value, onChange }: { value: Pick; onChange: (p: Pick) => void }) {
  const [tab, setTab] = useState<'catalog' | 'link'>(value?.kind === 'url' ? 'link' : 'catalog')
  const [query, setQuery] = useState('')
  const { items } = useCatalogSearch(query)

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl bg-surface-2 p-1" role="tablist">
        {(['catalog', 'link'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${tab === t ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`}
          >
            {t === 'catalog' ? 'Из каталога' : 'Вставить ссылку'}
          </button>
        ))}
      </div>

      {tab === 'catalog' ? (
        <div>
          <div className="relative mb-4">
            <SearchIcon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название, жанр, год…" className={`${inputClass} pl-10`} aria-label="Поиск по каталогу" />
          </div>
          {items === null ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Ничего не нашлось.</p>
          ) : (
            <div className="grid max-h-[46vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item) => (
                <PosterCard
                  key={item.id}
                  item={item}
                  selected={value?.kind === 'catalog' && value.item.id === item.id}
                  onSelect={(it) => onChange(value?.kind === 'catalog' && value.item.id === it.id ? null : { kind: 'catalog', item: it })}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <LinkChecker onResolved={(url, media) => onChange(media ? { kind: 'url', url, media } : null)} />
          <p className="text-xs text-muted">
            Подходят YouTube, Vimeo, Internet Archive и прямые ссылки на <Badge>.mp4</Badge> <Badge>.webm</Badge> <Badge>.m3u8</Badge>
          </p>
        </div>
      )}
    </div>
  )
}
