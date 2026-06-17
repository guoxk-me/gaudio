import type { GAudioErrorCode } from '../errors/errors'
import { GAudioError } from '../errors/errors'

export function mediaElementError(audioElement: HTMLAudioElement): GAudioError {
  const mediaError = audioElement.error
  const errorCode: GAudioErrorCode = mediaError ? mediaElementErrorCode(mediaError.code) : 'ENGINE_ERROR'
  return new GAudioError(errorCode, mediaError?.message || 'Audio element reported a playback error', mediaError ?? undefined)
}

function mediaElementErrorCode(mediaErrorCode: number): GAudioErrorCode {
  switch (mediaErrorCode) {
    case 1:
      return 'LOAD_ABORTED'
    case 2:
      return 'NETWORK_ERROR'
    case 3:
      return 'DECODE_FAILED'
    case 4:
      return 'UNSUPPORTED_FORMAT'
    default:
      return 'ENGINE_ERROR'
  }
}
