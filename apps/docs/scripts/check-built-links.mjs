import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, relative, resolve } from 'node:path'
import process from 'node:process'
import { docsBase, docsRoute } from '../lib/docs-base.ts'
import { docsSiteUrl } from '../lib/docs-site.ts'

const docsRoot = resolve(import.meta.dirname, '..')
// AI modified: isolated fixture directories exercise the same release link gate without rebuilding documentation.
const outputRoot = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(docsRoot, '.output/public')
const docsProductionUrl = docsSiteUrl
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
    return new URL(pageFile.slice(0, -'/index.html'.length), docsProductionUrl).href
  }

  return new URL(pageFile.slice(0, -'.html'.length), docsProductionUrl).href
}

function isTranslatedPage(pageFile) {
  const englishPageFile = pageFile.startsWith('zh/')
    ? pageFile.slice('zh/'.length)
    : pageFile

  return englishPageFile === 'index.html'
    || englishPageFile === 'docs/index.html'
    || englishPageFile === 'examples/index.html'
    || englishPageFile === 'player-studio/index.html'
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
    // AI modified: clean Nuxt documents take precedence over compatibility redirect artifacts.
    linkedFiles.push(`${linkedPath}/index.html`, `${linkedPath}.html`)
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
  const refreshTarget = pageMarkup.match(/<meta\s+http-equiv=["']refresh["']\s+content=["'][^;]*;\s*url=([^"']+)["']/i)?.[1]
  const isClientFallback = pageFile === '200.html' || pageFile === '404.html'

  if (refreshTarget) {
    const refreshUrl = new URL(refreshTarget, pageAddress)
    const refreshCandidates = candidateFiles(new URL(`${refreshUrl.pathname}${refreshUrl.search}${refreshUrl.hash}`, siteOrigin))
    const isDirectoryIndex = pageFile.endsWith('/index.html')
    const comparablePagePath = pageAddress.pathname.replace(/\/$/, '')
    const comparableRefreshPath = refreshUrl.pathname.replace(/\/$/, '')

    // AI modified: compatibility artifacts must stay inside the subpath and land on a generated canonical document.
    if (isDirectoryIndex && comparableRefreshPath === comparablePagePath) {
      semanticFailures.push(`${pageFile} -> canonical page redirects to itself: ${refreshTarget}`)
    }
    else if (refreshUrl.origin !== siteOrigin || !refreshUrl.pathname.startsWith(docsBase)) {
      semanticFailures.push(`${pageFile} -> redirect escaped deployment base: ${refreshTarget}`)
    }
    else if (!refreshCandidates.some(refreshCandidate => outputFileSet.has(refreshCandidate))) {
      brokenReferences.push(`${pageFile} -> ${refreshTarget}`)
    }

    continue
  }

  if (!isClientFallback) {
    const siteFooters = tagsWithClass(pageMarkup, 'footer', 'site-footer')
    const footerTags = [...pageMarkup.matchAll(/<footer\b[^>]*>/gi)].map(footerMatch => footerMatch[0])
    const implicitThemeContentinfoCount = footerTags.filter(footerTag => markupRole(footerTag) === undefined).length
    const explicitContentinfoCount = [...pageMarkup.matchAll(/\brole\s*=\s*["']contentinfo["']/gi)].length
    const contentinfoCount = implicitThemeContentinfoCount + explicitContentinfoCount

    // AI modified: Nuxt's shared site footer exclusively owns contentinfo on every rendered page.
    if (siteFooters.length !== 1 || ![undefined, 'contentinfo'].includes(markupRole(siteFooters[0] ?? ''))) {
      semanticFailures.push(`${pageFile} -> expected one site-wide contentinfo footer`)
    }

    if (contentinfoCount !== 1) {
      semanticFailures.push(`${pageFile} -> expected one contentinfo landmark, found ${contentinfoCount}`)
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

  if (isClientFallback) {
    if (canonicalLinks.length > 0) {
      semanticFailures.push(`${pageFile} -> expected no canonical link`)
    }

    if (alternateLinks.length > 0) {
      semanticFailures.push(`${pageFile} -> expected no language alternates`)
    }

    // AI modified: Nuxt generates an empty client shell whose router renders the localized error document.
    if (!/<div\s+id=["']__nuxt["']><\/div>/.test(pageMarkup)) {
      semanticFailures.push(`${pageFile} -> expected the Nuxt client fallback shell`)
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
      const chinesePageFile = englishPageFile === 'player-studio/index.html'
        ? 'zh/examples/index.html'
        : `zh/${englishPageFile}`
      const expectedAlternates = new Map([
        ['en-US', englishUrl],
        ['zh-CN', productionUrl(chinesePageFile)],
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
  const sitemapEntries = [...sitemapSource.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(entryMatch => entryMatch[1])
  const sitemapUrls = new Set(sitemapEntries.flatMap((sitemapEntry) => {
    const locationMatch = sitemapEntry.match(/<loc>([^<]+)<\/loc>/)

    return locationMatch ? [locationMatch[1].replace(/\/$/, '')] : []
  }))

  for (const pageFile of pageFiles) {
    const pageProductionUrl = productionUrl(pageFile)
    const pageMarkup = documentMarkup(pageHtmlByFile.get(pageFile))
    const isRefreshArtifact = /<meta\s+http-equiv=["']refresh["']/i.test(pageMarkup)
    const isClientFallback = pageFile === '200.html' || pageFile === '404.html'
    const shouldAppearInSitemap = !isRefreshArtifact && !isClientFallback && !isChineseApiMirror(pageFile)

    const comparableProductionUrl = pageProductionUrl.replace(/\/$/, '')

    if (shouldAppearInSitemap && !sitemapUrls.has(comparableProductionUrl)) {
      semanticFailures.push(`${sitemapFile} -> missing ${pageProductionUrl}`)
    }
  }

  for (const sitemapUrl of sitemapUrls) {
    if (sitemapUrl.includes('/zh/api/') || /\/(?:en|docs\/(?:guide|api))(?:\/|$)/.test(new URL(sitemapUrl).pathname)) {
      semanticFailures.push(`${sitemapFile} -> non-canonical page must be excluded: ${sitemapUrl}`)
    }
  }

  for (const sitemapEntry of sitemapEntries) {
    const locationMatch = sitemapEntry.match(/<loc>([^<]+)<\/loc>/)

    if (!locationMatch) {
      semanticFailures.push(`${sitemapFile} -> entry is missing a location`)
      continue
    }

    const docsProductionRoot = docsProductionUrl.replace(/\/$/, '')
    const relativeProductionUrl = locationMatch[1] === docsProductionRoot
      ? ''
      : locationMatch[1].startsWith(`${docsProductionRoot}/`)
        ? locationMatch[1].slice(docsProductionRoot.length + 1)
        : locationMatch[1]
    const pageFile = relativeProductionUrl === ''
      ? 'index.html'
      : `${relativeProductionUrl.replace(/\/$/, '')}/index.html`
    const alternateCount = [...sitemapEntry.matchAll(/<xhtml:link\b/g)].length
    const expectedAlternateCount = isTranslatedPage(pageFile) ? 3 : 0

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
