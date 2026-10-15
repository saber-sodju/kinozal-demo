import { useEffect, useState } from 'react'
import { api } from './api'

interface Config {
  tg_bot: string | null
}

let cached: Promise<Config> | null = null

/** Настройки сервера (например, имя Telegram-бота), загружаются один раз. */
export function useConfig(): Config | null {
  const [config, setConfig] = useState<Config | null>(null)
  useEffect(() => {
    cached ??= api<Config>('/api/config').catch(() => ({ tg_bot: null }))
    cached.then(setConfig)
  }, [])
  return config
}
