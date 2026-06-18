# Public API TSDoc Design

## Goal

Make gaudio's public API understandable from IDE hover and parameter hints without requiring consumers to read the implementation.

## Scope

- Add English TSDoc to every public declaration exported from `gaudio`, `gaudio/hls`, and `gaudio/dash`.
- Document public classes, interfaces, type aliases, properties, methods, parameters, return values, events, defaults, units, side effects, and relevant exceptions.
- Keep declaration comments concise enough for IDE use.
- Preserve existing runtime behavior and public signatures.
- Keep internal comments focused on non-obvious design reasons; do not annotate self-explanatory local variables.

## Documentation Style

- Lead with a one-sentence summary.
- Add details only when callers need lifecycle, unit, default, or compatibility context.
- Use `@param`, `@returns`, `@throws`, and `@defaultValue` where they improve generated API help.
- Describe event payload fields at their type definitions and event timing at the event map.
- Use links between related public symbols when useful.

## Verification

- Run library and demo type checks.
- Run ESLint and the full Vitest suite.
- Build all package entry points.
- Inspect emitted `.d.ts` files to confirm TSDoc is retained for IDE consumers.

