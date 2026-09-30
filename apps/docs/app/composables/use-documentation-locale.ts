import { computed } from 'vue'

export function useDocumentationLocale() {
  const route = useRoute()
  const isChinese = computed(() => route.path === '/zh' || route.path.startsWith('/zh/'))
  const language = computed(() => isChinese.value ? 'zh-CN' : 'en-US')
  const alternatePath = computed(() => {
    // AI modified: Studio keeps its own route when switching languages.
    if (isChinese.value) {
      const englishPath = route.path.slice('/zh'.length)
      return englishPath || '/'
    }

    return route.path === '/' ? '/zh' : `/zh${route.path}`
  })

  return { alternatePath, isChinese, language }
}
