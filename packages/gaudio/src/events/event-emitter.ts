type EventHandler<Payload> = (payload: Payload) => void

type ErrorReportingGlobal = typeof globalThis & {
  reportError?: (error: unknown) => void
}

/**
 * A small strongly typed event emitter keyed by an event-to-payload map.
 *
 * Use this concrete utility directly or through composition. Subclassing is not a supported
 * compatibility contract.
 *
 * @typeParam Events Object whose keys are event names and values are their payload types.
 */
export class EventEmitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<EventHandler<Events[keyof Events]>>>()

  /**
   * Registers an event listener.
   *
   * @typeParam EventName Event key whose payload type is delivered to the handler.
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
   * @typeParam EventName Event key whose payload type is delivered to the handler.
   * @param eventName Event to observe once.
   * @param handler Listener invoked with the next event payload.
   * @returns A function that removes this listener before it runs.
   */
  once<EventName extends keyof Events>(eventName: EventName, handler: EventHandler<Events[EventName]>): () => void {
    let hasRun = false
    const removeListener = this.on(eventName, (payload) => {
      // AI modified: guard stale outer snapshots as well as re-entrant emits started inside this listener.
      if (hasRun) {
        return
      }
      hasRun = true
      removeListener()
      handler(payload)
    })

    return removeListener
  }

  /**
   * Removes a previously registered event listener.
   *
   * @typeParam EventName Event key associated with the typed handler.
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
   * @typeParam EventName Event key whose declared payload type is published.
   * @param eventName Event to publish.
   * @param payload Payload delivered to every current listener.
   */
  emit<EventName extends keyof Events>(eventName: EventName, payload: Events[EventName]): void {
    const existingHandlers = this.handlers.get(eventName)

    if (!existingHandlers) {
      return
    }

    // AI modified: listener failures are reported globally without interrupting sibling or internal listeners.
    for (const handler of [...existingHandlers]) {
      try {
        handler(payload)
      }
      catch (error) {
        this.reportListenerError(error)
      }
    }
  }

  /**
   * Removes registered listeners.
   *
   * @typeParam EventName Optional event key whose listeners should be removed.
   * @param eventName Optional event name. When omitted, every listener is removed.
   */
  clear<EventName extends keyof Events>(eventName?: EventName): void {
    // AI modified: falsy event keys such as 0 and '' still identify a specific event.
    if (eventName !== undefined) {
      this.handlers.delete(eventName)
      return
    }

    this.handlers.clear()
  }

  private reportListenerError(error: unknown): void {
    const errorReporter = (globalThis as ErrorReportingGlobal).reportError
    if (errorReporter) {
      try {
        errorReporter(error)
        return
      }
      catch (reportingError) {
        // AI modified: a broken host reporter cannot interrupt the remaining event listeners.
        queueMicrotask(() => {
          throw new AggregateError([error, reportingError], 'Event listener and error reporter failed')
        })
        return
      }
    }

    queueMicrotask(() => {
      throw error
    })
  }
}
