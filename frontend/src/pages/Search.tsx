import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { GlobalSearch, type SearchResult } from '../components/GlobalSearch'
import { Modal } from '../components/Modal'
import { NameForm } from '../components/NameForm'
import { TgBotHint } from '../components/TgBotHint'
import { useToast } from '../components/Toasts'
import { storedSession, verifySession } from '../lib/api'
import { createRoom } from '../lib/createRoom'
import type { Media } from '../lib/types'

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const [pending, setPending] = useState<{ media: Media; r: SearchResult } | null>(null)
  const navigate = useNavigate()
  const toast = useToast()

  async function watch(media: Media, r: SearchResult) {
    const session = storedSession() ? await verifySession() : null
    if (!session) {
      setPending({ media, r })
      return
    }
    try {
      const slug = await createRoom({ url: r.url, name: media.title.slice(0, 60) })
      navigate(`/r/${slug}?invite=1`)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">
        Найти <span className="text-gradient">что посмотреть</span>
      </h1>
      <p className="mt-3 max-w-2xl text-muted">
        Ищем сразу по всем площадкам, которые умеем показывать синхронно. Нажми на видео — создадим комнату и позовём друзей.
      </p>
      <div className="mt-8">
        <GlobalSearch
          initialQuery={params.get('q') ?? ''}
          autoFocus
          onQueryChange={(q) => setParams(q ? { q } : {}, { replace: true })}
          onPicked={watch}
        />
      </div>
      <TgBotHint className="mt-10" />

      {pending && (
        <Modal title="Сначала представься" onClose={() => setPending(null)}>
          <NameForm
            submitLabel="Создать комнату"
            onDone={async () => {
              const p = pending
              setPending(null)
              await watch(p.media, p.r)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
