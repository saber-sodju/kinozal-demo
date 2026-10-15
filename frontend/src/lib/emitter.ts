type Handler = (payload: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any

/** Минимальный эмиттер событий. */
export class Emitter {
  private handlers = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler)
    return () => set.delete(handler)
  }

  emit(event: string, payload?: unknown): void {
    this.handlers.get(event)?.forEach((h) => h(payload))
  }
}
