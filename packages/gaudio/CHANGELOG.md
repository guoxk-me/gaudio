# Changelog

## [Unreleased]

- Kept DASH UTC synchronization and XLink fallback failures recoverable instead of terminating playback initialization.
- Preserved newer playback and position controls during HLS configuration reloads, including explicit paused player state.
- Rejected fatal engine errors arriving during load completion before readiness, analyzer creation, or autoplay.
- Published DASH segment completion only for successful downloads, excluding failed attempts before a retry succeeds.
- Prevented cross-origin Web Audio silence by applying anonymous CORS before built-in analysis loads; added explicit `crossOrigin` and per-load `AudioEngineLoadOptions` for credentialed media.
- Closed engines created during cancelled router loads and removed the redundant replacement stage that left them unowned.
- Refreshed DASH live variants on active-stream updates and preserved HLS public variant identities after level removal, reordering, and content steering.
- Preserved manual DASH quality during unrelated settings updates and synchronized explicit ABR changes with public selection state.
- Kept superseded load errors isolated and preserved playback attempts started synchronously inside pause/stop listeners; stopping native playback now cancels an unfinished seek.
- Made eight browser-specific `AudioEngine` members optional with documented player/router fallbacks, while retaining required playback and asynchronous cleanup contracts.
- Strengthened adaptive configuration types and added independent Chromium, Firefox, and WebKit core media regressions to CI.

- Prepared the initial public prerelease of GAudio.
- Added the core `AudioPlayer`, typed events, playlist support, fallback sources, alternate audio tracks, Media Session integration, and Web Audio analysis helpers.
- Added optional HLS and DASH entry points with adaptive playback presets, content-type tuning, manifest/segment events, variant reporting, and quality controls where supported.
- Prepared ESM, CommonJS, and TypeScript declaration entry points for `gaudio`, `gaudio/hls`, and `gaudio/dash`.
- Rejected child `<source>` elements in directly injected media engines so cleanup cannot reactivate browser-owned media candidates.
- Preserved active-engine volume, mute, and playback-rate changes when later source loads switch playback protocols.
- Made Media Session ownership follow the last-playing or explicitly activated player, with transactional restoration and retryable cleanup failures.
- Made player and engine disposal return `Promise<void>`, wait for browser/source/vendor cleanup, and remove router knowledge of concrete media-engine cleanup state.
- Restricted the optional `hls.js` peer to `>=1.6.16 <1.7.0` because the declarations published by `hls.js` 1.7 do not pass the supported TypeScript consumer matrix.
