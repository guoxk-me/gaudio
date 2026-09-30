<script setup lang="ts">
import type { DocumentationNavigationLink } from '../types/documentation'
import { ArrowLeft, ArrowRight } from '@lucide/vue'

defineProps<{
  previous?: DocumentationNavigationLink
  next?: DocumentationNavigationLink
  isChinese: boolean
}>()
</script>

<template>
  <nav v-if="previous || next" class="docs-pager" :aria-label="isChinese ? '文档分页' : 'Documentation pages'">
    <NuxtLink v-if="previous" class="docs-pager__link" :to="previous.path">
      <ArrowLeft :size="18" aria-hidden="true" />
      <span><small>{{ isChinese ? '上一页' : 'Previous' }}</small>{{ previous.label }}</span>
    </NuxtLink>
    <span v-else />
    <NuxtLink v-if="next" class="docs-pager__link docs-pager__link--next" :to="next.path">
      <span><small>{{ isChinese ? '下一页' : 'Next' }}</small>{{ next.label }}</span>
      <ArrowRight :size="18" aria-hidden="true" />
    </NuxtLink>
  </nav>
</template>
