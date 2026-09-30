<script setup lang="ts">
import { ChevronRight, Menu, Monitor, Search, X } from '@lucide/vue'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

const emit = defineEmits<{
  search: []
}>()

const route = useRoute()
const { alternatePath, isChinese } = useDocumentationLocale()
// AI modified: keep header actions aligned with the prototype's search and locale controls.
const isMobileMenuOpen = shallowRef(false)
const themePreference = shallowRef('system')
let systemTheme: MediaQueryList | undefined
const navigation = computed(() => [
  { label: isChinese.value ? '文档' : 'Docs', path: isChinese.value ? '/zh/docs' : '/docs' },
  { label: isChinese.value ? '示例' : 'Examples', path: isChinese.value ? '/zh/examples' : '/examples' },
  { label: 'Player Studio', path: isChinese.value ? '/zh/player-studio' : '/player-studio' },
])
const guideNavigation = computed(() => [
  { label: isChinese.value ? '快速开始' : 'Getting started', path: isChinese.value ? '/zh/guide/getting-started' : '/guide/getting-started' },
  { label: isChinese.value ? '配置总览' : 'Configuration', path: isChinese.value ? '/zh/guide/configuration' : '/guide/configuration' },
  { label: isChinese.value ? '场景示例' : 'Recipes', path: isChinese.value ? '/zh/guide/recipes' : '/guide/recipes' },
  { label: isChinese.value ? '自适应播放' : 'Adaptive playback', path: isChinese.value ? '/zh/guide/adaptive-playback' : '/guide/adaptive-playback' },
  { label: isChinese.value ? '事件' : 'Events', path: isChinese.value ? '/zh/guide/events' : '/guide/events' },
])
const sectionLabel = computed(() => {
  if (route.path === '/' || route.path === '/zh') {
    return undefined
  }
  if (route.path.endsWith('/player-studio')) {
    return 'Studio'
  }
  if (route.path.endsWith('/examples')) {
    return isChinese.value ? '示例' : 'Examples'
  }
  return isChinese.value ? '文档' : 'Docs'
})

function closeMobileMenu(): void {
  isMobileMenuOpen.value = false
}

function applyTheme(): void {
  const isDark = themePreference.value === 'dark' || (themePreference.value === 'system' && !!systemTheme?.matches)
  document.documentElement.classList.toggle('dark', isDark)
}

function chooseTheme(): void {
  applyTheme()
  try {
    localStorage.setItem('gaudio-color-mode', themePreference.value)
  }
  catch {
    // AI modified: theme switching still works when persistent storage is unavailable.
  }
}

watch(() => route.fullPath, closeMobileMenu)
watch(isMobileMenuOpen, (isOpen) => {
  if (import.meta.client) {
    document.body.classList.toggle('is-menu-open', isOpen)
  }
})

onMounted(() => {
  // AI modified: System remains an explicit choice and follows OS changes without overwriting that preference.
  systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
  try {
    const savedTheme = localStorage.getItem('gaudio-color-mode')
    themePreference.value = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'system'
  }
  catch { themePreference.value = 'system' }
  applyTheme()
  systemTheme.addEventListener('change', applyTheme)
})

onBeforeUnmount(() => {
  systemTheme?.removeEventListener('change', applyTheme)
  if (import.meta.client) {
    document.body.classList.remove('is-menu-open')
  }
})
</script>

<template>
  <header class="site-header">
    <a class="skip-link" href="#main-content">{{ isChinese ? '跳到正文' : 'Skip to content' }}</a>
    <div class="site-header__inner">
      <SiteLogo :section-label="sectionLabel" />
      <nav class="site-header__nav" :aria-label="isChinese ? '主导航' : 'Primary navigation'">
        <NuxtLink v-for="navigationLink in navigation" :key="navigationLink.path" :to="navigationLink.path">
          {{ navigationLink.label }}
        </NuxtLink>
        <a href="https://github.com/guoxk-me/gaudio" target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <div class="site-header__actions">
        <button class="header-search" type="button" :aria-label="isChinese ? '搜索文档' : 'Search documentation'" @click="emit('search')">
          <Search :size="16" aria-hidden="true" />
        </button>
        <label class="header-theme">
          <Monitor :size="14" aria-hidden="true" />
          <select v-model="themePreference" :aria-label="isChinese ? '颜色主题' : 'Color theme'" @change="chooseTheme">
            <option value="system">{{ isChinese ? '系统' : 'System' }}</option>
            <option value="light">{{ isChinese ? '浅色' : 'Light' }}</option>
            <option value="dark">{{ isChinese ? '深色' : 'Dark' }}</option>
          </select>
        </label>
        <NuxtLink class="header-action header-locale" :to="alternatePath">
          {{ isChinese ? '简中 / EN' : 'EN / 简中' }}
        </NuxtLink>
        <button class="header-action mobile-menu-button" type="button" :aria-expanded="isMobileMenuOpen" aria-controls="mobile-navigation" :aria-label="isChinese ? '移动导航' : 'mobile navigation'" @click="isMobileMenuOpen = !isMobileMenuOpen">
          <X v-if="isMobileMenuOpen" :size="20" aria-hidden="true" />
          <Menu v-else :size="20" aria-hidden="true" />
        </button>
      </div>
    </div>

    <button v-if="isMobileMenuOpen" class="mobile-navigation-backdrop" type="button" :aria-label="isChinese ? '关闭导航' : 'Close navigation'" @click="closeMobileMenu" />
    <nav v-if="isMobileMenuOpen" id="mobile-navigation" class="mobile-navigation" :aria-label="isChinese ? '移动导航' : 'Mobile navigation'">
      <button class="mobile-navigation__search" type="button" @click="closeMobileMenu(); emit('search')">
        <Search :size="16" aria-hidden="true" />
        {{ isChinese ? '搜索文档…' : 'Search docs…' }}
      </button>
      <div class="mobile-navigation__group">
        <p>{{ isChinese ? '主要入口' : 'Primary' }}</p>
        <NuxtLink v-for="navigationLink in navigation" :key="navigationLink.path" :to="navigationLink.path">
          {{ navigationLink.label }}
          <ChevronRight :size="15" aria-hidden="true" />
        </NuxtLink>
      </div>
      <div class="mobile-navigation__group">
        <p>{{ isChinese ? '开始使用' : 'Guides' }}</p>
        <NuxtLink v-for="guideLink in guideNavigation" :key="guideLink.path" :to="guideLink.path">
          {{ guideLink.label }}
          <ChevronRight :size="15" aria-hidden="true" />
        </NuxtLink>
      </div>
      <div class="mobile-navigation__footer">
        <a href="https://github.com/guoxk-me/gaudio" target="_blank" rel="noreferrer">GitHub</a>
        <NuxtLink :to="alternatePath">
          {{ isChinese ? 'English' : '简体中文' }}
        </NuxtLink>
      </div>
    </nav>
  </header>
</template>

<style scoped>
/* AI modified: navigation reflects the four distinct destinations in the agreed prototype. */
.site-header { height: var(--header-height); background: var(--header-bg); }
.site-header__inner { width: min(calc(100% - 64px), 1240px); height: var(--header-height); gap: 28px; }
.site-header__nav { margin-right: auto; margin-left: 24px; gap: 28px; }
.site-header__nav a { font-size: 12px; white-space: nowrap; }
.header-search { width: 32px; min-width: 32px; padding: 0; justify-content: center; background: transparent; border-color: transparent; }
.header-theme { display: flex; align-items: center; gap: 4px; color: var(--text-secondary); }
.header-theme select { width: 75px; padding: 8px 0; border: 0; background: var(--surface-bg); color: var(--text-secondary); font-size: 11px; cursor: pointer; }
.header-locale { padding: 0 7px; font-size: 10px; border-color: transparent; background: transparent; }
@media (max-width: 820px) {
  .site-header__inner { width: calc(100% - 40px); gap: 10px; }
  .site-header__actions { gap: 8px; }
  .site-header__actions > .header-theme { display: flex; }
  .site-header__nav { display: none; }
  .header-theme > svg { display: none; }
}
</style>
