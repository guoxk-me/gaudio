import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')
const releaseChangelogScript = resolve(packageRoot, 'scripts/validate-release-changelog.mjs')
const temporaryDirectories: string[] = []

async function checkReleaseChangelog(
  changelog: string,
  dryRun?: boolean,
  packageVersion?: string,
) {
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'gaudio-release-changelog-'))
  const changelogPath = resolve(temporaryDirectory, 'CHANGELOG.md')
  const releaseEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    CHANGELOG_PATH: changelogPath,
  }

  temporaryDirectories.push(temporaryDirectory)
  await writeFile(changelogPath, changelog)
  delete releaseEnvironment.DRY_RUN
  delete releaseEnvironment.PACKAGE_VERSION
  if (dryRun !== undefined) {
    releaseEnvironment.DRY_RUN = String(dryRun)
  }
  if (packageVersion !== undefined) {
    releaseEnvironment.PACKAGE_VERSION = packageVersion
  }

  return spawnSync(process.execPath, [releaseChangelogScript], {
    encoding: 'utf8',
    env: releaseEnvironment,
  })
}

async function checkPackagePublishChangelog(
  packageChangelog: string,
  ambientChangelog: string,
  ambientDryRun: string,
) {
  const temporaryPackageRoot = await mkdtemp(resolve(tmpdir(), 'gaudio-package-publish-'))
  const temporaryScriptsRoot = resolve(temporaryPackageRoot, 'scripts')
  const temporaryReleaseScript = resolve(temporaryScriptsRoot, 'validate-release-changelog.mjs')
  const ambientChangelogPath = resolve(temporaryPackageRoot, 'ambient-CHANGELOG.md')

  temporaryDirectories.push(temporaryPackageRoot)
  await mkdir(temporaryScriptsRoot)
  await Promise.all([
    copyFile(releaseChangelogScript, temporaryReleaseScript),
    writeFile(
      resolve(temporaryPackageRoot, 'package.json'),
      `${JSON.stringify({ version: '9.9.9' })}\n`,
    ),
    writeFile(resolve(temporaryPackageRoot, 'CHANGELOG.md'), packageChangelog),
    writeFile(ambientChangelogPath, ambientChangelog),
  ])

  // AI modified: reproduce shells where release-test overrides leaked into npm's lifecycle environment.
  return spawnSync(process.execPath, [temporaryReleaseScript, '--package-publish'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CHANGELOG_PATH: ambientChangelogPath,
      DRY_RUN: ambientDryRun,
      PACKAGE_VERSION: '0.0.0',
    },
  })
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(temporaryDirectory => (
    rm(temporaryDirectory, { force: true, recursive: true })
  )))
})

describe('release changelog validation', () => {
  it('uses package metadata and accepts a traceable past release date when overrides are absent', async () => {
    const packageManifest = JSON.parse(
      await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>
      version: string
    }
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      `## ${packageManifest.version} - 2000-01-01`,
      '',
      '- Added playback fixes.',
      '',
    ].join('\n'))

    // AI modified: retrying a reviewed release must not require rewriting its historical release date.
    expect(releaseCheck.status).toBe(0)
    expect(releaseCheck.stderr).toBe('')
    expect(packageManifest.scripts.prepublishOnly).toMatch(
      /^node scripts\/validate-release-changelog\.mjs --package-publish && /,
    )
  })

  it('ignores contaminated validation overrides in package-publish mode', async () => {
    const releaseCheck = await checkPackagePublishChangelog(
      '# Changelog\n\n## 9.9.9 - 2000-01-01\n\n- Added playback fixes.\n',
      '# Changelog\n\n## [Unreleased]\n\n- Ambient dry-run notes.\n',
      'not-a-boolean',
    )

    expect(releaseCheck.status).toBe(0)
    expect(releaseCheck.stderr).toBe('')
  })

  it('requires finalized package notes even when the ambient environment requests a dry run', async () => {
    const releaseCheck = await checkPackagePublishChangelog(
      '# Changelog\n\n## [Unreleased]\n\n- Package notes are not finalized.\n',
      '# Changelog\n\n## [Unreleased]\n\n- Ambient dry-run notes.\n',
      'true',
    )

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('## 9.9.9 - YYYY-MM-DD')
    expect(releaseCheck.stderr).not.toContain('0.0.0')
  })

  it('accepts the unreleased section during a dry run', async () => {
    const releaseCheck = await checkReleaseChangelog('# Changelog\n\n## [Unreleased]\n\n- Added playback fixes.\n', true)

    expect(releaseCheck.status).toBe(0)
    expect(releaseCheck.stderr).toBe('')
  })

  it('rejects an empty unreleased section during a dry run', async () => {
    const releaseCheck = await checkReleaseChangelog('# Changelog\n\n## [Unreleased]\n', true)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('[Unreleased] section must include non-empty release notes')
  })

  it('does not count notes below an empty heading as unreleased content', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '## ',
      '',
      '- Decoy notes.',
      '',
      '## [Unreleased]',
      '',
    ].join('\n'), true)

    // AI modified: an empty heading cannot redirect content ownership from the real release section.
    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('[Unreleased] section must include non-empty release notes')
  })

  it('rejects an unreleased section containing only empty markdown markers', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '-',
      '*',
      '+',
      '1.',
      '>',
      '```ts',
      '```',
      '<!-- TODO: add release notes. -->',
      '',
    ].join('\n'), true)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('[Unreleased] section must include non-empty release notes')
  })

  it('requires a finalized first section before publishing', async () => {
    const releaseCheck = await checkReleaseChangelog('# Changelog\n\n## [Unreleased]\n\n- Added playback fixes.\n', false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('## 0.4.0 - YYYY-MM-DD')
  })

  it('accepts the matching version with a real calendar date', async () => {
    const releaseCheck = await checkReleaseChangelog('# Changelog\n\n## 0.4.0 - 2026-07-28\n\n- Added playback fixes.\n', false)

    expect(releaseCheck.status).toBe(0)
    expect(releaseCheck.stderr).toBe('')
  })

  it('rejects a matching version section without release notes', async () => {
    const releaseCheck = await checkReleaseChangelog('# Changelog\n\n## 0.4.0 - 2026-07-28\n', false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('must include non-empty release notes')
  })

  it('rejects a matching version section with only markdown placeholders', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '## 0.4.0 - 2026-07-28',
      '',
      '### Added',
      '',
      '---',
      '',
      '<!-- TODO: add release notes. -->',
      '',
    ].join('\n'), false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('must include non-empty release notes')
  })

  it.each([
    ['an HTML line break', '<br>'],
    ['an HTML divider', '<hr>'],
    ['an empty HTML container', '<div></div>'],
    ['an empty HTML anchor', '<a href="https://example.com/release"></a>'],
    ['an empty Markdown link', '[]()'],
    ['an HTML non-breaking space', '&nbsp;'],
    ['a zero-width space', '\u200B'],
    ['a decimal whitespace entity', '&#32;'],
    ['a hexadecimal whitespace entity', '&#x20;'],
    ['a named em-space entity', '&emsp;'],
    ['a named zero-width joiner entity', '&zwj;'],
    ['a byte-order-mark entity', '&#xFEFF;'],
    ['a named zero-width-space entity', '&ZeroWidthSpace;'],
    ['a named negative-thin-space entity', '&NegativeThinSpace;'],
    ['a named non-breaking-space entity', '&NonBreakingSpace;'],
    ['a soft hyphen', '\u00AD'],
    ['a variation selector', '\uFE0F'],
    ['a hidden HTML script', '<script>Fixed playback.</script>'],
    ['a list-prefixed hidden HTML script', '- <script>Fixed playback.</script>'],
    ['a nested hidden HTML script', '<div><script>Fixed playback.</script></div>'],
    ['a multiline hidden HTML style', '<style>\n.fixed { color: green; }\n</style>'],
    ['a fenced block inside hidden HTML', '<template>\n```md\nFixed playback.\n```\n</template>'],
    ['nested hidden templates', '<template><template></template>Fixed playback.</template>'],
    ['an unclosed hidden HTML template', '<template>\nFixed playback.'],
    ['an empty Markdown table', '| |\n| - |'],
    ['an empty multi-column Markdown table', '|  |  |\n| :- | -: |\n| | |'],
    ['an inline code span containing only whitespace', '` `'],
    ['a longer inline code span containing only whitespace', '``` ```'],
    ['a multiline inline code span containing only whitespace', '` \n `'],
    ['a Markdown reference definition', '[release-note]: https://example.com'],
    ['an empty resolved reference link', '[][release-note]\n\n[release-note]: https://example.com'],
    ['an empty link with a nested destination', '[](https://example.com/a_(b))'],
    ['an empty link with an escaped closing parenthesis', '[](https://example.com/a\\))'],
    ['an empty angle-bracket link with parentheses', '[](<https://example.com/a_(b)>)'],
    ['an empty multiline link', '[](\nhttps://example.com\n)'],
    ['a multiline reference destination', '[release-note]:\nhttps://example.com'],
    [
      'a multiline reference title',
      '[release-note]: https://example.com\n"title\ncontinued"',
    ],
  ])('rejects release notes containing only %s', async (_description, placeholder) => {
    const [publishCheck, dryRunCheck] = await Promise.all([
      checkReleaseChangelog(`# Changelog\n\n## 0.4.0 - 2026-07-28\n\n${placeholder}\n`, false),
      checkReleaseChangelog(`# Changelog\n\n## [Unreleased]\n\n${placeholder}\n`, true),
    ])

    expect(publishCheck.status).toBe(1)
    expect(publishCheck.stderr).toContain('must include non-empty release notes')
    expect(dryRunCheck.status).toBe(1)
    expect(dryRunCheck.stderr).toContain('must include non-empty release notes')
  })

  it.each([
    ['visible HTML text', '<div>Fixed &amp; documented interrupted playback.</div>'],
    ['a labelled Markdown link', '[Documented the fix](https://example.com/fix)'],
    ['a URL autolink', '<https://example.com/release>'],
    ['an email autolink', '<maintainer@example.com>'],
    [
      'a labelled Markdown reference link',
      '[Fixed playback][release-note]\n\n[release-note]: https://example.com',
    ],
    [
      'a labelled link with a nested destination',
      '[Fixed playback](https://example.com/a_(b))',
    ],
    [
      'visible text after a multiline reference definition',
      '[release-note]:\nhttps://example.com\n\nFixed playback.',
    ],
    [
      'a malformed inline link that renders as text',
      '[](not a valid link destination)',
    ],
    [
      'visible quoted text after a reference definition',
      '[release-note]: https://example.com\n"Fixed playback" remains visible.',
    ],
    [
      'a malformed inline reference definition that renders as text',
      '[release-note]: https://example.com "title" trailing text',
    ],
    [
      'a malformed angle destination that renders as text',
      '[](<https://example.com/<nested>>)',
    ],
    [
      'a destination nested beyond the CommonMark limit',
      `[](https://example.com/${'('.repeat(33)}nested${')'.repeat(33)})`,
    ],
    [
      'an indented code line that resembles a reference definition',
      '\t[release-note]: https://example.com',
    ],
    [
      'inline code containing hidden-HTML syntax',
      '`<script>Visible release-note code.</script>`',
    ],
    [
      'inline code containing an otherwise empty HTML entity',
      '`&nbsp;`',
    ],
    [
      'inline code containing otherwise empty link syntax',
      '`[](<https://example.com/release>)`',
    ],
    [
      'backticks separated by a blank line',
      '`\n\n`',
    ],
    [
      'visible text after a hidden HTML block',
      '<script>Hidden.</script> Fixed playback.',
    ],
    [
      'a Markdown table with a visible header',
      '| Fixed playback |\n| - |',
    ],
    [
      'a visible named HTML entity',
      '&copy;',
    ],
    [
      'a visible numeric HTML entity',
      '&#x1F3B5;',
    ],
  ])('accepts release notes containing %s', async (_description, releaseNote) => {
    const releaseCheck = await checkReleaseChangelog(
      `# Changelog\n\n## 0.4.0 - 2026-07-28\n\n${releaseNote}\n`,
      false,
    )

    expect(releaseCheck.status).toBe(0)
    expect(releaseCheck.stderr).toBe('')
  })

  it('ignores release headings inside fenced code blocks', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '```md',
      '## 0.4.0 - 2026-07-28',
      '```',
      '',
      '- Text outside the fence is not part of a real release section.',
      '',
    ].join('\n'), false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('must start its release history with a level-two heading')
  })

  it('accepts visible fenced code as the only release note', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '## 0.4.0 - 2026-07-28',
      '',
      '```md',
      '## This rendered example is not a release heading',
      '```',
      '',
    ].join('\n'), false)

    expect(releaseCheck.status).toBe(0)
    expect(releaseCheck.stderr).toBe('')
  })

  it('rejects an empty fenced block as the only release note', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '## 0.4.0 - 2026-07-28',
      '',
      '```md',
      '',
      '```',
      '',
    ].join('\n'), false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('must include non-empty release notes')
  })

  it('ignores release headings inside HTML comments', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '<!--',
      '## 0.4.0 - 2026-07-28',
      '-->',
      '',
      '- Text outside the comment is not part of a real release section.',
      '',
    ].join('\n'), false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('must start its release history with a level-two heading')
  })

  it('rejects an impossible release date', async () => {
    const releaseCheck = await checkReleaseChangelog('# Changelog\n\n## 0.4.0 - 2026-02-29\n\n- Added playback fixes.\n', false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('## 0.4.0 - YYYY-MM-DD')
  })

  it('rejects a release date later than the current UTC date', async () => {
    const releaseCheck = await checkReleaseChangelog('# Changelog\n\n## 0.4.0 - 9999-12-31\n\n- Added playback fixes.\n', false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('cannot be later than the current UTC date')
  })

  it('does not accept a matching version hidden below a stale first release', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '## 0.3.0 - 2026-06-01',
      '',
      '- Previous release.',
      '',
      '## 0.4.0 - 2026-07-28',
      '',
      '- Current release.',
      '',
    ].join('\n'), false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('first CHANGELOG.md release section')
  })

  it('rejects a matching version hidden below the unreleased section', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '- Pending changes.',
      '',
      '## 0.4.0 - 2026-07-28',
      '',
      '- Premature release.',
      '',
    ].join('\n'), true)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('cannot sit below [Unreleased]')
  })

  it('rejects duplicate matching release sections', async () => {
    const releaseCheck = await checkReleaseChangelog([
      '# Changelog',
      '',
      '## 0.4.0 - 2026-07-28',
      '',
      '- Current release.',
      '',
      '## [0.4.0] - 2026-07-27',
      '',
      '- Duplicate release.',
      '',
    ].join('\n'), false)

    expect(releaseCheck.status).toBe(1)
    expect(releaseCheck.stderr).toContain('at most one 0.4.0 section')
  })
})
