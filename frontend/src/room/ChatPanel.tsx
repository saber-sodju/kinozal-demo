import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Avatar } from '../components/ui'
import { formatClock } from '../lib/format'
import type { ChatMessage } from '../lib/types'

export function ChatPanel({
  messages,
  you,
  onSend,
  inputRef,
}: {
  messages: ChatMessage[]
  you: string | null
  onSend: (body: string) => boolean
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  function submit(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    if (onSend(body)) setText('')
    stick.current = true
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
        aria-live="polite"
        aria-label="Сообщения чата"
      >
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">Здесь пока тихо. Напиши первым!</p>}
        {messages.map((m, i) => {
          if (m.kind === 'system') {
            return (
              <p key={m.id} className="py-1 text-center text-xs text-faint">
                {m.body}
              </p>
            )
          }
          const prev = messages[i - 1]
          const grouped = prev && prev.kind === 'text' && prev.author_id === m.author_id && m.created_at - prev.created_at < 120000
          const mine = m.author_id === you
          return (
            <div key={m.id} className={`flex gap-2.5 ${grouped ? '' : 'pt-2'}`}>
              <div className="w-8 shrink-0">{!grouped && <Avatar name={m.author_name ?? '?'} color={m.author_color ?? '#888'} size={32} />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="flex items-baseline gap-2 text-sm">
                    <span className="font-semibold" style={{ color: m.author_color ?? undefined }}>
                      {m.author_name}
                      {mine && <span className="ml-1 font-normal text-faint">(ты)</span>}
                    </span>
                    <span className="text-[11px] text-faint">{formatClock(m.created_at)}</span>
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text/90">{m.body}</p>
              </div>
            </div>
          )
        })}
      </div>
      <form onSubmit={submit} className="border-t border-white/5 p-3">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Написать в чат…"
          aria-label="Сообщение"
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-sm outline-none placeholder:text-faint focus:border-accent/60"
        />
      </form>
    </div>
  )
}
