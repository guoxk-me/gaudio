<script setup lang="ts">
import type { DocumentationNavigationGroup, DocumentationNavigationLink, DocumentationTocLink } from '../types/documentation'
import { guideNavigation, guideSurrounding } from '../config/documentation-navigation'

const route = useRoute()
const { isChinese } = useDocumentationLocale()
const isChineseApiMirror = computed(() => route.path.startsWith('/zh/api'))
const contentPath = computed(() => isChineseApiMirror.value ? route.path.slice('/zh'.length) : route.path)
const contentLookupPath = computed(() => contentPath.value.startsWith('/api/')
  ? contentPath.value.toLocaleLowerCase()
  : contentPath.value)

const { data: page } = await useAsyncData(`documentation:${route.path}`, () => (
  // AI modified: Content indexes slugs in lowercase while published TypeDoc symbol routes retain their casing.
  queryCollection('docs').path(contentLookupPath.value).first()
))

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: isChinese.value ? '页面未找到' : 'Page not found' })
}

const isGuide = computed(() => contentPath.value.startsWith('/guide/'))
const apiDocuments = isGuide.value
  ? ref<{ id: string, title: string }[]>([])
  : await useAsyncData('api-navigation', () => (
      queryCollection('docs')
        .where('path', 'LIKE', '/api/%')
        .order('path', 'ASC')
        .select('id', 'title')
        .all()
    )).then(({ data }) => data)

const navigation = computed<DocumentationNavigationGroup[]>(() => {
  if (isGuide.value) {
    return guideNavigation(isChinese.value)
  }

  const localePrefix = isChinese.value ? '/zh' : ''
  const apiLinks: DocumentationNavigationLink[] = (apiDocuments.value ?? []).map((document) => {
    const publishedPath = document.id
      .replace(/^docs/, '')
      .replace(/\/index\.md$/, '')
      .replace(/\.md$/, '')

    return {
      label: document.title || publishedPath.split('/').at(-1) || 'API overview',
      path: `${localePrefix}${publishedPath}`,
    }
  })

  return [{ label: 'API', links: apiLinks }]
})
const surrounding = computed(() => isGuide.value
  ? guideSurrounding(route.path, isChinese.value)
  : { previous: undefined, next: undefined })
const tocLinks = computed<DocumentationTocLink[]>(() => page.value?.body.toc?.links ?? [])
const canonicalPath = computed(() => isChineseApiMirror.value ? contentPath.value : route.path)

useDocumentationHead({
  title: () => `${page.value?.title ?? 'Documentation'} · GAudio`,
  description: () => page.value?.description ?? (isChinese.value ? 'GAudio 文档' : 'GAudio documentation'),
  canonicalPath,
})
</script>

<template>
  <DocumentationLayout
    v-if="page"
    :navigation="navigation"
    :toc-links="tocLinks"
    :previous="surrounding.previous"
    :next="surrounding.next"
    :is-chinese="isChinese"
  >
    <div v-if="isChineseApiMirror" class="docs-notice" role="note">
      <strong>API 声明以英文为准。</strong>
      当前页面保留中文路由兼容性；符号名称、签名和规范说明来自同一份生成结果。
    </div>
    <!-- AI modified: mirrored API declarations retain their English language boundary on Chinese pages. -->
    <div :lang="isChineseApiMirror ? 'en-US' : undefined">
      <ContentRenderer class="prose" :value="page" />
    </div>
  </DocumentationLayout>
</template>
