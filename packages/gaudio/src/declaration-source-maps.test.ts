import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')
const declarationMapScript = resolve(packageRoot, 'scripts/verify-declaration-source-maps.mjs')
const temporaryPackageRoots: string[] = []

interface DeclarationMapFields {
  file?: unknown
  mappings?: unknown
  names?: unknown
  sourceRoot?: unknown
  sources?: unknown
  sourcesContent?: unknown
  version?: unknown
}

async function createTemporaryPackage() {
  const temporaryPackageRoot = await mkdtemp(resolve(tmpdir(), 'gaudio-declaration-maps-'))

  temporaryPackageRoots.push(temporaryPackageRoot)
  await Promise.all([
    mkdir(resolve(temporaryPackageRoot, 'dist')),
    mkdir(resolve(temporaryPackageRoot, 'src')),
  ])
  return temporaryPackageRoot
}

async function writeDeclarationWithMap(
  temporaryPackageRoot: string,
  declarationName: string,
  declarationMapFields: DeclarationMapFields = {},
) {
  const distributionRoot = resolve(temporaryPackageRoot, 'dist')
  const sourceName = `${declarationName}.source.ts`
  const sourceText = `export interface ${basename(declarationName).replaceAll('.', '_')} {}\n`
  const declarationMap = {
    file: declarationName,
    mappings: '',
    names: [],
    sourceRoot: '',
    sources: [`../src/${sourceName}`],
    sourcesContent: [sourceText],
    version: 3,
    ...declarationMapFields,
  }

  await Promise.all([
    writeFile(
      resolve(distributionRoot, declarationName),
      `export {};\n//# sourceMappingURL=${declarationName}.map\n`,
    ),
    writeFile(resolve(distributionRoot, `${declarationName}.map`), `${JSON.stringify(declarationMap)}\n`),
    writeFile(resolve(temporaryPackageRoot, 'src', sourceName), sourceText),
  ])
}

function checkDeclarationMaps(temporaryPackageRoot: string) {
  return spawnSync(process.execPath, [declarationMapScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DECLARATION_DIST_PATH: resolve(temporaryPackageRoot, 'dist'),
      DECLARATION_PACKAGE_PATH: temporaryPackageRoot,
    },
  })
}

afterEach(async () => {
  await Promise.all(temporaryPackageRoots.splice(0).map(temporaryPackageRoot => (
    rm(temporaryPackageRoot, { force: true, recursive: true })
  )))
})

describe('declaration source map validation', () => {
  it('accepts complete one-to-one declaration maps with current embedded sources', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()

    await Promise.all([
      writeDeclarationWithMap(temporaryPackageRoot, 'index.d.ts'),
      writeDeclarationWithMap(temporaryPackageRoot, 'index.d.cts'),
    ])

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(0)
    expect(declarationMapCheck.stderr).toBe('')
    expect(declarationMapCheck.stdout).toContain('Verified declaration source maps for 2 files')
  })

  it('rejects a declaration that references another declaration map', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()

    await Promise.all([
      writeDeclarationWithMap(temporaryPackageRoot, 'index.d.ts'),
      writeDeclarationWithMap(temporaryPackageRoot, 'hls.d.ts'),
    ])
    await writeFile(
      resolve(temporaryPackageRoot, 'dist/index.d.ts'),
      'export {};\n//# sourceMappingURL=hls.d.ts.map\n',
    )

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain('index.d.ts must reference index.d.ts.map')
    expect(declarationMapCheck.stderr).toContain('hls.d.ts.map is referenced by more than one declaration')
    expect(declarationMapCheck.stderr).toContain('index.d.ts.map is not referenced by a declaration')
  })

  it('rejects invalid map versions, file identities, and source entries', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()

    await Promise.all([
      writeDeclarationWithMap(temporaryPackageRoot, 'version.d.ts', { version: 2 }),
      writeDeclarationWithMap(temporaryPackageRoot, 'identity.d.ts', { file: 'other.d.ts' }),
      writeDeclarationWithMap(temporaryPackageRoot, 'mappings.d.ts', { mappings: undefined }),
      writeDeclarationWithMap(temporaryPackageRoot, 'names.d.ts', { names: undefined }),
      writeDeclarationWithMap(temporaryPackageRoot, 'sources.d.ts', {
        sources: [''],
        sourcesContent: [''],
      }),
    ])

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain('version.d.ts.map must use source map version 3')
    expect(declarationMapCheck.stderr).toContain('identity.d.ts.map must identify identity.d.ts')
    expect(declarationMapCheck.stderr).toContain('mappings.d.ts.map must contain string mappings')
    expect(declarationMapCheck.stderr).toContain('names.d.ts.map must contain a names array')
    expect(declarationMapCheck.stderr).toContain('sources.d.ts.map must list non-empty source paths')
  })

  it('counts empty source map directives when enforcing a single reference', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()

    await writeDeclarationWithMap(temporaryPackageRoot, 'index.d.ts')
    await writeFile(
      resolve(temporaryPackageRoot, 'dist/index.d.ts'),
      [
        'export {};',
        '//# sourceMappingURL=index.d.ts.map',
        '//# sourceMappingURL=',
        '',
      ].join('\n'),
    )

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain(
      'index.d.ts must contain exactly one non-empty declaration source map reference',
    )
  })

  it('rejects malformed, outside-package, and non-file source paths', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()

    await Promise.all([
      writeDeclarationWithMap(temporaryPackageRoot, 'encoded.d.ts', {
        sources: ['%E0%A4%A'],
        sourcesContent: [''],
      }),
      writeDeclarationWithMap(temporaryPackageRoot, 'outside.d.ts', {
        sources: ['../../outside.ts'],
        sourcesContent: [''],
      }),
      writeDeclarationWithMap(temporaryPackageRoot, 'directory.d.ts', {
        sources: ['../src'],
        sourcesContent: [''],
      }),
    ])

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain('encoded.d.ts.map contains an invalid encoded source path')
    expect(declarationMapCheck.stderr).toContain('outside.d.ts.map references a source outside the package')
    expect(declarationMapCheck.stderr).toContain('directory.d.ts.map source ../src is not a file')
  })

  it('rejects stale embedded source content', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()

    await writeDeclarationWithMap(temporaryPackageRoot, 'index.d.ts', {
      sourcesContent: ['export interface StaleSource {}\n'],
    })

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain('index.d.ts.map contains stale embedded source content')
  })

  it('rejects orphan declaration maps', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()

    await writeDeclarationWithMap(temporaryPackageRoot, 'index.d.ts')
    await writeFile(
      resolve(temporaryPackageRoot, 'dist/orphan.d.ts.map'),
      JSON.stringify({
        file: 'orphan.d.ts',
        mappings: '',
        names: [],
        sources: ['../src/orphan.ts'],
        sourcesContent: ['export {}\n'],
        version: 3,
      }),
    )

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain('orphan.d.ts.map is not referenced by a declaration')
  })

  it('rejects declaration map symlinks that resolve outside dist', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()
    const externalMapRoot = await mkdtemp(resolve(tmpdir(), 'gaudio-external-map-'))
    const declarationMapPath = resolve(temporaryPackageRoot, 'dist/index.d.ts.map')
    const externalMapPath = resolve(externalMapRoot, 'index.d.ts.map')

    temporaryPackageRoots.push(externalMapRoot)
    await writeDeclarationWithMap(temporaryPackageRoot, 'index.d.ts')
    await rename(declarationMapPath, externalMapPath)
    await symlink(externalMapPath, declarationMapPath)

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain(
      'index.d.ts.map resolves outside the declaration distribution',
    )
  })

  it('rejects declaration symlinks that resolve outside dist', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()
    const externalDeclarationRoot = await mkdtemp(resolve(tmpdir(), 'gaudio-external-declaration-'))
    const declarationPath = resolve(temporaryPackageRoot, 'dist/index.d.ts')
    const externalDeclarationPath = resolve(externalDeclarationRoot, 'index.d.ts')

    temporaryPackageRoots.push(externalDeclarationRoot)
    await writeDeclarationWithMap(temporaryPackageRoot, 'index.d.ts')
    await rename(declarationPath, externalDeclarationPath)
    await symlink(externalDeclarationPath, declarationPath)

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain(
      'index.d.ts resolves outside the declaration distribution',
    )
  })

  it('ignores source map text inside block comments', async () => {
    const temporaryPackageRoot = await createTemporaryPackage()

    await writeDeclarationWithMap(temporaryPackageRoot, 'index.d.ts')
    await writeFile(
      resolve(temporaryPackageRoot, 'dist/index.d.ts'),
      [
        'export {};',
        '/*',
        '//# sourceMappingURL=index.d.ts.map',
        '*/',
        '',
      ].join('\n'),
    )

    const declarationMapCheck = checkDeclarationMaps(temporaryPackageRoot)

    expect(declarationMapCheck.status).toBe(1)
    expect(declarationMapCheck.stderr).toContain(
      'index.d.ts must contain exactly one non-empty declaration source map reference',
    )
  })
})
