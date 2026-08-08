import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'
import process from 'node:process'
import { docsBase, docsRoute } from '../lib/docs-base.ts'

const docsRoot = resolve(import.meta.dirname, '..')
// AI modified: isolated fixture directories exercise the same release link gate without rebuilding documentation.
const outputRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(docsRoot, '.vitepress/dist')
const docsProductionUrl = 'https://guoxk-me.github.io/gaudio/'
const siteOrigin = 'https://gaudio.local'
const allowedDocumentationProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])

async function generatedFiles(directory = outputRoot) {
  const directoryEntries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(directoryEntries.map(async (directoryEntry) => {
    const entryPath = resolve(directory, directoryEntry.name)

    return directoryEntry.isDirectory()
      ? generatedFiles(entryPath)
      : [relative(outputRoot, entryPath)]
  }))

  return nestedFiles.flat()
}

function pageUrl(pageFile) {
  if (pageFile === 'index.html') {
    return new URL(docsBase, siteOrigin)
  }

  if (pageFile.endsWith('/index.html')) {
    return new URL(docsRoute(pageFile.slice(0, -'index.html'.length)), siteOrigin)
  }

  return new URL(docsRoute(pageFile.slice(0, -'.html'.length)), siteOrigin)
}

function productionUrl(pageFile) {
  if (pageFile === 'index.html') {
    return docsProductionUrl
  }

  if (pageFile.endsWith('/index.html')) {
    return new URL(pageFile.slice(0, -'index.html'.length), docsProductionUrl).href
  }

  return new URL(pageFile.slice(0, -'.html'.length), docsProductionUrl).href
}

function isTranslatedPage(pageFile) {
  const englishPageFile = pageFile.startsWith('zh/')
    ? pageFile.slice('zh/'.length)
    : pageFile

  return englishPageFile === 'index.html'
    || englishPageFile === 'examples/index.html'
    || englishPageFile.startsWith('guide/')
}

function isChineseApiMirror(pageFile) {
  return pageFile.startsWith('zh/api/')
}

function headLinks(pageHtml, relationship) {
  const matchingLinks = []

  for (const linkMatch of pageHtml.matchAll(/<link\b([^>]*)>/g)) {
    const linkAttributes = {}

    for (const attributeMatch of linkMatch[1].matchAll(/\b([\w:-]+)=["']([^"']*)["']/g)) {
      linkAttributes[attributeMatch[1]] = attributeMatch[2]
    }

    if (linkAttributes.rel === relationship) {
      matchingLinks.push(linkAttributes)
    }
  }

  return matchingLinks
}

function tagsWithClass(pageMarkup, tagName, className) {
  const openingTagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi')

  return [...pageMarkup.matchAll(openingTagPattern)]
    .map(tagMatch => tagMatch[0])
    .filter((openingTag) => {
      const classNames = openingTag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1].split(/\s+/) ?? []

      return classNames.includes(className)
    })
}

function markupRole(openingTag) {
  return openingTag.match(/\brole\s*=\s*["']([^"']*)["']/i)?.[1].toLowerCase()
}

function markupAriaLabel(openingTag) {
  return openingTag.match(/\baria-label\s*=\s*["']([^"']*)["']/i)?.[1]
}

function candidateFiles(linkedUrl) {
  const docsBaseWithoutSlash = docsBase.slice(0, -1)

  if (linkedUrl.pathname === docsBaseWithoutSlash) {
    return ['index.html']
  }

  if (!linkedUrl.pathname.startsWith(docsBase)) {
    return []
  }

  let linkedPath

  try {
    linkedPath = decodeURIComponent(linkedUrl.pathname.slice(docsBase.length))
  }
  catch {
    return []
  }

  if (linkedPath === '') {
    return ['index.html']
  }

  if (linkedPath.endsWith('/')) {
    return [`${linkedPath}index.html`]
  }

  const linkedFiles = [linkedPath]

  if (extname(linkedPath) === '') {
    linkedFiles.push(`${linkedPath}.html`, `${linkedPath}/index.html`)
  }

  return linkedFiles
}

function documentMarkup(pageHtml) {
  const lowercaseHtml = pageHtml.toLowerCase()
  const markupSegments = []
  let sourceOffset = 0

  while (sourceOffset < pageHtml.length) {
    const scriptStart = lowercaseHtml.indexOf('<script', sourceOffset)

    if (scriptStart < 0) {
      markupSegments.push(pageHtml.slice(sourceOffset))
      break
    }

    const scriptTagEnd = lowercaseHtml.indexOf('>', scriptStart)

    if (scriptTagEnd < 0) {
      markupSegments.push(pageHtml.slice(sourceOffset))
      break
    }

    // AI modified: retain real script src attributes while excluding serialized HTML strings inside inline scripts.
    markupSegments.push(pageHtml.slice(sourceOffset, scriptTagEnd + 1))
    const scriptEnd = lowercaseHtml.indexOf('</script>', scriptTagEnd + 1)

    if (scriptEnd < 0) {
      break
    }

    sourceOffset = scriptEnd + '</script>'.length
  }

  return markupSegments.join('')
}

// AI modified: validate generated locale links and assets that Markdown-only checks cannot observe.
const outputFiles = await generatedFiles()
const outputFileSet = new Set(outputFiles)
const pageFiles = outputFiles.filter(outputFile => outputFile.endsWith('.html'))
const pageHtmlByFile = new Map(await Promise.all(pageFiles.map(async pageFile => (
  [pageFile, await readFile(resolve(outputRoot, pageFile), 'utf8')]
))))
// AI modified: cache rendered heading targets so cross-page and same-page fragments are verified together.
const pageIdsByFile = new Map([...pageHtmlByFile].map(([pageFile, pageHtml]) => (
  [pageFile, new Set([...documentMarkup(pageHtml).matchAll(/\bid=["']([^"'<>]+)["']/g)].map(idMatch => idMatch[1]))]
)))
const brokenReferences = []
const semanticFailures = []
let checkedFragmentCount = 0
let checkedLicensePointerCount = 0
let checkedReferenceCount = 0

// AI modified: the deployed artifact must expose its complete generated third-party attribution record.
const thirdPartyLicensesFile = 'THIRD_PARTY_LICENSES.txt'

if (!outputFileSet.has(thirdPartyLicensesFile)) {
  semanticFailures.push(`${thirdPartyLicensesFile} -> generated attribution record is missing`)
}
else if ((await readFile(resolve(outputRoot, thirdPartyLicensesFile), 'utf8')).trim() === '') {
  semanticFailures.push(`${thirdPartyLicensesFile} -> generated attribution record is empty`)
}

// AI modified: minified vendor banners resolve relative to their chunk, so every retained pointer needs a sibling sidecar.
for (const javascriptFile of outputFiles.filter(outputFile => outputFile.endsWith('.js'))) {
  const javascriptSource = await readFile(resolve(outputRoot, javascriptFile), 'utf8')

  for (const licensePointerMatch of javascriptSource.matchAll(/For license information please see ([\w./-]+) \*\//g)) {
    checkedLicensePointerCount += 1
    const licenseSidecar = normalize(join(dirname(javascriptFile), licensePointerMatch[1].trim()))

    if (licenseSidecar.startsWith('..') || !outputFileSet.has(licenseSidecar)) {
      semanticFailures.push(`${javascriptFile} -> missing referenced license sidecar ${licenseSidecar}`)
      continue
    }

    if (licensePointerMatch[1].trim() === 'dash.all.min.js.LICENSE.txt') {
      const [generatedSidecar, sourceSidecar] = await Promise.all([
        readFile(resolve(outputRoot, licenseSidecar)),
        readFile(resolve(docsRoot, 'node_modules/dashjs/dist/modern/esm/dash.all.min.js.LICENSE.txt')),
      ])

      // AI modified: basename collisions exist in dashjs, so the published notice must equal the imported modern ESM sidecar.
      if (!generatedSidecar.equals(sourceSidecar)) {
        semanticFailures.push(`${javascriptFile} -> dash license sidecar differs from the imported ESM source`)
      }
    }
  }
}

for (const pageFile of pageFiles) {
  const pageHtml = pageHtmlByFile.get(pageFile)
  const pageMarkup = documentMarkup(pageHtml)
  const pageAddress = pageUrl(pageFile)
  const canonicalLinks = headLinks(pageMarkup, 'canonical')
  const alternateLinks = headLinks(pageMarkup, 'alternate')
  const isHomePage = pageFile === 'index.html' || pageFile === 'zh/index.html'

  if (pageFile !== '404.html') {
    const siteFooters = tagsWithClass(pageMarkup, 'footer', 'VPFooter')
    const documentFooters = tagsWithClass(pageMarkup, 'footer', 'VPDocFooter')
    const documentInformationBlocks = tagsWithClass(pageMarkup, 'div', 'edit-info')
    const themeFooters = [...siteFooters, ...documentFooters]
    const implicitThemeContentinfoCount = themeFooters.filter(footerTag => markupRole(footerTag) === undefined).length
    const explicitContentinfoCount = [...pageMarkup.matchAll(/\brole\s*=\s*["']contentinfo["']/gi)].length
    const contentinfoCount = implicitThemeContentinfoCount + explicitContentinfoCount

    // AI modified: the site footer exclusively owns contentinfo in every statically rendered page.
    if (siteFooters.length !== 1 || ![undefined, 'contentinfo'].includes(markupRole(siteFooters[0] ?? ''))) {
      semanticFailures.push(`${pageFile} -> expected one site-wide contentinfo footer`)
    }

    if (contentinfoCount !== 1) {
      semanticFailures.push(`${pageFile} -> expected one contentinfo landmark, found ${contentinfoCount}`)
    }

    const expectedDocumentFooterCount = isHomePage ? 0 : 1

    // AI modified: document layouts retain a permitted footer group while home layouts must not grow one.
    if (documentFooters.length !== expectedDocumentFooterCount) {
      semanticFailures.push(`${pageFile} -> expected ${expectedDocumentFooterCount} document footer, found ${documentFooters.length}`)
    }

    if (documentFooters.length === 1 && markupRole(documentFooters[0]) !== 'group') {
      semanticFailures.push(`${pageFile} -> expected document footer role group`)
    }

    const maximumDocumentInformationBlockCount = isHomePage ? 0 : 1

    if (documentInformationBlocks.length > maximumDocumentInformationBlockCount) {
      semanticFailures.push(`${pageFile} -> expected at most ${maximumDocumentInformationBlockCount} document information block, found ${documentInformationBlocks.length}`)
    }

    if (documentInformationBlocks.length === 1) {
      const expectedDocumentInformationLabel = pageFile.startsWith('zh/') ? '页面信息' : 'Page information'
      const documentInformationBlock = documentInformationBlocks[0]

      if (markupRole(documentInformationBlock) !== 'region' || markupAriaLabel(documentInformationBlock) !== expectedDocumentInformationLabel) {
        semanticFailures.push(`${pageFile} -> expected a named ${expectedDocumentInformationLabel} region`)
      }
    }
  }

  if (isHomePage) {
    // AI modified: home pages must expose one static main landmark before client hydration.
    const mainLandmarkCount = [...pageMarkup.matchAll(/<main\b|role=["']main["']/g)].length

    if (mainLandmarkCount !== 1) {
      semanticFailures.push(`${pageFile} -> expected one main landmark, found ${mainLandmarkCount}`)
    }

    // AI modified: both locale home pages must make the generated attribution artifact discoverable.
    if (!pageMarkup.includes(`href="${docsRoute('THIRD_PARTY_LICENSES.txt')}"`)) {
      semanticFailures.push(`${pageFile} -> expected a base-aware third-party licenses footer link`)
    }
  }

  if (pageFile === '404.html') {
    if (canonicalLinks.length > 0) {
      semanticFailures.push(`${pageFile} -> expected no canonical link`)
    }

    if (alternateLinks.length > 0) {
      semanticFailures.push(`${pageFile} -> expected no language alternates`)
    }

    // AI modified: VitePress leaves #app empty for 404 builds, so guard the hydration-safe no-script fallback.
    const fallbackMatch = pageMarkup.match(/<div id=["']app["']><\/div>\s*(<noscript>[\s\S]*?<\/noscript>)/)
    const fallbackHtml = fallbackMatch?.[1] ?? ''
    const fallbackMainCount = [...fallbackHtml.matchAll(/<main\b/g)].length

    if (!fallbackMatch) {
      semanticFailures.push(`${pageFile} -> expected a no-script fallback outside the empty application root`)
    }

    if (fallbackMainCount !== 1) {
      semanticFailures.push(`${pageFile} -> expected one no-script main landmark, found ${fallbackMainCount}`)
    }

    if (!fallbackHtml.includes('lang="zh-CN"')) {
      semanticFailures.push(`${pageFile} -> expected a Chinese language-of-parts marker`)
    }

    if (!fallbackHtml.includes(`href="${docsBase}"`) || !fallbackHtml.includes(`href="${docsBase}zh/"`)) {
      semanticFailures.push(`${pageFile} -> expected base-aware English and Chinese home links`)
    }
  }
  else {
    // AI modified: untranslated Chinese declaration mirrors must consolidate into the English API canonical.
    const canonicalPageFile = isChineseApiMirror(pageFile)
      ? pageFile.slice('zh/'.length)
      : pageFile
    const expectedCanonicalUrl = productionUrl(canonicalPageFile)

    if (canonicalLinks.length !== 1 || canonicalLinks[0].href !== expectedCanonicalUrl) {
      semanticFailures.push(`${pageFile} -> expected canonical ${expectedCanonicalUrl}`)
    }

    if (isTranslatedPage(pageFile)) {
      const englishPageFile = pageFile.startsWith('zh/')
        ? pageFile.slice('zh/'.length)
        : pageFile
      const englishUrl = productionUrl(englishPageFile)
      const expectedAlternates = new Map([
        ['en-US', englishUrl],
        ['zh-CN', productionUrl(`zh/${englishPageFile}`)],
        ['x-default', englishUrl],
      ])

      if (alternateLinks.length !== expectedAlternates.size) {
        semanticFailures.push(`${pageFile} -> expected ${expectedAlternates.size} language alternates`)
      }

      for (const alternateLink of alternateLinks) {
        if (expectedAlternates.get(alternateLink.hreflang) !== alternateLink.href) {
          semanticFailures.push(`${pageFile} -> unexpected ${alternateLink.hreflang} alternate ${alternateLink.href}`)
        }
      }
    }
    else if (alternateLinks.length > 0) {
      semanticFailures.push(`${pageFile} -> non-translated page must not declare language alternates`)
    }
  }

  // AI modified: inspect every HTML attribute form so unsafe protocols cannot hide behind quoting or casing.
  for (const attributeMatch of pageMarkup.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
    const rawLinkedTarget = attributeMatch[1] ?? attributeMatch[2] ?? attributeMatch[3]

    if (rawLinkedTarget === '') {
      continue
    }

    if (/&(?!amp;)/i.test(rawLinkedTarget)) {
      // AI modified: reject encoded characters the lightweight scanner cannot safely decode like a browser.
      semanticFailures.push(`${pageFile} -> unsupported HTML character reference in ${rawLinkedTarget}`)
      continue
    }

    const linkedTarget = rawLinkedTarget.replaceAll('&amp;', '&')
    const linkedUrl = new URL(linkedTarget, pageAddress)

    // AI modified: generated pages reject executable and unknown URL schemes while retaining normal contact links.
    if (!allowedDocumentationProtocols.has(linkedUrl.protocol)) {
      semanticFailures.push(`${pageFile} -> unsafe or unsupported URL protocol ${linkedUrl.protocol} in ${linkedTarget}`)
      continue
    }

    if (linkedUrl.protocol === 'mailto:' || linkedUrl.protocol === 'tel:' || linkedUrl.origin !== siteOrigin) {
      continue
    }

    checkedReferenceCount += 1
    const linkedFileCandidates = candidateFiles(linkedUrl)
    const linkedFile = linkedFileCandidates.find(linkedFileCandidate => outputFileSet.has(linkedFileCandidate))

    if (!linkedFile) {
      brokenReferences.push(`${pageFile} -> ${linkedTarget}`)
      continue
    }

    if (linkedUrl.hash.length <= 1 || !linkedFile.endsWith('.html')) {
      continue
    }

    checkedFragmentCount += 1

    let fragmentId

    try {
      fragmentId = decodeURIComponent(linkedUrl.hash.slice(1))
    }
    catch {
      brokenReferences.push(`${pageFile} -> ${linkedTarget} (invalid fragment encoding)`)
      continue
    }

    if (!pageIdsByFile.get(linkedFile)?.has(fragmentId)) {
      brokenReferences.push(`${pageFile} -> ${linkedTarget} (missing fragment in ${linkedFile})`)
    }
  }
}

const sitemapFile = 'sitemap.xml'

if (!outputFileSet.has(sitemapFile)) {
  semanticFailures.push(`${sitemapFile} -> production sitemap was not generated`)
}
else {
  const sitemapSource = await readFile(resolve(outputRoot, sitemapFile), 'utf8')
  const sitemapEntries = [...sitemapSource.matchAll(/<url>(.*?)<\/url>/g)].map(entryMatch => entryMatch[1])
  const sitemapUrls = new Set(sitemapEntries.flatMap((sitemapEntry) => {
    const locationMatch = sitemapEntry.match(/<loc>([^<]+)<\/loc>/)

    return locationMatch ? [locationMatch[1]] : []
  }))

  for (const pageFile of pageFiles) {
    const pageProductionUrl = productionUrl(pageFile)
    const shouldAppearInSitemap = pageFile !== '404.html' && !isChineseApiMirror(pageFile)

    if (shouldAppearInSitemap && !sitemapUrls.has(pageProductionUrl)) {
      semanticFailures.push(`${sitemapFile} -> missing ${pageProductionUrl}`)
    }

    if (!shouldAppearInSitemap && sitemapUrls.has(pageProductionUrl)) {
      semanticFailures.push(`${sitemapFile} -> non-canonical page must be excluded: ${pageProductionUrl}`)
    }
  }

  for (const sitemapEntry of sitemapEntries) {
    const locationMatch = sitemapEntry.match(/<loc>([^<]+)<\/loc>/)

    if (!locationMatch) {
      semanticFailures.push(`${sitemapFile} -> entry is missing a location`)
      continue
    }

    const relativeProductionUrl = locationMatch[1].startsWith(docsProductionUrl)
      ? locationMatch[1].slice(docsProductionUrl.length)
      : locationMatch[1]
    const pageFile = relativeProductionUrl === ''
      ? 'index.html'
      : relativeProductionUrl.endsWith('/')
        ? `${relativeProductionUrl}index.html`
        : `${relativeProductionUrl}.html`
    const alternateCount = [...sitemapEntry.matchAll(/<xhtml:link\b/g)].length
    const expectedAlternateCount = isTranslatedPage(pageFile) ? 2 : 0

    if (alternateCount !== expectedAlternateCount) {
      semanticFailures.push(`${sitemapFile} -> ${locationMatch[1]} expected ${expectedAlternateCount} language alternates, found ${alternateCount}`)
    }
  }
}

if (brokenReferences.length > 0) {
  throw new Error(`Generated documentation contains broken internal references:\n${brokenReferences.join('\n')}`)
}

if (semanticFailures.length > 0) {
  throw new Error(`Generated documentation contains semantic failures:\n${semanticFailures.join('\n')}`)
}

console.log(`Verified ${checkedReferenceCount} internal references, ${checkedFragmentCount} fragments, and ${checkedLicensePointerCount} license pointers across ${pageFiles.length} generated pages.`)
