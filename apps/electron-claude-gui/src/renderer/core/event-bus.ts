type Handler = (...args: any[]) => void

export class EventBus {
  private handlers = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach(h => h(...args))
  }

  off(event: string, handler: Handler): void {
    this.handlers.get(event)?.delete(handler)
  }

  clear(): void {
    this.handlers.clear()
  }
}

export const bus = new EventBus()
