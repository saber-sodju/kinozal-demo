import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { useToast } from '../components/Toasts'
import { Button, inputClass } from '../components/ui'
import { api } from '../lib/api'

export function ReportPage() {
  const [params] = useSearchParams()
  const [target, setTarget] = useState(params.get('target') ?? '')
  const [reason, setReason] = useState('')
  const [sent, setSent] = useState(false)
  const toast = useToast()

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await api('/api/reports', { body: { room_slug: params.get('room'), kind: 'content', target, reason } })
      setSent(true)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Сообщить о нарушении</h1>
      {sent ? (
        <p className="mt-6 rounded-xl border border-ok/25 bg-ok/5 p-4">Спасибо! Мы рассмотрим жалобу.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-muted">Если в комнате показывают видео без разрешения правообладателя или ведут себя неприемлемо — напиши нам.</p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Ссылка на видео или комнату</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Что не так</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={5} minLength={3} required className={`${inputClass} h-auto py-3`} />
          </label>
          <Button type="submit" disabled={reason.trim().length < 3}>Отправить</Button>
        </form>
      )}
    </div>
  )
}
