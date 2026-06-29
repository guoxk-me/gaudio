# Public API TSDoc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add concise English TSDoc to every public GAudio API so npm consumers receive useful IDE hover and parameter documentation.

**Architecture:** Documentation lives beside the exported TypeScript declarations so tsdown preserves it in generated declaration files. Runtime implementation and public signatures remain unchanged.

**Tech Stack:** TypeScript 6, tsdown, ESLint, Vitest, pnpm

---

### Task 1: Document the core package API

**Files:**
- Modify: `src/types.ts`
- Modify: `src/source/audio-source.ts`
- Modify: `src/source/http-audio-source.ts`
- Modify: `src/errors/errors.ts`
- Modify: `src/events/event-emitter.ts`
- Modify: `src/engine/audio-engine.ts`
- Modify: `src/engine/audio-engine-adapter.ts`
- Modify: `src/engine/media-element-audio-engine.ts`
- Modify: `src/player/audio-player.ts`
- Modify: `src/analysis/audio-analyzer.ts`

- [x] Add TSDoc to exported declarations and each public member.
- [x] Document parameter units, defaults, return values, lifecycle effects, and exceptions.
- [x] Keep runtime code and signatures unchanged.

### Task 2: Document adaptive playback entry points

**Files:**
- Modify: `src/adapters/hls/hls-audio-adapter.ts`
- Modify: `src/adapters/hls/index.ts`
- Modify: `src/adapters/dash/dash-audio-adapter.ts`
- Modify: `src/adapters/dash/index.ts`

- [x] Document adapter options, active vendor instances, runtime updates, and factory functions.
- [x] Explain HLS reload behavior and DASH settings application.
- [x] Keep vendor implementation classes out of the package export surface documentation unless their public contracts require clarification.

### Task 3: Verify generated consumer documentation

**Files:**
- Inspect: `dist/index.d.ts`
- Inspect: `dist/hls.d.ts`
- Inspect: `dist/dash.d.ts`

- [x] Run `pnpm run typecheck` and require exit code 0.
- [x] Run `pnpm run lint --fix` and require exit code 0.
- [x] Run `pnpm run test` and require exit code 0.
- [x] Run `pnpm run build` and require exit code 0.
- [x] Inspect declaration output and confirm comments exist for representative classes, methods, parameters, options, and events.
