# GAudio Next Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add release basics, richer public playback APIs, browser E2E coverage, source helpers, and a more convincing docs/demo experience.

**Architecture:** Keep `AudioPlayer` as the user-facing API and extend the existing `AudioEngineRouter`, `AudioEngine`, and adapter contracts instead of adding parallel control paths. Keep HLS/DASH vendor-specific details in their subpaths while exposing protocol-neutral quality controls only where both vendors can support the same behavior. Rework the VitePress demo through existing Vue components and composables.

**Tech Stack:** TypeScript 6, pnpm, Turborepo, Vitest, Playwright, Vue 3, VitePress, tsdown.

---

### Task 1: Release And CI Basics

**Files:**
- Create: `LICENSE`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Modify: `package.json`

- [ ] Add an MIT license file using `gaudio contributors`.
- [ ] Add PR CI for install, typecheck, lint, tests, build, and browser E2E.
- [ ] Add a protected manual npm publish workflow that runs the full verification chain before publishing `packages/gaudio`.
- [ ] Add a root `e2e` script that delegates to Playwright after browser test files exist.

### Task 2: Event API Additions

**Files:**
- Modify: `packages/gaudio/src/events/event-emitter.test.ts`
- Modify: `packages/gaudio/src/events/event-emitter.ts`
- Modify: `packages/gaudio/src/player/audio-player.test.ts`
- Modify: `packages/gaudio/src/player/audio-player.ts`

- [ ] Write failing tests for `EventEmitter.once()`, `EventEmitter.clear(eventName)`, `AudioPlayer.once()`, and `AudioPlayer.removeAllListeners(eventName?)`.
- [ ] Implement the minimal event API without weakening payload typing.
- [ ] Document the new methods in TSDoc, README, and API examples.

### Task 3: Source And Capability APIs

**Files:**
- Modify: `packages/gaudio/src/source/http-audio-source.test.ts`
- Create: `packages/gaudio/src/source/blob-audio-source.test.ts`
- Create: `packages/gaudio/src/source/blob-audio-source.ts`
- Modify: `packages/gaudio/src/source/audio-source.ts`
- Modify: `packages/gaudio/src/player/audio-player.test.ts`
- Modify: `packages/gaudio/src/player/audio-player.ts`
- Modify: `packages/gaudio/src/index.ts`

- [ ] Add tests for `BlobAudioSource`, `AudioPlayer.getSource()`, `getActiveProtocol()`, and adapter-aware `canPlayType()`.
- [ ] Add `BlobAudioSource` with object URL ownership and cleanup.
- [ ] Track current source and active adaptive playback info in `AudioPlayer`.
- [ ] Make support checks include registered adapters without breaking native `canPlayType()` behavior.

### Task 4: Unified Manual Quality API

**Files:**
- Modify: `packages/gaudio/src/adapters/adaptive-audio-types.ts`
- Modify: `packages/gaudio/src/engine/audio-engine.ts`
- Modify: `packages/gaudio/src/engine/audio-engine-router.ts`
- Modify: `packages/gaudio/src/player/audio-player.ts`
- Modify: `packages/gaudio/src/adapters/hls/hls-audio-engine.ts`
- Modify: `packages/gaudio/src/adapters/dash/dash-audio-engine.ts`
- Modify: adapter and player tests.

- [ ] Add failing tests for available variants, automatic quality restore, and manual variant selection through `AudioPlayer`.
- [ ] Implement `getAdaptiveVariants()`, `getAdaptiveQualitySelection()`, `setAdaptiveQuality('auto' | variantId)`, and `getActiveAdaptivePlayback()`.
- [ ] Keep native HLS returning an unsupported typed error for manual selection.
- [ ] Emit existing `variantchange` events with `reason: 'manual'` when manual selection succeeds.

### Task 5: Browser E2E

**Files:**
- Create: `playwright.config.ts`
- Create: `apps/docs/e2e/audio-demo.spec.ts`
- Modify: `package.json`
- Modify: `apps/docs/package.json`
- Modify: workflows.

- [ ] Add Playwright config that starts `pnpm run docs:dev`.
- [ ] Verify docs app loads, the interactive example renders, sample loading works, play controls are clickable, and the music-player surface is visible.
- [ ] Add CI browser installation through `pnpm exec playwright install --with-deps chromium`.

### Task 6: Docs And Demo Experience

**Files:**
- Modify: VitePress theme files under `apps/docs/.vitepress/theme`
- Modify: `apps/docs/index.md`
- Modify: `apps/docs/examples/*.vue`
- Modify: `apps/docs/examples/use-gaudio-demo.ts`
- Modify: guide pages and tests.

- [ ] Add API code examples beside each key API group.
- [ ] Redesign the interactive demo as a polished music-player surface with album art, waveform/progress, quality control, status, and event trace.
- [ ] Keep advanced source/protocol controls available without making them dominate the first view.
- [ ] Preserve bilingual demo text and add docs tests that enforce the new example coverage.

### Verification

- [ ] Run `pnpm run typecheck`.
- [ ] Run `pnpm run lint`.
- [ ] Run `pnpm run test`.
- [ ] Run `pnpm run build`.
- [ ] Run `pnpm run e2e` after Playwright browsers are installed.
