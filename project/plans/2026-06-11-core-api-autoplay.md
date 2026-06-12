# GAudio 0.3.0 Core API and Autoplay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add autoplay, pitch preservation, fast seek, played ranges, and strict numeric input validation to the public player API.

**Architecture:** `AudioPlayer` owns public validation and autoplay orchestration, while `AudioEngine` exposes runtime capabilities and `MediaElementAudioEngine` delegates them to `HTMLAudioElement`. Existing event and time-range representations remain unchanged, and the Vue demo exercises the new API without adding dependencies.

**Tech Stack:** TypeScript 6, DOM media APIs, Vitest, Vue 3, Vite, pnpm, tsdown.

---

## File Structure

- Modify `src/types.ts`: add autoplay and pitch-preservation player options.
- Modify `src/engine/audio-engine.ts`: add engine capability methods.
- Modify `src/engine/media-element-audio-engine.ts`: implement media properties, fast seek fallback, and played ranges.
- Modify `src/engine/media-element-audio-engine.test.ts`: verify browser-engine behavior.
- Modify `src/player/audio-player.ts`: expose public APIs, validate inputs, and orchestrate autoplay.
- Modify `src/player/audio-player.test.ts`: verify public behavior and error semantics.
- Modify `demo/composables/use-gaudio-demo.ts`: bind new controls and played-range state.
- Modify `demo/App.vue`: expose autoplay, pitch preservation, fast seek, and played ranges.
- Modify `demo/demo.test.ts`: assert demo and documentation coverage.
- Modify `README.md`: document 0.3.0 API and engine migration.
- Modify `package.json`: bump package version to 0.3.0.
- Modify `pnpm-lock.yaml`: synchronize package version metadata.

### Task 1: Media Element Engine Capabilities

**Files:**
- Modify: `src/engine/audio-engine.ts`
- Modify: `src/engine/media-element-audio-engine.ts`
- Test: `src/engine/media-element-audio-engine.test.ts`

- [ ] **Step 1: Write failing engine tests**

Extend `FakeAudioElement` with `autoplay`, `preservesPitch`, `played`, an optional `fastSeek`, and call tracking. Add tests equivalent to:

```ts
it('exposes autoplay, pitch preservation, and played ranges', () => {
  const audioElement = new FakeAudioElement()
  audioElement.played = new FakeTimeRanges([{ start: 2, end: 8 }])
  const engine = new MediaElementAudioEngine(audioElement as unknown as HTMLAudioElement)

  engine.setAutoplay(true)
  engine.setPreservesPitch(false)

  expect(engine.getAutoplay()).toBe(true)
  expect(engine.getPreservesPitch()).toBe(false)
  expect(engine.getPlayedRanges()).toEqual([{ start: 2, end: 8 }])
})

it('uses native fast seek when available and falls back to currentTime', async () => {
  const nativeElement = new FakeAudioElement()
  nativeElement.fastSeek = seconds => nativeElement.fastSeekCalls.push(seconds)
  const nativeEngine = new MediaElementAudioEngine(nativeElement as unknown as HTMLAudioElement)

  await nativeEngine.fastSeek(12)
  expect(nativeElement.fastSeekCalls).toEqual([12])

  const fallbackElement = new FakeAudioElement()
  const fallbackEngine = new MediaElementAudioEngine(fallbackElement as unknown as HTMLAudioElement)
  await fallbackEngine.fastSeek(18)
  expect(fallbackElement.currentTime).toBe(18)
})
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run src/engine/media-element-audio-engine.test.ts`

Expected: FAIL because the new engine methods do not exist.

- [ ] **Step 3: Extend the engine contract and implementation**

Add these methods to `AudioEngine` and `MediaElementAudioEngine`:

```ts
fastSeek: (seconds: number) => Promise<void>
setAutoplay: (shouldAutoplay: boolean) => void
getAutoplay: () => boolean
setPreservesPitch: (shouldPreservePitch: boolean) => void
getPreservesPitch: () => boolean
getPlayedRanges: () => readonly TimeRange[]
```

Implement browser behavior directly:

```ts
async fastSeek(seconds: number): Promise<void> {
  // AI modified: use optimized browser seeking when available while retaining broad compatibility.
  if (typeof this.audioElement.fastSeek === 'function') {
    this.audioElement.fastSeek(seconds)
    return
  }
  await this.seek(seconds)
}

setAutoplay(shouldAutoplay: boolean): void {
  this.audioElement.autoplay = shouldAutoplay
}

getAutoplay(): boolean {
  return this.audioElement.autoplay
}

setPreservesPitch(shouldPreservePitch: boolean): void {
  this.audioElement.preservesPitch = shouldPreservePitch
}

getPreservesPitch(): boolean {
  return this.audioElement.preservesPitch
}

getPlayedRanges(): readonly TimeRange[] {
  return this.timeRanges(this.audioElement.played)
}
```

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec vitest run src/engine/media-element-audio-engine.test.ts`

Expected: PASS.

### Task 2: Player API, Validation, and Autoplay

**Files:**
- Modify: `src/types.ts`
- Modify: `src/player/audio-player.ts`
- Test: `src/player/audio-player.test.ts`

- [ ] **Step 1: Extend the fake engine and write failing player tests**

Add engine state and methods for autoplay, pitch preservation, fast seek, and played ranges. Add tests for option forwarding, runtime accessors, autoplay success, autoplay rejection, retry without reload, and numeric validation. Core assertions:

```ts
expect(() => player.setVolume(Number.NaN)).toThrow(RangeError)
expect(() => player.setVolume(1.1)).toThrow(RangeError)
expect(() => player.setPlaybackRate(0)).toThrow(RangeError)
await expect(player.seek(-1)).rejects.toThrow(RangeError)
await expect(player.fastSeek(Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError)
```

Autoplay tests must assert:

```ts
const player = new AudioPlayer({ source: '/audio.mp3', autoplay: true }, engine)
await player.load()
expect(engine.playCalls).toBe(1)
expect(engine.loadCalls).toBe(1)
```

For blocked autoplay, make `engine.play()` reject with `PLAYBACK_BLOCKED`, assert `load()` rejects and emits the error, then allow playback and call `player.play()`; `engine.loadCalls` must remain `1`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm exec vitest run src/player/audio-player.test.ts`

Expected: FAIL because the new options and methods do not exist and validation is not enforced.

- [ ] **Step 3: Add options and public delegation**

Add to `AudioPlayerOptions`:

```ts
autoplay?: boolean
preservesPitch?: boolean
```

Apply defaults in the constructor and add public getters/setters plus `fastSeek()` and `getPlayedRanges()`.

- [ ] **Step 4: Add validation before engine mutation**

Validate at the public boundary using direct guards:

```ts
if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
  throw new RangeError('Volume must be a finite number between 0 and 1')
}
```

Use equivalent checks for playback rate (`> 0`) and seek positions (`>= 0`). Keep these checks in the public methods rather than changing engine clamping behavior for direct engine consumers.

- [ ] **Step 5: Orchestrate autoplay after successful load**

After the current request is confirmed and `hasLoadedSource` becomes true, set state to `ready`, then call `play()` when autoplay is enabled. This reuses existing typed playback error publication and leaves `hasLoadedSource` true after a block so a manual retry does not reload.

```ts
if (loadRequestId === this.loadRequestId) {
  this.hasLoadedSource = true
  this.setState('ready')
  if (this.getAutoplay()) {
    // AI modified: explicit playback makes browser autoplay rejection observable to consumers.
    await this.play()
  }
}
```

- [ ] **Step 6: Run focused tests**

Run: `pnpm exec vitest run src/player/audio-player.test.ts`

Expected: PASS.

### Task 3: Demo Coverage

**Files:**
- Modify: `demo/composables/use-gaudio-demo.ts`
- Modify: `demo/App.vue`
- Test: `demo/demo.test.ts`

- [ ] **Step 1: Write failing demo source assertions**

Assert that the composable and template exercise `fastSeek`, autoplay, pitch preservation, and played ranges:

```ts
expect(composable).toContain('fastSeek')
expect(composable).toContain('setAutoplay')
expect(composable).toContain('setPreservesPitch')
expect(composable).toContain('getPlayedRanges')
expect(appVue).toContain('Autoplay')
expect(appVue).toContain('Preserve pitch')
expect(appVue).toContain('Played')
```

- [ ] **Step 2: Run demo test and confirm failure**

Run: `pnpm exec vitest run demo/demo.test.ts`

Expected: FAIL on the new assertions.

- [ ] **Step 3: Extend the composable**

Add reactive `shouldAutoplay`, `shouldPreservePitch`, and `playedLabel`. Initialize from the player, refresh played ranges during time updates and seeks, expose setters that call the new player APIs, and expose a `fastSeek` action using the current slider value.

- [ ] **Step 4: Extend the template**

Add a Fast seek button, Autoplay and Preserve pitch checkboxes, and a Played status cell. Keep the existing panel structure and CSS conventions.

- [ ] **Step 5: Run demo test and type check**

Run: `pnpm exec vitest run demo/demo.test.ts && pnpm run typecheck:demo`

Expected: PASS.

### Task 4: Version, Documentation, and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `demo/demo.test.ts`

- [ ] **Step 1: Update documentation assertions**

Change the expected version to `0.3.0` and require README coverage for `autoplay`, `fastSeek`, `preservesPitch`, `getPlayedRanges`, and `Migration from 0.2.0`.

- [ ] **Step 2: Run demo test and confirm failure**

Run: `pnpm exec vitest run demo/demo.test.ts`

Expected: FAIL until version metadata and README are updated.

- [ ] **Step 3: Update package metadata and README**

Set `package.json` and lockfile importer version to `0.3.0`. Update Quick Start, Core API, Demo, migration notes, validation behavior, autoplay policy rejection, and Current Limits. Remove the now-implemented APIs from Current Limits.

- [ ] **Step 4: Run complete verification**

Run in order:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run demo:build
pnpm run build
git diff --check
```

Expected: all commands PASS with no whitespace errors.

- [ ] **Step 5: Review scope and status**

Run: `git status --short` and `git diff --stat`

Expected: only the planned source, test, demo, metadata, and documentation files are modified.
