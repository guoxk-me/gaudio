type EventHandler<Payload> = (payload: Payload) => void

/** A small strongly typed event emitter keyed by an event-to-payload map. */
export class EventEmitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<EventHandler<Events[keyof Events]>>>()

  /**
   * Registers an event listener.
   *
   * @param eventName Event to observe.
   * @param handler Listener invoked with the event payload.
   * @returns A function that removes this listener.
   */
  on<EventName extends keyof Events>(eventName: EventName, handler: EventHandler<Events[EventName]>): () => void {
    const existingHandlers = this.handlers.get(eventName) ?? new Set<EventHandler<Events[keyof Events]>>()
    existingHandlers.add(handler as EventHandler<Events[keyof Events]>)
    this.handlers.set(eventName, existingHandlers)

    return () => {
      this.off(eventName, handler)
    }
  }

  /**
   * Removes a previously registered event listener.
   *
   * @param eventName Event associated with the listener.
   * @param handler Listener reference originally passed to {@link on}.
   */
  off<EventName extends keyof Events>(eventName: EventName, handler: EventHandler<Events[EventName]>): void {
    const existingHandlers = this.handlers.get(eventName)
    existingHandlers?.delete(handler as EventHandler<Events[keyof Events]>)
  }

  /**
   * Synchronously notifies listeners for an event.
   *
   * @param eventName Event to publish.
   * @param payload Payload delivered to every current listener.
   */
  emit<EventName extends keyof Events>(eventName: EventName, payload: Events[EventName]): void {
    const existingHandlers = this.handlers.get(eventName)

    if (!existingHandlers) {
      return
    }

    for (const handler of existingHandlers) {
      handler(payload)
    }
  }

  /** Removes every registered listener. */
  clear(): void {
    this.handlers.clear()
  }
}
