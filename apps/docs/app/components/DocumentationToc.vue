<script setup lang="ts">
import type { DocumentationTocLink } from '../types/documentation'

defineProps<{
  links: DocumentationTocLink[]
  label: string
}>()
</script>

<template>
  <aside class="docs-toc">
    <p>{{ label }}</p>
    <nav :aria-label="label">
      <a v-for="tocLink in links" :key="tocLink.id" :href="`#${tocLink.id}`">
        {{ tocLink.text }}
      </a>
    </nav>
  </aside>
</template>
