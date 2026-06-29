# GAudio Extensibility Plan

> Date: 2026-06-18  
> Scope: Future-facing product, API, architecture, documentation, testing, and release plan for an open-source browser audio library.

## Goals

- Keep `AudioPlayer` the stable high-level API for most users.
- Keep optional protocols and heavy vendors out of the core bundle.
- Support simple configuration for common needs and custom hooks for advanced integrations.
- Make every public API documented, typed, and testable before a 1.0 release.
- Prefer incremental extension points over broad rewrites.

## Current Extension Points

| Area | Existing extension point | Notes |
| --- | --- | --- |
| Source lifecycle | `AudioSource` | Supports signed URLs, object URLs, app-owned cleanup, and protocol hints. |
| Protocol engines | `AudioEngineAdapter` | Supports HLS/DASH today and future manifest protocols later. |
| Playback engine | Optional `AudioPlayer` custom engine | Useful for tests, app-owned media engines, or non-standard playback backends. |
| Audio analysis | `AudioPlayerOptions.analyzer` and `AudioAnalyzer` | Simple player config plus custom Web Audio factory. |
| Adaptive config | HLS `updateConfig`, DASH `updateSettings` | Vendor-specific runtime controls stay outside core. |
| Observability | Typed `AudioPlayerEvents` | Stable event map for UI, diagnostics, and telemetry adapters. |

## API Stability Plan

### Pre-1.0

- Allow purposeful breaking changes when they simplify the long-term surface.
- Keep every new public export documented in TSDoc, README, VitePress guide, and TypeDoc.
- Use minor version bumps for new user-facing APIs even while `0.x`.
- Maintain migration notes when renaming options, states, events, or error codes.

### 1.0 Readiness Checklist

- Freeze `AudioPlayerOptions`, `PlaybackState`, `AudioPlayerEvents`, and `GAudioErrorCode`.
- Decide whether `AudioEngine` remains public for direct app use or is documented primarily as an adapter contract.
- Add browser E2E coverage for native media, HLS, DASH, analyzer, autoplay rejection, and source switching.
- Publish changelog and compatibility policy.

## Analyzer Roadmap

### Near Term

- Keep `analyzer: true` as the simple path.
- Document CORS requirements for analyzing cross-origin media.
- Add demo copy that distinguishes "analyzer unavailable" from "browser returned silent samples".
- Consider an analyzer event or polling helper only if real users repeatedly need it.

### Future Options

- `player.setAnalyzerOptions(options)` for runtime FFT changes.
- A lightweight `createVisualizerLoop()` helper that stays outside core playback.
- Optional worklet or custom processor support for advanced metering.
- Separate analyzer lifecycle events if UI needs to react to analyzer creation or disposal.

### Non-Goals For Now

- Do not add DSP, EQ, filters, or effects chains to core playback.
- Do not assume analyzer output means audible playback; browser policy and CORS can produce silence.

## Protocol Roadmap

### HLS/DASH

- Keep vendor-specific controls in `gaudio/hls` and `gaudio/dash`.
- Add a protocol-neutral manual quality API only after both vendors can support equivalent behavior safely.
- Continue exposing vendor instances for advanced users, clearly marked as vendor-specific.

### Future Protocols

- Candidate adapters: progressive playlist, Icecast/Shoutcast, live HLS/DASH profiles, DRM-aware enterprise adapters.
- Each protocol should enter through a separate entry point if it adds vendor dependencies.
- Adapter tests should cover source routing, support detection, fatal/recoverable errors, and event translation.

## Source Roadmap

- Add examples for object URL cleanup and signed URL refresh.
- Consider a `BlobAudioSource` helper only if it reduces repeated user code.
- Keep `AudioSource` minimal: `open()` and `close()` are enough for most resource lifecycles.
- Avoid adding network fetch behavior to `HttpAudioSource`; engines and browsers should own media loading.

## Event And Error Roadmap

- Keep error codes stable and machine-readable.
- Add new error codes only when users can handle them differently.
- Keep adaptive recoverable failures on `streamerror` and fatal failures on `error`.
- Consider `warning` only if non-fatal core issues become common.

## Documentation Roadmap

- Maintain three layers:
  - README for install, quick start, and entry points.
  - VitePress guides for usage decisions and examples.
  - TypeDoc for declaration-level API details.
- Keep English and Chinese guide structure aligned.
- Add release notes and migration pages before 1.0.
- Keep interactive examples focused on real public APIs, not private internals.

## Testing Roadmap

- Unit tests: source lifecycle, player orchestration, router switching, adapter settings, analyzer config.
- Type tests: public entry points, optional peer isolation, important inferred option types.
- Browser E2E: media playback, analyzer availability, HLS/DASH manifests, GitHub Pages base path.
- CI: typecheck, lint, tests, package build, docs build, and docs deployment.

## Release And CI Plan

- Keep docs deployment separate from npm publishing.
- Require green typecheck, lint, tests, and build before release.
- Add npm provenance and package attestations later if publishing becomes automated.
- Use GitHub Pages workflow for documentation only; package publishing should be a separate manual or protected workflow.

## Open Decisions

| Decision | Options | Recommendation |
| --- | --- | --- |
| Version bump for analyzer config | Patch, minor, beta | Use `0.5.0` or `0.5.0-beta.0` before publish. |
| Runtime analyzer reconfiguration | New setter, recreate on load only | Keep recreate-on-load until real runtime demand appears. |
| Unified manual quality | Protocol-neutral API, vendor-only docs | Keep vendor-only until behavior can be equivalent. |
| Low-level engine API | Public stable API, adapter contract | Treat as public but advanced; document most users should use `AudioPlayer`. |

## Implementation Backlog

- [ ] Add browser E2E for analyzer-enabled MP3 playback.
- [ ] Add docs page for custom `AudioSource` patterns.
- [ ] Add migration/changelog page before next package publish.
- [ ] Decide and apply next version bump.
- [ ] Add release workflow after docs deployment is stable.
