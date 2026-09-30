<script setup lang="ts">
defineProps<{
  sectionLabel?: string
}>()

const { isChinese } = useDocumentationLocale()
// AI modified: reuse the exact brand mark exported from the approved header component.
const brandMarkUrl = useDocumentationAsset('visuals/gaudio-brand-mark.png')
</script>

<template>
  <NuxtLink class="site-logo" :to="isChinese ? '/zh' : '/'" aria-label="GAudio home">
    <img :src="brandMarkUrl" width="32" height="32" alt="">
    <span>GAudio</span>
    <template v-if="sectionLabel">
      <span class="site-logo__separator" aria-hidden="true">/</span>
      <span class="site-logo__section">{{ sectionLabel }}</span>
    </template>
  </NuxtLink>
</template>
