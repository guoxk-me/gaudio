import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(
  process.env.DECLARATION_PACKAGE_PATH ?? fileURLToPath(new URL('..', import.meta.url)),
)
const distributionRoot = resolve(
  process.env.DECLARATION_DIST_PATH ?? resolve(packageRoot, 'dist'),
)
const packageRealPath = await realpath(packageRoot)
const distributionRealPath = await realpath(distributionRoot)
const declarationFiles = []
const declarationMapFiles = []

async function collectDeclarationArtifacts(directory) {
  const directoryEntries = await readdir(directory, { withFileTypes: true })

  for (const directoryEntry of directoryEntries) {
    const entryPath = resolve(directory, directoryEntry.name)
    if (directoryEntry.isDirectory()) {
      await collectDeclarationArtifacts(entryPath)
    }
    else if (/\.d\.(?:cts|mts|ts)$/.test(directoryEntry.name)) {
      declarationFiles.push(entryPath)
    }
    else if (/\.d\.(?:cts|mts|ts)\.map$/.test(directoryEntry.name)) {
      declarationMapFiles.push(entryPath)
    }
  }
}

function isPathInside(parentPath, childPath) {
  const childRelativePath = relative(parentPath, childPath)
  return childRelativePath !== '..'
    && !childRelativePath.startsWith(`..${sep}`)
    && !isAbsolute(childRelativePath)
}

// AI modified: map ownership comes only from standalone line comments, never commented-out text.
function declarationSourceMapReferences(declarationSource) {
  const sourceMapReferences = []
  let isInsideBlockComment = false
  let lineStart = 0
  let quoteMarker

  for (let sourceOffset = 0; sourceOffset < declarationSource.length; sourceOffset += 1) {
    const currentCharacter = declarationSource[sourceOffset]
    const nextCharacter = declarationSource[sourceOffset + 1]

    if (currentCharacter === '\n') {
      lineStart = sourceOffset + 1
      if (quoteMarker === '\'' || quoteMarker === '"') {
        quoteMarker = undefined
      }
      continue
    }

    if (isInsideBlockComment) {
      if (currentCharacter === '*' && nextCharacter === '/') {
        isInsideBlockComment = false
        sourceOffset += 1
      }
      continue
    }

    if (quoteMarker) {
      if (currentCharacter === '\\') {
        sourceOffset += 1
      }
      else if (currentCharacter === quoteMarker) {
        quoteMarker = undefined
      }
      continue
    }

    if (currentCharacter === '\'' || currentCharacter === '"' || currentCharacter === '`') {
      quoteMarker = currentCharacter
      continue
    }

    if (currentCharacter === '/' && nextCharacter === '*') {
      isInsideBlockComment = true
      sourceOffset += 1
      continue
    }

    if (currentCharacter !== '/' || nextCharacter !== '/') {
      continue
    }

    const lineEnd = declarationSource.indexOf('\n', sourceOffset)
    const commentEnd = lineEnd === -1 ? declarationSource.length : lineEnd
    const hasOnlyIndentation = declarationSource.slice(lineStart, sourceOffset).trim().length === 0
    const lineComment = declarationSource
      .slice(sourceOffset, commentEnd)
      .replace(/\r$/, '')
    const sourceMapMatch = hasOnlyIndentation
      ? /^\/\/# sourceMappingURL=([^\r\n]*)$/.exec(lineComment)
      : null

    if (sourceMapMatch) {
      sourceMapReferences.push(sourceMapMatch[1]?.trim() ?? '')
    }
    sourceOffset = commentEnd - 1
  }

  return sourceMapReferences
}

// AI modified: every published declaration must own a current, self-contained map backed by package sources.
await collectDeclarationArtifacts(distributionRoot)
declarationFiles.sort()
declarationMapFiles.sort()

if (declarationFiles.length === 0) {
  console.error('No declaration files were generated in dist.')
  process.exit(1)
}

const declarationMapFailures = []
const declarationMapOwners = new Map()

for (const declarationFile of declarationFiles) {
  const declarationRelativePath = relative(distributionRoot, declarationFile)
  let declarationRealPath

  try {
    declarationRealPath = await realpath(declarationFile)
    if (!isPathInside(distributionRealPath, declarationRealPath)) {
      declarationMapFailures.push(
        `${declarationRelativePath} resolves outside the declaration distribution.`,
      )
      continue
    }

    const declarationStats = await stat(declarationRealPath)
    if (!declarationStats.isFile()) {
      declarationMapFailures.push(`${declarationRelativePath} is not a file.`)
      continue
    }
  }
  catch {
    declarationMapFailures.push(`${declarationRelativePath} is not a file.`)
    continue
  }

  const declarationSource = await readFile(declarationRealPath, 'utf8')
  const sourceMapReferences = declarationSourceMapReferences(declarationSource)

  if (sourceMapReferences.length !== 1 || sourceMapReferences[0]?.length === 0) {
    declarationMapFailures.push(
      `${declarationRelativePath} must contain exactly one non-empty declaration source map reference.`,
    )
    continue
  }

  const sourceMapReference = sourceMapReferences[0]
  const sourceMapPath = resolve(dirname(declarationFile), sourceMapReference)
  const sourceMapRelativePath = relative(distributionRoot, sourceMapPath)
  const expectedSourceMapPath = `${declarationFile}.map`

  if (!isPathInside(distributionRoot, sourceMapPath)) {
    declarationMapFailures.push(
      `${declarationRelativePath} references a declaration map outside dist.`,
    )
    continue
  }

  if (sourceMapPath !== expectedSourceMapPath) {
    declarationMapFailures.push(
      `${declarationRelativePath} must reference ${basename(expectedSourceMapPath)}.`,
    )
  }

  const existingOwner = declarationMapOwners.get(sourceMapPath)
  if (existingOwner) {
    declarationMapFailures.push(
      `${sourceMapRelativePath} is referenced by more than one declaration (${existingOwner} and ${declarationRelativePath}).`,
    )
  }
  else {
    declarationMapOwners.set(sourceMapPath, declarationRelativePath)
  }

  let sourceMapRealPath
  try {
    sourceMapRealPath = await realpath(sourceMapPath)
    if (!isPathInside(distributionRealPath, sourceMapRealPath)) {
      declarationMapFailures.push(
        `${sourceMapRelativePath} resolves outside the declaration distribution.`,
      )
      continue
    }

    const sourceMapStats = await stat(sourceMapRealPath)
    if (!sourceMapStats.isFile()) {
      declarationMapFailures.push(`${sourceMapRelativePath} is not a file.`)
      continue
    }
  }
  catch {
    declarationMapFailures.push(
      `${declarationRelativePath} references missing ${sourceMapRelativePath}.`,
    )
    continue
  }

  let declarationMap
  try {
    declarationMap = JSON.parse(await readFile(sourceMapRealPath, 'utf8'))
  }
  catch {
    declarationMapFailures.push(`${sourceMapRelativePath} is not valid JSON.`)
    continue
  }

  if (typeof declarationMap !== 'object' || declarationMap === null || Array.isArray(declarationMap)) {
    declarationMapFailures.push(`${sourceMapRelativePath} must contain a source map object.`)
    continue
  }

  if (declarationMap.version !== 3) {
    declarationMapFailures.push(`${sourceMapRelativePath} must use source map version 3.`)
  }

  if (declarationMap.file !== basename(declarationFile)) {
    declarationMapFailures.push(
      `${sourceMapRelativePath} must identify ${basename(declarationFile)} in its file field.`,
    )
  }

  if (typeof declarationMap.mappings !== 'string') {
    declarationMapFailures.push(`${sourceMapRelativePath} must contain string mappings.`)
  }

  if (!Array.isArray(declarationMap.names)
    || !declarationMap.names.every(sourceName => typeof sourceName === 'string')) {
    declarationMapFailures.push(`${sourceMapRelativePath} must contain a names array of strings.`)
  }

  const hasValidSources = Array.isArray(declarationMap.sources)
    && declarationMap.sources.length > 0
    && declarationMap.sources.every(sourcePath => (
      typeof sourcePath === 'string' && sourcePath.trim().length > 0
    ))
  const hasValidSourceRoot = declarationMap.sourceRoot === undefined
    || typeof declarationMap.sourceRoot === 'string'
  const hasEmbeddedSources = hasValidSources
    && Array.isArray(declarationMap.sourcesContent)
    && declarationMap.sourcesContent.length === declarationMap.sources.length
    && declarationMap.sourcesContent.every(sourceContent => typeof sourceContent === 'string')

  if (!hasValidSources) {
    declarationMapFailures.push(`${sourceMapRelativePath} must list non-empty source paths.`)
  }
  if (!hasValidSourceRoot) {
    declarationMapFailures.push(`${sourceMapRelativePath} must use a string sourceRoot.`)
  }
  if (!hasEmbeddedSources) {
    declarationMapFailures.push(`${sourceMapRelativePath} must embed every declaration source.`)
  }
  if (!hasValidSources || !hasValidSourceRoot || !hasEmbeddedSources) {
    continue
  }

  let decodedSourceRoot
  try {
    decodedSourceRoot = decodeURIComponent(declarationMap.sourceRoot ?? '')
  }
  catch {
    declarationMapFailures.push(`${sourceMapRelativePath} contains an invalid encoded sourceRoot.`)
    continue
  }

  for (const [sourceIndex, sourceReference] of declarationMap.sources.entries()) {
    let decodedSourceReference
    try {
      decodedSourceReference = decodeURIComponent(sourceReference)
    }
    catch {
      declarationMapFailures.push(`${sourceMapRelativePath} contains an invalid encoded source path.`)
      continue
    }

    const sourcePath = resolve(dirname(sourceMapPath), decodedSourceRoot, decodedSourceReference)
    if (!isPathInside(packageRoot, sourcePath)) {
      declarationMapFailures.push(`${sourceMapRelativePath} references a source outside the package.`)
      continue
    }

    let sourceRealPath
    try {
      sourceRealPath = await realpath(sourcePath)
      const sourceStats = await stat(sourceRealPath)
      if (!sourceStats.isFile()) {
        declarationMapFailures.push(
          `${sourceMapRelativePath} source ${sourceReference} is not a file.`,
        )
        continue
      }
    }
    catch {
      declarationMapFailures.push(`${sourceMapRelativePath} source ${sourceReference} is not a file.`)
      continue
    }

    if (!isPathInside(packageRealPath, sourceRealPath)) {
      declarationMapFailures.push(`${sourceMapRelativePath} references a source outside the package.`)
      continue
    }

    const currentSourceContent = await readFile(sourceRealPath, 'utf8')
    if (declarationMap.sourcesContent[sourceIndex] !== currentSourceContent) {
      declarationMapFailures.push(
        `${sourceMapRelativePath} contains stale embedded source content for ${sourceReference}.`,
      )
    }
  }
}

for (const declarationMapFile of declarationMapFiles) {
  if (!declarationMapOwners.has(declarationMapFile)) {
    declarationMapFailures.push(
      `${relative(distributionRoot, declarationMapFile)} is not referenced by a declaration.`,
    )
  }
}

if (declarationMapFailures.length > 0) {
  console.error(declarationMapFailures.join('\n'))
  process.exit(1)
}

console.log(`Verified declaration source maps for ${declarationFiles.length} files.`)
