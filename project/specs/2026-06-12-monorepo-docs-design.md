# Monorepo and Documentation Architecture Design

## Goal

Reorganize gaudio into a pnpm workspace managed by Turborepo, keep `gaudio` as the only published npm package, and replace the standalone demo with a VitePress documentation site containing guides, generated API reference pages, and interactive audio examples.

## Scope

- Move the library package into `packages/gaudio` without changing its public API or npm package name.
- Create a VitePress site in `apps/docs`.
- Move the standalone Vue demo into reusable, client-only documentation examples.
- Generate API reference Markdown from the public TSDoc declarations.
- Move internal Superpowers specifications and plans from `docs/superpowers` to `project`.
- Add Turborepo task orchestration and GitHub Pages deployment.
- Keep the repository ready for additional packages without splitting the current library prematurely.

The migration does not split `gaudio`, change authentication or authorization, modify production data, or intentionally change runtime playback behavior.

## Repository Structure

```text
gaudio/
├── apps/
│   └── docs/
│       ├── .vitepress/
│       ├── api/
│       ├── examples/
│       ├── guide/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── gaudio/
│       ├── src/
│       ├── package.json
│       ├── README.md
│       ├── tsconfig.json
│       ├── tsdown.config.ts
│       └── vitest.config.ts
├── project/
│   ├── plans/
│   └── specs/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── pnpm-lock.yaml
```

The root package is private and contains only repository tooling and aggregate scripts. `packages/gaudio` owns all npm metadata and remains the sole publishable package. `apps/docs` is a private application and cannot be published to npm.

## Workspace Boundaries

### Library Package

`packages/gaudio` owns the current library source, unit tests, package export tests, package README, TypeScript configuration, tsdown configuration, and package-specific dependencies.

The package continues to expose:

- `gaudio`
- `gaudio/hls`
- `gaudio/dash`

Optional `hls.js` and `dashjs` peer dependency behavior remains unchanged.

### Documentation Application

`apps/docs` owns VitePress, documentation pages, theme components, interactive examples, API generation configuration, and documentation tests. It declares `gaudio` as a `workspace:*` dependency.

Documentation source code imports only public package entry points. It must not import files from `packages/gaudio/src`.

During development, Turbo runs the library in watch mode alongside VitePress. During verification and deployment, the library is built first and the documentation site resolves the package through its declared exports. This makes the production documentation build a consumer-level check of the package contract.

### Internal Project Records

`project/specs` and `project/plans` contain internal design and implementation records. VitePress does not include this directory, so these files are not published with the public site.

## Documentation Content

The initial site contains:

- Introduction and installation.
- Core player quick start.
- HLS and DASH setup.
- Playback lifecycle and events.
- API reference for `gaudio`, `gaudio/hls`, and `gaudio/dash`.
- Interactive examples migrated from the current demo.
- Migration notes and current limitations.

The package README remains concise and points to the documentation site for detailed material.

## API Reference Generation

TypeDoc reads the three public TypeScript entry points and generates Markdown into `apps/docs/api`. A TypeDoc Markdown renderer is used instead of embedding a separate HTML documentation site.

Generated API pages are build artifacts. They are recreated by the docs build and checked for successful generation in CI. Handwritten guides remain the source of explanatory documentation; generated pages only describe the public API surface.

API generation must fail when an entry point cannot be resolved or when TypeDoc reports a configuration error. It must not read internal implementation modules as independent public entry points.

## Interactive Examples

The current demo is migrated into Vue components under `apps/docs/examples`. Audio player construction and browser API access occur only after client mounting because VitePress renders pages during SSR.

Examples use VitePress client guards such as `ClientOnly` where required. Components dispose players and event subscriptions when unmounted. Example failures are shown within the page without breaking navigation to other documentation.

The initial migration retains the current capabilities but reduces sample media size. Short representative clips replace the current large WAV, MP3, M4A, and OGG files. Full-length duplicate samples are not required to validate playback controls or format support.

The example components remain independent of VitePress page layout so they can later move to a separate `apps/demo` application if their complexity grows.

## Turborepo Tasks

The root exposes repository-level commands that delegate to Turbo:

- `dev`: run package watch tasks and the VitePress development server.
- `build`: build packages before dependent applications.
- `typecheck`: type-check every workspace.
- `lint`: lint every workspace.
- `test`: run workspace tests.
- `docs:dev`: run the documentation development pipeline.
- `docs:build`: generate API pages and build the production documentation site.

Turbo task dependencies ensure application builds wait for dependency builds. Build outputs include package `dist` directories and `apps/docs/.vitepress/dist`. Long-running development tasks are persistent and are not cached.

Turbo is used for task ordering and caching only. No additional monorepo framework or independent versioning tool is introduced.

## GitHub Pages Deployment

A GitHub Actions workflow runs on relevant pushes and manual dispatch. It installs the pinned pnpm version, restores Turbo and pnpm caches, runs the full verification pipeline, builds the documentation site, and deploys `apps/docs/.vitepress/dist` through the official GitHub Pages actions.

VitePress uses the repository-name base path for a project Pages site. The base can be overridden for a custom domain later without changing content paths.

Deployment does not publish the npm package. Package publishing remains a separate explicit workflow.

## Migration Sequence

1. Add workspace and Turbo root configuration.
2. Move the library into `packages/gaudio` and restore all package checks.
3. Create `apps/docs` with a minimal VitePress build consuming the workspace package.
4. Move internal records into `project/specs` and `project/plans`.
5. Migrate README content into guides and add generated API reference pages.
6. Migrate the demo into client-only documentation examples and reduce media assets.
7. Add GitHub Pages deployment.
8. Run the complete repository verification pipeline and inspect the production site.

Each step must leave package exports and tests executable. File moves should preserve Git history where practical.

## Verification

The completed migration requires executed verification for:

- pnpm workspace installation.
- Library type checking, linting, unit tests, and package build.
- Documentation type checking, linting, tests, API generation, and VitePress build.
- Root Turbo `typecheck`, `lint`, `test`, and `build` tasks.
- Inspection of generated declaration files and TypeDoc Markdown.
- Inspection of the packed `gaudio` tarball to confirm only intended package files are published.
- Browser testing of documentation navigation and representative audio controls.
- Validation of GitHub Pages base paths in the production build.

## Risks and Controls

- **Package-root assumptions:** Tests and scripts using the repository root must move to package-relative paths and be rerun after relocation.
- **Source alias leakage:** Documentation aliases to `src` are forbidden; the production docs build must consume package exports.
- **SSR browser API failures:** Audio creation is delayed until client mounting and covered by a production VitePress build.
- **Repository size:** Large demo media is replaced with short clips before deployment.
- **Accidental root publication:** The root and docs package are marked private; only `packages/gaudio` is publishable.
- **Generated documentation drift:** API generation is part of the docs build and CI verification.
- **Premature package splitting:** Internal modules remain in one package until independent release or dependency requirements exist.

## Success Criteria

- A fresh checkout can install dependencies and run all root verification commands.
- `packages/gaudio` builds the same three public entry points with unchanged package identity.
- `apps/docs` builds a GitHub Pages-compatible static site from public package imports.
- Guides, generated API reference pages, and interactive examples are available from one site.
- Internal specifications and plans live under `project` and are absent from the public documentation output.
- The repository can add future packages under `packages` without another root-level layout migration.
