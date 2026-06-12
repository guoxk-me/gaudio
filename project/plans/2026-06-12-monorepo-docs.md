# Monorepo and Documentation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert gaudio into a pnpm/Turborepo workspace with one publishable library package and one VitePress documentation application containing generated API pages and the interactive demo.

**Architecture:** The private repository root orchestrates tasks only. `packages/gaudio` remains the single npm package, while `apps/docs` consumes its public `workspace:*` exports and builds a GitHub Pages-compatible VitePress site. Internal specifications and plans live under `project` and are excluded from the public site.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript 6, tsdown, Vitest, ESLint, Vue 3, VitePress, TypeDoc, typedoc-plugin-markdown, GitHub Actions

---

## Tasks

### Task 1: Create the workspace orchestration layer

**Files:**
- Modify: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Modify: `.gitignore`

- [x] **Step 1: Replace the root package metadata with a private workspace package**

Use a private root package with scripts that delegate to Turbo:

```json
{
  "name": "gaudio-workspace",
  "private": true,
  "packageManager": "pnpm@10.28.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "docs:build": "turbo run build --filter=@gaudio/docs",
    "docs:dev": "turbo run dev --filter=@gaudio/docs... --parallel",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^9.0.0",
    "eslint": "^10.4.1"
  }
}
```

`pnpm add -Dw turbo` in Step 5 adds the resolved Turbo version to this object.

- [x] **Step 2: Declare workspace package locations**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

- [x] **Step 3: Configure Turbo task dependencies and outputs**

Create `turbo.json` with package builds preceding dependent builds, cached build outputs, uncached persistent development tasks, and independent lint/test/typecheck tasks:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".vitepress/dist/**", "api/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [x] **Step 4: Ignore generated workspace outputs**

Ensure `.gitignore` contains `node_modules`, `.turbo`, `dist`, `apps/docs/.vitepress/cache`, `apps/docs/.vitepress/dist`, and generated `apps/docs/api` output.

- [x] **Step 5: Install the root Turborepo dependency**

Run: `pnpm add -Dw turbo`

Expected: `package.json` and `pnpm-lock.yaml` contain Turbo, with no install errors.

- [x] **Step 6: Verify Turbo can discover the workspace configuration**

Run: `pnpm exec turbo run lint --dry=json`

Expected: valid JSON describing the current root task graph. Package tasks are verified again after package manifests are added.

### Task 2: Move the publishable library into `packages/gaudio`

**Files:**
- Move: `src` to `packages/gaudio/src`
- Move: `README.md` to `packages/gaudio/README.md`
- Move: `tsconfig.json` to `packages/gaudio/tsconfig.json`
- Move: `tsdown.config.ts` to `packages/gaudio/tsdown.config.ts`
- Move: `vitest.config.ts` to `packages/gaudio/vitest.config.ts`
- Create: `packages/gaudio/package.json`
- Modify: `eslint.config.mjs`
- Test: `packages/gaudio/src/package-exports.test.ts`

- [x] **Step 1: Move existing library files without altering current source changes**

Use filesystem moves so the existing TSDoc edits remain intact. Do not recreate or overwrite files under `src`.

- [x] **Step 2: Create the package manifest from the current npm metadata**

Keep `name`, `version`, `description`, `sideEffects`, `exports`, `main`, `module`, `types`, `files`, peer dependencies, and optional peer metadata unchanged. Use package-local scripts:

```json
{
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

Move TypeScript, tsdown, Vitest, `hls.js`, and `dashjs` development dependencies from the old root manifest into this package.

- [x] **Step 3: Keep package-relative tests valid**

Run: `pnpm --filter gaudio test`

Expected: existing tests pass from `packages/gaudio`; package export tests resolve the package root through `resolve(import.meta.dirname, '..')`.

- [x] **Step 4: Verify package type checking and build**

Run: `pnpm --filter gaudio typecheck && pnpm --filter gaudio build`

Expected: exit code 0 and `packages/gaudio/dist` contains ESM, CJS, source maps, and declarations for `index`, `hls`, and `dash`.

- [x] **Step 5: Inspect the publish payload**

Run: `pnpm --filter gaudio pack --pack-destination /tmp/gaudio-pack`

Expected: the tarball contains `package/README.md`, `package/package.json`, and `package/dist/**`, but no source, docs application, project records, or root tooling.

### Task 3: Relocate internal project records

**Files:**
- Move: `docs/superpowers/specs/*` to `project/specs/`
- Move: `docs/superpowers/plans/*` to `project/plans/`

- [x] **Step 1: Move tracked and untracked internal records**

Move every existing design and plan, including the public API TSDoc records, while preserving file contents. Resolve duplicate destination names by keeping the already approved `project` file and moving only non-conflicting records.

- [x] **Step 2: Verify the old internal docs directory is gone**

Run: `find docs -maxdepth 3 -type f 2>/dev/null`

Expected: no `docs/superpowers` files remain.

- [x] **Step 3: Verify all records are present under `project`**

Run: `find project -maxdepth 2 -type f | sort`

Expected: all prior specs and plans plus this migration design and plan are listed.

### Task 4: Add the VitePress documentation application and API generation

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/tsconfig.json`
- Create: `apps/docs/.vitepress/config.ts`
- Create: `apps/docs/index.md`
- Create: `apps/docs/guide/getting-started.md`
- Create: `apps/docs/guide/adaptive-playback.md`
- Create: `apps/docs/guide/events.md`
- Create: `apps/docs/guide/migration.md`
- Create: `apps/docs/typedoc.json`
- Create: `apps/docs/docs.test.ts`
- Modify: `eslint.config.mjs`

- [x] **Step 1: Write a failing documentation contract test**

The test reads the docs manifest and VitePress config and asserts that the application is private, depends on `gaudio` through `workspace:*`, exposes `build`, `dev`, `typecheck`, `lint`, and `test`, generates API docs before VitePress build, and configures the GitHub Pages base path.

- [x] **Step 2: Run the contract test and verify failure**

Run: `pnpm exec vitest run apps/docs/docs.test.ts`

Expected: FAIL because the docs application files do not exist.

- [x] **Step 3: Create the docs package manifest**

Use package name `@gaudio/docs`, `private: true`, `gaudio: workspace:*`, and scripts:

```json
{
  "scripts": {
    "api": "typedoc",
    "build": "pnpm run api && vitepress build .",
    "dev": "vitepress dev .",
    "lint": "eslint .",
    "test": "vitest run",
    "typecheck": "vue-tsc --noEmit -p tsconfig.json"
  }
}
```

Add VitePress, Vue, Vue TypeScript tooling, TypeDoc, `typedoc-plugin-markdown`, Vitest, and the optional adaptive peers required by examples.

- [x] **Step 4: Configure TypeDoc for public entry points**

Configure `typedoc.json` to read:

```json
{
  "entryPoints": [
    "../../packages/gaudio/src/index.ts",
    "../../packages/gaudio/src/adapters/hls/index.ts",
    "../../packages/gaudio/src/adapters/dash/index.ts"
  ],
  "entryPointStrategy": "expand",
  "plugin": ["typedoc-plugin-markdown"],
  "out": "api",
  "readme": "none",
  "cleanOutputDir": true
}
```

TypeDoc reads declarations to generate reference content, while runtime docs examples continue to import only package exports.

- [x] **Step 5: Configure VitePress navigation and Pages base**

Use `process.env.DOCS_BASE ?? '/gaudio/'` for `base`. Add navigation for Guide, Examples, and API, plus sidebar entries for the initial guide pages.

- [x] **Step 6: Add handwritten guide pages**

Move the detailed README material into focused guides. Keep the package README concise and link to `/gaudio/`. Code examples must import from `gaudio`, `gaudio/hls`, and `gaudio/dash` only.

- [x] **Step 7: Install documentation dependencies**

Run: `pnpm install`

Expected: the lockfile contains separate importers for `.`, `apps/docs`, and `packages/gaudio`.

- [x] **Step 8: Run docs contract and API generation**

Run: `pnpm --filter @gaudio/docs test && pnpm --filter @gaudio/docs api`

Expected: the test passes and generated Markdown exists under `apps/docs/api` for all three public entry points.

### Task 5: Migrate the demo into client-only documentation examples

**Files:**
- Move and modify: `demo/App.vue` to `apps/docs/examples/AudioPlayerDemo.vue`
- Move and modify: `demo/composables/use-gaudio-demo.ts` to `apps/docs/examples/use-gaudio-demo.ts`
- Move and modify: `demo/data/demo-samples.ts` to `apps/docs/examples/demo-samples.ts`
- Move and modify: representative `demo/public` media to `apps/docs/public/audio`
- Create: `apps/docs/examples/index.md`
- Create: `apps/docs/examples/demo.test.ts`
- Delete after migration: `demo/`

- [x] **Step 1: Write a failing example integration test**

Assert that the example page wraps `AudioPlayerDemo` in `ClientOnly`, the component imports the composable locally, the composable imports only `gaudio` public entry points, and sample URLs include the VitePress base path.

- [x] **Step 2: Run the integration test and verify failure**

Run: `pnpm --filter @gaudio/docs test`

Expected: FAIL because the migrated example files do not exist.

- [x] **Step 3: Move and adapt the existing demo**

Rename the component to `AudioPlayerDemo.vue`. Keep the existing controls and status behavior. Move player creation into the mounted client lifecycle so SSR import does not instantiate `Audio`, `document`, or vendor playback engines.

Add a concise nearby comment explaining the behavioral change:

```ts
// AI modified: create the player after mount because VitePress renders examples during SSR.
```

Dispose the mounted player in `onUnmounted` and guard control methods until initialization completes.

- [x] **Step 4: Make sample URLs base-aware**

Use Vite's `import.meta.env.BASE_URL` when creating local audio URLs so both local `/` development and GitHub Pages `/gaudio/` deployment resolve assets correctly.

- [x] **Step 5: Reduce sample media size**

Use `ffmpeg` to create short representative clips under `apps/docs/public/audio/{mp3,wav,m4a,ogg}`. Retain one short track per format, update the catalog to match, and remove the original full-length duplicates after verifying output playback metadata.

- [x] **Step 6: Add the example page**

Create `apps/docs/examples/index.md`:

```md
# Interactive Player

<ClientOnly>
  <AudioPlayerDemo />
</ClientOnly>

<script setup lang="ts">
import AudioPlayerDemo from './AudioPlayerDemo.vue'
</script>
```

- [x] **Step 7: Verify SSR-safe production build**

Run: `pnpm --filter gaudio build && pnpm --filter @gaudio/docs typecheck && pnpm --filter @gaudio/docs test && pnpm --filter @gaudio/docs build`

Expected: exit code 0; no `window is not defined`, `document is not defined`, or unresolved package export errors.

### Task 6: Add GitHub Pages deployment

**Files:**
- Create: `.github/workflows/docs.yml`

- [x] **Step 1: Add the Pages workflow**

Configure pushes to `main`, manual dispatch, read-only contents, Pages write permission, and id-token write permission. Use `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`.

The build job runs:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm run typecheck
- run: pnpm run lint
- run: pnpm run test
- run: pnpm run build
```

Upload `apps/docs/.vitepress/dist` as the Pages artifact.

- [x] **Step 2: Inspect workflow and base-path agreement**

Run: `rg -n "pages|apps/docs/.vitepress/dist|pnpm run build|/gaudio/" .github/workflows/docs.yml apps/docs/.vitepress/config.ts`

Expected: workflow output path and VitePress base configuration agree.

### Task 7: Complete repository verification

**Files:**
- Inspect: files introduced or moved in Tasks 1-6

- [x] **Step 1: Run all root quality gates**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Expected: every Turbo task succeeds for `gaudio` and `@gaudio/docs`.

- [x] **Step 2: Inspect generated package and API outputs**

Confirm TSDoc appears in representative `packages/gaudio/dist/*.d.ts` declarations and generated API Markdown documents `AudioPlayer`, adaptive adapter factories, events, options, defaults, and exceptions.

- [x] **Step 3: Run package payload verification again**

Run: `pnpm --filter gaudio pack --pack-destination /tmp/gaudio-pack-final`

Expected: only package metadata, README, and `dist` are included.

- [x] **Step 4: Start the docs site and test it in a browser**

Run: `pnpm run docs:dev`

Open the reported local URL. Verify the home page, guide navigation, generated API navigation, interactive player load/play/pause/seek controls, and static audio requests. Stop the development tasks after verification.

- [x] **Step 5: Check repository state and scope**

Run: `git status --short && git diff --check`

Expected: only the planned workspace, package relocation, docs application, project record relocation, workflow, lockfile, and generated-file policy changes remain; no unrelated files are changed.
