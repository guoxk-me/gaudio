import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { realpathWithinDirectory } from './lib/file-boundary.ts'
import { assertReviewedLicense } from './lib/license-policy.ts'
import { attributedPackageIdentities } from './lib/third-party-license-coverage.ts'

const docsRoot = resolve(import.meta.dirname)
const licenseGenerator = resolve(docsRoot, 'scripts/generate-third-party-licenses.mjs')
const generatedLicenseFile = 'THIRD_PARTY_LICENSES.txt'
const dashSidecarFile = 'assets/chunks/dash.all.min.js.LICENSE.txt'
const temporaryDirectories: string[] = []

async function generatedAttribution() {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'gaudio-third-party-licenses-'))
  temporaryDirectories.push(outputRoot)

  const generation = spawnSync(process.execPath, [licenseGenerator, outputRoot], {
    cwd: docsRoot,
    encoding: 'utf8',
  })

  return {
    attribution: await readFile(resolve(outputRoot, generatedLicenseFile), 'utf8'),
    dashSidecar: await readFile(resolve(outputRoot, dashSidecarFile)),
    generation,
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(temporaryDirectory => (
    rm(temporaryDirectory, { force: true, recursive: true })
  )))
})

describe('documentation third-party attribution', () => {
  it.each([
    '0BSD',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'ISC',
    'MIT',
    'MPL-2.0',
  ])('accepts the reviewed license expression %s', (licenseExpression) => {
    expect(() => assertReviewedLicense('fixture@1.0.0', licenseExpression)).not.toThrow()
  })

  it.each(['', 'UNKNOWN', 'GPL-3.0-only', 'AGPL-3.0-only', 'MIT OR GPL-3.0-only'])(
    'rejects the unreviewed license expression %s',
    (licenseExpression) => {
      expect(() => assertReviewedLicense('fixture@1.0.0', licenseExpression)).toThrow(
        'uses unreviewed license expression',
      )
    },
  )

  it('reads package coverage only from complete generated metadata sections', () => {
    const attributionText = `Packages: 1

--------------------------------------------------------------------------------
Package: genuine@1.0.0
License expression: MIT
Included files: LICENSE

[LICENSE]
Package: forged-from-license-body@9.9.9
`

    expect([...attributedPackageIdentities(attributionText)]).toEqual(['genuine@1.0.0'])
  })

  it('rejects attribution when the declared count does not match structured sections', () => {
    const attributionText = `Packages: 2

--------------------------------------------------------------------------------
Package: genuine@1.0.0
License expression: MIT
Included files: LICENSE

[LICENSE]
fixture
`

    expect(() => attributedPackageIdentities(attributionText)).toThrow(
      'declares 2 packages but contains 1 valid package sections',
    )
  })

  it('rejects duplicate structured package identities', () => {
    const attributionText = `Packages: 2

--------------------------------------------------------------------------------
Package: duplicate@1.0.0
License expression: MIT
Included files: LICENSE

[LICENSE]
first
--------------------------------------------------------------------------------
Package: duplicate@1.0.0
License expression: MIT
Included files: NOTICE

[NOTICE]
second
`

    expect(() => attributedPackageIdentities(attributionText)).toThrow('duplicate package identity')
  })

  it.each([
    'Packages:',
    'Packages: ',
    'Packages: many',
    'Packages: 01',
  ])('rejects an empty or abnormal count header: %s', (packageCountHeader) => {
    expect(() => attributedPackageIdentities(`${packageCountHeader}\n`)).toThrow(
      'exactly one valid Packages count header',
    )
  })

  it('covers the production closure and shipped site dependencies deterministically', { timeout: 20_000 }, async () => {
    const [firstGeneration, secondGeneration, committedAttribution] = await Promise.all([
      generatedAttribution(),
      generatedAttribution(),
      readFile(resolve(docsRoot, 'public', generatedLicenseFile), 'utf8'),
    ])

    expect(firstGeneration.generation.status).toBe(0)
    expect(firstGeneration.generation.stderr).toBe('')
    expect(firstGeneration.attribution).toBe(secondGeneration.attribution)
    expect(firstGeneration.attribution).toBe(committedAttribution)
    const attributedPackages = attributedPackageIdentities(firstGeneration.attribution)
    expect(attributedPackages.size).toBe(Number(firstGeneration.attribution.match(/^Packages: (\d+)$/m)?.[1]))
    expect(attributedPackages.has('@docsearch/css@3.8.2')).toBe(true)
    expect(firstGeneration.attribution).toContain('Package: @svta/cml-dash@')
    expect(firstGeneration.attribution).toContain('Package: @docsearch/css@3.8.2')
    expect(firstGeneration.attribution).toContain('https://github.com/algolia/docsearch/blob/v3.8.2/LICENSE')
    expect(firstGeneration.attribution).toContain('Copyright (c) 2015-present Algolia, Inc.')
    expect(firstGeneration.attribution).toContain('Package: @vueuse/shared@')
    expect(firstGeneration.attribution).toContain('Package: hls.js@')
    expect(firstGeneration.attribution).toContain('Package: dashjs@')
    expect(firstGeneration.attribution).toContain('Package: tw-animate-css@')
    expect(firstGeneration.attribution).toContain('Package: vitepress@')
    expect(firstGeneration.attribution).toContain('Package: vue@')
    expect(firstGeneration.attribution).not.toContain('Package: gaudio@')
    expect(firstGeneration.attribution).not.toContain(docsRoot)
  })

  it('copies the exact sidecar referenced by the dashjs ESM bundle', async () => {
    const [sourceSidecar, committedSidecar] = await Promise.all([
      readFile(resolve(docsRoot, 'node_modules/dashjs/dist/modern/esm/dash.all.min.js.LICENSE.txt')),
      readFile(resolve(docsRoot, 'public', dashSidecarFile)),
    ])

    expect(committedSidecar).toEqual(sourceSidecar)
  })

  it('rejects a dependency license symlink that resolves outside its package', async () => {
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'gaudio-license-boundary-'))
    const packageDirectory = resolve(temporaryRoot, 'package')
    const externalLicensePath = resolve(temporaryRoot, 'external-LICENSE')

    temporaryDirectories.push(temporaryRoot)
    await mkdir(packageDirectory)
    const packageRoot = await realpath(packageDirectory)
    const packageLicensePath = resolve(packageRoot, 'LICENSE')
    await writeFile(externalLicensePath, 'external license text\n')
    await symlink(externalLicensePath, packageLicensePath)

    await expect(realpathWithinDirectory(
      packageRoot,
      packageLicensePath,
      'fixture@1.0.0 license LICENSE',
    )).rejects.toThrow(
      'fixture@1.0.0 license LICENSE resolves outside its allowed directory.',
    )
  })

  it('reads an internal dependency license symlink through its verified real path', async () => {
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'gaudio-license-boundary-'))
    const packageDirectory = resolve(temporaryRoot, 'package')

    temporaryDirectories.push(temporaryRoot)
    await mkdir(resolve(packageDirectory, 'licenses'), { recursive: true })
    const packageRoot = await realpath(packageDirectory)
    const licenseMaterialPath = resolve(packageRoot, 'licenses/MIT.txt')
    const packageLicensePath = resolve(packageRoot, 'LICENSE')
    await writeFile(licenseMaterialPath, 'internal license text\n')
    await symlink(licenseMaterialPath, packageLicensePath)

    const verifiedLicensePath = await realpathWithinDirectory(
      packageRoot,
      packageLicensePath,
      'fixture@1.0.0 license LICENSE',
    )

    expect(verifiedLicensePath).toBe(await realpath(licenseMaterialPath))
    expect(await readFile(verifiedLicensePath, 'utf8')).toBe('internal license text\n')
  })

  it('includes both upstream notices for copied shadcn-vue component source', async () => {
    const [componentsConfiguration, copiedSourceLicense, committedAttribution] = await Promise.all([
      readFile(resolve(docsRoot, 'components.json'), 'utf8'),
      readFile(resolve(docsRoot, 'licenses/copied-source-licenses.txt'), 'utf8'),
      readFile(resolve(docsRoot, 'public', generatedLicenseFile), 'utf8'),
    ])

    expect(componentsConfiguration).toContain('shadcn-vue.com/schema.json')
    expect(copiedSourceLicense).toContain('Copyright (c) 2023 unovue')
    expect(copiedSourceLicense).toContain('Copyright (c) 2023 shadcn')
    expect(copiedSourceLicense.match(/Permission is hereby granted/g)).toHaveLength(2)
    expect(committedAttribution).toContain(copiedSourceLicense.trim())
  })
})
