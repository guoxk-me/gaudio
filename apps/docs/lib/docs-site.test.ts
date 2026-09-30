import { describe, expect, it } from 'vitest'
import { resolveDocsSiteUrl } from './docs-site.ts'

describe('documentation production URL', () => {
  it.each([
    ['https://docs.example.test', 'https://docs.example.test/'],
    ['https://docs.example.test/reference/', 'https://docs.example.test/reference/'],
  ])('uses %s as %s', (configuredSiteUrl, expectedSiteUrl) => {
    expect(resolveDocsSiteUrl(configuredSiteUrl)).toBe(expectedSiteUrl)
  })

  it.each([
    '',
    'http://docs.example.test',
    'https://user:password@docs.example.test',
    'https://docs.example.test?preview=true',
    'https://docs.example.test#preview',
    '/documentation',
  ])('rejects unsafe or ambiguous site URL %j', (configuredSiteUrl) => {
    expect(() => resolveDocsSiteUrl(configuredSiteUrl)).toThrow(
      'DOCS_SITE_URL must be an absolute HTTPS URL',
    )
  })
})
