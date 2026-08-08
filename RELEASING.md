# Releasing GAudio

This is the maintainer runbook for publishing the `gaudio` package and its documentation. The executable source of truth is [`.github/workflows/release.yml`](.github/workflows/release.yml); this document explains the repository and registry state that workflow expects.

Do not assume any external setting is already configured. Confirm each prerequisite before the first release and after ownership or credential changes.

## One-time prerequisites

### GitHub Pages

In the repository settings, configure Pages to use **GitHub Actions** as its source. The documentation workflow deliberately separates responsibilities:

- The `build` job can read repository and Pages metadata and upload the generated artifact.
- The `deploy` job is the only job with `pages: write` and `id-token: write`.

Keep that permission boundary intact. After enabling Pages, run the documentation workflow and confirm the package homepage returns the generated site rather than a GitHub 404 page.

<!-- AI modified: HTTP probes cannot prove that each browser can initialize and play adaptive media from the deployed CDN. -->
For the first Pages enablement, and after any Pages/CDN or media-generation change, open the deployed interactive demo in current Chromium, Firefox, and Safari. Play both the HLS and DASH sample through a segment transition and confirm audio, seeking, and pause/resume work. The automated post-deploy smoke verifies routes, MIME families, manifests, media segments, byte ranges, and license attribution, but it does not replace this real-browser first-release check.

### Protected npm environment

Create a GitHub environment named `npm`, matching the `environment` value in the release workflow. Restrict it to the intended release tags and add required reviewers when the repository plan supports them. Protect `main` with required CI checks, and use a tag ruleset so an unreviewed commit cannot become a release.

The first publication must bootstrap package ownership with the credential expected by the current workflow:

1. Create a short-lived npm granular access token with **Read and write** permission and **Bypass 2FA** enabled for non-interactive publishing. Limit it to the `gaudio` package or `guoxk-me` organization scope npm permits. If an unpublished package cannot be selected, use the narrowest account or organization grant npm allows. Granular tokens can last at most 90 days; choose a much shorter expiry for this bootstrap and revoke the token as soon as trusted publishing is proven.
2. Store it as the `NPM_TOKEN` secret on the protected `npm` environment, not in source, logs, workflow inputs, or an unprotected repository variable.
3. Confirm the environment policy applies before the first real release is dispatched.

The publish job also receives `id-token: write` for npm provenance. That OIDC permission does not replace `NPM_TOKEN` in the current workflow.

After the first version exists on npm, configure its trusted publisher with these exact values:

- Provider: GitHub Actions
- Organization or user: `guoxk-me`
- Repository: `gaudio`
- Workflow filename: `release.yml`
- Environment: `npm`
- Allowed action: `npm publish`

Trusted publishing requires Node.js 22.14.0 or newer and npm CLI 11.5.1 or newer. The release baseline is maintained Node.js 24; verify `npm --version` in the publish job and update npm there if it is below 11.5.1 before migrating.

Make the migration as a reviewed workflow change. Remove the explicit `NPM_TOKEN` validation, secret references, and `NODE_AUTH_TOKEN` publish environment variable; retain the narrowly scoped publish-job `id-token: write` permission and the protected `npm` environment. Complete the dry run, perform a reviewer-approved publication, and confirm npm recorded provenance from the configured workflow. Then delete the `NPM_TOKEN` environment secret and revoke the bootstrap token.

## Prepare a release

1. Start from a clean commit on `main` with required CI checks passing.
2. Choose a version that has never been published.
3. Update `packages/gaudio/package.json`.
4. Keep non-empty pending notes under the first `## [Unreleased]` heading. Do not assign a release date until the release is ready to tag; finalized changelog dates use the real, non-future UTC date recorded for that release. Keep that date unchanged when retrying the same reviewed tag.
5. Update public documentation for any API, compatibility, or migration change.
6. Run the local release gates:

   ```bash
   pnpm install --frozen-lockfile
   pnpm audit --audit-level high
   pnpm run typecheck
   pnpm run lint
   pnpm run test
   pnpm run coverage
   pnpm run build
   pnpm exec playwright install chromium firefox webkit
   pnpm run e2e
   pnpm --filter gaudio run pack:dry-run
   ```

The package defaults to the `next` dist-tag. Keep `next` for pre-release distribution. Choose `latest` only when the version is intentionally the default install for users; the workflow rejects a SemVer pre-release version published as `latest`.

<!-- AI modified: document the package-owned validation boundary used by npm lifecycle publishing. -->
The package `prepublishOnly` lifecycle invokes the changelog validator in `--package-publish` mode. That mode always requires a finalized release section matching `packages/gaudio/package.json` and always reads `packages/gaudio/CHANGELOG.md`; it ignores inherited `DRY_RUN`, `PACKAGE_VERSION`, and `CHANGELOG_PATH` values. Those environment overrides remain available only for the explicit release-workflow and validator-test paths.

## Run the dry run

Open **Actions → Release package → Run workflow** and select:

- Ref: `main`
- `npm_tag`: the tag intended for the real release
- `dry_run`: `true`

The dry run accepts either a first `## [Unreleased]` section or a finalized first section matching the package version and a real, non-future ISO date. A finalized section must contain release notes. The workflow validates the remaining release metadata, confirms the commit belongs to `main`, runs the full quality and browser gates, packs one immutable artifact, and exercises npm's publish dry run against that exact tarball.

Package-consumer verification deliberately separates Node.js packaging guarantees from browser playback:

- On Node.js 24, a clean consumer installs the tarball with `hls.js`, `dashjs`, TypeScript 5.8.3, and the current project compiler. It verifies that both optional peers resolve, imports the `gaudio`, `gaudio/hls`, and `gaudio/dash` ESM and CommonJS entry points, and compiles external `.mts` and `.cts` consumers against the published declarations. TypeScript 5.8 is the supported compiler floor.
- On Node.js 18, a clean consumer installs the same tarball without optional peers. It verifies the ESM and CommonJS entry points and the stable `ADAPTER_UNAVAILABLE` errors produced when lazy HLS or DASH loading cannot find its peer. Node.js 18 is EOL; this is only a packed-artifact/SSR compatibility floor and is not a recommendation for new secure deployments.
- Node.js checks do not emulate a DASH-capable browser or initialize vendor playback engines. Real HLS and DASH playback, including vendor runtime creation, remains covered by the Chromium, Firefox, and WebKit E2E suite.

The dry run does not enter the `npm` environment, read `NPM_TOKEN`, request publish OIDC credentials, or upload to npm.

Do not create the release tag until this run is green.

## Tag and publish

Replace the first `## [Unreleased]` heading with the exact package version and the real UTC date recorded for the release, for example `## 0.4.1 - 2026-07-28`. The date may precede a retry, but it cannot be impossible or in the future; do not rewrite it merely because registry publication is rerun later. Commit that change to `main` and rerun the dry run so the exact release commit is green. Real publishing rejects an unreleased, stale, mismatched, or invalid-date first changelog section.

Create an annotated or signed `v<package-version>` tag on that exact reviewed `main` commit and push it without moving or reusing an existing release tag:

```bash
git tag -s v0.4.1 -m "gaudio v0.4.1"
git push origin v0.4.1
```

If signed tags are not available, use an annotated tag and retain the same review and protection requirements.

Run **Release package** again with:

- Ref: the new `v<package-version>` tag
- `npm_tag`: the value proven by the dry run
- `dry_run`: `false`

The workflow refuses a tag that does not exactly match the package version, a commit outside `main`, a missing or empty changelog section, an existing npm version, or a pre-release version paired with `latest`. Verification and Node.js 18 package consumption must pass before the protected publish job can start.

## Verify the release

After upload, a separate verification job without the protected npm environment, `NPM_TOKEN`, or OIDC permission waits for registry visibility and installs the exact published version. When it finishes, independently confirm:

```bash
npm view gaudio@0.4.1 version dist-tags repository homepage
npm dist-tag ls gaudio
```

Install the published package in a clean consumer project and verify the entry points used by the release:

```bash
npm install gaudio@0.4.1
```

Also confirm:

- The selected dist-tag points to the intended version.
- The npm package shows provenance from the expected repository workflow.
- The documentation workflow is green and the package homepage is reachable.
- Release notes match the changelog. Create a GitHub Release from the immutable tag when release notes are published there.

## Failure and recovery

- **Before npm upload:** fix the cause on `main` and rerun the dry run. If an unpublished tag is wrong, delete it explicitly and recreate it from the reviewed commit; never force-move a release tag. Confirm that no GitHub Release or external consumer references it first.
- **After npm upload:** the version is immutable. Do not rerun as though it were unpublished, and do not use routine unpublishing as rollback. Publish a corrected patch version with a new changelog entry and tag. Deprecate the bad version with a clear message when users must avoid it.
- **Wrong dist-tag:** point the intended dist-tag at the verified version before removing the incorrect assignment. Recheck `npm dist-tag ls gaudio`.
- **Post-publish verification failure:** first query npm to determine whether the upload succeeded. If it did, repair verification separately or make a forward release; the duplicate-version guard will correctly reject another upload of the same version.
- **Documentation deployment failure:** repair or enable Pages and rerun the documentation workflow. Do not republish an unchanged npm version only to repair documentation.
- **Credential exposure:** revoke the npm token immediately, rotate the protected environment secret, inspect workflow logs and package activity, and follow [`SECURITY.md`](SECURITY.md).

Record the failed run, cause, and recovery in the release notes or maintainer log so the next release does not repeat it.
