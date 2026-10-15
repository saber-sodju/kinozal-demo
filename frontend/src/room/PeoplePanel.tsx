import { useState } from 'react'
import { CrownIcon, HeadphonesIcon, MicOffIcon, MoreIcon, ShieldIcon } from '../components/Icons'
import { Avatar } from '../components/ui'
import type { Member, RoomInfo } from '../lib/types'
import type { VoiceManager } from '../lib/voice'

const STATUS_TEXT: Record<string, string> = {
  buffering: 'загружает видео…',
  ad: 'смотрит рекламу',
  error: 'видео не запускается',
}

export function PeoplePanel({
  members,
  you,
  room,
  speaking,
  voice,
  send,
}: {
  members: Member[]
  you: string | null
  room: RoomInfo | null
  speaking: Set<string>
  voice: VoiceManager | null
  send: (msg: Record<string, unknown>) => boolean
}) {
  const me = members.find((m) => m.id === you)
  const isHost = me?.role === 'host'
  const canModerate = me?.role === 'host' || me?.role === 'mod'
  const [menu, setMenu] = useState<string | null>(null)
  const [, force] = useState(0)

  const act = (action: string, target: string) => {
    send({ type: 'member.action', action, target })
    setMenu(null)
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <ul className="space-y-1">
        {members.map((m) => {
          const status = !m.connected ? 'нет связи, ждём…' : STATUS_TEXT[m.status]
          return (
            <li key={m.id} className="relative rounded-xl px-2 py-2 hover:bg-white/[0.03]">
              <div className="flex items-center gap-3">
                <Avatar name={m.name} color={m.color} speaking={speaking.has(m.id)} dim={!m.connected} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {m.name}
                    {m.id === you && <span className="font-normal text-faint">(ты)</span>}
                    {m.role === 'host' && <CrownIcon size={14} className="text-accent" aria-label="Ведущий" />}
                    {m.role === 'mod' && <ShieldIcon size={14} className="text-[#7FB2FF]" aria-label="Модератор" />}
                  </p>
                  <p className={`truncate text-xs ${status ? 'text-accent' : 'text-faint'}`}>
                    {status ?? (m.role === 'host' ? 'ведущий' : m.role === 'mod' ? 'модератор' : 'смотрит')}
                  </p>
                </div>
                {m.in_voice && (
                  <span className={m.muted ? 'text-danger' : 'text-ok'} title={m.muted ? 'Микрофон выключен' : 'В голосе'}>
                    {m.muted ? <MicOffIcon size={16} /> : <HeadphonesIcon size={16} />}
                  </span>
                )}
                {canModerate && m.id !== you && m.role !== 'host' && (
                  <button
                    onClick={() => setMenu(menu === m.id ? null : m.id)}
                    className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-text"
                    aria-label={`Действия с ${m.name}`}
                    aria-expanded={menu === m.id}
                  >
                    <MoreIcon size={18} />
                  </button>
                )}
              </div>
              {voice?.joined && m.in_voice && m.id !== you && (
                <label className="mt-2 flex items-center gap-2 pl-12 text-xs text-muted">
                  Громкость
                  <input
                    type="range"
                    className="slider flex-1"
                    min={0}
                    max={1}
                    step={0.05}
                    defaultValue={voice.getPeerVolume(m.id)}
                    style={{ ['--fill' as string]: `${voice.getPeerVolume(m.id) * 100}%` }}
                    onChange={(e) => {
                      voice.setPeerVolume(m.id, Number(e.target.value))
                      force((x) => x + 1)
                    }}
                    aria-label={`Громкость ${m.name}`}
                  />
                </label>
              )}
              {menu === m.id && (
                <div className="fade-in mt-2 grid gap-1 rounded-xl border border-line bg-surface-2 p-1.5 text-sm">
                  {isHost && m.role === 'viewer' && <MenuItem onClick={() => act('promote', m.id)}>Сделать модератором</MenuItem>}
                  {isHost && m.role === 'mod' && <MenuItem onClick={() => act('demote', m.id)}>Снять модератора</MenuItem>}
                  {isHost && <MenuItem onClick={() => act('transfer', m.id)}>Передать роль ведущего</MenuItem>}
                  {(isHost || m.role === 'viewer') && (
                    <MenuItem danger onClick={() => act('kick', m.id)}>Удалить из комнаты</MenuItem>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {isHost && room && (
        <div className="mt-4 space-y-3 border-t border-white/5 px-2 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">Настройки комнаты</p>
          <Switch
            checked={room.control_mode === 'host_only'}
            onChange={(v) => send({ type: 'room.settings', control_mode: v ? 'host_only' : 'everyone' })}
            label="Управляет только ведущий"
            hint="Остальные смотрят и общаются, но не ставят паузу"
          />
          <Switch
            checked={room.wait_for_all}
            onChange={(v) => send({ type: 'room.settings', wait_for_all: v })}
            label="Ждать отстающих"
            hint="Пауза для всех, пока кто-то загружается (не дольше 8 с)"
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-2 text-left transition hover:bg-white/5 ${danger ? 'text-danger' : ''}`}>
      {children}
    </button>
  )
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-surface-3 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
    </label>
  )
}
