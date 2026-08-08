import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

const linkCheckerScript = resolve(import.meta.dirname, 'scripts/check-built-links.mjs')
const temporaryDirectories: string[] = []

async function documentationFixture(
  linkAttribute: string,
  fixtureDocsBase = '/gaudio/',
  additionalBodyMarkup = '',
): Promise<string> {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'gaudio-built-links-'))
  const productionRoot = 'https://guoxk-me.github.io/gaudio/'

  temporaryDirectories.push(outputRoot)
  await Promise.all([
    writeFile(resolve(outputRoot, 'index.html'), `<!doctype html>
<html lang="en-US">
  <head>
    <link rel="canonical" href="${productionRoot}">
    <link rel="alternate" hreflang="en-US" href="${productionRoot}">
    <link rel="alternate" hreflang="zh-CN" href="${productionRoot}zh/">
    <link rel="alternate" hreflang="x-default" href="${productionRoot}">
  </head>
  <body>
    <main><a ${linkAttribute}>Protocol fixture</a></main>${additionalBodyMarkup}
    <footer class="VPFooter"><a href="${fixtureDocsBase}THIRD_PARTY_LICENSES.txt">Third-party licenses</a></footer>
  </body>
</html>`),
    writeFile(resolve(outputRoot, 'sitemap.xml'), `<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>${productionRoot}</loc><xhtml:link rel="alternate" hreflang="en-US" href="${productionRoot}"/><xhtml:link rel="alternate" hreflang="zh-CN" href="${productionRoot}zh/"/></url>
</urlset>`),
    // AI modified: every deployable fixture carries the same required attribution artifact as production docs.
    writeFile(resolve(outputRoot, 'THIRD_PARTY_LICENSES.txt'), 'fixture dependency licenses\n'),
  ])

  return outputRoot
}

async function documentationPageFixture(documentFooterMarkup: string): Promise<string> {
  const outputRoot = await documentationFixture('href="https://example.com/guide"')
  const productionRoot = 'https://guoxk-me.github.io/gaudio/'

  await mkdir(resolve(outputRoot, 'api'))
  await Promise.all([
    writeFile(resolve(outputRoot, 'api/index.html'), `<!doctype html>
<html lang="en-US">
  <head><link rel="canonical" href="${productionRoot}api/"></head>
  <body>
    <main>API fixture</main>${documentFooterMarkup}
    <footer class="VPFooter"></footer>
  </body>
</html>`),
    writeFile(resolve(outputRoot, 'sitemap.xml'), `<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>${productionRoot}</loc><xhtml:link rel="alternate" hreflang="en-US" href="${productionRoot}"/><xhtml:link rel="alternate" hreflang="zh-CN" href="${productionRoot}zh/"/></url>
<url><loc>${productionRoot}api/</loc></url>
</urlset>`),
  ])

  return outputRoot
}

async function checkDocumentationLink(linkTarget: string) {
  const outputRoot = await documentationFixture(`href="${linkTarget}"`)

  return spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
    encoding: 'utf8',
  })
}

async function checkDocumentationAttribute(linkAttribute: string) {
  const outputRoot = await documentationFixture(linkAttribute)

  return spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
    encoding: 'utf8',
  })
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(temporaryDirectory => (
    rm(temporaryDirectory, { force: true, recursive: true })
  )))
})

describe('built documentation link protocol policy', () => {
  it('accepts one site footer, a document group, and a named information region', async () => {
    const outputRoot = await documentationPageFixture(
      '<footer role="group" class="VPDocFooter"><div role="region" aria-label="Page information" class="edit-info"></div></footer>',
    )
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
    })

    expect(linkCheck.status).toBe(0)
    expect(linkCheck.stderr).toBe('')
  })

  it('rejects a document footer that duplicates the site contentinfo landmark', async () => {
    const outputRoot = await documentationPageFixture(
      '<footer class="VPDocFooter"><div role="region" aria-label="Page information" class="edit-info"></div></footer>',
    )
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
    })

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('expected one contentinfo landmark, found 2')
    expect(linkCheck.stderr).toContain('expected document footer role group')
  })

  it('rejects a document layout without its named footer region', async () => {
    const outputRoot = await documentationPageFixture('')
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
    })

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('api/index.html -> expected 1 document footer, found 0')
  })

  it('rejects document information that is not a named region', async () => {
    const outputRoot = await documentationPageFixture(
      '<footer role="group" class="VPDocFooter"><div class="edit-info">Updated today</div></footer>',
    )
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
    })

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('api/index.html -> expected a named Page information region')
  })

  it('uses the shared leading- and trailing-slash rules for a custom deployment base', async () => {
    const outputRoot = await documentationFixture('href="/review-base/asset.txt"', '/review-base/')

    await writeFile(resolve(outputRoot, 'asset.txt'), 'base-aware fixture\n')
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DOCS_BASE: 'review-base',
      },
    })

    expect(linkCheck.status).toBe(0)
    expect(linkCheck.stderr).toBe('')
  })

  it('rejects a minified chunk whose retained license pointer has no sidecar', async () => {
    const outputRoot = await documentationFixture('href="https://example.com/guide"')

    await writeFile(resolve(outputRoot, 'vendor.js'), '/*! For license information please see vendor.js.LICENSE.txt */')
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
    })

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('missing referenced license sidecar vendor.js.LICENSE.txt')
  })

  it('accepts a retained license pointer with a sibling sidecar', async () => {
    const outputRoot = await documentationFixture('href="https://example.com/guide"')

    await Promise.all([
      writeFile(resolve(outputRoot, 'vendor.js'), '/*! For license information please see vendor.js.LICENSE.txt */'),
      writeFile(resolve(outputRoot, 'vendor.js.LICENSE.txt'), 'fixture license\n'),
    ])
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
    })

    expect(linkCheck.status).toBe(0)
    expect(linkCheck.stderr).toBe('')
  })

  it('does not accept an internal fragment found only in serialized inline-script markup', async () => {
    const outputRoot = await documentationFixture(
      'href="#serialized-only"',
      '/gaudio/',
      '<script>globalThis.__fixture = \'<span id="serialized-only">\'</script>',
    )
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
    })

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('missing fragment in index.html')
  })

  it('rejects a license pointer that escapes the generated artifact', async () => {
    const outputRoot = await documentationFixture('href="https://example.com/guide"')

    await writeFile(resolve(outputRoot, 'vendor.js'), '/*! For license information please see ../outside.LICENSE.txt */')
    const linkCheck = spawnSync(process.execPath, [linkCheckerScript, outputRoot], {
      encoding: 'utf8',
    })

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('missing referenced license sidecar ../outside.LICENSE.txt')
  })

  it.each([
    'javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'blob:https://gaudio.local/unsafe',
    'file:///etc/passwd',
    'ftp://example.com/archive',
  ])('rejects the unsafe or unsupported target %s', async (linkTarget) => {
    const linkCheck = await checkDocumentationLink(linkTarget)

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('unsafe or unsupported URL protocol')
  })

  it.each([
    'java&#x73;cript:alert(1)',
    'javascript&colon;alert(1)',
  ])('rejects the browser-decoded protocol target %s', async (linkTarget) => {
    const linkCheck = await checkDocumentationLink(linkTarget)

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('unsupported HTML character reference')
  })

  it.each([
    'href=javascript:alert(1)',
    'HREF = vbscript:msgbox(1)',
  ])('rejects an unquoted or case-varied unsafe attribute: %s', async (linkAttribute) => {
    const linkCheck = await checkDocumentationAttribute(linkAttribute)

    expect(linkCheck.status).toBe(1)
    expect(linkCheck.stderr).toContain('unsafe or unsupported URL protocol')
  })

  it.each([
    'mailto:maintainer@example.com',
    'tel:+8610000000000',
    'https://example.com/guide',
    'http://example.com/guide',
  ])('allows the supported external target %s', async (linkTarget) => {
    const linkCheck = await checkDocumentationLink(linkTarget)

    expect(linkCheck.status).toBe(0)
    expect(linkCheck.stderr).toBe('')
  })
})
