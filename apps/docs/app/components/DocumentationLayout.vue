<script setup lang="ts">
import type { DocumentationNavigationGroup, DocumentationNavigationLink, DocumentationTocLink } from '../types/documentation'
import { List } from '@lucide/vue'
import { shallowRef } from 'vue'

defineProps<{
  navigation: DocumentationNavigationGroup[]
  tocLinks: DocumentationTocLink[]
  previous?: DocumentationNavigationLink
  next?: DocumentationNavigationLink
  isChinese: boolean
}>()

const isTocOpen = shallowRef(false)
</script>

<template>
  <div class="docs-layout">
    <DocumentationSidebar :groups="navigation" />
    <article class="docs-article">
      <button class="mobile-toc-button" type="button" :aria-expanded="isTocOpen" @click="isTocOpen = !isTocOpen">
        <List :size="18" aria-hidden="true" />
        {{ isChinese ? '本页目录' : 'On this page' }}
      </button>
      <DocumentationToc v-if="isTocOpen" class="mobile-toc" :links="tocLinks" :label="isChinese ? '本页目录' : 'On this page'" />
      <slot />
      <DocumentationPager :previous="previous" :next="next" :is-chinese="isChinese" />
    </article>
    <DocumentationToc :links="tocLinks" :label="isChinese ? '本页目录' : 'On this page'" />
  </div>
</template>
