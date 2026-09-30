<script setup lang="ts">
const props = defineProps<{
  href?: string
  target?: string
}>()

const route = useRoute()
const resolvedHref = computed(() => {
  const href = props.href ?? ''

  if (!href || href.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(href)) {
    return href
  }

  // AI modified: TypeDoc Markdown links become clean Nuxt routes while retaining query strings and fragments.
  // AI modified: TypeDoc module indexes resolve from directories while declaration and guide routes resolve as files.
  const isApiIndex = /^(?:\/zh)?\/api(?:\/(?:core|adapters\/(?:dash|hls)))?$/.test(route.path)
  const relativeLinkBase = isApiIndex ? `${route.path.replace(/\/$/, '')}/` : route.path
  const resolvedUrl = new URL(href, `https://gaudio.local${relativeLinkBase}`)
  resolvedUrl.pathname = resolvedUrl.pathname
    .replace(/\.md$/, '')
    .replace(/\/index$/, '') || '/'

  return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`
})

const isExternal = computed(() => /^[a-z][a-z\d+.-]*:/i.test(resolvedHref.value))
</script>

<template>
  <a v-if="isExternal" :href="resolvedHref" :target="target" :rel="target === '_blank' ? 'noreferrer' : undefined"><slot /></a>
  <a v-else-if="resolvedHref.startsWith('#')" :href="resolvedHref"><slot /></a>
  <NuxtLink v-else :to="resolvedHref">
    <slot />
  </NuxtLink>
</template>
