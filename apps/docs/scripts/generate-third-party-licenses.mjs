import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { realpathWithinDirectory } from '../lib/file-boundary.ts'
import { assertReviewedLicense } from '../lib/license-policy.ts'

const executeFile = promisify(execFile)
const docsRoot = resolve(import.meta.dirname, '..')
const workspaceRoot = resolve(docsRoot, '../..')
const workspaceNodeModules = resolve(workspaceRoot, 'node_modules')
const licenseOverridesRoot = resolve(docsRoot, 'licenses')
const resolvedLicenseOverridesRoot = await realpath(licenseOverridesRoot)
const copiedSourceLicensePath = resolve(resolvedLicenseOverridesRoot, 'copied-source-licenses.txt')
const licenseOverridesPath = resolve(resolvedLicenseOverridesRoot, 'package-license-overrides.json')
const outputRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(docsRoot, 'public')
// AI modified: Nuxt runtime modules replace VitePress in the generated site's shipped dependency closure.
const shippedDevelopmentRoots = ['@nuxt/content', '@nuxtjs/sitemap', 'nuxt', 'tw-animate-css']
const licenseFileNamePattern = /^(?:licen[cs]e|copying|copyright|notice)(?:$|[._-])/i
const sectionRule = '-'.repeat(80)
const licenseOverridesRealPath = await realpathWithinDirectory(
  resolvedLicenseOverridesRoot,
  licenseOverridesPath,
  'package license override configuration',
)
const packageLicenseOverrides = JSON.parse(await readFile(licenseOverridesRealPath, 'utf8'))

if (!packageLicenseOverrides || typeof packageLicenseOverrides !== 'object' || Array.isArray(packageLicenseOverrides)) {
  throw new TypeError('Package license overrides must be a JSON object.')
}

function compareCodePoints(leftText, rightText) {
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0
}

function dependencyRecords(dependencies, packageRecords = []) {
  if (!dependencies || typeof dependencies !== 'object') {
    return packageRecords
  }

  for (const dependencyName of Object.keys(dependencies).sort(compareCodePoints)) {
    const dependencyRecord = dependencies[dependencyName]

    if (!dependencyRecord || typeof dependencyRecord !== 'object' || typeof dependencyRecord.path !== 'string') {
      throw new TypeError(`pnpm returned an invalid dependency record for ${dependencyName}.`)
    }

    packageRecords.push(dependencyRecord)
    // AI modified: workspace links are traversed before first-party filtering so their future external dependencies stay covered.
    dependencyRecords(dependencyRecord.dependencies, packageRecords)
  }

  return packageRecords
}

function textWithStableLineEndings(sourceText) {
  // AI modified: upstream line-ending and trailing-space differences must not dirty generated attribution files.
  const unixText = sourceText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(licenseLine => licenseLine.trimEnd())
    .join('\n')

  return `${unixText.replace(/\n+$/, '')}\n`
}

// AI modified: pnpm supplies the resolved mandatory graph; excluding platform optionals keeps Mac and Linux output identical.
const { stdout: packageGraphText } = await executeFile('pnpm', [
  '--filter',
  '@gaudio/docs',
  'list',
  '--no-optional',
  '--depth',
  'Infinity',
  '--json',
], {
  cwd: workspaceRoot,
  encoding: 'utf8',
  // AI modified: Nuxt's explicit dependency tree exceeds Node's small child-process output default.
  maxBuffer: 64 * 1024 * 1024,
})

let packageGraphs

try {
  packageGraphs = JSON.parse(packageGraphText)
}
catch (error) {
  throw new Error('pnpm did not return a valid dependency graph.', { cause: error })
}

if (!Array.isArray(packageGraphs) || packageGraphs.length !== 1) {
  throw new TypeError('Expected exactly one @gaudio/docs dependency graph from pnpm.')
}

const docsPackageGraph = packageGraphs[0]
const selectedRootDependencies = new Map()

for (const dependencyRecord of dependencyRecords(docsPackageGraph.dependencies)) {
  selectedRootDependencies.set(dependencyRecord.path, {
    dependencyRecord,
    isProductionRequired: true,
  })
}

for (const shippedDevelopmentRoot of shippedDevelopmentRoots) {
  const shippedDependency = docsPackageGraph.devDependencies?.[shippedDevelopmentRoot]

  if (!shippedDependency) {
    throw new Error(`Missing shipped documentation dependency ${shippedDevelopmentRoot}.`)
  }

  for (const dependencyRecord of dependencyRecords({ [shippedDevelopmentRoot]: shippedDependency })) {
    const existingDependency = selectedRootDependencies.get(dependencyRecord.path)

    selectedRootDependencies.set(dependencyRecord.path, {
      dependencyRecord,
      isProductionRequired: existingDependency?.isProductionRequired ?? false,
    })
  }
}

const resolvedPackageRoots = new Map()

for (const { dependencyRecord, isProductionRequired } of selectedRootDependencies.values()) {
  const packageRoot = await realpath(dependencyRecord.path)
  const nodeModulesPath = relative(workspaceNodeModules, packageRoot)
  const isThirdPartyPackage = nodeModulesPath !== ''
    && !nodeModulesPath.startsWith('..')
    && !isAbsolute(nodeModulesPath)

  if (isThirdPartyPackage) {
    const existingPackage = resolvedPackageRoots.get(packageRoot)

    resolvedPackageRoots.set(packageRoot, {
      isProductionRequired: existingPackage?.isProductionRequired || isProductionRequired,
      packageRoot,
    })
  }
}

const licensesByPackage = new Map()
const usedLicenseOverrides = new Set()
let dashSidecarBytes
let dashSidecarName

for (const { isProductionRequired, packageRoot } of [...resolvedPackageRoots.values()].sort((leftPackage, rightPackage) => (
  compareCodePoints(leftPackage.packageRoot, rightPackage.packageRoot)
))) {
  const manifestText = await readFile(resolve(packageRoot, 'package.json'), 'utf8')
  const packageManifest = JSON.parse(manifestText)

  if (typeof packageManifest.name !== 'string' || typeof packageManifest.version !== 'string') {
    throw new TypeError(`Package at ${packageRoot} is missing a name or version.`)
  }

  const legacyLicenseExpressions = Array.isArray(packageManifest.licenses)
    ? packageManifest.licenses
        .map(licenseRecord => typeof licenseRecord?.type === 'string' ? licenseRecord.type.trim() : '')
        .filter(Boolean)
    : []
  // AI modified: legacy npm packages may declare one valid license through the deprecated licenses array.
  const licenseExpression = typeof packageManifest.license === 'string'
    ? packageManifest.license.trim().replace(/\s+/g, ' ')
    : new Set(legacyLicenseExpressions).size === 1 ? legacyLicenseExpressions[0] : ''
  const packageIdentity = `${packageManifest.name}@${packageManifest.version}`
  const packageEntries = await readdir(packageRoot, { withFileTypes: true })
  const licensePaths = packageEntries
    .filter(packageEntry => (
      (packageEntry.isFile() || packageEntry.isSymbolicLink())
      && licenseFileNamePattern.test(packageEntry.name)
    ))
    .map(packageEntry => resolve(packageRoot, packageEntry.name))

  const referencedLicenseMatch = licenseExpression.match(/^SEE LICENSE IN ([^\r\n]+)$/i)

  if (referencedLicenseMatch) {
    const referencedLicensePath = resolve(packageRoot, referencedLicenseMatch[1])
    const referencedPathWithinPackage = relative(packageRoot, referencedLicensePath)

    if (referencedPathWithinPackage.startsWith('..') || isAbsolute(referencedPathWithinPackage)) {
      throw new Error(`${packageManifest.name}@${packageManifest.version} references a license outside its package.`)
    }

    licensePaths.push(referencedLicensePath)
  }

  const uniqueLicensePaths = [...new Set(licensePaths)].sort(compareCodePoints)

  // AI modified: dash.js ships bundled notices beside its actual ESM export, and the emitted chunk retains that pointer.
  if (packageManifest.name === 'dashjs') {
    const rootExport = packageManifest.exports?.['.']
    const dashEntry = typeof rootExport === 'object' && typeof rootExport.import === 'string'
      ? rootExport.import
      : undefined

    if (!dashEntry) {
      throw new Error('dashjs no longer declares the expected ESM import export.')
    }

    const dashSourcePath = resolve(packageRoot, dashEntry)
    const dashSourceRealPath = await realpathWithinDirectory(
      packageRoot,
      dashSourcePath,
      'dashjs ESM export',
    )
    const dashSource = await readFile(dashSourceRealPath, 'utf8')
    const sidecarPointer = dashSource.match(/For license information please see ([\w./-]+) \*\//)?.[1]

    if (!sidecarPointer || basename(sidecarPointer) !== sidecarPointer) {
      throw new Error('dashjs no longer exposes a safe sibling license pointer.')
    }

    const sourceSidecarPath = resolve(dirname(dashSourcePath), sidecarPointer)
    const sidecarPathWithinPackage = relative(packageRoot, sourceSidecarPath)

    if (sidecarPathWithinPackage.startsWith('..') || isAbsolute(sidecarPathWithinPackage)) {
      throw new Error('dashjs references a license sidecar outside its package.')
    }

    const sourceSidecarRealPath = await realpathWithinDirectory(
      packageRoot,
      sourceSidecarPath,
      `dashjs sidecar ${sidecarPointer}`,
    )

    dashSidecarBytes = await readFile(sourceSidecarRealPath)
    dashSidecarName = sidecarPointer
    uniqueLicensePaths.push(sourceSidecarPath)
    uniqueLicensePaths.sort(compareCodePoints)
  }

  const licenseMaterials = []
  let licenseSource

  if (uniqueLicensePaths.length === 0) {
    const licenseOverride = packageLicenseOverrides[packageIdentity]

    if (!licenseOverride) {
      if (isProductionRequired) {
        throw new Error(`${packageManifest.name}@${packageManifest.version} ships no root license or notice text.`)
      }

      // AI modified: candidate build dependencies may be absent only when the Rollup coverage gate proves they did not ship.
      continue
    }

    if (
      typeof licenseOverride !== 'object'
      || typeof licenseOverride.licenseExpression !== 'string'
      || typeof licenseOverride.licenseFile !== 'string'
      || typeof licenseOverride.source !== 'string'
      || licenseOverride.licenseExpression !== licenseExpression
      || !licenseOverride.source.startsWith('https://')
    ) {
      throw new TypeError(`Invalid reviewed license override for ${packageIdentity}.`)
    }

    const overrideLicensePath = resolve(resolvedLicenseOverridesRoot, licenseOverride.licenseFile)
    const overridePathWithinRoot = relative(resolvedLicenseOverridesRoot, overrideLicensePath)

    if (overridePathWithinRoot.startsWith('..') || isAbsolute(overridePathWithinRoot)) {
      throw new Error(`${packageIdentity} references a license override outside the licenses directory.`)
    }

    const overrideLicenseRealPath = await realpathWithinDirectory(
      resolvedLicenseOverridesRoot,
      overrideLicensePath,
      `${packageIdentity} license override ${licenseOverride.licenseFile}`,
    )
    const overrideLicenseText = textWithStableLineEndings(
      await readFile(overrideLicenseRealPath, 'utf8'),
    )

    if (overrideLicenseText.trim() === '') {
      throw new Error(`${packageIdentity} has an empty license override.`)
    }

    // AI modified: upstream text is an explicit version-pinned exception when an npm tarball omits its declared license.
    licenseMaterials.push({
      relativePath: `override:${licenseOverride.licenseFile}`,
      text: overrideLicenseText,
    })
    licenseSource = licenseOverride.source
    usedLicenseOverrides.add(packageIdentity)
  }
  else {
    for (const licensePath of uniqueLicensePaths) {
      const displayedLicensePath = relative(packageRoot, licensePath).replaceAll('\\', '/')
      // AI modified: preserve the package-facing name while reading only a real target owned by that package.
      const licenseRealPath = await realpathWithinDirectory(
        packageRoot,
        licensePath,
        `${packageIdentity} license ${displayedLicensePath}`,
      )
      const licenseText = textWithStableLineEndings(await readFile(licenseRealPath, 'utf8'))

      if (licenseText.trim() === '') {
        throw new Error(`${packageManifest.name}@${packageManifest.version} ships an empty license file.`)
      }

      licenseMaterials.push({
        relativePath: displayedLicensePath,
        text: licenseText,
      })
    }
  }

  if (licenseMaterials.length === 0) {
    if (isProductionRequired) {
      throw new Error(`${packageManifest.name}@${packageManifest.version} ships no root license or notice text.`)
    }

    continue
  }

  assertReviewedLicense(packageIdentity, licenseExpression)

  const licenseRecord = {
    identity: packageIdentity,
    licenseExpression,
    licenseSource,
    materials: licenseMaterials,
  }
  const existingLicenseRecord = licensesByPackage.get(packageIdentity)

  // AI modified: peer snapshots may deduplicate only when the package metadata and shipped license bytes agree exactly.
  if (existingLicenseRecord && JSON.stringify(existingLicenseRecord) !== JSON.stringify(licenseRecord)) {
    throw new Error(`Conflicting license material found for ${packageIdentity}.`)
  }

  licensesByPackage.set(packageIdentity, licenseRecord)
}

const unusedLicenseOverrides = Object.keys(packageLicenseOverrides)
  .filter(packageIdentity => !usedLicenseOverrides.has(packageIdentity))
  .sort(compareCodePoints)

if (unusedLicenseOverrides.length > 0) {
  throw new Error(`Unused package license overrides must be reviewed or removed:\n${unusedLicenseOverrides.join('\n')}`)
}

if (!dashSidecarBytes || !dashSidecarName) {
  throw new Error('The production dependency closure did not include the required dashjs sidecar.')
}

const licenseRecords = [...licensesByPackage.values()].sort((leftRecord, rightRecord) => (
  compareCodePoints(leftRecord.identity, rightRecord.identity)
))
const componentsConfiguration = await readFile(resolve(docsRoot, 'components.json'), 'utf8')
let copiedSourceLicenseText = ''

if (componentsConfiguration.includes('shadcn-vue.com/schema.json')) {
  // AI modified: copied-source notices share the same symlink boundary as reviewed package overrides.
  const copiedSourceLicenseRealPath = await realpathWithinDirectory(
    resolvedLicenseOverridesRoot,
    copiedSourceLicensePath,
    'copied-source license attribution',
  )
  copiedSourceLicenseText = textWithStableLineEndings(
    await readFile(copiedSourceLicenseRealPath, 'utf8'),
  )
  const requiredCopiedSourceMarkers = [
    'Project: shadcn-vue',
    'Copyright (c) 2023 unovue',
    'https://raw.githubusercontent.com/unovue/shadcn-vue/dev/LICENSE',
    'Project: shadcn/ui',
    'Copyright (c) 2023 shadcn',
    'https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md',
  ]

  // AI modified: copied UI source bypasses node_modules, so its two upstream MIT notices are mandatory inputs.
  for (const copiedSourceMarker of requiredCopiedSourceMarkers) {
    if (!copiedSourceLicenseText.includes(copiedSourceMarker)) {
      throw new Error(`Copied-source attribution is missing ${copiedSourceMarker}.`)
    }
  }

  assertReviewedLicense('shadcn-vue copied source', 'MIT')
  assertReviewedLicense('shadcn/ui copied source', 'MIT')
}

const licenseSections = licenseRecords.map(licenseRecord => [
  sectionRule,
  `Package: ${licenseRecord.identity}`,
  `License expression: ${licenseRecord.licenseExpression}`,
  ...(licenseRecord.licenseSource ? [`License source: ${licenseRecord.licenseSource}`] : []),
  `Included files: ${licenseRecord.materials.map(material => material.relativePath).join(', ')}`,
  '',
  ...licenseRecord.materials.flatMap(material => [
    `[${material.relativePath}]`,
    material.text,
  ]),
].join('\n'))
const attributionText = [
  'GAudio documentation third-party licenses',
  '===========================================',
  '',
  'Generated by apps/docs/scripts/generate-third-party-licenses.mjs; do not edit by hand.',
  'Scope: the mandatory apps/docs production dependency closure plus declared packages whose code or CSS ships in the static site.',
  'Platform-specific optional build bindings are not part of the browser artifact.',
  `Packages: ${licenseRecords.length}`,
  '',
  ...licenseSections,
  sectionRule,
  copiedSourceLicenseText,
].join('\n').replace(/\n+$/, '\n')

await Promise.all([
  mkdir(outputRoot, { recursive: true }),
  mkdir(resolve(outputRoot, 'assets/chunks'), { recursive: true }),
])
await Promise.all([
  writeFile(resolve(outputRoot, 'THIRD_PARTY_LICENSES.txt'), attributionText, 'utf8'),
  writeFile(resolve(outputRoot, 'assets/chunks', dashSidecarName), dashSidecarBytes),
])

console.log(`Generated third-party attribution for ${licenseRecords.length} packages.`)
