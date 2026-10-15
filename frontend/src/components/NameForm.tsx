import { useState, type FormEvent } from 'react'
import { createSession, storedSession, updateSession } from '../lib/api'
import type { Session } from '../lib/types'
import { useToast } from './Toasts'
import { Avatar, Button, inputClass } from './ui'

export const AVATAR_COLORS = ['#5CC8FF', '#7C9BFF', '#B48CFF', '#F08BD8', '#5EE0B0', '#FFC56B', '#FF8F8F', '#6FE3F0']

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет аватара">
      {AVATAR_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`Цвет ${c}`}
          onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-full transition ${value === c ? 'ring-2 ring-white ring-offset-2 ring-offset-surface' : 'opacity-70 hover:opacity-100'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

/** Ввод имени: создаёт гостевую сессию (или обновляет существующую). */
export function NameForm({ onDone, submitLabel = 'Продолжить' }: { onDone: (s: Session) => void; submitLabel?: string }) {
  const existing = storedSession()
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)])
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      let session: Session
      try {
        session = existing ? await updateSession(trimmed, color) : await createSession(trimmed, color)
      } catch {
        session = await createSession(trimmed, color) // сессия устарела — создаём новую
      }
      onDone(session)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={name || '?'} color={color} size={56} />
        <div className="flex-1">
          <label htmlFor="nickname" className="mb-1.5 block text-sm font-medium">Как тебя зовут?</label>
          <input
            id="nickname"
            autoFocus
            maxLength={32}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя или ник"
            className={inputClass}
            autoComplete="nickname"
          />
        </div>
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <Button type="submit" size="lg" className="w-full" disabled={!name.trim() || busy}>
        {submitLabel}
      </Button>
    </form>
  )
}
