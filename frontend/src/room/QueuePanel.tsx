import { ArrowDownIcon, ArrowUpIcon, CloseIcon, PlayIcon, PlusIcon } from '../components/Icons'
import { Poster } from '../components/PosterCard'
import { Button } from '../components/ui'
import { SOURCE_NAMES } from '../lib/format'
import type { Media } from '../lib/types'

export function QueuePanel({
  queue,
  current,
  canControl,
  onAdd,
  send,
}: {
  queue: Media[]
  current: Media | null
  canControl: boolean
  onAdd: () => void
  send: (msg: Record<string, unknown>) => boolean
}) {
  const act = (action: string, qid?: string) => send({ type: 'queue.action', action, qid })

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      {current && (
        <div className="mb-4">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-faint">Сейчас</p>
          <div className="flex gap-3 rounded-xl bg-accent/8 p-2 ring-1 ring-accent/20">
            <Poster src={current.poster_url} title={current.title} className="aspect-video w-24 shrink-0 rounded-lg" />
            <div className="min-w-0 py-0.5">
              <p className="line-clamp-2 text-sm font-semibold">{current.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{SOURCE_NAMES[current.source]}</p>
            </div>
          </div>
        </div>
      )}
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-faint">Дальше · {queue.length}</p>
      {queue.length === 0 && <p className="px-1 py-4 text-sm text-muted">Очередь пуста. Добавь, что посмотреть следующим — включится само.</p>}
      <ul className="space-y-1.5">
        {queue.map((q, i) => (
          <li key={q.qid} className="group flex items-center gap-3 rounded-xl p-2 hover:bg-white/[0.03]">
            <Poster src={q.poster_url} title={q.title} className="aspect-video w-20 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{q.title}</p>
              <p className="truncate text-xs text-faint">добавил(а) {q.added_by}</p>
            </div>
            {canControl && (
              <div className="flex shrink-0 flex-col gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <div className="flex">
                  <SmallBtn label="Включить сейчас" onClick={() => act('play', q.qid)}><PlayIcon size={14} /></SmallBtn>
                  <SmallBtn label="Убрать" onClick={() => act('remove', q.qid)}><CloseIcon size={14} /></SmallBtn>
                </div>
                <div className="flex">
                  <SmallBtn label="Выше" onClick={() => act('up', q.qid)} disabled={i === 0}><ArrowUpIcon size={14} /></SmallBtn>
                  <SmallBtn label="Ниже" onClick={() => act('down', q.qid)} disabled={i === queue.length - 1}><ArrowDownIcon size={14} /></SmallBtn>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canControl && (
        <Button variant="secondary" className="mt-4 w-full" onClick={onAdd}>
          <PlusIcon size={16} /> Добавить видео
        </Button>
      )}
    </div>
  )
}

function SmallBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-text disabled:opacity-30">
      {children}
    </button>
  )
}
