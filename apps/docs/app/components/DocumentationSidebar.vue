<script setup lang="ts">
import type { DocumentationNavigationGroup } from '../types/documentation'

defineProps<{
  groups: DocumentationNavigationGroup[]
}>()

const route = useRoute()
</script>

<template>
  <nav class="docs-sidebar" aria-label="Documentation">
    <section v-for="group in groups" :key="group.label" class="docs-sidebar__group">
      <h2>{{ group.label }}</h2>
      <NuxtLink
        v-for="navigationLink in group.links"
        :key="navigationLink.path"
        :to="navigationLink.path"
        :aria-current="route.path === navigationLink.path ? 'page' : undefined"
      >
        <span aria-hidden="true" />
        {{ navigationLink.label }}
      </NuxtLink>
    </section>
  </nav>
</template>
