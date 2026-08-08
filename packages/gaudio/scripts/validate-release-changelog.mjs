// AI modified: keep development changelog entries truthful while requiring a dated first section before npm upload.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const packageRoot = resolve(import.meta.dirname, '..')
const packageManifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
const validationArguments = process.argv.slice(2)
const isPackagePublish = validationArguments[0] === '--package-publish'

if (validationArguments.length > 1 || (validationArguments.length === 1 && !isPackagePublish)) {
  console.error('Usage: validate-release-changelog.mjs [--package-publish]')
  process.exit(1)
}

// AI modified: package lifecycle publishes must ignore ambient workflow and test overrides.
const packageVersion = isPackagePublish
  ? packageManifest.version
  : process.env.PACKAGE_VERSION ?? packageManifest.version
const dryRun = isPackagePublish ? 'false' : process.env.DRY_RUN ?? 'false'
const changelogPath = isPackagePublish
  ? resolve(packageRoot, 'CHANGELOG.md')
  : resolve(process.env.CHANGELOG_PATH ?? resolve(packageRoot, 'CHANGELOG.md'))

function markdownFenceAtLineStart(markdownLine) {
  let markerOffset = 0
  while (markerOffset < 3 && markdownLine[markerOffset] === ' ') {
    markerOffset += 1
  }

  const marker = markdownLine[markerOffset]
  if (marker !== '`' && marker !== '~') {
    return undefined
  }

  let markerEnd = markerOffset
  while (markdownLine[markerEnd] === marker) {
    markerEnd += 1
  }

  const markerLength = markerEnd - markerOffset
  return markerLength >= 3
    ? {
        details: markdownLine.slice(markerEnd),
        length: markerLength,
        marker,
      }
    : undefined
}

function lineEndOffset(markdownText, startOffset) {
  const lineFeedOffset = markdownText.indexOf('\n', startOffset)
  if (lineFeedOffset === -1) {
    return markdownText.length
  }

  return lineFeedOffset > startOffset && markdownText[lineFeedOffset - 1] === '\r'
    ? lineFeedOffset - 1
    : lineFeedOffset
}

function offsetAfterLineEnd(markdownText, endOffset) {
  if (endOffset >= markdownText.length) {
    return endOffset
  }

  return markdownText[endOffset] === '\r'
    ? endOffset + 2
    : endOffset + 1
}

function offsetAfterHorizontalWhitespace(markdownText, startOffset) {
  let whitespaceEndOffset = startOffset
  while (markdownText[whitespaceEndOffset] === ' ' || markdownText[whitespaceEndOffset] === '\t') {
    whitespaceEndOffset += 1
  }
  return whitespaceEndOffset
}

function inlineWhitespace(markdownText, startOffset) {
  let whitespaceEndOffset = startOffset
  let lineBreakCount = 0

  while (whitespaceEndOffset < markdownText.length) {
    const whitespaceCharacter = markdownText[whitespaceEndOffset]
    if (whitespaceCharacter === ' ' || whitespaceCharacter === '\t') {
      whitespaceEndOffset += 1
      continue
    }

    if (whitespaceCharacter !== '\n' && whitespaceCharacter !== '\r') {
      break
    }

    lineBreakCount += 1
    if (lineBreakCount > 1) {
      return {
        endOffset: whitespaceEndOffset,
        hasWhitespace: true,
        isValid: false,
      }
    }

    whitespaceEndOffset += whitespaceCharacter === '\r'
      && markdownText[whitespaceEndOffset + 1] === '\n'
      ? 2
      : 1
  }

  return {
    endOffset: whitespaceEndOffset,
    hasWhitespace: whitespaceEndOffset > startOffset,
    isValid: true,
  }
}

function linkDestinationEnd(markdownText, startOffset) {
  if (markdownText[startOffset] === '<') {
    for (let destinationOffset = startOffset + 1; destinationOffset < markdownText.length; destinationOffset += 1) {
      const destinationCharacter = markdownText[destinationOffset]
      if (destinationCharacter === '\\') {
        destinationOffset += 1
        continue
      }
      if (destinationCharacter === '\n' || destinationCharacter === '\r') {
        return undefined
      }
      if (destinationCharacter === '<') {
        return undefined
      }
      if (destinationCharacter === '>') {
        return destinationOffset + 1
      }
    }

    return undefined
  }

  let destinationDepth = 0
  let destinationOffset = startOffset

  while (destinationOffset < markdownText.length) {
    const destinationCharacter = markdownText[destinationOffset]
    if (destinationCharacter === '\\') {
      if (destinationOffset + 1 >= markdownText.length) {
        return undefined
      }
      destinationOffset += 2
      continue
    }
    if (/\s/.test(destinationCharacter)) {
      break
    }
    if (destinationCharacter === '(') {
      destinationDepth += 1
      if (destinationDepth > 32) {
        return undefined
      }
    }
    else if (destinationCharacter === ')') {
      if (destinationDepth === 0) {
        break
      }
      destinationDepth -= 1
    }
    destinationOffset += 1
  }

  return destinationOffset > startOffset && destinationDepth === 0
    ? destinationOffset
    : undefined
}

function linkTitleEnd(markdownText, startOffset) {
  const titleMarker = markdownText[startOffset]
  if (titleMarker !== '"' && titleMarker !== '\'' && titleMarker !== '(') {
    return undefined
  }

  const closingMarker = titleMarker === '(' ? ')' : titleMarker
  let hasContentAfterLineBreak = true

  for (let titleOffset = startOffset + 1; titleOffset < markdownText.length; titleOffset += 1) {
    const titleCharacter = markdownText[titleOffset]
    if (titleCharacter === '\\') {
      titleOffset += 1
      hasContentAfterLineBreak = true
      continue
    }
    if (titleCharacter === '\n' || titleCharacter === '\r') {
      if (!hasContentAfterLineBreak) {
        return undefined
      }
      hasContentAfterLineBreak = false
      if (titleCharacter === '\r' && markdownText[titleOffset + 1] === '\n') {
        titleOffset += 1
      }
      continue
    }
    if (titleCharacter !== ' ' && titleCharacter !== '\t') {
      hasContentAfterLineBreak = true
    }
    if (titleMarker === '(' && titleCharacter === '(') {
      return undefined
    }
    if (titleCharacter === closingMarker) {
      return titleOffset + 1
    }
  }

  return undefined
}

function inlineLinkEnd(markdownText, openingParenthesisOffset) {
  const leadingWhitespace = inlineWhitespace(markdownText, openingParenthesisOffset + 1)
  if (!leadingWhitespace.isValid) {
    return undefined
  }

  let linkOffset = leadingWhitespace.endOffset
  if (markdownText[linkOffset] === ')') {
    return linkOffset + 1
  }

  const destinationEndOffset = linkDestinationEnd(markdownText, linkOffset)
  if (destinationEndOffset === undefined) {
    return undefined
  }

  const destinationWhitespace = inlineWhitespace(markdownText, destinationEndOffset)
  if (!destinationWhitespace.isValid) {
    return undefined
  }

  linkOffset = destinationWhitespace.endOffset
  if (markdownText[linkOffset] === ')') {
    return linkOffset + 1
  }
  if (!destinationWhitespace.hasWhitespace) {
    return undefined
  }

  const titleEndOffset = linkTitleEnd(markdownText, linkOffset)
  if (titleEndOffset === undefined) {
    return undefined
  }

  const trailingWhitespace = inlineWhitespace(markdownText, titleEndOffset)
  return trailingWhitespace.isValid && markdownText[trailingWhitespace.endOffset] === ')'
    ? trailingWhitespace.endOffset + 1
    : undefined
}

// AI modified: balanced and multiline link destinations must not masquerade as reader-visible release notes.
function releaseNoteTextWithoutInlineLinkDestinations(markdownText) {
  let readerText = ''
  let textOffset = 0

  while (textOffset < markdownText.length) {
    const labelMarkerOffset = markdownText[textOffset] === '!'
      && markdownText[textOffset + 1] === '['
      ? textOffset + 1
      : textOffset

    if (markdownText[labelMarkerOffset] !== '[') {
      readerText += markdownText[textOffset]
      textOffset += 1
      continue
    }

    let labelDepth = 1
    let labelEndOffset = labelMarkerOffset + 1

    while (labelEndOffset < markdownText.length && labelDepth > 0) {
      const labelCharacter = markdownText[labelEndOffset]

      if (labelCharacter === '\\') {
        labelEndOffset += 2
        continue
      }

      if (labelCharacter === '[') {
        labelDepth += 1
      }
      else if (labelCharacter === ']') {
        labelDepth -= 1
      }

      labelEndOffset += 1
    }

    const closingLabelOffset = labelEndOffset - 1
    if (labelDepth !== 0 || markdownText[labelEndOffset] !== '(') {
      readerText += markdownText[textOffset]
      textOffset += 1
      continue
    }

    const labelText = markdownText.slice(labelMarkerOffset + 1, closingLabelOffset)
    if (labelText.length > 999 || /\r?\n[ \t]*\r?\n/.test(labelText)) {
      readerText += markdownText[textOffset]
      textOffset += 1
      continue
    }

    const linkEndOffset = inlineLinkEnd(markdownText, labelEndOffset)
    if (linkEndOffset === undefined) {
      readerText += markdownText[textOffset]
      textOffset += 1
      continue
    }

    const destinationText = markdownText.slice(labelEndOffset, linkEndOffset)
    readerText += labelText
    readerText += destinationText.replace(/[^\r\n]/g, '')
    textOffset = linkEndOffset
  }

  return readerText
}

function hiddenHtmlClosingTag(markdownLine, tagName, startOffset) {
  const lowercaseLine = markdownLine.toLowerCase()
  const closingTagStart = `</${tagName}`
  let closingTagOffset = lowercaseLine.indexOf(closingTagStart, startOffset)

  while (closingTagOffset !== -1) {
    const boundaryCharacter = lowercaseLine[closingTagOffset + closingTagStart.length]
    if (boundaryCharacter === '>' || boundaryCharacter === ' ' || boundaryCharacter === '\t') {
      const closingTagEndOffset = lowercaseLine.indexOf('>', closingTagOffset + closingTagStart.length)
      return {
        endOffset: closingTagEndOffset === -1 ? markdownLine.length : closingTagEndOffset + 1,
        index: closingTagOffset,
      }
    }
    closingTagOffset = lowercaseLine.indexOf(closingTagStart, closingTagOffset + closingTagStart.length)
  }

  return undefined
}

function hiddenHtmlOpeningTag(markdownLine, startOffset, requiredTagName) {
  const openingTagPattern = /<(head|script|style|template|title)(?:[ \t>/]|$)/gi
  openingTagPattern.lastIndex = startOffset

  for (let openingTagMatch = openingTagPattern.exec(markdownLine); openingTagMatch; openingTagMatch = openingTagPattern.exec(markdownLine)) {
    const tagName = openingTagMatch[1].toLowerCase()
    if (requiredTagName && tagName !== requiredTagName) {
      continue
    }

    let precedingBackslashCount = 0
    for (
      let precedingOffset = openingTagMatch.index - 1;
      precedingOffset >= 0 && markdownLine[precedingOffset] === '\\';
      precedingOffset -= 1
    ) {
      precedingBackslashCount += 1
    }
    if (precedingBackslashCount % 2 === 0) {
      return {
        index: openingTagMatch.index,
        tagName,
      }
    }
  }

  return undefined
}

// AI modified: raw HTML whose contents browsers do not render cannot satisfy the release-note content gate.
function releaseNoteLinesWithoutHiddenHtmlContent(markdownLines, fencedCodeLines) {
  const readerLines = [...markdownLines]
  let hiddenTag

  for (let lineIndex = 0; lineIndex < readerLines.length; lineIndex += 1) {
    const markdownLine = readerLines[lineIndex]
    if (fencedCodeLines[lineIndex] && !hiddenTag) {
      continue
    }

    let visibleLine = ''
    let lineOffset = 0
    while (lineOffset < markdownLine.length) {
      if (hiddenTag) {
        const nestedOpeningTag = hiddenHtmlOpeningTag(markdownLine, lineOffset, hiddenTag.name)
        const closingTag = hiddenHtmlClosingTag(markdownLine, hiddenTag.name, lineOffset)
        if (!closingTag) {
          lineOffset = markdownLine.length
          continue
        }
        if (nestedOpeningTag && nestedOpeningTag.index < closingTag.index) {
          const nestedOpeningTagEndOffset = markdownLine.indexOf('>', nestedOpeningTag.index)
          if (nestedOpeningTagEndOffset === -1) {
            lineOffset = markdownLine.length
            continue
          }
          hiddenTag.depth += 1
          lineOffset = nestedOpeningTagEndOffset + 1
          continue
        }

        hiddenTag.depth -= 1
        lineOffset = closingTag.endOffset
        if (hiddenTag.depth === 0) {
          hiddenTag = undefined
        }
        continue
      }

      const openingTag = hiddenHtmlOpeningTag(markdownLine, lineOffset)
      if (!openingTag) {
        visibleLine += markdownLine.slice(lineOffset)
        break
      }

      visibleLine += markdownLine.slice(lineOffset, openingTag.index)
      const openingTagEndOffset = markdownLine.indexOf('>', openingTag.index)
      hiddenTag = {
        depth: 1,
        name: openingTag.tagName,
      }
      if (openingTagEndOffset === -1) {
        break
      }
      lineOffset = openingTagEndOffset + 1
    }
    readerLines[lineIndex] = visibleLine
  }

  return readerLines
}

function releaseNoteLinesWithoutInlineLinkDestinations(markdownLines, fencedCodeLines) {
  const readerLines = []
  let lineOffset = 0

  while (lineOffset < markdownLines.length) {
    if (fencedCodeLines[lineOffset]) {
      readerLines.push(markdownLines[lineOffset])
      lineOffset += 1
      continue
    }

    let runEndOffset = lineOffset
    while (runEndOffset < markdownLines.length && !fencedCodeLines[runEndOffset]) {
      runEndOffset += 1
    }

    readerLines.push(
      ...releaseNoteTextWithoutInlineLinkDestinations(
        markdownLines.slice(lineOffset, runEndOffset).join('\n'),
      ).split('\n'),
    )
    lineOffset = runEndOffset
  }

  return readerLines
}

function releaseNoteTextWithoutInlineCodeSpans(markdownText) {
  const visibleCodeLineOffsets = new Set()
  let readerText = ''
  let textOffset = 0

  while (textOffset < markdownText.length) {
    if (markdownText[textOffset] !== '`') {
      readerText += markdownText[textOffset]
      textOffset += 1
      continue
    }

    let openingMarkerEndOffset = textOffset
    while (markdownText[openingMarkerEndOffset] === '`') {
      openingMarkerEndOffset += 1
    }
    const marker = markdownText.slice(textOffset, openingMarkerEndOffset)
    let closingMarkerOffset = markdownText.indexOf(marker, openingMarkerEndOffset)
    const blankLineMatch = /\r?\n[ \t]*\r?\n/.exec(markdownText.slice(openingMarkerEndOffset))
    const blankLineOffset = blankLineMatch === null
      ? undefined
      : openingMarkerEndOffset + blankLineMatch.index

    while (
      closingMarkerOffset !== -1
      && (
        markdownText[closingMarkerOffset - 1] === '`'
        || markdownText[closingMarkerOffset + marker.length] === '`'
      )
    ) {
      closingMarkerOffset = markdownText.indexOf(marker, closingMarkerOffset + marker.length)
    }

    if (
      closingMarkerOffset === -1
      || (blankLineOffset !== undefined && closingMarkerOffset > blankLineOffset)
    ) {
      readerText += marker
      textOffset = openingMarkerEndOffset
      continue
    }

    const codeText = markdownText.slice(openingMarkerEndOffset, closingMarkerOffset)
    const visibleCodeText = codeText
      .replace(/\r?\n/g, ' ')
      .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
      .trim()
    if (visibleCodeText.length > 0) {
      visibleCodeLineOffsets.add(markdownText.slice(0, textOffset).split('\n').length - 1)
    }

    const codeSpanEndOffset = closingMarkerOffset + marker.length
    readerText += markdownText.slice(textOffset, codeSpanEndOffset).replace(/[^\r\n]/g, '')
    textOffset = codeSpanEndOffset
  }

  return {
    readerText,
    visibleCodeLineOffsets,
  }
}

function releaseNoteLinesWithoutInlineCodeSpans(markdownLines, fencedCodeLines) {
  const readerLines = []
  const visibleCodeLineIndexes = new Set()
  let lineOffset = 0

  while (lineOffset < markdownLines.length) {
    if (fencedCodeLines[lineOffset]) {
      readerLines.push(markdownLines[lineOffset])
      lineOffset += 1
      continue
    }

    let runEndOffset = lineOffset
    while (runEndOffset < markdownLines.length && !fencedCodeLines[runEndOffset]) {
      runEndOffset += 1
    }

    const codeSpanCheck = releaseNoteTextWithoutInlineCodeSpans(
      markdownLines.slice(lineOffset, runEndOffset).join('\n'),
    )
    readerLines.push(...codeSpanCheck.readerText.split('\n'))
    for (const visibleCodeLineOffset of codeSpanCheck.visibleCodeLineOffsets) {
      visibleCodeLineIndexes.add(lineOffset + visibleCodeLineOffset)
    }
    lineOffset = runEndOffset
  }

  return {
    readerLines,
    visibleCodeLineIndexes,
  }
}

function referenceDefinitionEnd(markdownText) {
  const definitionMatch = /^ {0,3}\[(?:\\.|[^\\[\]\r\n]){1,999}\]:/.exec(markdownText)
  if (!definitionMatch) {
    return undefined
  }

  let definitionOffset = offsetAfterHorizontalWhitespace(markdownText, definitionMatch[0].length)
  let destinationLineEndOffset = lineEndOffset(markdownText, definitionOffset)
  if (definitionOffset === destinationLineEndOffset) {
    definitionOffset = offsetAfterLineEnd(markdownText, destinationLineEndOffset)
    destinationLineEndOffset = lineEndOffset(markdownText, definitionOffset)
    definitionOffset = offsetAfterHorizontalWhitespace(markdownText, definitionOffset)
    if (definitionOffset === destinationLineEndOffset) {
      return undefined
    }
  }

  const destinationEndOffset = linkDestinationEnd(markdownText, definitionOffset)
  if (destinationEndOffset === undefined || destinationEndOffset > destinationLineEndOffset) {
    return undefined
  }

  const titleSeparatorEndOffset = offsetAfterHorizontalWhitespace(markdownText, destinationEndOffset)
  if (titleSeparatorEndOffset < destinationLineEndOffset) {
    if (titleSeparatorEndOffset === destinationEndOffset) {
      return undefined
    }

    const titleEndOffset = linkTitleEnd(markdownText, titleSeparatorEndOffset)
    if (titleEndOffset === undefined) {
      return undefined
    }

    const titleLineEndOffset = lineEndOffset(markdownText, titleEndOffset)
    return offsetAfterHorizontalWhitespace(markdownText, titleEndOffset) === titleLineEndOffset
      ? titleLineEndOffset
      : undefined
  }

  const definitionEndOffset = destinationLineEndOffset
  const nextLineOffset = offsetAfterLineEnd(markdownText, destinationLineEndOffset)
  if (nextLineOffset >= markdownText.length) {
    return definitionEndOffset
  }

  const possibleTitleOffset = offsetAfterHorizontalWhitespace(markdownText, nextLineOffset)
  const titleEndOffset = linkTitleEnd(markdownText, possibleTitleOffset)
  if (titleEndOffset === undefined) {
    return definitionEndOffset
  }

  const titleLineEndOffset = lineEndOffset(markdownText, titleEndOffset)
  return offsetAfterHorizontalWhitespace(markdownText, titleEndOffset) === titleLineEndOffset
    ? titleLineEndOffset
    : definitionEndOffset
}

// AI modified: only syntactically complete reference definitions are excluded from visible release notes.
function referenceDefinitionLineIndexes(markdownLines, fencedCodeLines) {
  const definitionLineIndexes = new Set()

  for (let lineIndex = 0; lineIndex < markdownLines.length; lineIndex += 1) {
    if (fencedCodeLines[lineIndex]) {
      continue
    }

    let candidateEndLineIndex = lineIndex
    while (candidateEndLineIndex < markdownLines.length && !fencedCodeLines[candidateEndLineIndex]) {
      candidateEndLineIndex += 1
    }

    const definitionCandidate = markdownLines.slice(lineIndex, candidateEndLineIndex).join('\n')
    const definitionEndOffset = referenceDefinitionEnd(definitionCandidate)
    if (definitionEndOffset === undefined) {
      continue
    }

    const definitionLineCount = definitionCandidate.slice(0, definitionEndOffset).split('\n').length
    for (let definitionLineOffset = 0; definitionLineOffset < definitionLineCount; definitionLineOffset += 1) {
      definitionLineIndexes.add(lineIndex + definitionLineOffset)
    }
  }

  return definitionLineIndexes
}

// AI modified: empty table cells and their delimiter row are structure, not visible release notes.
function emptyTableLineIndexes(markdownLines, fencedCodeLines) {
  const tableLineIndexes = new Set()

  for (let lineIndex = 0; lineIndex + 1 < markdownLines.length; lineIndex += 1) {
    if (fencedCodeLines[lineIndex] || fencedCodeLines[lineIndex + 1]) {
      continue
    }

    const headerLine = markdownLines[lineIndex]
    const delimiterLine = markdownLines[lineIndex + 1]
    if (!headerLine.includes('|') || !delimiterLine.includes('|')) {
      continue
    }

    const delimiterCells = delimiterLine
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
    if (delimiterCells.length === 0 || !delimiterCells.every(cell => /^:?-+:?$/.test(cell.trim()))) {
      continue
    }

    tableLineIndexes.add(lineIndex + 1)
    if (/^[\s|]*$/.test(headerLine)) {
      tableLineIndexes.add(lineIndex)
    }

    let bodyLineIndex = lineIndex + 2
    while (
      bodyLineIndex < markdownLines.length
      && !fencedCodeLines[bodyLineIndex]
      && markdownLines[bodyLineIndex].includes('|')
    ) {
      if (/^[\s|]*$/.test(markdownLines[bodyLineIndex])) {
        tableLineIndexes.add(bodyLineIndex)
      }
      bodyLineIndex += 1
    }
  }

  return tableLineIndexes
}

function htmlNumericEntityCharacter(entityText, hexadecimalDigits, decimalDigits) {
  const codePoint = Number.parseInt(
    hexadecimalDigits ?? decimalDigits,
    hexadecimalDigits === undefined ? 10 : 16,
  )
  return Number.isInteger(codePoint)
    && codePoint > 0
    && codePoint <= 0x10FFFF
    && !(codePoint >= 0xD800 && codePoint <= 0xDFFF)
    ? String.fromCodePoint(codePoint)
    : entityText
}

// AI modified: hidden comments and fenced examples cannot define the published release structure.
function changelogLinesOutsideCommentsAndFences(changelogText) {
  const markdownLines = changelogText.split(/\r?\n/)
  const readerContentLines = []
  const structureLines = []
  const fencedCodeLines = []
  let isInsideComment = false
  let activeFence

  for (const markdownLine of markdownLines) {
    if (activeFence) {
      const closingFence = markdownFenceAtLineStart(markdownLine)
      const isClosingFence = closingFence?.marker === activeFence.marker
        && closingFence.length >= activeFence.length
        && closingFence.details.trim().length === 0

      structureLines.push('')
      readerContentLines.push(isClosingFence ? '' : markdownLine)
      fencedCodeLines.push(!isClosingFence)
      if (isClosingFence) {
        activeFence = undefined
      }
      continue
    }

    let visibleLine = ''
    let lineOffset = 0

    while (lineOffset < markdownLine.length) {
      if (isInsideComment) {
        const commentEnd = markdownLine.indexOf('-->', lineOffset)
        if (commentEnd === -1) {
          visibleLine += ' '.repeat(markdownLine.length - lineOffset)
          lineOffset = markdownLine.length
          continue
        }

        visibleLine += ' '.repeat(commentEnd + 3 - lineOffset)
        lineOffset = commentEnd + 3
        isInsideComment = false
        continue
      }

      const commentStart = markdownLine.indexOf('<!--', lineOffset)
      if (commentStart === -1) {
        visibleLine += markdownLine.slice(lineOffset)
        break
      }

      visibleLine += markdownLine.slice(lineOffset, commentStart)
      visibleLine += ' '.repeat(4)
      lineOffset = commentStart + 4
      isInsideComment = true
    }

    const openingFence = markdownFenceAtLineStart(visibleLine)
    const isOpeningFence = openingFence !== undefined
      && (openingFence.marker === '~' || !openingFence.details.includes('`'))

    if (isOpeningFence) {
      activeFence = {
        length: openingFence.length,
        marker: openingFence.marker,
      }
      structureLines.push('')
      readerContentLines.push('')
      fencedCodeLines.push(false)
      continue
    }

    structureLines.push(visibleLine)
    readerContentLines.push(visibleLine)
    fencedCodeLines.push(false)
  }

  return {
    fencedCodeLines,
    readerContentLines,
    structureLines,
  }
}

if (!packageVersion) {
  console.error('A package version is required.')
  process.exit(1)
}

if (dryRun !== 'true' && dryRun !== 'false') {
  console.error('DRY_RUN must be either true or false.')
  process.exit(1)
}

const changelog = await readFile(changelogPath, 'utf8')
const {
  fencedCodeLines,
  readerContentLines,
  structureLines: changelogLines,
} = changelogLinesOutsideCommentsAndFences(changelog)
// AI modified: content ownership starts at the first real release heading, not an empty Markdown heading.
const firstReleaseHeadingIndex = changelogLines.findIndex(changelogLine => (
  changelogLine.startsWith('## ') && changelogLine.slice(3).trim().length > 0
))
const releaseHeadings = changelogLines.flatMap((changelogLine) => {
  if (!changelogLine.startsWith('## ')) {
    return []
  }

  const releaseHeading = changelogLine.slice(3).trim()
  return releaseHeading ? [releaseHeading] : []
})
const firstReleaseHeading = releaseHeadings[0]

if (!firstReleaseHeading) {
  console.error('CHANGELOG.md must start its release history with a level-two heading.')
  process.exit(1)
}

const escapedVersion = packageVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const matchingVersionHeadings = releaseHeadings.filter(releaseHeading => (
  new RegExp(`^\\[?${escapedVersion}\\]?(?:\\s|$)`).test(releaseHeading)
))
const releaseHeadingMatch = new RegExp(`^${escapedVersion} - (\\d{4})-(\\d{2})-(\\d{2})$`).exec(firstReleaseHeading)
const releaseDateParts = releaseHeadingMatch?.slice(1).map(Number)
const releaseDate = releaseDateParts
  ? new Date(Date.UTC(releaseDateParts[0], releaseDateParts[1] - 1, releaseDateParts[2]))
  : undefined
const hasValidReleaseDate = releaseDateParts !== undefined
  && releaseDate?.getUTCFullYear() === releaseDateParts[0]
  && releaseDate.getUTCMonth() + 1 === releaseDateParts[1]
  && releaseDate.getUTCDate() === releaseDateParts[2]
const currentDate = new Date()
const currentUtcDay = Date.UTC(
  currentDate.getUTCFullYear(),
  currentDate.getUTCMonth(),
  currentDate.getUTCDate(),
)
// AI modified: a release cannot truthfully claim a date that has not occurred yet.
const isFutureReleaseDate = hasValidReleaseDate && releaseDate.getTime() > currentUtcDay
const nextReleaseHeadingOffset = changelogLines
  .slice(firstReleaseHeadingIndex + 1)
  .findIndex(changelogLine => changelogLine.startsWith('## '))
const firstReleaseSectionEnd = nextReleaseHeadingOffset === -1
  ? changelogLines.length
  : firstReleaseHeadingIndex + 1 + nextReleaseHeadingOffset
const firstReleaseSectionLines = readerContentLines
  .slice(firstReleaseHeadingIndex + 1, firstReleaseSectionEnd)
const firstReleaseFencedCodeLines = fencedCodeLines
  .slice(firstReleaseHeadingIndex + 1, firstReleaseSectionEnd)
const {
  readerLines: firstReleaseLinesWithoutInlineCode,
  visibleCodeLineIndexes: firstReleaseVisibleCodeLines,
} = releaseNoteLinesWithoutInlineCodeSpans(
  firstReleaseSectionLines,
  firstReleaseFencedCodeLines,
)
const firstReleaseReaderLines = releaseNoteLinesWithoutInlineLinkDestinations(
  releaseNoteLinesWithoutHiddenHtmlContent(
    firstReleaseLinesWithoutInlineCode,
    firstReleaseFencedCodeLines,
  ),
  firstReleaseFencedCodeLines,
)
const firstReleaseReferenceDefinitionLines = referenceDefinitionLineIndexes(
  firstReleaseSectionLines,
  firstReleaseFencedCodeLines,
)
const firstReleaseEmptyTableLines = emptyTableLineIndexes(
  firstReleaseReaderLines,
  firstReleaseFencedCodeLines,
)

// AI modified: markup-only placeholders cannot substitute for reader-visible release notes.
const hasFirstReleaseSectionContent = firstReleaseReaderLines
  .some((changelogLine, releaseLineIndex) => {
    if (firstReleaseFencedCodeLines[releaseLineIndex]) {
      return changelogLine.replace(/\p{Default_Ignorable_Code_Point}/gu, '').trim().length > 0
    }
    if (
      firstReleaseVisibleCodeLines.has(releaseLineIndex)
      && !firstReleaseReferenceDefinitionLines.has(releaseLineIndex)
    ) {
      return true
    }

    const trimmedLine = changelogLine.trim()
    const dividerCandidate = trimmedLine.replaceAll(/\s/g, '')
    const dividerMarker = dividerCandidate[0]
    const isDivider = dividerCandidate.length >= 3
      && dividerMarker !== undefined
      && '-*_'.includes(dividerMarker)
      && [...dividerCandidate].every(character => character === dividerMarker)
    const isFence = trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')
    let releaseNoteText = trimmedLine
    let previousReleaseNoteText

    do {
      previousReleaseNoteText = releaseNoteText
      // AI modified: Markdown autolinks expose their URL or email as reader-visible text.
      releaseNoteText = releaseNoteText
        .replace(/^(?:>\s*)+/, '')
        .replace(/^(?:[-*+]|\d+[.)])\s*/, '')
        .replace(/^\[[ x]\]\s*/i, '')
        .replace(/!?\[([^\]]*)\]\[[^\]]+\]/g, '$1')
        .replace(/<([a-z][a-z\d+.-]{1,31}:[^<>\s]+)>/gi, '$1')
        .replace(/<([^<>\s@]+@[^<>\s@]+)>/g, '$1')
        .replace(/<[^>]*>/g, '')
        // AI modified: visible entities count as notes; only decoded whitespace and invisible entities disappear.
        .replace(/&#(?:x([\da-f]+)|(\d+));/gi, htmlNumericEntityCharacter)
        .replace(
          /&(?:ApplyFunction|emsp|emsp13|emsp14|ensp|hairsp|InvisibleComma|InvisibleTimes|lrm|MediumSpace|nbsp|NegativeMediumSpace|NegativeThickSpace|NegativeThinSpace|NegativeVeryThinSpace|NewLine|NoBreak|NonBreakingSpace|numsp|puncsp|rlm|shy|Tab|ThickSpace|thinsp|VeryThinSpace|ZeroWidthSpace|zwj|zwnj);/gi,
          '',
        )
        .replace(/\p{Default_Ignorable_Code_Point}/gu, '')
        .trim()
    } while (releaseNoteText !== previousReleaseNoteText)

    return trimmedLine.length > 0
      && !/^#{1,6}(?:\s|$)/.test(trimmedLine)
      && !isDivider
      && !isFence
      && !firstReleaseReferenceDefinitionLines.has(releaseLineIndex)
      && !firstReleaseEmptyTableLines.has(releaseLineIndex)
      && releaseNoteText.length > 0
  })

if (matchingVersionHeadings.length > 1 || (firstReleaseHeading === '[Unreleased]' && matchingVersionHeadings.length > 0)) {
  console.error(`CHANGELOG.md must contain at most one ${packageVersion} section, and it cannot sit below [Unreleased].`)
  process.exit(1)
}

if (isFutureReleaseDate) {
  console.error('The CHANGELOG.md release date cannot be later than the current UTC date.')
  process.exit(1)
}

if ((firstReleaseHeading === '[Unreleased]' || hasValidReleaseDate) && !hasFirstReleaseSectionContent) {
  const releaseSectionLabel = firstReleaseHeading === '[Unreleased]'
    ? firstReleaseHeading
    : packageVersion

  console.error(`The CHANGELOG.md ${releaseSectionLabel} section must include non-empty release notes.`)
  process.exit(1)
}

if (dryRun === 'true' && (firstReleaseHeading === '[Unreleased]' || hasValidReleaseDate)) {
  process.exit(0)
}

if (!hasValidReleaseDate) {
  const requiredHeading = dryRun === 'true'
    ? `## [Unreleased] or ## ${packageVersion} - YYYY-MM-DD`
    : `## ${packageVersion} - YYYY-MM-DD`

  console.error(`The first CHANGELOG.md release section must be ${requiredHeading}.`)
  process.exit(1)
}
