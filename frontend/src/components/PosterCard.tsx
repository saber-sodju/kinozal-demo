import { useState } from 'react'
import { Link } from 'react-router'
import { formatDuration } from '../lib/format'
import type { CatalogItem } from '../lib/types'

export function Poster({ src, title, className = '' }: { src?: string | null; title: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-surface-3 to-surface p-3 text-center font-display text-sm text-muted ${className}`}>
        {title}
      </div>
    )
  }
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />
}

export function PosterCard({ item, onSelect, selected }: { item: CatalogItem; onSelect?: (item: CatalogItem) => void; selected?: boolean }) {
  const inner = (
    <>
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 ring-1 transition duration-300 ease-out group-hover:-translate-y-1.5 group-hover:shadow-[0_18px_40px_-14px_rgba(61,107,255,0.6)] ${
          selected ? 'ring-2 ring-accent' : 'ring-white/[0.06] group-hover:ring-accent/50'
        }`}
      >
        <Poster src={item.poster_url} title={item.title} className="h-full w-full transition duration-700 ease-out group-hover:scale-[1.06]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07070f]/95 via-[#07070f]/20 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
        <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 scale-75 items-center justify-center rounded-full bg-brand text-white opacity-0 shadow-[0_8px_30px_rgba(61,107,255,0.6)] transition duration-300 group-hover:scale-100 group-hover:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z" /></svg>
        </span>
        {item.description && (
          <p className="absolute inset-x-0 bottom-0 line-clamp-4 p-3 text-xs leading-relaxed text-white/90 opacity-0 transition group-hover:opacity-100">
            {item.description}
          </p>
        )}
        {selected && (
          <span className="absolute right-2 top-2 rounded-md bg-brand px-2 py-0.5 text-xs font-bold text-white shadow-lg">Выбран</span>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-text transition group-hover:text-accent-strong">{item.title}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {[item.year, formatDuration(item.duration_s)].filter(Boolean).join(' · ')}
        </p>
      </div>
    </>
  )
  if (onSelect) {
    return (
      <button type="button" onClick={() => onSelect(item)} className="group block w-full text-left" aria-pressed={selected}>
        {inner}
      </button>
    )
  }
  return (
    <Link to={`/film/${item.id}`} className="group block">
      {inner}
    </Link>
  )
}
