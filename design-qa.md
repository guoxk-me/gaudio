# GAudio Home Wireframe — Code Implementation QA

- Date: 2026-08-22
- Source of truth: `/Users/guoxk/me/i/pen/gaudio_new.pen`, frame `yGoGD`
- Exported source: `/private/tmp/gaudio-home-waveform-player.png/yGoGD.png` (1441 × 3861 px)
- Implementation: `http://127.0.0.1:4180/gaudio/`
- Desktop viewport: 1440 × 900 CSS px; browser capture surface 1440 × 780 px at 1×
- Responsive viewports: 1024 × 900 and 390 × 844 CSS px at 1×
- Full segmented comparison, source left and implementation right: `/private/tmp/gaudio-home-qa-full-segmented.png`
- Focused player comparison: `/private/tmp/gaudio-home-qa-hero-current.png`
- Mobile evidence: `/private/tmp/gaudio-home-mobile-390-closed.png` and `/private/tmp/gaudio-home-mobile-390.png`

## Required Surface Comparison

- Typography: Geist and Geist Mono preserve the prototype's display, body, eyebrow, code, and status hierarchy.
- Layout and spacing: desktop section boundaries align to the prototype at 112, 872, 1412, 1860, 2500, 3000, and 3400 px; the rendered document height is 3860 px with no horizontal overflow.
- Colors: the light surface, Tailwind Violet accents, semantic mint status, pale-violet Hero field, dark-violet CTA, and muted borders match the authored foundations.
- Assets and icons: the page uses existing Lucide icons and a real 58-sample waveform derived from `aurora-loop.mp3`; no unapproved raster placeholder is required.
- Copy: promise, installation, public `AudioPlayer` example, optional HLS/DASH paths, capability groups, boundaries, final CTA, and footer copy follow the Home frame.

## Interaction and Responsive QA

- Player: executed Play/Pause against the public `AudioPlayer` API. Audio and analyzer code are imported only after user interaction; autoplay remains off. Seek and mute controls are connected to the same player instance.
- Quick Start: pnpm/npm/yarn/bun tabs switch commands, package-manager selection persists, and both copy actions report success or failure.
- Theme and locale: existing global controls remain usable; the light implementation shown here is the prototype comparison state.
- 1024 px: Hero and Quick Start collapse to one column without horizontal overflow.
- 390 px: navigation collapses, the mobile menu opens and closes, CTA controls remain at least 44 px high, and code can scroll horizontally.
- Clean browser session: 0 console errors and 0 warnings. Historical HMR fetch noise from a server restart during the production build was excluded by repeating the check in a new tab.

## Findings

- P0: none.
- P1: none.
- P2: none after correction. Initial section heights produced a 3627 px page; the final geometry now follows the 3860 px Pencil frame and exact desktop section boundaries.
- P3: prototype annotation markers are intentionally not rendered as production UI. Their behavioral requirements are implemented or retained in tests instead.
- Assumption: `Troubleshooting` is omitted from the primary header because this Nuxt content tree has no corresponding route; the existing troubleshooting destination remains available in the footer/reference structure.

## Comparison History

1. Replaced the migration-era WebGL Hero and architecture-led homepage with the selected waveform-player wireframe structure.
2. Corrected announcement/header and every section boundary to the Pencil frame's desktop geometry.
3. Changed the player from eager initialization to interaction-triggered creation and preserved distinct played, buffered, and remaining waveform states.
4. Re-ran source-versus-implementation comparisons for Hero, Quick Start, capability/boundary, and CTA/footer regions as one combined full-page evidence image.

## Verification

- `CI=true pnpm --filter @gaudio/docs typecheck` — passed
- `CI=true pnpm --filter @gaudio/docs lint` — passed
- `CI=true pnpm --filter @gaudio/docs test` — 165 passed
- `CI=true pnpm --filter @gaudio/docs exec playwright test --config ../../playwright.config.ts --grep homepage` — 10 passed, 2 skipped
- `CI=true pnpm --filter @gaudio/docs build` — passed; 669 routes generated and 23,668 internal references verified

## Final Result

passed

---

# Homepage Reference Match — Max-width and Responsive Pass

- Date: 2026-08-21
- Hero source: `/Users/guoxk/.codex/attachments/ad50a0cc-4abc-4066-9af2-b7562395eeb3/image-1.png`
- Architecture source: `/Users/guoxk/.codex/attachments/ad50a0cc-4abc-4066-9af2-b7562395eeb3/image-2.png`
- Final light Hero evidence: `design-reference/latest-hero-light-top.png` and `design-reference/latest-hero-light-bottom.png`
- Final dark Hero evidence: `design-reference/latest-hero-dark-top.png` and `design-reference/latest-hero-dark-bottom.png`
- Final mobile evidence: `design-reference/final-mobile-dark-390.png`
- Tested route: `/gaudio/zh`
- Tested widths: 2560, 1920, 1440, 1024, 768, and 390 px

## Findings

- P0: none.
- P1: none.
- P2: none after correction. Header, Hero, Architecture, and the remaining homepage modules now share a `1280px` maximum content boundary with responsive page gutters. At 1920 and 2560 px the authored composition no longer stretches.
- P3: the WebGL sculpture is driven by live time and analyzer uniforms, so its exact silhouette changes from the static source frame. Its scale, center, diagonal orbit, ring, lighting, scan-line field, and light/dark material hierarchy preserve the reference intent.
- Layout and spacing: the Hero uses the source aspect ratio and three authored rows. Copy, reactor, metadata, CTA, timeline, transport controls, volume, FFT, and engine status remain separated without crowding.
- Architecture: the four-stage signal rail, runtime fan-out, animated signal waveform, and fact rail retain the same hierarchy as the source. The graph collapses to two columns on tablet and a single readable sequence on small mobile screens.
- Header: search, GitHub, theme switch, locale control, and mobile navigation are present. Focus styles and practical tap targets remain visible.
- Responsive: all tested widths reported zero horizontal overflow. The desktop content width remains exactly `1280px` at 1920 and 2560 px; at 390 px the board is 350 px wide with a two-line title and stacked reactor.
- Interaction: the real Play control was executed; it changed to Pause, the progress value advanced to `0.22`, and Pause returned successfully. Browser console error count was zero.
- Dark theme: geometry is shared with Light while surfaces, shader lighting, text, diagram paths, and controls invert through project theme tokens. The provided source assets are Light boards, so Dark was checked as a contrast-safe theme derivative rather than claimed as a pixel-identical color comparison.

## Comparison History

1. The initial implementation inherited legacy homepage grid rules, which caused full-width stretching and made reference-board geometry unreliable.
2. Hero and Architecture were isolated under dedicated reference classes and placed on one shared `1280px` content boundary.
3. The final pass tightened title scale, copy-to-metadata rhythm, transport spacing, reactor centering, WebGL scale, and light-theme material depth.

## Verification

- `pnpm --filter @gaudio/docs typecheck` — passed
- `pnpm --filter @gaudio/docs lint` — passed
- `pnpm --filter @gaudio/docs test` — 165 passed
- `pnpm --filter @gaudio/docs build` — static generation and 23,404 internal-reference checks passed

## Final Result

passed

---

# Homepage Code Implementation — WebGL Hero + SVG Architecture

- Date: 2026-08-20
- Exact hero reference: `/Users/guoxk/.codex/attachments/ad50a0cc-4abc-4066-9af2-b7562395eeb3/image-1.png`
- Exact architecture reference: `/Users/guoxk/.codex/attachments/ad50a0cc-4abc-4066-9af2-b7562395eeb3/image-2.png`
- Browser implementation, light: `/private/tmp/gaudio-home-light.png`
- Browser implementation, dark: `/private/tmp/gaudio-home-dark.png`
- Browser implementation, architecture: `/private/tmp/gaudio-home-architecture-light.png`
- Combined hero comparison input: `/private/tmp/gaudio-hero-comparison.png`
- Combined architecture comparison input: `/private/tmp/gaudio-architecture-comparison.png`
- Tested routes: `/gaudio/zh` and its shared English homepage composition
- Viewports: default 1280 × 720 desktop plus 390 × 844 responsive override

## Browser QA

- P0: none.
- P1: none.
- P2: none after correction. The legacy `.home-hero` grid initially leaked a second column and 72 px gap into the new composition; the reference surface now explicitly owns one outer column, three rows, stretch alignment, and zero gap.
- P3: the ray-marched WebGL sculpture intentionally changes silhouette over time and therefore cannot reproduce one generated-image frame pixel-for-pixel. Its ring, diagonal orbit, material palette, scan-line surface, and split-screen scale retain the reference hierarchy.
- Hero: inspected in light and dark themes. Track copy, technical metadata, Studio CTA, full-width transport, volume, FFT status, and engine state remain readable without clipping.
- Architecture: the four-stage rail and five runtime branches align with the reference. Base paths remain visible while animated pulses travel along the main track and each SVG branch.
- Responsive: inspected at 390 × 844. Header controls remain usable, the track title keeps a two-line hierarchy, WebGL stays inside its stage, and the architecture collapses to a readable single-column sequence.
- Interaction: executed the real Play control in the browser. It changed to Pause and the timeline advanced from `0:00 / 0:08` to `0:07 / 0:08`; volume and seek remain bound to the same `AudioPlayer` instance that supplies the analyzer.
- Theme controls: GitHub, search, locale, and a persisted light/dark toggle are visible in the real header. The WebGL shader updates its background and lighting when the root theme changes.

## Verification

- `CI=true pnpm --filter @gaudio/docs typecheck`
- `CI=true pnpm --filter @gaudio/docs test` — 165 passed
- `CI=true pnpm --filter @gaudio/docs lint`
- `CI=true pnpm --filter @gaudio/docs build` — static generation and internal-link validation passed

## Final Result

passed

---

# GAudio Reference Match — Design QA

- Date: 2026-08-20
- Source visual: `/Users/guoxk/.codex/generated_images/01a01e79-944d-7ec3-96ab-7670e8743046/exec-fe72d33b-2487-4e36-b23f-36f233d8337c.png`
- Source dimensions: 1034 × 1521 px
- Light implementation: `/private/tmp/gaudio-reference-match-final3/light-1034x1521.png`
- Dark implementation: `/private/tmp/gaudio-reference-match-final3/dark-1034x1521.png`
- Canvas source: `/Users/guoxk/me/i/pen/gaudio.pen`
- State: fixed desktop reference artboard, Chinese locale, player shown as playing, engine ready

## Comparison Evidence

1. Initial same-size comparison: `/private/tmp/gaudio-reference-match-final/source-vs-light.png`
2. Second pass after metadata, waveform, and hero-edge refinements: `/private/tmp/gaudio-reference-match-final2/source-vs-light.png`
3. Final same-size comparison opened as one combined input: `/private/tmp/gaudio-reference-match-final3/source-vs-light.png`

The implementation was exported from Pencil at 2× and downsampled to the source's exact 1034 × 1521 dimensions before comparison. This is a static Pencil artboard, so browser interaction and responsive breakpoint checks are not applicable to this fidelity pass.

## Findings

- P0: none.
- P1: none.
- P2: none after correction. The selected composition, section boundary, player hierarchy, control deck, architecture rail, output fan-out, and fact rail align with the source's visible structure and density.
- P3: the live GAudio shader produces slightly different blob deformation and scan-line texture than the generated source image. The architecture waveform also differs in exact contour while preserving the same placement, tone, and role.
- Dark theme: inspected as a geometry-identical derivative. Contrast, token mapping, control inversion, shader choice, diagram readability, and clipping are intact.

## Final Result

passed

---

# Homepage Migration — Step 1 Hero Player

- Source visual truth: `/Users/guoxk/.codex/generated_images/01a01e79-944d-7ec3-96ab-7670e8743046/exec-fe72d33b-2487-4e36-b23f-36f233d8337c.png`
- Implementation screenshot: `/private/tmp/gaudio-home-step1-final/home-hero-1034x671.png`
- Full homepage screenshot: `/private/tmp/gaudio-home-step1-final/OdtCs.png`
- Viewport: 1440 px homepage canvas; player module preserved at 1034 × 671 px and centered
- Source pixels: 1034 × 671 crop at 1×
- Implementation pixels: 2068 × 1342 Pencil export normalized to 1034 × 671
- State: Light theme, Chinese locale, playing, engine ready
- Full-view evidence: `/private/tmp/gaudio-home-step1-final/OdtCs.png`
- Focused comparison evidence: `/private/tmp/gaudio-home-step1-final/source-vs-home-hero.png`

## Findings

- P0: none.
- P1: none.
- P2: none. Player hierarchy, track copy, reactor scale, metadata, CTA, timeline, transport controls, volume, FFT, and status remain aligned with the selected visual.
- P3: the source's compact brand/status strip is intentionally replaced by the real homepage global header. The live shader deformation differs slightly from the generated source frame.
- Typography: Geist and Geist Mono hierarchy, wrapping, weights, and spacing remain intact.
- Layout: the 1034 px reference module is centered inside the 1440 px homepage rather than stretched, preserving its authored proportions.
- Colors and imagery: GAudio theme tokens and the real light reactor shader are retained; no substitute artwork was introduced.
- Copy: selected Chinese player copy is unchanged.
- Interaction scope: static Pencil canvas verification; browser interactions and responsive breakpoints are deferred until implementation work begins.

## Comparison History

- Initial homepage insertion preserved the reference module at its authored size and produced no actionable P0/P1/P2 mismatch.
- A full-width scaling experiment was rejected during implementation because it did not preserve the shader rendering; the exact-size module was restored before the final evidence capture.

## Final Result

passed
