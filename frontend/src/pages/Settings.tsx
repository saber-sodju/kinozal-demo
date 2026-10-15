import { useEffect, useRef, useState } from 'react'
import { NameForm } from '../components/NameForm'
import { useToast } from '../components/Toasts'
import { Button } from '../components/ui'
import { loadPrefs, savePrefs, type Prefs } from '../lib/settings'
import { useSession } from '../lib/useSession'

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-4">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative mt-1 h-6 w-11 shrink-0 rounded-full bg-surface-3 transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  )
}

export function MicTest({ deviceId }: { deviceId: string }) {
  const [level, setLevel] = useState(0)
  const [on, setOn] = useState(false)
  const stop = useRef<() => void>(() => {})
  const toast = useToast()

  useEffect(() => () => stop.current(), [])

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      let raf = 0
      const loop = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6))
        raf = requestAnimationFrame(loop)
      }
      loop()
      setOn(true)
      stop.current = () => {
        cancelAnimationFrame(raf)
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close()
        setOn(false)
        setLevel(0)
      }
      window.dispatchEvent(new Event('kinozal:devices'))
    } catch {
      toast('Нет доступа к микрофону. Разреши его в настройках браузера (значок замка в адресной строке).', 'error')
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" onClick={() => (on ? stop.current() : start())}>{on ? 'Остановить' : 'Проверить микрофон'}</Button>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-label="Уровень микрофона">
        <div className="h-full rounded-full bg-ok transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
      </div>
    </div>
  )
}

export function useMicDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const load = () =>
      navigator.mediaDevices
        ?.enumerateDevices()
        .then((list) => setDevices(list.filter((d) => d.kind === 'audioinput')))
        .catch(() => {})
    load()
    navigator.mediaDevices?.addEventListener('devicechange', load)
    window.addEventListener('kinozal:devices', load)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', load)
      window.removeEventListener('kinozal:devices', load)
    }
  }, [])
  return devices
}

export function SettingsPage() {
  const session = useSession()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const devices = useMicDevices()
  const toast = useToast()
  const update = (patch: Partial<Prefs>) => setPrefs(savePrefs(patch))

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Профиль и настройки</h1>

      <section className="mt-8 rounded-2xl border border-white/5 bg-surface p-6">
        <h2 className="mb-5 text-lg font-semibold">Профиль</h2>
        <NameForm submitLabel={session ? 'Сохранить' : 'Создать профиль'} onDone={() => toast('Сохранено', 'ok')} />
      </section>

      <section className="mt-6 rounded-2xl border border-white/5 bg-surface p-6">
        <h2 className="text-lg font-semibold">Голос</h2>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Микрофон</span>
            <select
              value={prefs.micDeviceId}
              onChange={(e) => update({ micDeviceId: e.target.value })}
              className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent/70"
            >
              <option value="">По умолчанию</option>
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Микрофон ${i + 1}`}</option>
              ))}
            </select>
          </label>
          <MicTest deviceId={prefs.micDeviceId} />
        </div>
        <div className="mt-2 divide-y divide-white/5">
          <Toggle
            checked={prefs.pushToTalk}
            onChange={(v) => update({ pushToTalk: v })}
            label="Рация (push-to-talk)"
            hint="Микрофон включён, только пока держишь клавишу V. Удобно, если смотришь без наушников."
          />
          <Toggle
            checked={prefs.duckMovie}
            onChange={(v) => update({ duckMovie: v })}
            label="Приглушать фильм, когда кто-то говорит"
            hint="Звук фильма плавно тише, пока звучит голос друга."
          />
        </div>
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">Совет: смотри в наушниках — тогда звук фильма не попадёт в микрофон и друзья не услышат эхо.</p>
      </section>
    </div>
  )
}
