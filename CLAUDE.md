# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
pnpm run build          # Build all packages (turbo)
pnpm run dev            # Dev mode (watch) for all packages
pnpm run lint           # Lint workspace + root eslint config
pnpm run test           # Run all tests (vitest)
pnpm run typecheck      # Type-check all packages
pnpm run e2e            # Playwright e2e tests (docs site)

# Scoped / single-package
pnpm run docs:dev       # VitePress docs dev server
pnpm run docs:build     # Build docs site (includes typedoc API generation)

# In packages/gaudio:
pnpm run test           # vitest run
npx vitest src/path/to/file.test.ts   # Run a single test file
pnpm run typecheck      # tsc --noEmit
pnpm run build          # tsdown

# In apps/docs:
pnpm run test           # vitest run (excludes e2e and .vitepress)
pnpm run e2e            # playwright test
pnpm run api            # typedoc (generates API reference markdown)
```

## Architecture

gaudio is a browser-first TypeScript audio streaming library (`packages/gaudio`), with a VitePress documentation site (`apps/docs`). The monorepo uses pnpm workspaces + Turborepo.

### Engine Layer (strategy pattern)

`AudioEngine` is the low-level interface. `AudioEngineRouter` selects the right engine by protocol:

| Protocol | Engine | Source |
|---|---|---|
| `'media'` | `MediaElementAudioEngine` (wraps `HTMLAudioElement`) | Standard HTTP URLs |
| `'hls'` | HLS engine (native or hls.js) | HLS playlists |
| `'dash'` | DASH engine (dashjs) | DASH manifests |

### Adapter Pattern (HLS/DASH)

Adaptive streaming uses `AudioEngineAdapter` — each adapter owns exactly one engine (enforced via `WeakMap`). Adapters are created via `createHlsAdapter()` / `createDashAdapter()` factory functions, exported from `gaudio/hls` and `gaudio/dash` subpath exports.

Three playback presets (`FastStart`, `Balanced`, `Stable`) combine with content types (`vod`, `long-form`, `live`) to produce engine-specific configuration via `settingsWithChanges()` deep merging.

### AudioPlayer (high-level API)

`AudioPlayer` wraps the engine router. Its state machine: `idle → loading → ready → playing/paused/buffering/ended/error`. Engine events flow up: `HTMLAudioElement → Engine → Router → Player → consumer`.

### Source Abstraction

`AudioSource` interface defines `open()`/`close()` lifecycle with lazy resource acquisition. `audioSourceForInput()` auto-wraps strings/descriptions into `HttpAudioSource` or `BlobAudioSource`.

### Package Entry Points

- **`gaudio`** — `AudioPlayer`, `AudioAnalyzer`, `EventEmitter`, base engine, source types, error types
- **`gaudio/hls`** — `createHlsAdapter()`, HLS-specific types, re-exports `HlsConfig` from hls.js
- **`gaudio/dash`** — `createDashAdapter()`, DASH-specific types, re-exports `MediaPlayerClass` from dashjs

HLS and DASH are optional peer dependencies. Build produces ESM (`.js`), CJS (`.cjs`), and standalone `.d.ts` declarations via `tsdown`.

## Coding Conventions (from AGENTS.md)

### Naming
- **Variables**: camelCase; booleans prefixed with `is`/`has`/`can`/`should`; arrays use plural names.
- **Functions**: camelCase, describe business behavior. **Never** name a function `normalize`, `parse`, `transform`, `convert`, `format`, `build`, or `map` when it only does field mapping or object reshaping — just construct the object directly.
- **Types**: PascalCase, no `I`/`T` prefixes.
- **Files**: kebab-case (except Vue components: PascalCase). Composables start with `use`.

### AI Modification Comments
When AI changes logic, behavior, or structure, add a concise `// AI modified:` comment explaining why. Don't comment every line or add meaningless comments.

### Strict Rules
- No `any` as a shortcut.
- Never disable lint rules or ignore TypeScript errors.
- Never use `normalize` as a method, variable, file, or type name.
- Don't create helper functions solely for field mapping.
- Check existing dependencies before adding new ones; prefer built-in platform APIs.

### Public API Changes
Public API changes are high-risk and require confirmation. The package declares `"sideEffects": false` — maintain this for tree-shaking compatibility.
