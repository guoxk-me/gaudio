<script setup lang="ts">
import { Search, X } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'

interface SearchDisplayResult {
  description?: string
  path: string
  section: string
  title: string
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const { isChinese } = useDocumentationLocale()
const query = shallowRef('')
const searchResults = ref<SearchDisplayResult[]>([])
const isSearching = shallowRef(false)
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
const { search } = useSearchCollection('docs', { immediate: false, minHeading: 'h1', maxHeading: 'h3' })
const publishedApiRouteByLookupPath = new Map<string, string>(
  Object.keys(import.meta.glob('../../api/**/*.md')).map((modulePath) => {
    const routeSuffix = modulePath
      .slice('../../api'.length, -'.md'.length)
      .replace(/\/index$/, '')
    const publishedRoute = `/api${routeSuffix}`

    return [publishedRoute.toLocaleLowerCase(), publishedRoute]
  }),
)
let searchRequestId = 0
let previouslyFocusedElement: HTMLElement | null = null
const quickLinks = computed(() => [
  { title: isChinese.value ? '快速开始' : 'Getting Started', path: isChinese.value ? '/zh/guide/getting-started' : '/guide/getting-started', section: isChinese.value ? '指南' : 'Guide', description: isChinese.value ? '安装、浏览器能力与第一个播放器。' : 'Install, browser capabilities, and your first player.' },
  { title: 'AudioPlayer', path: isChinese.value ? '/zh/api/core/classes/AudioPlayer' : '/api/core/classes/AudioPlayer', section: 'API', description: isChinese.value ? '核心播放器类、方法与事件。' : 'Core player class, methods, and events.' },
  { title: 'Player Studio', path: isChinese.value ? '/zh/examples' : '/player-studio', section: isChinese.value ? '交互示例' : 'Interactive', description: isChinese.value ? '使用真实音频验证完整播放链路。' : 'Validate the complete playback flow with real audio.' },
])
const results = computed<SearchDisplayResult[]>(() => query.value.trim() ? searchResults.value : quickLinks.value)

function publishedSearchPath(searchId: string): string {
  const [searchPath, fragment] = searchId.split('#', 2)
  const localePrefix = searchPath?.startsWith('/zh/') ? '/zh' : ''
  const englishPath = localePrefix ? searchPath?.slice(localePrefix.length) : searchPath
  // AI modified: Content's lowercase lookup keys return to the reviewed TypeDoc symbol casing in public URLs.
  const publishedPath = publishedApiRouteByLookupPath.get(englishPath?.toLocaleLowerCase() ?? '') ?? englishPath ?? '/'

  return `${localePrefix}${publishedPath}${fragment ? `#${fragment}` : ''}`
}

function close(): void {
  emit('update:open', false)
}

function handleKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault()
    emit('update:open', true)
  }
  else if (event.key === 'Escape' && props.open) {
    close()
  }
}

watch(() => props.open, async (isOpen) => {
  if (import.meta.client) {
    document.body.classList.toggle('is-dialog-open', isOpen)
  }
  if (isOpen) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    searchInput.value?.focus()
  }
  else {
    previouslyFocusedElement?.focus()
    previouslyFocusedElement = null
  }
})

watch(query, async (searchQuery) => {
  const searchTerm = searchQuery.trim()
  const requestId = ++searchRequestId

  if (!searchTerm) {
    searchResults.value = []
    isSearching.value = false
    return
  }

  isSearching.value = true

  try {
    const matches = await search(searchTerm, {
      limit: 40,
      snippet: { columns: ['content'], around: 14 },
      weights: { title: 24, content: 5, heading: 0.5 },
    })

    if (requestId !== searchRequestId) {
      return
    }

    const localePrefix = isChinese.value ? '/zh/' : '/'
    searchResults.value = matches
      .filter(searchMatch => isChinese.value ? searchMatch.id.startsWith(localePrefix) : !searchMatch.id.startsWith('/zh/'))
      .slice(0, 12)
      .map(searchMatch => ({
        description: searchMatch.snippets?.content ?? searchMatch.content.slice(0, 150),
        path: publishedSearchPath(searchMatch.id),
        section: searchMatch.titles.at(0) ?? (searchMatch.id.startsWith('/api') ? 'API' : isChinese.value ? '文档' : 'Docs'),
        title: searchMatch.title,
      }))
  }
  finally {
    if (requestId === searchRequestId) {
      isSearching.value = false
    }
  }
})

onMounted(() => window.addEventListener('keydown', handleKeydown))

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.classList.remove('is-dialog-open')
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="search-overlay" role="presentation" @mousedown.self="close">
      <section class="search-dialog" role="dialog" aria-modal="true" :aria-label="isChinese ? '搜索文档' : 'Search documentation'">
        <div class="search-dialog__field">
          <Search :size="20" aria-hidden="true" />
          <input ref="searchInput" v-model="query" type="search" :placeholder="isChinese ? '搜索指南、API 与示例…' : 'Search guides, API, and examples…'">
          <button type="button" :aria-label="isChinese ? '关闭搜索' : 'Close search'" @click="close">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="search-dialog__results">
          <p>{{ isSearching ? (isChinese ? '正在搜索' : 'Searching') : query ? (isChinese ? '搜索结果' : 'Results') : (isChinese ? '快速入口' : 'Quick links') }}</p>
          <NuxtLink v-for="searchResult in results" :key="searchResult.path" :to="searchResult.path" @click="close">
            <span>{{ searchResult.section }}</span>
            <strong>{{ searchResult.title }}</strong>
            <small v-if="searchResult.description">{{ searchResult.description }}</small>
          </NuxtLink>
          <div v-if="!isSearching && results.length === 0" class="search-empty">
            <strong>{{ isChinese ? '没有找到结果' : 'No results found' }}</strong>
            <span>{{ isChinese ? '尝试符号名称或更短的关键词。' : 'Try a symbol name or a shorter query.' }}</span>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
