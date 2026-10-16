import { HeadphonesIcon, LinkIcon, MicIcon, MicOffIcon, PhoneOffIcon, ScreenIcon } from '../components/Icons'
import { Avatar } from '../components/ui'
import type { Member } from '../lib/types'
import type { VoiceManager } from '../lib/voice'

export function VoiceBar({
  members,
  speaking,
  voice,
  reactions,
  onReact,
  onJoinVoice,
  onInvite,
  sharing = false,
  onShareScreen,
  compact = false,
}: {
  members: Member[]
  speaking: Set<string>
  voice: VoiceManager | null
  reactions: string[]
  onReact: (emoji: string) => void
  onJoinVoice: () => void
  onInvite?: () => void
  sharing?: boolean
  onShareScreen?: () => void
  compact?: boolean
}) {
  const joined = voice?.joined ?? false
  const online = members.filter((m) => m.connected)

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 ${compact ? 'mt-2' : ''}`}>
      {!compact && (
        <div className="flex items-center gap-1.5" aria-label="Кто в комнате">
          {online.slice(0, 8).map((m) => (
            <span key={m.id} className="relative" title={`${m.name}${m.in_voice ? (m.muted ? ' · микрофон выкл.' : ' · в голосе') : ''}`}>
              <Avatar name={m.name} color={m.color} size={34} speaking={speaking.has(m.id)} />
              {m.in_voice && (
                <span className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-bg ${m.muted ? 'bg-danger' : 'bg-ok'}`}>
                  {m.muted ? <MicOffIcon size={9} className="text-black" /> : <MicIcon size={9} className="text-black" />}
                </span>
              )}
            </span>
          ))}
          {online.length > 8 && <span className="text-xs text-muted">+{online.length - 8}</span>}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {joined && voice?.audioBlocked && (
          <button
            onClick={() => voice.resumeAudio()}
            className="btn-press inline-flex h-10 items-center gap-2 rounded-xl bg-[#f5b544]/15 px-3 text-sm font-semibold text-[#ffd27a] hover:bg-[#f5b544]/25"
          >
            🔊 Включить звук голоса
          </button>
        )}
        {joined ? (
          <>
            <button
              onClick={() => voice?.setMuted(!voice.muted)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${
                voice?.muted ? 'bg-danger/15 text-danger hover:bg-danger/25' : 'bg-ok/15 text-ok hover:bg-ok/25'
              }`}
              aria-pressed={!voice?.muted}
              title="Микрофон"
            >
              {voice?.muted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
              <span className="hidden sm:inline">
                {voice?.muted ? 'Микрофон выкл.' : voice?.pushToTalk ? (voice.isTransmitting() ? 'Говоришь' : 'Держи V') : 'Микрофон вкл.'}
              </span>
            </button>
            <button onClick={() => voice?.leave()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-danger hover:bg-surface-3" aria-label="Выйти из голоса" title="Выйти из голоса">
              <PhoneOffIcon size={18} />
            </button>
          </>
        ) : (
          <button onClick={onJoinVoice} className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-3.5 text-sm font-semibold hover:bg-surface-3">
            <HeadphonesIcon size={18} /> Голос
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5" aria-label="Реакции">
        {reactions.map((e) => (
          <button
            key={e}
            onClick={() => onReact(e)}
            className="flex h-10 w-9 items-center justify-center rounded-xl text-xl transition hover:-translate-y-0.5 hover:bg-white/10 active:scale-90"
            aria-label={`Реакция ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      {onShareScreen && (
        <button
          onClick={onShareScreen}
          className={`btn-press inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition ${
            sharing ? 'bg-danger/15 text-danger hover:bg-danger/25' : 'bg-surface-2 hover:bg-surface-3'
          }`}
          title="Показать вкладку с любого сайта — как в Discord"
        >
          <ScreenIcon size={18} /> <span className="hidden sm:inline">{sharing ? 'Остановить показ' : 'Показать вкладку'}</span>
        </button>
      )}

      {onInvite && !compact && (
        <button onClick={onInvite} className="btn-press btn-sheen glow-brand bg-brand ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-white">
          <LinkIcon size={17} /> Пригласить
        </button>
      )}
    </div>
  )
}
