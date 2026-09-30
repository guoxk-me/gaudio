import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

interface DocumentationHeadOptions {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  canonicalPath?: MaybeRefOrGetter<string | undefined>
}

function productionUrl(path: string, productionOrigin: string): string {
  return new URL(path.replace(/^\/+/, ''), productionOrigin).href
}

export function useDocumentationHead(options: DocumentationHeadOptions): void {
  const route = useRoute()
  const runtimeConfig = useRuntimeConfig()
  const { language } = useDocumentationLocale()
  const canonicalPath = computed(() => toValue(options.canonicalPath) ?? route.path)
  const isApiPage = computed(() => canonicalPath.value.startsWith('/api'))
  const englishPath = computed(() => route.path === '/zh'
    ? '/'
    : route.path.startsWith('/zh/') ? route.path.slice('/zh'.length) : route.path)
  const chinesePath = computed(() => {
    if (route.path === '/player-studio') {
      return '/zh/examples'
    }

    if (route.path === '/zh' || route.path.startsWith('/zh/')) {
      return route.path
    }

    return route.path === '/' ? '/zh' : `/zh${route.path}`
  })

  useSeoMeta({
    title: () => toValue(options.title),
    description: () => toValue(options.description),
    ogTitle: () => toValue(options.title),
    ogDescription: () => toValue(options.description),
    ogType: 'website',
  })

  useHead(() => ({
    htmlAttrs: { lang: language.value },
    link: [
      { rel: 'canonical' as const, href: productionUrl(canonicalPath.value, runtimeConfig.public.docsSiteUrl) },
      ...(!isApiPage.value
        ? [
            { rel: 'alternate' as const, hreflang: 'en-US', href: productionUrl(englishPath.value, runtimeConfig.public.docsSiteUrl) },
            { rel: 'alternate' as const, hreflang: 'zh-CN', href: productionUrl(chinesePath.value, runtimeConfig.public.docsSiteUrl) },
            { rel: 'alternate' as const, hreflang: 'x-default', href: productionUrl(englishPath.value, runtimeConfig.public.docsSiteUrl) },
          ]
        : []),
    ],
  }))
}
