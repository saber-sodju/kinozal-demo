export type SourceId = 'youtube' | 'vk' | 'rutube' | 'telegram' | 'tgbot' | 'archive' | 'vimeo' | 'direct'

export interface Capabilities {
  can_seek: boolean
  can_set_rate: boolean
  may_have_ads: boolean
  needs_auth: boolean
}

export interface Media {
  source: SourceId
  external_id: string
  url: string
  title: string
  subtitle?: string | null
  poster_url?: string | null
  duration_s?: number | null
  page_url?: string | null
  catalog_id?: number
  capabilities?: Capabilities
  qid?: string
  added_by?: string
}

export interface Playback {
  media: Media | null
  status: 'playing' | 'paused'
  position: number
  ref_time: number
  rate: number
  version: number
  by: string | null
  waiting: boolean
}

export type MemberStatus = 'idle' | 'ready' | 'buffering' | 'ad' | 'error' | 'ended'

export interface Member {
  id: string
  name: string
  color: string
  role: 'host' | 'mod' | 'viewer'
  connected: boolean
  status: MemberStatus
  in_voice: boolean
  muted: boolean
}

export interface RoomInfo {
  slug: string
  name: string
  control_mode: 'everyone' | 'host_only'
  wait_for_all: boolean
  host_id: string
}

export interface ChatMessage {
  id: number
  author_id: string | null
  author_name: string | null
  author_color: string | null
  kind: 'text' | 'system'
  body: string
  created_at: number
}

export interface CatalogItem {
  id: number
  source: SourceId
  external_id: string
  title: string
  year: number | null
  description: string | null
  duration_s: number | null
  poster_url: string | null
  media_url: string
  page_url: string | null
  license: string | null
  license_url: string | null
  tags: string[]
}

export interface SourceInfo {
  id: SourceId
  name: string
  examples: string[]
  capabilities: Capabilities
  notes: string[]
}

export interface Session {
  id: string
  name: string
  color: string
}
