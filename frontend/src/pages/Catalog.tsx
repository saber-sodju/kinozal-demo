import { useState } from 'react'
import { SearchIcon } from '../components/Icons'
import { useCatalogSearch } from '../components/MediaPicker'
import { PosterCard } from '../components/PosterCard'
import { inputClass } from '../components/ui'

export function CatalogPage() {
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const { items, tags, error } = useCatalogSearch(query, tag)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Каталог</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Фильмы из Internet Archive с открытой лицензией. Хочешь что-то другое — вставь ссылку на YouTube или Vimeo при создании комнаты.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <div className="relative max-w-xl">
          <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название, жанр, год…"
            className={`${inputClass} h-12 pl-11 text-base`}
            aria-label="Поиск фильмов"
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Жанры">
            {['', ...tags].map((t) => (
              <button
                key={t || 'all'}
                onClick={() => setTag(t)}
                aria-pressed={tag === t}
                className={`rounded-full px-3.5 py-1.5 text-sm capitalize transition ${
                  tag === t ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted hover:bg-surface-3 hover:text-text'
                }`}
              >
                {t || 'Все'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-8 text-danger">{error}</p>}
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items === null
          ? Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-surface-2" />)
          : items.map((item) => <PosterCard key={item.id} item={item} />)}
      </div>
      {items?.length === 0 && <p className="py-16 text-center text-muted">Ничего не нашлось. Попробуй другой запрос.</p>}
    </div>
  )
}
