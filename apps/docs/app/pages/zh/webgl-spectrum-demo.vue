<script setup lang="ts">
const runtimeConfig = useRuntimeConfig()

// AI modified: keep the temporary spectrum lab reachable from the shared locale switcher.
useHead({
  title: 'GAudio WebGL Spectrum Lab',
  link: [
    {
      rel: 'canonical',
      href: new URL('zh/webgl-spectrum-demo', runtimeConfig.public.docsSiteUrl).href,
    },
  ],
})
</script>

<template>
  <WebglSpectrumDemo />
</template>
