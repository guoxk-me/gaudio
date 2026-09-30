<script setup lang="ts">
import type { NuxtError } from '#app'
import { ArrowLeft } from '@lucide/vue'

defineProps<{
  error: NuxtError
}>()
const route = useRoute()
const isChinese = computed(() => route.path === '/zh' || route.path.startsWith('/zh/'))
const homePath = computed(() => isChinese.value ? '/zh' : '/')

useHead({
  title: () => isChinese.value ? '页面未找到 · GAudio' : 'Page not found · GAudio',
  meta: [{ name: 'robots', content: 'noindex' }],
  htmlAttrs: { lang: () => isChinese.value ? 'zh-CN' : 'en-US' },
})
</script>

<template>
  <div class="error-page">
    <!-- AI modified: the standalone error logo belongs to a banner landmark for assistive navigation. -->
    <header>
      <SiteLogo :section-label="isChinese ? '错误' : 'Error'" />
    </header>
    <main>
      <p class="error-page__code">
        {{ error.statusCode || 404 }}
      </p>
      <p class="eyebrow">
        LOST SIGNAL / {{ isChinese ? '页面未找到' : 'PAGE NOT FOUND' }}
      </p>
      <h1>{{ isChinese ? '这段路径没有音频信号。' : 'There is no signal on this path.' }}</h1>
      <p>{{ isChinese ? '页面可能已移动，或者地址并不存在。' : 'The page may have moved, or the address may not exist.' }}</p>
      <NuxtLink :to="homePath" @click="clearError({ redirect: homePath })">
        <ArrowLeft :size="18" aria-hidden="true" />
        {{ isChinese ? '返回 GAudio 中文首页' : 'Go to home' }}
      </NuxtLink>
    </main>
  </div>
</template>
