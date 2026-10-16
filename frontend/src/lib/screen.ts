import { Emitter } from './emitter'
import type { RoomClient } from './roomClient'

type Signal = { want?: boolean; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

const MAX_BITRATE = 2_500_000 // ~720p30 — разумно для 3–5 зрителей

interface Peer {
  pc: RTCPeerConnection
  pending: RTCIceCandidateInit[]
}



/**
 * Демонстрация вкладки (как в Discord): один участник показывает вкладку со звуком,
 * остальные получают её по WebRTC напрямую от него. Сигналинг — через сокет комнаты.
 */
export class ScreenShare extends Emitter {
  sharing = false
  localStream: MediaStream | null = null
  remoteStream: MediaStream | null = null
  sharerId: string | null = null
  sharerName = ''
  /** Состояние соединения у зрителя: ждём предложение → connecting → connected / failed. */
  viewerState: 'waiting' | RTCPeerConnectionState = 'waiting'
  private client: RoomClient
  private iceServers: RTCIceServer[] = []
  private selfId = ''
  private peers = new Map<string, Peer>()
  private offs: (() => void)[] = []

  static supported(): boolean {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    return !mobile && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices
  }

  constructor(client: RoomClient) {
    super()
    this.client = client
    this.offs.push(
      client.on('screen.signal', (m: { from: string; data: Signal }) => void this.onSignal(m.from, m.data)),
      client.on('screen.stopped', (m: { by: string }) => {
        if (m.by === this.sharerId) this.resetViewer()
      }),
    )
  }

  setSelf(id: string): void {
    this.selfId = id
  }

  setIceServers(servers: RTCIceServer[]): void {
    this.iceServers = servers
  }

  // ---------- показывающий ----------

  async start(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {
      video: { frameRate: { ideal: 30, max: 30 }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      systemAudio: 'include',
      preferCurrentTab: false,
    }
    const stream = await navigator.mediaDevices.getDisplayMedia(options)
    const video = stream.getVideoTracks()[0]
    if (video) {
      video.contentHint = 'motion'
      video.addEventListener('ended', () => this.stop())
    }
    this.localStream = stream
    this.sharing = true
    this.client.send({ type: 'screen.start' })
    this.emit('change')
  }

  stop(): void {
    if (this.sharing) this.client.send({ type: 'screen.stop' })
    this.stopSharingLocally()
  }

  hasAudio(): boolean {
    return !!this.localStream?.getAudioTracks().length
  }

  private stopSharingLocally(): void {
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null
    this.sharing = false
    this.emit('change')
  }

  // ---------- состояние комнаты ----------

  /** Вызывается при каждом обновлении комнаты: кто сейчас показывает. */
  onRoomScreen(screen: { by: string; name: string } | null, connectedIds: string[]): void {
    if (!screen) {
      // Сервер потерял показ (обрыв сокета у показывающего) — заявляем его снова.
      if (this.sharing && this.localStream?.active) {
        this.client.send({ type: 'screen.start' })
        return
      }
      if (this.sharing) this.stopSharingLocally()
      this.resetViewer()
      return
    }
    if (screen.by === this.selfId) {
      if (!this.sharing) this.client.send({ type: 'screen.stop' }) // показ остался от прошлой вкладки
      else {
        // Убираем соединения с теми, кто ушёл.
        for (const id of [...this.peers.keys()]) if (!connectedIds.includes(id)) this.closePeer(id)
      }
      return
    }
    if (this.sharing) this.stopSharingLocally() // показ перехватил ведущий
    if (this.sharerId !== screen.by) {
      this.resetViewer()
      this.sharerId = screen.by
      this.sharerName = screen.name
      this.client.send({ type: 'screen.signal', to: screen.by, data: { want: true } })
      this.emit('change')
    }
  }

  /** Попросить трансляцию заново (если не подключилось). */
  retry(): void {
    if (!this.sharerId) return
    const id = this.sharerId
    this.closePeer(id)
    this.remoteStream = null
    this.viewerState = 'waiting'
    this.client.send({ type: 'screen.signal', to: id, data: { want: true } })
    this.emit('change')
  }

  private resetViewer(): void {
    if (this.sharerId) this.closePeer(this.sharerId)
    const had = this.sharerId || this.remoteStream
    this.sharerId = null
    this.sharerName = ''
    this.remoteStream = null
    this.viewerState = 'waiting'
    if (had) this.emit('change')
  }

  // ---------- WebRTC ----------

  private makePeer(id: string): Peer {
    this.closePeer(id)
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const peer: Peer = { pc, pending: [] }
    this.peers.set(id, peer)
    pc.onicecandidate = (e) => {
      if (e.candidate) this.client.send({ type: 'screen.signal', to: id, data: { candidate: e.candidate.toJSON() } })
    }
    pc.onconnectionstatechange = () => {
      if (!this.sharing && id === this.sharerId) {
        this.viewerState = pc.connectionState
        this.emit('change')
      }
      if (pc.connectionState === 'failed') this.emit('failed', id)
    }
    return peer
  }

  private async onSignal(from: string, data: Signal): Promise<void> {
    if (!data) return
    try {
      if (this.sharing) {
        if (data.want && this.localStream) {
          const peer = this.makePeer(from)
          for (const track of this.localStream.getTracks()) peer.pc.addTrack(track, this.localStream)
          const offer = await peer.pc.createOffer()
          await peer.pc.setLocalDescription(offer)
          this.client.send({ type: 'screen.signal', to: from, data: { sdp: peer.pc.localDescription?.toJSON() } })
        } else if (data.sdp?.type === 'answer') {
          const peer = this.peers.get(from)
          if (!peer) return
          await peer.pc.setRemoteDescription(data.sdp)
          for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c)
          // Ограничение битрейта — только после согласования, иначе Chrome может не отправлять видео.
          for (const sender of peer.pc.getSenders()) {
            if (sender.track?.kind !== 'video') continue
            const params = sender.getParameters()
            if (!params.encodings?.length) continue
            params.encodings[0].maxBitrate = MAX_BITRATE
            await sender.setParameters(params).catch(() => {})
          }
        } else if (data.candidate) {
          await this.addCandidate(from, data.candidate)
        }
        return
      }
      if (from !== this.sharerId) return
      if (data.sdp?.type === 'offer') {
        const peer = this.makePeer(from)
        peer.pc.ontrack = (e) => {
          const stream = e.streams[0] ?? new MediaStream([e.track])
          this.remoteStream = stream
          this.emit('change')
        }
        await peer.pc.setRemoteDescription(data.sdp)
        for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c)
        const answer = await peer.pc.createAnswer()
        await peer.pc.setLocalDescription(answer)
        this.client.send({ type: 'screen.signal', to: from, data: { sdp: peer.pc.localDescription?.toJSON() } })
      } else if (data.candidate) {
        await this.addCandidate(from, data.candidate)
      }
    } catch (err) {
      console.warn('screen signal error', err)
    }
  }

  private async addCandidate(from: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(from)
    if (!peer) return
    if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate)
    else peer.pending.push(candidate)
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id)
    if (!peer) return
    peer.pc.close()
    this.peers.delete(id)
  }

  destroy(): void {
    if (this.sharing) this.client.send({ type: 'screen.stop' })
    this.stopSharingLocally()
    this.resetViewer()
    this.offs.forEach((off) => off())
  }
}
