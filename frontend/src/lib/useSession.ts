import { useEffect, useState } from 'react'
import { storedSession } from './api'
import type { Session } from './types'

/** Текущая гостевая сессия; обновляется при входе и смене имени. */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(() => storedSession())
  useEffect(() => {
    const update = () => setSession(storedSession())
    window.addEventListener('kinozal:session', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('kinozal:session', update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return session
}
