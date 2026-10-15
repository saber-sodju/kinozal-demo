import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../components/Toasts'
import { RoomClient, type ConnectionStatus, type FatalReason } from '../lib/roomClient'
import { SyncController, type SyncHealth } from '../lib/sync'
import type { ChatMessage, Media, Member, Playback, RoomInfo } from '../lib/types'
import { VoiceManager } from '../lib/voice'

export interface FloatingReaction {
  id: string
  emoji: string
  name: string
  x: number
}

export interface RoomState {
  you: string | null
  room: RoomInfo | null
  members: Member[]
  playback: Playback | null
  queue: Media[]
  messages: ChatMessage[]
  reactionSet: string[]
  connection: ConnectionStatus
  fatal: FatalReason | null
  latency: number | null
  health: SyncHealth
  speaking: Set<string>
  floating: FloatingReaction[]
  /** Браузер не даст включить звук, пока зритель не кликнет. */
  locked: boolean
}

const INITIAL: RoomState = {
  you: null,
  room: null,
  members: [],
  playback: null,
  queue: [],
  messages: [],
  reactionSet: [],
  connection: 'connecting',
  fatal: null,
  latency: null,
  health: 'loading',
  speaking: new Set(),
  floating: [],
  locked: true,
}

/** Всё состояние комнаты: сокет, синхронизация, голос. Подключается, когда enabled=true. */
export function useRoom(slug: string, enabled: boolean, startUnlocked: boolean) {
  const [state, setState] = useState<RoomState>(INITIAL)
  const [voiceTick, setVoiceTick] = useState(0)
  const clientRef = useRef<RoomClient | null>(null)
  const syncRef = useRef<SyncController | null>(null)
  const voiceRef = useRef<VoiceManager | null>(null)
  const toast = useToast()
  const [attempt, setAttempt] = useState(0)

  const patch = useCallback((p: Partial<RoomState> | ((s: RoomState) => Partial<RoomState>)) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }))
  }, [])

  useEffect(() => {
    if (!enabled) return
    const client = new RoomClient(slug)
    const sync = new SyncController(client)
    const voice = new VoiceManager(client, [])
    clientRef.current = client
    syncRef.current = sync
    voiceRef.current = voice
    setState({ ...INITIAL, locked: !startUnlocked })
    if (startUnlocked) sync.unlock()

    const offs = [
      client.on('welcome', (m) => {
        voice.setSelf(m.you)
        voice.setIceServers(m.ice_servers)
        sync.setState(m.playback)
        patch((s) => {
          const known = new Set(s.messages.map((x) => x.id))
          const merged = [...s.messages, ...(m.messages as ChatMessage[]).filter((x) => !known.has(x.id))]
          return {
            you: m.you,
            room: m.room,
            members: m.members,
            playback: m.playback,
            queue: m.queue,
            messages: merged.slice(-200),
            reactionSet: m.reactions,
            fatal: null,
          }
        })
      }),
      client.on('presence', (m) => patch({ members: m.members, room: m.room })),
      client.on('playback.state', (m) => {
        sync.setState(m.playback)
        patch({ playback: m.playback })
      }),
      client.on('queue', (m) => patch({ queue: m.queue })),
      client.on('chat.message', (m) => patch((s) => ({ messages: [...s.messages, m.message].slice(-200) }))),
      client.on('reaction', (m) => {
        const r: FloatingReaction = { id: m.id, emoji: m.emoji, name: m.name, x: 8 + Math.random() * 84 }
        patch((s) => ({ floating: [...s.floating.slice(-24), r] }))
        window.setTimeout(() => patch((s) => ({ floating: s.floating.filter((x) => x.id !== r.id) })), 2700)
      }),
      client.on('error', (m) => toast(m.message, 'error')),
      client.on('kicked', () => patch({ fatal: 'kicked' })),
      client.on('status', (st: ConnectionStatus) => patch({ connection: st })),
      client.on('fatal', (reason: FatalReason) => patch({ fatal: reason })),
      client.on('latency', (ms: number) => patch({ latency: ms })),
      sync.on('health', (h: SyncHealth) => patch({ health: h })),
      sync.on('error', (msg: string) => toast(msg, 'error')),
      sync.on('blocked', () => patch({ locked: true })),
      voice.on('speaking', (set: Set<string>) => patch({ speaking: set })),
      voice.on('change', () => setVoiceTick((t) => t + 1)),
      voice.on('peer-failed', () =>
        toast('Голосовое соединение не установилось: сеть блокирует прямое подключение. Нужен TURN-сервер.', 'error'),
      ),
    ]
    client.connect()

    return () => {
      offs.forEach((off) => off())
      voice.destroy()
      sync.destroy()
      client.close()
      clientRef.current = null
      syncRef.current = null
      voiceRef.current = null
    }
    // startUnlocked читаем только при подключении
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, enabled, attempt, patch, toast])

  const unlock = useCallback(() => {
    syncRef.current?.unlock()
    patch({ locked: false })
  }, [patch])

  const send = useCallback((msg: Record<string, unknown>) => {
    const ok = clientRef.current?.send(msg) ?? false
    if (!ok) toast('Нет соединения — переподключаюсь…', 'error')
    return ok
  }, [toast])

  const reconnect = useCallback(() => setAttempt((a) => a + 1), [])

  return { state, send, reconnect, unlock, sync: syncRef, voice: voiceRef, voiceTick }
}
