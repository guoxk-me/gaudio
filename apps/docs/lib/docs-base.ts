import process from 'node:process'

const invalidDocsBaseMessage = 'DOCS_BASE must be a non-empty URL pathname without schemes, authorities, query/hash data, whitespace, control characters, backslashes, encoded separators, or traversal segments.'
const docsBaseSchemePattern = /^[a-z][a-z\d+.-]*:/iu

function hasUnsafeDocsBaseCharacter(docsPath: string): boolean {
  return [...docsPath].some((pathCharacter) => {
    const characterCode = pathCharacter.codePointAt(0)
    const isC0ControlCharacter = characterCode !== undefined && characterCode <= 0x1F
    const isC1ControlCharacter = characterCode !== undefined && characterCode >= 0x7F && characterCode <= 0x9F

    return /\s/u.test(pathCharacter)
      || isC0ControlCharacter
      || isC1ControlCharacter
  })
}

function hasTraversalSegment(docsPath: string): boolean {
  return docsPath.split('/').some(pathSegment => pathSegment === '.' || pathSegment === '..')
}

function hasUnsafeDocsBaseStructure(docsPath: string): boolean {
  return docsBaseSchemePattern.test(docsPath)
    || docsPath.includes('//')
    || docsPath.includes('?')
    || docsPath.includes('#')
    || docsPath.includes('\\')
    || hasUnsafeDocsBaseCharacter(docsPath)
    || hasTraversalSegment(docsPath)
}

// AI modified: validate the shared deployment base before build tools or browsers interpret it as a URL.
export function resolveDocsBase(configuredBase: string): string {
  if (
    configuredBase.length === 0
    || hasUnsafeDocsBaseStructure(configuredBase)
  ) {
    throw new TypeError(invalidDocsBaseMessage)
  }

  let safetyPath = configuredBase
  let isOriginalEncoding = true

  while (safetyPath.includes('%')) {
    let decodedSafetyPath: string

    try {
      decodedSafetyPath = decodeURIComponent(safetyPath)
    }
    catch {
      if (isOriginalEncoding) {
        throw new TypeError(invalidDocsBaseMessage)
      }

      break
    }

    if (decodedSafetyPath === safetyPath) {
      break
    }

    const hasEncodedSlash = decodedSafetyPath.split('/').length > safetyPath.split('/').length

    if (
      hasEncodedSlash
      // AI modified: query, fragment, authority, and scheme confusion stays invalid through every encoding layer.
      || hasUnsafeDocsBaseStructure(decodedSafetyPath)
    ) {
      throw new TypeError(invalidDocsBaseMessage)
    }

    safetyPath = decodedSafetyPath
    isOriginalEncoding = false
  }

  const docsBaseWithLeadingSlash = configuredBase.startsWith('/')
    ? configuredBase
    : `/${configuredBase}`

  return docsBaseWithLeadingSlash.endsWith('/')
    ? docsBaseWithLeadingSlash
    : `${docsBaseWithLeadingSlash}/`
}

// AI modified: every build, preview, and browser check shares one deployment-base contract.
export const docsBase = resolveDocsBase(process.env.DOCS_BASE ?? '/gaudio/')

export function docsRoute(relativePath = ''): string {
  return `${docsBase}${relativePath.replace(/^\/+/, '')}`
}
