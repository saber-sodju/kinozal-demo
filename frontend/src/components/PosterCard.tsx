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
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 ring-1 transition ${selected ? 'ring-2 ring-accent' : 'ring-white/5 group-hover:ring-white/15'}`}>
        <Poster src={item.poster_url} title={item.title} className="h-full w-full transition duration-500 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 to-black/0 opacity-0 transition group-hover:opacity-100" />
        {item.description && (
          <p className="absolute inset-x-0 bottom-0 line-clamp-4 p-3 text-xs leading-relaxed text-white/90 opacity-0 transition group-hover:opacity-100">
            {item.description}
          </p>
        )}
        {selected && (
          <span className="absolute right-2 top-2 rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">Выбран</span>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-text">{item.title}</h3>
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
