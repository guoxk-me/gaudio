import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const docsRoot = resolve(import.meta.dirname, '..')
const attributionPath = resolve(docsRoot, 'public/THIRD_PARTY_LICENSES.txt')
const sectionRule = '-'.repeat(80)

export function attributedPackageIdentities(attributionText: string): Set<string> {
  const packageCountHeaders = [...attributionText.matchAll(/^Packages:[^\r\n]*$/gm)]

  if (packageCountHeaders.length !== 1 || !/^Packages: (?:0|[1-9]\d*)$/.test(packageCountHeaders[0][0])) {
    throw new Error('Third-party attribution must contain exactly one valid Packages count header.')
  }

  const declaredPackageCount = Number(packageCountHeaders[0][0].slice('Packages: '.length))

  if (!Number.isSafeInteger(declaredPackageCount) || declaredPackageCount === 0) {
    throw new Error('Third-party attribution Packages count must be a positive safe integer.')
  }

  const packageSectionPattern = new RegExp(
    `^${sectionRule}\\nPackage: ([^\\r\\n]+)\\nLicense expression: [^\\r\\n]+\\n(?:License source: https:\\/\\/[^\\s\\r\\n]+\\n)?Included files: [^\\r\\n]+\\n\\n\\[[^\\r\\n\\]]+\\]\\n`,
    'gm',
  )
  const packageIdentities = [...attributionText.matchAll(packageSectionPattern)].map(packageMatch => packageMatch[1])

  // AI modified: generated record counts make license-body text unable to impersonate coverage metadata.
  if (packageIdentities.length !== declaredPackageCount) {
    throw new Error(`Third-party attribution declares ${declaredPackageCount} packages but contains ${packageIdentities.length} valid package sections.`)
  }

  const uniquePackageIdentities = new Set(packageIdentities)

  if (uniquePackageIdentities.size !== packageIdentities.length) {
    throw new Error('Third-party attribution contains a duplicate package identity.')
  }

  return uniquePackageIdentities
}

function packageIdentityForModule(moduleId: string): string | undefined {
  const filePath = moduleId.replace(/^\0/, '').split('?')[0].replaceAll('\\', '/')
  const nodeModulesMarker = '/node_modules/'
  const packageMarkerIndex = filePath.lastIndexOf(nodeModulesMarker)

  if (packageMarkerIndex < 0) {
    return
  }

  const packagePath = filePath.slice(packageMarkerIndex + nodeModulesMarker.length)
  const packagePathSegments = packagePath.split('/')
  const packageName = packagePath.startsWith('@')
    ? `${packagePathSegments[0]}/${packagePathSegments[1]}`
    : packagePathSegments[0]

  if (!packageName || packageName.endsWith('/undefined')) {
    throw new Error(`Unable to identify the package for bundled module ${moduleId}.`)
  }

  const packageRoot = filePath.slice(0, packageMarkerIndex + nodeModulesMarker.length) + packageName
  const packageManifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    name?: unknown
    version?: unknown
  }

  if (typeof packageManifest.name !== 'string' || typeof packageManifest.version !== 'string') {
    throw new TypeError(`Bundled package ${packageRoot} is missing a name or version.`)
  }

  return `${packageManifest.name}@${packageManifest.version}`
}

// AI modified: Rollup's actual module graph proves every third-party module shipped by the site has attributed text.
export function thirdPartyLicenseCoverage(): Plugin {
  return {
    name: 'gaudio-third-party-license-coverage',
    apply: 'build',
    generateBundle(_outputOptions, outputBundle) {
      const attributionText = readFileSync(attributionPath, 'utf8')
      const attributedPackages = attributedPackageIdentities(attributionText)
      const missingAttributions = new Set<string>()

      for (const bundledFile of Object.values(outputBundle)) {
        if (bundledFile.type !== 'chunk') {
          continue
        }

        for (const moduleId of Object.keys(bundledFile.modules)) {
          const packageIdentity = packageIdentityForModule(moduleId)

          if (packageIdentity && !attributedPackages.has(packageIdentity)) {
            missingAttributions.add(packageIdentity)
          }
        }
      }

      if (missingAttributions.size > 0) {
        this.error(`Bundled packages lack third-party attribution:\n${[...missingAttributions].sort().join('\n')}`)
      }
    },
  }
}
