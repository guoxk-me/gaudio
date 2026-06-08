# AGENTS.md

## META

### First Principles

- Understand the root cause before changing code.
- Fix causes, not symptoms.
- Follow existing architecture and conventions unless they conflict with correctness.
- Prefer the simplest solution that fully solves the problem.

### Execution

- Default to action on low-risk, reversible changes.
- Avoid unnecessary confirmations.
- Stop only for true human-gated decisions.
- Do not expand scope without justification.

### Verification

- Execution is the source of truth.
- Verify through Type Check, Lint, Tests, and Build whenever applicable.
- Never claim verification that was not executed.
- Tag conclusions as: Executed, Inspected, or Assumed.

### Refactoring

- Refactor adjacent code only when it directly supports the current task.

### Push Back

- If a request conflicts with correctness, security, or maintainability, explain the concern and propose a better alternative.

## General Rules

Before making changes:

1. Understand the existing implementation.
2. Reuse existing patterns.
3. Prefer modifying existing files over creating new ones.
4. Keep changes minimal and focused.
5. Avoid unnecessary abstractions.

Prefer:

- Simple solutions
- Clear naming
- Focused changes

Avoid:

- Over-engineering
- Premature optimization
- Dead code

## Naming Rules

### General

- Use clear, specific, business-oriented names.
- Prefer business meaning over implementation details.
- Avoid generic names such as: data, item, result, temp, value.
- Avoid technical placeholder names such as: processedData, transformedData, parsedResponse, formattedResult, normalizedData.

### Variables

- Use camelCase.
- Boolean variables should start with: is, has, can, should.
- Arrays should use plural names.

### Functions

- Use camelCase.
- Function names should describe business behavior.
- Functions should represent business logic, not simple data reshaping.
- Prefer direct object construction for one-time transformations.
- Do not use normalize, parse, transform, convert, format, build, or map when the function only performs field mapping, object reshaping, or property copying.

### Types

- Use PascalCase.
- Avoid prefixes such as I and T.

### Components

- Use PascalCase.

### Composables

- Must start with use.

### Files

- Vue Components: PascalCase.
- Other files: kebab-case.

## AI Modification Comments

- When AI changes logic, behavior, or structure, add a concise comment nearby.
- Explain why the change exists.
- Keep comments short.
- Do not comment every line.
- Do not add meaningless comments.

Example:

```ts
// AI modified: added fallback handling for empty user names.
```

## TypeScript

- Use strict typing.
- Avoid any.
- Prefer explicit types.

## Dependencies & Files

- Check existing dependencies before adding new ones.
- Prefer built-in platform APIs.
- Prefer modifying existing files.
- Create new files only when responsibility separation is clearly justified.

## High-Risk Changes

Require confirmation before:

- Database schema changes
- Production data modifications
- Public API changes
- Authentication or authorization changes
- Large cross-module refactors
- Irreversible operations

## Forbidden

Do not:

- Rewrite large areas unnecessarily.
- Introduce breaking changes without justification.
- Disable lint rules.
- Ignore TypeScript errors.
- Use any as a shortcut.
- Change unrelated files.
- Create helper functions solely for field mapping.
- Use normalize as a method, variable, file, or type name.
- Add meaningless AI comments.

## Completion Criteria

- Implementation is finished.
- Relevant verification is completed.
- Risks and assumptions are reported.
- Scope remains controlled.
- Changes remain maintainable.
