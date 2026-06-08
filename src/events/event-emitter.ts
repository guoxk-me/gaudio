type EventHandler<Payload> = (payload: Payload) => void

export class EventEmitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<EventHandler<Events[keyof Events]>>>()

  on<EventName extends keyof Events>(eventName: EventName, handler: EventHandler<Events[EventName]>): () => void {
    const existingHandlers = this.handlers.get(eventName) ?? new Set<EventHandler<Events[keyof Events]>>()
    existingHandlers.add(handler as EventHandler<Events[keyof Events]>)
    this.handlers.set(eventName, existingHandlers)

    return () => {
      this.off(eventName, handler)
    }
  }

  off<EventName extends keyof Events>(eventName: EventName, handler: EventHandler<Events[EventName]>): void {
    const existingHandlers = this.handlers.get(eventName)
    existingHandlers?.delete(handler as EventHandler<Events[keyof Events]>)
  }

  emit<EventName extends keyof Events>(eventName: EventName, payload: Events[EventName]): void {
    const existingHandlers = this.handlers.get(eventName)

    if (!existingHandlers) {
      return
    }

    for (const handler of existingHandlers) {
      handler(payload)
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
