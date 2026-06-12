# GAudio 0.4.0 Adaptive VOD Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional HLS and MPEG-DASH VOD adapters with automatic protocol routing, unified adaptive events, vendor configuration access, and same-player protocol switching.

**Architecture:** Keep `AudioPlayer` focused on public state and controls. Add an `AudioEngineRouter` that selects and owns one engine at a time, while `gaudio/hls` and `gaudio/dash` provide optional adapter implementations backed by peer dependencies. Vendor modules translate their events into protocol-neutral engine events and retain vendor-specific instances and configuration APIs on the adapter objects.

**Tech Stack:** TypeScript 6, DOM media APIs, `hls.js`, `dashjs`, Vitest, Vue 3, Vite, pnpm, tsdown.

---

## File Structure

- Modify `src/types.ts`: add protocols, source descriptions, adaptive payloads, player options, events, and error codes.
- Modify `src/source/audio-source.ts`: add optional protocol metadata and the source-input union.
- Modify `src/source/http-audio-source.ts`: accept string or source description while retaining the existing constructor call.
- Create `src/source/audio-protocol.ts`: resolve a source protocol from explicit metadata, MIME type, or URL pathname.
- Create `src/source/audio-protocol.test.ts`: verify protocol-selection priority and fallback.
- Create `src/engine/audio-engine-adapter.ts`: define the vendor-neutral adapter factory contract.
- Create `src/engine/audio-engine-router.ts`: route loads, transfer settings, switch engines, and suppress stale events.
- Create `src/engine/audio-engine-router.test.ts`: verify routing and lifecycle behavior with fake engines.
- Modify `src/engine/audio-engine.ts`: add adaptive event keys to the engine event contract.
- Modify `src/engine/media-element-audio-engine.ts`: expose protected media hooks used by vendor engines.
- Modify `src/player/audio-player.ts`: create the router when adapters are configured and forward adaptive events.
- Modify `src/player/audio-player.test.ts`: verify source descriptions, custom-engine conflict, and adaptive events.
- Create `src/adapters/hls/hls-audio-adapter.ts`: select native or `hls.js`, own active instance, and update configuration.
- Create `src/adapters/hls/hls-audio-engine.ts`: attach HLS sources and translate vendor events.
- Create `src/adapters/hls/hls-audio-adapter.test.ts`: verify strategies, events, errors, and reload behavior.
- Create `src/adapters/hls/index.ts`: public HLS subpath exports.
- Create `src/adapters/dash/dash-audio-adapter.ts`: own the active dash.js player and settings.
- Create `src/adapters/dash/dash-audio-engine.ts`: initialize DASH playback and translate vendor events.
- Create `src/adapters/dash/dash-audio-adapter.test.ts`: verify settings, events, errors, and lifecycle.
- Create `src/adapters/dash/index.ts`: public DASH subpath exports.
- Modify `src/index.ts`: export only vendor-neutral adaptive types and contracts.
- Modify `tsdown.config.ts`: build root, HLS, and DASH entry points.
- Modify `package.json` and `pnpm-lock.yaml`: add optional peers, development dependencies, subpath exports, and version 0.4.0.
- Create `src/package-exports.test.ts`: verify package metadata, build configuration, and root source isolation.
- Modify `demo/composables/use-gaudio-demo.ts`: register adapters and display adaptive events.
- Modify `demo/App.vue`: add source protocol override and adaptive status.
- Modify `demo/demo.test.ts`: require adaptive demo and documentation coverage.
- Modify `README.md`: document installation, usage, strategies, events, configuration updates, limitations, and migration.

### Task 1: Source Metadata and Protocol Selection

**Files:**
- Modify: `src/types.ts`
- Modify: `src/source/audio-source.ts`
- Modify: `src/source/http-audio-source.ts`
- Create: `src/source/audio-protocol.ts`
- Test: `src/source/audio-protocol.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing protocol-selection tests**

Create tests that construct `HttpAudioSource` instances and assert:

```ts
expect(resolveAudioProtocol(new HttpAudioSource({
  url: '/stream?id=1',
  protocol: 'dash',
  mimeType: 'application/vnd.apple.mpegurl',
}))).toBe('dash')

expect(resolveAudioProtocol(new HttpAudioSource({
  url: '/stream?id=1',
  mimeType: 'application/vnd.apple.mpegurl',
}))).toBe('hls')

expect(resolveAudioProtocol(new HttpAudioSource('/audio/episode.mpd?token=abc#start'))).toBe('dash')
expect(resolveAudioProtocol(new HttpAudioSource('/audio/episode.m3u8?token=abc'))).toBe('hls')
expect(resolveAudioProtocol(new HttpAudioSource('/audio/episode.mp3'))).toBe('media')
```

Also assert HLS MIME aliases `application/vnd.apple.mpegurl` and `application/x-mpegURL`, case-insensitively.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm exec vitest run src/source/audio-protocol.test.ts`

Expected: FAIL because the source description types and `resolveAudioProtocol` do not exist.

- [ ] **Step 3: Add source and adaptive public types**

Add protocol and source-description types to `src/types.ts`:

```ts
export type AudioProtocol = 'media' | 'hls' | 'dash'
export type AdaptiveAudioProtocol = Exclude<AudioProtocol, 'media'>

export interface AudioSourceDescription {
  url: string
  protocol?: AudioProtocol
  mimeType?: string
}

```

Add optional `protocol` and `mimeType` to `AudioSource`, and define `AudioSourceInput = string | AudioSourceDescription | AudioSource` beside the interface in `src/source/audio-source.ts` to avoid a type cycle. Change `HttpAudioSource` to accept `string | AudioSourceDescription`, store metadata, and return the URL unchanged from `open()`.

- [ ] **Step 4: Implement deterministic protocol resolution**

Create `resolveAudioProtocol(source)` with direct priority checks: explicit protocol, lowercase MIME lookup, URL pathname extension after removing query/fragment, then `media`. Do not perform network requests or infer from unrelated URL text.

Add the required concise AI modification comment explaining that deterministic local selection avoids duplicate manifest requests.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
pnpm exec vitest run src/source/audio-protocol.test.ts
pnpm run typecheck:library
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/source src/index.ts
git commit -m "feat: describe adaptive audio sources"
```

### Task 2: Engine Router and Adapter Contract

**Files:**
- Create: `src/engine/audio-engine-adapter.ts`
- Create: `src/engine/audio-engine-router.ts`
- Test: `src/engine/audio-engine-router.test.ts`
- Modify: `src/engine/audio-engine.ts`
- Modify: `src/engine/media-element-audio-engine.ts`
- Modify: `src/types.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing router tests**

Use fake engines and adapters to assert:

```ts
const router = new AudioEngineRouter({
  adapters: [hlsAdapter, dashAdapter],
  mediaEngineFactory: () => mediaEngine,
})

await router.load(new HttpAudioSource('/stream.m3u8'))
expect(hlsAdapter.createCalls).toBe(1)

router.setVolume(0.4)
router.setMuted(true)
await router.load(new HttpAudioSource('/stream.mpd'))
expect(dashEngine.getVolume()).toBe(0.4)
expect(dashEngine.isMuted()).toBe(true)
expect(hlsEngine.disposeCalls).toBe(1)
```

Additional tests must verify media fallback, `ADAPTER_UNAVAILABLE`, duplicate protocol rejection, adapter ownership rejection across concurrent routers, release on dispose, event rebinding, and suppression of late events from a disposed engine.

- [ ] **Step 2: Run the router test and confirm RED**

Run: `pnpm exec vitest run src/engine/audio-engine-router.test.ts`

Expected: FAIL because the router and adapter contract do not exist.

- [ ] **Step 3: Define adaptive payloads and engine events**

Add the design types `AdaptivePlaybackInfo`, `AdaptiveVariant`, `AdaptiveManifestUpdate`, `AdaptiveVariantUpdate`, `AdaptiveSegmentUpdate`, and `AdaptiveStreamError`. Extend `AudioEngineEvents` and `AudioPlayerEvents` with:

```ts
adaptivechange: AdaptivePlaybackInfo
manifestloaded: AdaptiveManifestUpdate
variantchange: AdaptiveVariantUpdate
segmentloadstart: AdaptiveSegmentUpdate
segmentloaded: AdaptiveSegmentUpdate
streamerror: AdaptiveStreamError
```

Add the five adaptive error codes from the design.

- [ ] **Step 4: Implement the adapter contract and router**

Define:

```ts
export interface AudioEngineAdapter {
  readonly protocol: AdaptiveAudioProtocol
  createEngine: () => AudioEngine
  isSupported: () => boolean
}
```

The router must keep a settings snapshot, lazily create the first engine on `load()`, apply all settings before engine loading, bind every engine event, dispose replaced engines, and use a generation number in event closures. Track adapter ownership in a module-level `WeakMap<AudioEngineAdapter, AudioEngineRouter>` and release it on router disposal.

For getters before the first load, return the router's settings snapshot and neutral media state (`0`, `true`, `false`, or empty ranges as appropriate).

- [ ] **Step 5: Add protected media-element hooks**

Change `audioElement` to `protected readonly` and route source attachment through protected methods:

```ts
protected attachSourceUrl(url: string): void
protected detachSourceUrl(): void
```

The base implementation keeps the current `src`, `load()`, and attribute-removal behavior. Vendor engines override only attachment and cleanup while reusing media controls and events.

- [ ] **Step 6: Run router, media-engine, and type tests**

Run:

```bash
pnpm exec vitest run src/engine/audio-engine-router.test.ts src/engine/media-element-audio-engine.test.ts
pnpm run typecheck:library
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine src/types.ts src/index.ts
git commit -m "feat: route audio sources to protocol engines"
```

### Task 3: AudioPlayer Router Integration

**Files:**
- Modify: `src/types.ts`
- Modify: `src/player/audio-player.ts`
- Test: `src/player/audio-player.test.ts`

- [ ] **Step 1: Write failing player integration tests**

Add tests for:

```ts
const player = new AudioPlayer({ adapters: [hlsAdapter] })
player.setSource({ url: '/stream?id=1', protocol: 'hls' })
await player.load()
expect(hlsAdapter.createCalls).toBe(1)
```

Assert that passing adapters and an explicit constructor engine throws `TypeError`, all six adaptive events are forwarded with unchanged payloads, fatal adaptive engine errors still reach the existing `error` event, and `dispose()` releases router ownership.

- [ ] **Step 2: Run player tests and confirm RED**

Run: `pnpm exec vitest run src/player/audio-player.test.ts`

Expected: FAIL on missing `adapters`, source descriptions, and adaptive event forwarding.

- [ ] **Step 3: Integrate the router**

Add `adapters?: readonly AudioEngineAdapter[]` to `AudioPlayerOptions`. Change the constructor's engine parameter to optional so the implementation can distinguish omitted injection from an explicit custom engine. Construct `AudioEngineRouter` only when no engine is supplied. Reject mixed ownership before applying settings.

Change constructor source handling and `setSource()` to create `HttpAudioSource` from string or description while preserving custom `AudioSource` objects.

Forward all adaptive engine events in `connectEngineEvents()`. Keep fatal state transitions driven by the engine's existing `error` event rather than treating every `streamerror` as fatal.

- [ ] **Step 4: Run player tests and full existing tests**

Run:

```bash
pnpm exec vitest run src/player/audio-player.test.ts
pnpm run test
```

Expected: PASS with existing ordinary-media behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/player src/types.ts
git commit -m "feat: register adaptive engines in audio player"
```

### Task 4: HLS Adapter

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/adapters/hls/hls-audio-adapter.ts`
- Create: `src/adapters/hls/hls-audio-engine.ts`
- Create: `src/adapters/hls/hls-audio-adapter.test.ts`
- Create: `src/adapters/hls/index.ts`

- [ ] **Step 1: Install the HLS development dependency**

Run: `pnpm add -D hls.js`

Expected: the current stable `hls.js` release is added to `devDependencies` and the lockfile.

- [ ] **Step 2: Write failing HLS strategy tests**

Use fake audio elements and a fake HLS constructor to verify all four strategies. Required assertions:

```ts
expect(nativeFirst.implementation).toBe('native')
expect(hlsFirst.implementation).toBe('hls.js')
expect(() => unsupportedNativeOnly.createEngine()).toThrowError(
  expect.objectContaining({ code: 'PROTOCOL_UNSUPPORTED' }),
)
```

Also verify `hlsInstance` is defined only for the vendor path and cleared on engine disposal.

- [ ] **Step 3: Run HLS tests and confirm RED**

Run: `pnpm exec vitest run src/adapters/hls/hls-audio-adapter.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 4: Implement strategy selection and source attachment**

Create public `HlsPlaybackStrategy`, `HlsConfigUpdateOptions`, `HlsAdapterOptions`, and `HlsAudioAdapter` types using the official `HlsConfig` and `Hls` types. The production factory imports `Hls` only from the HLS subpath module.

The HLS engine extends `MediaElementAudioEngine`. Native mode assigns the manifest URL to the media element. Vendor mode creates `new Hls(config)`, attaches the element, loads the source, and destroys the instance during detach/dispose.

- [ ] **Step 5: Write failing HLS event and error tests**

Drive fake vendor events and assert translation for manifest variants, initial/automatic level switches, fragment load start/completion, recoverable errors, and fatal manifest/segment/other errors. Fatal errors must emit both `streamerror` and a typed `GAudioError`; recoverable errors must not emit `error`.

- [ ] **Step 6: Run event tests and confirm RED**

Run: `pnpm exec vitest run src/adapters/hls/hls-audio-adapter.test.ts`

Expected: FAIL on missing event translation.

- [ ] **Step 7: Implement HLS event translation**

Use official `Hls.Events` constants. Convert levels directly to `AdaptiveVariant` objects with stable string IDs. Track the previous level ID for `variantchange`. Preserve vendor event objects as `cause` without exporting vendor enums from the core entry.

- [ ] **Step 8: Write failing configuration update tests**

Assert that `next-load` merges configuration without replacing the active instance; native mode stores configuration only; `reload` replaces the active HLS instance, restores finite current time by default, resumes only when previously playing unless overridden, and rejects with a typed error when reload fails.

- [ ] **Step 9: Implement explicit HLS reload semantics**

Store the active source URL and media state inside the HLS engine. For reload, destroy and recreate only the vendor object on the same media element, wait for metadata, restore position when enabled, and call `play()` according to `resumePlayback`. Do not claim or attempt buffer, request, bandwidth-estimate, or retry-state preservation.

- [ ] **Step 10: Run HLS tests and type checking**

Run:

```bash
pnpm exec vitest run src/adapters/hls/hls-audio-adapter.test.ts
pnpm run typecheck:library
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml src/adapters/hls
git commit -m "feat: add optional HLS playback adapter"
```

### Task 5: DASH Adapter

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/adapters/dash/dash-audio-adapter.ts`
- Create: `src/adapters/dash/dash-audio-engine.ts`
- Create: `src/adapters/dash/dash-audio-adapter.test.ts`
- Create: `src/adapters/dash/index.ts`

- [ ] **Step 1: Install the DASH development dependency**

Run: `pnpm add -D dashjs`

Expected: the current stable `dashjs` release is added to `devDependencies` and the lockfile.

- [ ] **Step 2: Write failing DASH lifecycle and settings tests**

Use a fake `MediaPlayer().create()` result to assert initialization with the media element and manifest URL, autoplay disabled, `dashInstance` exposure, destruction on dispose, settings storage before activation, incremental `updateSettings()` while active, and `PROTOCOL_UNSUPPORTED` when MSE support is unavailable.

- [ ] **Step 3: Run DASH tests and confirm RED**

Run: `pnpm exec vitest run src/adapters/dash/dash-audio-adapter.test.ts`

Expected: FAIL because the DASH adapter does not exist.

- [ ] **Step 4: Implement DASH adapter and engine**

Use the official dashjs player and settings types exported by the installed version. The adapter stores a deep settings snapshot using `structuredClone` and delegates active changes to `updateSettings()`. The engine extends `MediaElementAudioEngine`, calls `initialize(audioElement, url, false)`, and calls `reset()` when detached or disposed.

Add a concise AI modification comment explaining why settings are cloned before vendor mutation.

- [ ] **Step 5: Write failing DASH event and error tests**

Translate stream initialization/manifest events, representation switches, fragment loading start/completion, and DASH errors into the unified adaptive payloads. Verify recoverable request failures stay as `streamerror` and fatal manifest/media failures also emit a typed player error.

- [ ] **Step 6: Implement DASH event translation**

Use dashjs `MediaPlayer.events` constants from the installed package. Derive audio variants from available audio representations, use representation IDs as strings, and preserve raw events as `cause`. Categorize errors without leaking dashjs numeric codes into the core API.

- [ ] **Step 7: Run DASH tests and type checking**

Run:

```bash
pnpm exec vitest run src/adapters/dash/dash-audio-adapter.test.ts
pnpm run typecheck:library
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/adapters/dash
git commit -m "feat: add optional DASH playback adapter"
```

### Task 6: Package Entry Points and Optional Peers

**Files:**
- Modify: `src/index.ts`
- Modify: `tsdown.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/package-exports.test.ts`

- [ ] **Step 1: Write failing package-shape tests**

Assert `package.json` contains `./hls` and `./dash` exports, both vendor packages are optional peers, `tsdown.config.ts` contains three entries, and `src/index.ts` contains no vendor import. Keep generated-output checks in the explicit build verification so a clean `pnpm run test` does not depend on a pre-existing `dist` directory.

- [ ] **Step 2: Run package tests and confirm RED**

Run: `pnpm exec vitest run src/package-exports.test.ts`

Expected: FAIL until exports and build entries exist.

- [ ] **Step 3: Configure subpath builds and peers**

Build named entries `index`, `hls`, and `dash`. Add matching ESM, CJS, and declaration paths under `exports`. Keep vendor libraries external. Add both packages to `peerDependencies` using the installed compatible major ranges and set both entries to `optional: true` in `peerDependenciesMeta`; retain them in `devDependencies` for this repository.

Export vendor-neutral contracts and adaptive types from the root. Export vendor-specific types, factories, and official vendor types only from their subpaths.

- [ ] **Step 4: Build and run package-shape tests**

Run:

```bash
pnpm run build
pnpm exec vitest run src/package-exports.test.ts
```

Expected: all three entry points and declarations exist. Inspect `dist/index.js` and `dist/index.cjs` with `rg "hls\\.js|dashjs" dist/index.*`; the command must return no matches.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/package-exports.test.ts tsdown.config.ts package.json pnpm-lock.yaml
git commit -m "build: publish adaptive playback subpaths"
```

### Task 7: Demo, Documentation, and Version

**Files:**
- Modify: `demo/composables/use-gaudio-demo.ts`
- Modify: `demo/App.vue`
- Modify: `demo/demo.test.ts`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing demo and documentation assertions**

Require imports from `gaudio/hls` and `gaudio/dash`, adapter registration, protocol override, `adaptivechange`, `manifestloaded`, `variantchange`, `segmentloaded`, `streamerror`, adaptive status labels, README installation commands, HLS strategy documentation, runtime configuration examples, native limitations, and version `0.4.0`.

- [ ] **Step 2: Run demo tests and confirm RED**

Run: `pnpm exec vitest run demo/demo.test.ts`

Expected: FAIL on all new adaptive requirements.

- [ ] **Step 3: Extend the demo composable**

Create one native-first HLS adapter and one DASH adapter, register them with `AudioPlayer`, expose protocol override (`auto`, `media`, `hls`, `dash`), and update reactive fields for implementation, variant, bitrate, manifest variant count, segment status, and stream errors.

For custom URL loading, pass a source description only when the protocol override is not `auto`. Keep bundled local samples on normal media routing.

- [ ] **Step 4: Extend the demo template**

Add a compact protocol-override select near the source URL. Add adaptive implementation, variant, bitrate, and segment state to the existing status grid. Keep existing layout conventions and do not redesign unrelated styling.

- [ ] **Step 5: Update README and version metadata**

Document:

- Core-only, HLS, and DASH installation.
- Automatic and explicit protocol selection.
- HLS strategy behavior.
- Unified events and native-HLS event limitations.
- Read-only vendor instances.
- HLS `next-load` and `reload` configuration updates.
- DASH runtime settings updates.
- `0.3.0` to `0.4.0` migration and optional peers.
- VOD-only limitations for live, DRM, playlists, offline media, and manual quality selection.

Set package and lockfile importer versions to `0.4.0`.

- [ ] **Step 6: Run demo verification**

Run:

```bash
pnpm exec vitest run demo/demo.test.ts
pnpm run typecheck:demo
pnpm run demo:build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add demo README.md package.json pnpm-lock.yaml
git commit -m "docs: demonstrate adaptive VOD playback"
```

### Task 8: Full Verification and Scope Review

**Files:**
- Review all files changed by Tasks 1-7.

- [ ] **Step 1: Run automatic formatting fixes**

Run: `pnpm run lint --fix`

Expected: formatting changes only; no disabled rules.

- [ ] **Step 2: Run the complete verification chain**

Run in order:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run demo:build
pnpm run build
pnpm exec vitest run src/package-exports.test.ts
git diff --check
```

Expected: every command exits successfully with zero test failures and all three package entries generated.

- [ ] **Step 3: Review requirements against the design**

Confirm by inspection that:

- The root entry has no vendor import.
- Both protocols support VOD playback and same-player switching.
- HLS exposes four selection strategies and defaults to native-first.
- Both official configuration surfaces and active instances are public from subpaths.
- HLS reload semantics are explicit and tested.
- Unified events cover implementation, manifest, variant, segment, and errors.
- Native HLS limitations are documented.
- Live, DRM, offline, playlists, and manual quality controls were not added.

- [ ] **Step 4: Review git status and final diff**

Run:

```bash
git status --short --branch
git diff HEAD~7 --stat
```

Expected: only planned source, test, demo, build, metadata, and documentation changes are present.

- [ ] **Step 5: Commit verification-only formatting changes if needed**

```bash
git add .
git commit -m "chore: finalize adaptive playback iteration"
```

Skip this commit when Step 1 produced no tracked changes.
