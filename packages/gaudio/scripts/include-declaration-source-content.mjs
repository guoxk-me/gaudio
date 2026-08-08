import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

const packageRoot = resolve(import.meta.dirname, '..')
const distributionRoot = resolve(packageRoot, 'dist')
const declarationMapFiles = []

async function collectDeclarationMapFiles(directory) {
  const directoryEntries = await readdir(directory, { withFileTypes: true })

  for (const directoryEntry of directoryEntries) {
    const entryPath = resolve(directory, directoryEntry.name)
    if (directoryEntry.isDirectory()) {
      await collectDeclarationMapFiles(entryPath)
    }
    else if (/\.d\.(?:cts|mts|ts)\.map$/.test(directoryEntry.name)) {
      declarationMapFiles.push(entryPath)
    }
  }
}

// AI modified: declaration maps must remain useful after npm omits the package's private source tree.
await collectDeclarationMapFiles(distributionRoot)

for (const declarationMapFile of declarationMapFiles) {
  const declarationMap = JSON.parse(await readFile(declarationMapFile, 'utf8'))
  if (!Array.isArray(declarationMap.sources) || declarationMap.sources.length === 0) {
    throw new Error(`${relative(distributionRoot, declarationMapFile)} has no declaration sources.`)
  }

  const sourceRoot = typeof declarationMap.sourceRoot === 'string'
    ? declarationMap.sourceRoot
    : ''
  const sourceContents = []

  for (const sourceReference of declarationMap.sources) {
    if (typeof sourceReference !== 'string') {
      throw new TypeError(`${relative(distributionRoot, declarationMapFile)} contains a non-string source reference.`)
    }

    const sourcePath = resolve(dirname(declarationMapFile), sourceRoot, decodeURIComponent(sourceReference))
    const packageRelativePath = relative(packageRoot, sourcePath)
    const isInsidePackage = packageRelativePath !== '..'
      && !packageRelativePath.startsWith(`..${sep}`)
      && !isAbsolute(packageRelativePath)

    if (!isInsidePackage) {
      throw new Error(`${relative(distributionRoot, declarationMapFile)} references a source outside the package.`)
    }

    const sourceStats = await stat(sourcePath)
    if (!sourceStats.isFile()) {
      throw new Error(`${packageRelativePath} is not a declaration source file.`)
    }
    sourceContents.push(await readFile(sourcePath, 'utf8'))
  }

  declarationMap.sourcesContent = sourceContents
  await writeFile(declarationMapFile, `${JSON.stringify(declarationMap)}\n`)
}
