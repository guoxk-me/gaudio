import { describe, expect, it } from 'vitest'
import { resolveDocsBase } from './docs-base.ts'

describe('resolveDocsBase', () => {
  it.each([
    ['/', '/'],
    ['gaudio', '/gaudio/'],
    ['/gaudio', '/gaudio/'],
    ['gaudio/', '/gaudio/'],
    ['/nested/docs/', '/nested/docs/'],
    ['nested/docs', '/nested/docs/'],
    ['/docs/%E4%B8%AD/', '/docs/%E4%B8%AD/'],
    ['/rates/100%25/', '/rates/100%25/'],
  ])('uses %j as the deployment base %j', (configuredBase, expectedBase) => {
    expect(resolveDocsBase(configuredBase)).toBe(expectedBase)
  })

  // AI modified: guard every URL-confusion and traversal form at the single shared base boundary.
  it.each([
    '',
    ' ',
    '\t',
    '/gaudio/\n',
    '/gaudio/%09/',
    'https://example.com/docs/',
    'HTTP://example.com/docs/',
    'file:/tmp/docs/',
    'mailto:docs@example.com',
    '//example.com/docs/',
    '//user:password@example.com/docs/',
    '/gaudio//guide/',
    '/gaudio?language=en',
    '/gaudio/#guide',
    '\\server\\docs',
    '/gaudio\\guide/',
    '/gaudio/%5cguide/',
    '/gaudio/%255Cguide/',
    '.',
    '..',
    '/./',
    '/../',
    '/guide/./page/',
    '/guide/../page/',
    '/guide/%2e/page/',
    '/guide/%2E%2E/page/',
    '/guide/.%2e/page/',
    '/guide/%252e%252e/page/',
    '/guide/%25%32%65%25%32%45/page/',
    '/guide/%2fprivate/',
    '/guide/%2Fprivate/',
    '/guide/%252fprivate/',
    '/guide/%25%32%46private/',
    '/docs/%3Fquery/',
    '/docs/%23fragment/',
    '/docs/%253Fquery/',
    '/docs/%2523fragment/',
    'https%3Aexample.com/docs/',
    '%68%74%74%70%73%3Aexample.com/docs/',
    '/guide/%/',
    '/guide/%2/',
    '/guide/%GG/',
    '/guide/%C0%AF/',
  ])('rejects unsafe deployment base %j', (configuredBase) => {
    expect(() => resolveDocsBase(configuredBase)).toThrow(TypeError)
    expect(() => resolveDocsBase(configuredBase)).toThrow('DOCS_BASE must be a non-empty URL pathname')
  })
})
