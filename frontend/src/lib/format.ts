export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h === 0) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export const SOURCE_NAMES: Record<string, string> = {
  youtube: 'YouTube',
  vk: 'VK Видео',
  telegram: 'Telegram',
  tgbot: 'Telegram',
  archive: 'Internet Archive',
  vimeo: 'Vimeo',
  direct: 'Файл по ссылке',
}

export function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?'
}
