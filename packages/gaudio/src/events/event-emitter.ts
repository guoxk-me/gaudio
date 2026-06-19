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
   * Registers a listener that is removed after the next matching event.
   *
   * @param eventName Event to observe once.
   * @param handler Listener invoked with the next event payload.
   * @returns A function that removes this listener before it runs.
   */
  once<EventName extends keyof Events>(eventName: EventName, handler: EventHandler<Events[EventName]>): () => void {
    const removeListener = this.on(eventName, (payload) => {
      // AI modified: remove before invoking so re-entrant emits cannot call once listeners twice.
      removeListener()
      handler(payload)
    })

    return removeListener
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

  /**
   * Removes registered listeners.
   *
   * @param eventName Optional event name. When omitted, every listener is removed.
   */
  clear<EventName extends keyof Events>(eventName?: EventName): void {
    if (eventName) {
      this.handlers.delete(eventName)
      return
    }

    this.handlers.clear()
  }
}
