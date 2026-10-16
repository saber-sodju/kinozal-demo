import { Emitter } from './emitter'
import type { RoomClient } from './roomClient'

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  analyser: AnalyserNode | null
  pending: RTCIceCandidateInit[]
  volume: number
}

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

const SPEAK_THRESHOLD = 0.035

/**
 * Голосовой чат: P2P mesh через WebRTC, сигналинг идёт через WebSocket комнаты.
 * Подходит для 2–6 человек. Новичок сам звонит всем, кто уже в голосе.
 */
export class VoiceManager extends Emitter {
  joined = false
  muted = false
  private client: RoomClient
  private iceServers: RTCIceServer[]
  private stream: MediaStream | null = null
  private peers = new Map<string, Peer>()
  private ctx: AudioContext | null = null
  private localAnalyser: AnalyserNode | null = null
  private levelTimer = 0
  private speaking = new Set<string>()
  /** Браузер не дал включить звук собеседников без нажатия. */
  audioBlocked = false
  private selfId = ''
  private pttHeld = false
  pushToTalk = false
  private offs: (() => void)[] = []

  constructor(client: RoomClient, iceServers: RTCIceServer[]) {
    super()
    this.client = client
    this.iceServers = iceServers
    this.offs.push(
      client.on('voice.peers', (m: { ids: string[] }) => m.ids.forEach((id) => void this.call(id))),
      client.on('rtc.signal', (m: { from: string; data: Signal }) => void this.onSignal(m.from, m.data)),
      client.on('voice.left', (m: { id: string }) => this.closePeer(m.id)),
      client.on('welcome', () => this.onReconnect()),
    )
  }

  setSelf(id: string): void {
    this.selfId = id
  }

  setIceServers(servers: RTCIceServer[]): void {
    this.iceServers = servers
  }

  async join(deviceId: string, pushToTalk: boolean): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { ideal: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    this.ctx = new AudioContext()
    this.localAnalyser = this.makeAnalyser(this.stream)
    this.joined = true
    this.pushToTalk = pushToTalk
    this.applyTrackState()
    this.client.send({ type: 'voice.join', muted: this.effectiveMuted() })
    this.levelTimer = window.setInterval(() => this.measure(), 120)
    this.emit('change')
  }

  leave(): void {
    if (!this.joined) return
    this.client.send({ type: 'voice.leave' })
    this.teardown()
    this.emit('change')
  }

  destroy(): void {
    if (this.joined) this.client.send({ type: 'voice.leave' })
    this.teardown()
    this.offs.forEach((off) => off())
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyTrackState()
    this.client.send({ type: 'voice.state', muted: this.effectiveMuted() })
    this.emit('change')
  }

  setPushToTalk(on: boolean): void {
    this.pushToTalk = on
    this.applyTrackState()
    this.client.send({ type: 'voice.state', muted: this.effectiveMuted() })
    this.emit('change')
  }

  setPttHeld(held: boolean): void {
    if (this.pttHeld === held) return
    this.pttHeld = held
    this.applyTrackState()
    this.emit('change')
  }

  isTransmitting(): boolean {
    return this.joined && !this.effectiveMuted()
  }

  /** Включить звук собеседников по нажатию (обход ограничений автозапуска). */
  resumeAudio(): void {
    void this.ctx?.resume().catch(() => {})
    for (const peer of this.peers.values()) void peer.audio.play().catch(() => {})
    this.audioBlocked = false
    this.emit('change')
  }

  setPeerVolume(id: string, volume: number): void {
    const peer = this.peers.get(id)
    if (peer) {
      peer.volume = volume
      peer.audio.volume = volume
    }
  }

  getPeerVolume(id: string): number {
    return this.peers.get(id)?.volume ?? 1
  }

  async switchDevice(deviceId: string): Promise<void> {
    if (!this.joined) return
    const next = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const track = next.getAudioTracks()[0]
    for (const peer of this.peers.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track?.kind === 'audio')
      await sender?.replaceTrack(track)
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = next
    this.localAnalyser = this.ctx ? this.makeAnalyser(next) : null
    this.applyTrackState()
  }

  // ---------- внутреннее ----------

  private effectiveMuted(): boolean {
    return this.muted || (this.pushToTalk && !this.pttHeld)
  }

  private applyTrackState(): void {
    const enabled = !this.effectiveMuted()
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = enabled))
  }

  private teardown(): void {
    window.clearInterval(this.levelTimer)
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.localAnalyser = null
    this.joined = false
    this.speaking.clear()
    this.emit('speaking', new Set<string>())
  }

  /** После переподключения сокета сервер «забыл» голос — заходим заново. */
  private onReconnect(): void {
    if (!this.joined) return
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    this.client.send({ type: 'voice.join', muted: this.effectiveMuted() })
  }

  private makeAnalyser(stream: MediaStream): AnalyserNode | null {
    if (!this.ctx) return null
    try {
      const src = this.ctx.createMediaStreamSource(stream)
      const analyser = this.ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      return analyser
    } catch {
      return null
    }
  }

  private level(analyser: AnalyserNode | null): number {
    if (!analyser) return 0
    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += v * v
    return Math.sqrt(sum / buf.length)
  }

  private measure(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
    const next = new Set<string>()
    if (this.selfId && !this.effectiveMuted() && this.level(this.localAnalyser) > SPEAK_THRESHOLD) next.add(this.selfId)
    for (const [id, peer] of this.peers) {
      if (this.level(peer.analyser) > SPEAK_THRESHOLD) next.add(id)
    }
    const changed = next.size !== this.speaking.size || [...next].some((id) => !this.speaking.has(id))
    if (changed) {
      this.speaking = next
      this.emit('speaking', new Set(next))
    }
  }

  private createPeer(id: string): Peer {
    const existing = this.peers.get(id)
    if (existing) return existing
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const audio = new Audio()
    audio.autoplay = true
    const peer: Peer = { pc, audio, analyser: null, pending: [], volume: 1 }
    this.peers.set(id, peer)

    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!))
    pc.onicecandidate = (e) => {
      if (e.candidate) this.client.send({ type: 'rtc.signal', to: id, data: { candidate: e.candidate.toJSON() } })
    }
    pc.ontrack = (e) => {
      const [remote] = e.streams
      audio.srcObject = remote
      audio.play().catch(() => {
        this.audioBlocked = true
        this.emit('change')
      })
      peer.analyser = this.makeAnalyser(remote)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.emit('peer-failed', id)
    }
    return peer
  }

  private async call(id: string): Promise<void> {
    if (!this.joined || id === this.selfId) return
    const peer = this.createPeer(id)
    const offer = await peer.pc.createOffer()
    await peer.pc.setLocalDescription(offer)
    this.client.send({ type: 'rtc.signal', to: id, data: { sdp: peer.pc.localDescription?.toJSON() } })
  }

  private async onSignal(from: string, data: Signal): Promise<void> {
    if (!this.joined || !data) return
    try {
      if (data.sdp) {
        if (data.sdp.type === 'offer' && this.peers.has(from)) this.closePeer(from) // переподключение собеседника
        const peer = this.createPeer(from)
        await peer.pc.setRemoteDescription(data.sdp)
        for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c)
        if (data.sdp.type === 'offer') {
          const answer = await peer.pc.createAnswer()
          await peer.pc.setLocalDescription(answer)
          this.client.send({ type: 'rtc.signal', to: from, data: { sdp: peer.pc.localDescription?.toJSON() } })
        }
      } else if (data.candidate) {
        const peer = this.peers.get(from)
        if (!peer) return
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate)
        else peer.pending.push(data.candidate)
      }
    } catch (err) {
      console.warn('voice signal error', err)
    }
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id)
    if (!peer) return
    peer.pc.close()
    peer.audio.srcObject = null
    this.peers.delete(id)
    if (this.speaking.delete(id)) this.emit('speaking', new Set(this.speaking))
  }
}
