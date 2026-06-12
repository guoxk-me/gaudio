import type { GAudioErrorCode } from '../types'

/** Error type used for loading, playback, and adaptive streaming failures. */
export class GAudioError extends Error {
  /** Stable machine-readable code for application error handling. */
  readonly code: GAudioErrorCode

  /** Error class name used by logging and diagnostics. */
  override readonly name = 'GAudioError'

  /**
   * Creates a gaudio error.
   *
   * @param code Stable machine-readable failure code.
   * @param message Human-readable description of the failure.
   * @param cause Original browser, source, or vendor error, when available.
   */
  constructor(code: GAudioErrorCode, message: string, cause?: unknown) {
    super(message)
    this.code = code

    if (cause !== undefined) {
      this.cause = cause
    }
  }
}
