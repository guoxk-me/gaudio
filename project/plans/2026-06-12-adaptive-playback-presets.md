# Comprehensive Adaptive Playback Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the three adaptive playback profiles into complete, version-specific HLS and DASH configurations for cross-platform audio VOD.

**Architecture:** Each protocol owns a complete balanced audio VOD baseline and profile-specific differences. A shared recursive merge utility combines plain setting objects while replacing arrays, functions, regular expressions, class instances, and primitive values. Resolution order is baseline, selected profile, then caller overrides.

**Tech Stack:** TypeScript 6, hls.js 1.6.16, dash.js 5.2.0, Vitest 4, pnpm, ESLint, tsdown.

---

### Task 1: Safe Recursive Configuration Merge

**Files:**
- Create: `packages/gaudio/src/adapters/settings-with-changes.ts`
- Create: `packages/gaudio/src/adapters/settings-with-changes.test.ts`
- Modify: `packages/gaudio/src/adapters/dash/dash-audio-adapter.ts`

- [x] **Step 1: Write failing merge tests**

Test that `settingsWithChanges()` recursively retains untouched nested fields, replaces arrays and regular expressions, and does not mutate either input.

- [x] **Step 2: Verify RED**

Run: `pnpm --filter gaudio test -- src/adapters/settings-with-changes.test.ts`

Expected: FAIL because the shared module does not exist.

- [x] **Step 3: Implement the plain-record merge**

Export `settingsWithChanges<Settings extends object>(currentSettings, settingChanges): Settings`. Recurse only when both values have `Object.prototype` or `null` as their prototype. Return fresh plain-object branches and replace every other value.

- [x] **Step 4: Reuse it from DASH and verify GREEN**

Remove the private DASH merge implementation, import the shared function, and run the focused merge and DASH adapter tests.

### Task 2: Complete HLS Audio VOD Baseline

**Files:**
- Create: `packages/gaudio/src/adapters/hls/hls-vod-defaults.ts`
- Modify: `packages/gaudio/src/adapters/hls/hls-playback-presets.ts`
- Modify: `packages/gaudio/src/adapters/hls/hls-audio-adapter.ts`
- Test: `packages/gaudio/src/adapters/hls/hls-audio-adapter.test.ts`

- [x] **Step 1: Write failing baseline tests**

Assert the default `Balanced` configuration includes worker loading, disabled low latency, mobile-safe memory limits, stall recovery, VOD ABR, and complete manifest, playlist, fragment, and key request policies. Assert excluded live, DRM, interstitial, text, and video-only fields are absent.

- [x] **Step 2: Write failing profile tests**

Assert the exact FastStart/Balanced/Stable buffer, memory, ABR safety, loading delay, and request-policy values from the approved design.

- [x] **Step 3: Verify RED**

Run: `pnpm --filter gaudio test -- src/adapters/hls/hls-audio-adapter.test.ts`

Expected: FAIL because the current preset contains only four fields and uses shallow caller merging.

- [x] **Step 4: Implement the balanced HLS baseline**

Return a fresh `Partial<HlsConfig>` containing audio VOD loading, buffer, stall, ABR, and request-policy settings. Keep live, DRM, text, interstitial, telemetry, and video-rendering fields absent.

- [x] **Step 5: Implement HLS profile differences**

FastStart uses 12/30/15-second buffers, 16 MiB, aggressive timeouts, and fewer retries. Stable uses 60/180/60-second buffers, 48 MiB, conservative ABR, longer timeouts, and more retries. Balanced keeps the baseline values.

- [x] **Step 6: Deep-merge HLS caller updates**

Use `settingsWithChanges()` in constructor resolution and `updateConfig()` so a nested retry override retains the remainder of the active request policy.

- [x] **Step 7: Verify GREEN**

Run the HLS adapter and shared merge tests. Expected: PASS.

### Task 3: Complete DASH Audio VOD Baseline

**Files:**
- Create: `packages/gaudio/src/adapters/dash/dash-vod-defaults.ts`
- Modify: `packages/gaudio/src/adapters/dash/dash-playback-presets.ts`
- Modify: `packages/gaudio/src/adapters/dash/dash-audio-adapter.ts`
- Test: `packages/gaudio/src/adapters/dash/dash-audio-adapter.test.ts`

- [x] **Step 1: Write failing baseline tests**

Assert default Balanced settings for initialization cache, buffer management, paused scheduling, gaps, cache retention, audio track behavior, request policies, ABR rules, throughput measurement, audio auto switching, and media decode recovery. Assert live, DRM, text, telemetry, server-directed optimization, and video-only fields are absent.

- [x] **Step 2: Write failing profile tests**

Assert exact FastStart/Balanced/Stable values for buffers, pruning, back-buffer retention, ABR safety, VOD samples, timeouts, retry intervals, retry attempts, and blacklist expiry.

- [x] **Step 3: Verify RED**

Run: `pnpm --filter gaudio test -- src/adapters/dash/dash-audio-adapter.test.ts`

Expected: FAIL because the current preset contains only buffer targets and paused scheduling.

- [x] **Step 4: Implement the balanced DASH baseline**

Return fresh typed settings with audio VOD buffer, scheduling, gaps, caching, request, ABR, and error recovery configuration. Keep excluded feature groups absent.

- [x] **Step 5: Implement DASH profile differences**

FastStart reduces buffers and request patience. Stable increases buffers, throughput samples, request patience, retries, and service-location blacklist duration. Balanced keeps the baseline values.

- [x] **Step 6: Verify GREEN**

Run the DASH adapter and shared merge tests. Expected: PASS.

### Task 4: Documentation

**Files:**
- Modify: `packages/gaudio/README.md`
- Modify: `apps/docs/guide/adaptive-playback.md`

- [x] **Step 1: Document configuration coverage**

Explain that presets now own audio VOD loading, buffering, memory, ABR, retry, timeout, and stall behavior, while caller fields remain highest priority.

- [x] **Step 2: Document exclusions and upgrade contract**

State that live, DRM, text, interstitial, telemetry, server-directed, and pure-video behavior remains vendor-managed and outside the preset contract.

### Task 5: Verification

- [x] **Step 1:** Run `pnpm --filter gaudio test`; expect all tests pass.
- [x] **Step 2:** Run `pnpm --filter gaudio typecheck`; expect no TypeScript errors.
- [x] **Step 3:** Run `pnpm --filter gaudio lint`; expect no ESLint errors.
- [x] **Step 4:** Run `pnpm --filter gaudio build`; expect all package entry points build.
- [x] **Step 5:** Run `pnpm docs:build`; expect TypeDoc and VitePress build successfully.
- [x] **Step 6:** Run `rg "hls\\.js|dashjs" packages/gaudio/dist/index.js packages/gaudio/dist/index.cjs`; expect no matches.
- [x] **Step 7:** Run `git diff --check`; expect no whitespace errors.
