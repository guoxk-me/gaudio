// @env browser

// AI modified: HLS and DASH share one complete MSE probe so capability routing cannot drift.
export function hasMediaSourceSupport(mimeTypes: readonly string[]): boolean {
  const mediaGlobal = globalThis as typeof globalThis & {
    ManagedMediaSource?: typeof MediaSource
    WebKitMediaSource?: typeof MediaSource
    WebKitSourceBuffer?: typeof SourceBuffer
  }
  if (typeof mediaGlobal.Audio !== 'function') {
    return false
  }

  const mediaSource = mediaGlobal.ManagedMediaSource
    ?? mediaGlobal.MediaSource
    ?? mediaGlobal.WebKitMediaSource
  if (typeof mediaSource !== 'function' || typeof mediaSource.isTypeSupported !== 'function') {
    return false
  }

  const sourceBuffer = mediaGlobal.SourceBuffer ?? mediaGlobal.WebKitSourceBuffer
  if (
    sourceBuffer
    && (
      !sourceBuffer.prototype
      || typeof sourceBuffer.prototype.appendBuffer !== 'function'
      || typeof sourceBuffer.prototype.remove !== 'function'
    )
  ) {
    return false
  }

  try {
    return mimeTypes.some(mimeType => mediaSource.isTypeSupported(mimeType))
  }
  catch {
    return false
  }
}
