import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { SOURCE_NAMES, formatTime } from '../lib/format'
import type { Media } from '../lib/types'
import { SearchIcon } from './Icons'
import { Poster } from './PosterCard'
import { SourceTile } from './SourceIcons'
import { useToast } from './Toasts'
import { Spinner, inputClass } from './ui'

export interface SearchResult {
  source: string
  url: string
  title: string
  thumb: string | null
  duration_s: number | null
  author: string | null
  catalog_id?: number
}

interface SearchResponse {
  query: string
  results: SearchResult[]
  providers: Record<string, 'ok' | 'disabled' | 'error'>
}

export type SearchKind = 'all' | 'long' | 'short'

const KINDS: { id: SearchKind; label: string }[] = [
  { id: 'long', label: 'Фильмы и серии' },
  { id: 'all', label: 'Всё' },
  { id: 'short', label: 'Короткие' },
]

const PROVIDER_NAMES: Record<string, string> = {
  catalog: 'Каталог',
  rutube: 'Rutube',
  youtube: 'YouTube',
  vk: 'VK Видео',
  archive: 'Internet Archive',
}

export function useGlobalSearch(query: string, kind: SearchKind) {
  const [data, setData] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(async () => {
      try {
        const r = await api<SearchResponse>(`/api/search?${new URLSearchParams({ q, kind })}`)
        if (!cancelled) setData(r)
      } catch {
        if (!cancelled) setData({ query: q, results: [], providers: {} })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, kind])
  return { data, loading }
}

/** Проверяет выбранный результат (можно ли встроить) и возвращает готовое медиа. */
export async function resolveResult(r: SearchResult): Promise<Media> {
  const res = await api<{ ok: boolean; media?: Media; reason?: string }>('/api/media/resolve', { body: { url: r.url } })
  if (!res.ok || !res.media) throw new Error(res.reason || 'Это видео не получится посмотреть вместе.')
  return res.media
}

export function ResultCard({ r, onPick, busy }: { r: SearchResult; onPick: (r: SearchResult) => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onPick(r)}
      disabled={busy}
      className="group block w-full text-left disabled:cursor-wait"
      title={r.title}
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-white/[0.06] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_16px_36px_-14px_rgba(61,107,255,0.6)] group-hover:ring-accent/50">
        <Poster src={r.thumb} title={r.title} className="h-full w-full transition duration-700 ease-out group-hover:scale-[1.06]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07070f]/80 via-transparent to-transparent" />
        {r.duration_s ? (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur">
            {formatTime(r.duration_s)}
          </span>
        ) : null}
        <span className="absolute left-2 top-2">
          <SourceTile id={r.source} size={22} />
        </span>
        <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-white opacity-0 shadow-[0_8px_30px_rgba(61,107,255,0.6)] transition duration-300 group-hover:opacity-100">
          {busy ? (
            <Spinner size={18} />
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z" /></svg>
          )}
        </span>
        {busy && <span className="absolute inset-0 bg-black/40" />}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-text transition group-hover:text-accent-strong">{r.title}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{[...new Set([SOURCE_NAMES[r.source] ?? r.source, r.author].filter(Boolean))].join(' · ')}</p>
    </button>
  )
}

/** Поиск по всем площадкам: поле, фильтр и сетка результатов. */
export function GlobalSearch({
  initialQuery = '',
  onPicked,
  autoFocus = false,
  compact = false,
  onQueryChange,
}: {
  initialQuery?: string
  onPicked: (media: Media, r: SearchResult) => void | Promise<void>
  autoFocus?: boolean
  compact?: boolean
  onQueryChange?: (q: string) => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [kind, setKind] = useState<SearchKind>('long')
  const [busyUrl, setBusyUrl] = useState<string | null>(null)
  const { data, loading } = useGlobalSearch(query, kind)
  const toast = useToast()

  async function pick(r: SearchResult) {
    setBusyUrl(r.url)
    try {
      const media = await resolveResult(r)
      await onPicked(media, r)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusyUrl(null)
    }
  }

  const providersLine = data
    ? Object.entries(data.providers)
        .filter(([, s]) => s === 'ok')
        .map(([p]) => PROVIDER_NAMES[p] ?? p)
        .join(', ')
    : ''

  return (
    <div>
      <form onSubmit={(e: FormEvent) => e.preventDefault()} className="relative">
        <SearchIcon size={compact ? 18 : 20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onQueryChange?.(e.target.value)
          }}
          placeholder="Фильм, аниме, дорама, сериал…"
          aria-label="Поиск по всем площадкам"
          className={`${inputClass} ${compact ? 'pl-11' : 'h-14 rounded-2xl pl-12 text-base'}`}
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2">
            <Spinner size={18} />
          </span>
        )}
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            aria-pressed={kind === k.id}
            className={`btn-press rounded-full px-3.5 py-1.5 text-sm transition ${
              kind === k.id ? 'bg-brand text-white shadow-[0_6px_20px_-8px_rgba(61,107,255,0.8)]' : 'bg-white/[0.05] text-muted hover:bg-white/10 hover:text-text'
            }`}
          >
            {k.label}
          </button>
        ))}
        {providersLine && <span className="ml-auto text-xs text-faint">Искали: {providersLine}</span>}
      </div>

      {query.trim().length < 2 ? (
        <p className="py-10 text-center text-sm text-muted">Напиши название — поищем сразу на Rutube, YouTube, VK, в Internet Archive и в нашем каталоге.</p>
      ) : data && data.results.length === 0 && !loading ? (
        <p className="py-10 text-center text-sm text-muted">Ничего не нашлось. Попробуй другое название или переключи фильтр на «Всё».</p>
      ) : (
        <div
          className={`mt-5 grid gap-x-4 gap-y-6 ${compact ? 'max-h-[46vh] grid-cols-2 overflow-y-auto pr-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}
        >
          {(data?.results ?? []).map((r, i) => (
            <div key={r.url} className="fade-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              <ResultCard r={r} onPick={pick} busy={busyUrl === r.url} />
            </div>
          ))}
          {!data && loading && Array.from({ length: compact ? 6 : 10 }, (_, i) => <div key={i} className="aspect-video animate-pulse rounded-2xl bg-surface-2" />)}
        </div>
      )}
    </div>
  )
}
