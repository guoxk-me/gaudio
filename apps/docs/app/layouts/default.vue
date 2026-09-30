<script setup lang="ts">
const { isSearchOpen, openSearch } = useDocumentationSearch()
</script>

<template>
  <div class="site-shell">
    <SiteHeader @search="openSearch" />
    <main id="main-content" class="site-main">
      <slot />
    </main>
    <SiteFooter />
    <SearchDialog v-model:open="isSearchOpen" />
  </div>
</template>
