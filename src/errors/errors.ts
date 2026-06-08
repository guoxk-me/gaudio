import type { GAudioErrorCode } from '../types'

export class GAudioError extends Error {
  readonly code: GAudioErrorCode

  override readonly name = 'GAudioError'

  constructor(code: GAudioErrorCode, message: string, cause?: unknown) {
    super(message)
    this.code = code

    if (cause !== undefined) {
      this.cause = cause
    }
  }
}
