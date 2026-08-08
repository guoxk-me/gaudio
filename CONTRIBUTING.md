# Contributing

GAudio development and release automation require Node.js 24.11.0 or newer within the maintained Node.js 24 release line, as enforced by the root `engines` field. It uses pnpm 10.28.0 from the root `packageManager` field. Node.js 18 is EOL and is verified only as a packed-artifact/SSR compatibility floor; do not use it for new secure deployments.

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
```

On a fresh Linux machine or container, use `pnpm exec playwright install --with-deps chromium firefox webkit` so Playwright also installs the required operating-system packages.

## Verification

Run the same primary checks used by CI:

```bash
pnpm audit --audit-level high
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run coverage
pnpm run build
DOCS_E2E_USE_EXISTING_BUILD=true pnpm run e2e
pnpm --filter gaudio run pack:dry-run
```

The E2E command above previews the documentation artifact produced by the immediately preceding build. If another process owns the default preview port `4173`, choose an unused loopback port, for example `DOCS_E2E_USE_EXISTING_BUILD=true DOCS_PREVIEW_PORT=4174 pnpm run e2e`. Local runs do not retry failed browser tests. Failure traces and the HTML report are written below `output/playwright/`; CI retries once and uploads the same diagnostics.

Keep changes focused, add regression tests for behavior changes, and update English and Chinese documentation together when a public contract changes. Do not commit generated `dist`, `apps/docs/api`, coverage, or test-result directories. The checked-in `apps/docs/zh/api` files are source route loaders for the Chinese API mirror, not generated output.

## Pull requests

Describe the root cause, user-visible impact, verification performed, and any public API or migration implications. Changes to public API, authentication, release permissions, or other irreversible behavior require maintainer approval.

## Releases

Publishing is a maintainer operation with protected GitHub and npm prerequisites. Follow [`RELEASING.md`](RELEASING.md); do not create a release tag or expose a publishing credential from a contributor workflow.
