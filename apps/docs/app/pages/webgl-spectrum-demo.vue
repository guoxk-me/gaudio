<script setup lang="ts">
const runtimeConfig = useRuntimeConfig()

useHead({
  title: 'GAudio WebGL Spectrum Lab',
  meta: [
    {
      name: 'description',
      content: 'A local comparison demo for three WebGL scenes driven by the GAudio AudioAnalyzer spectrum.',
    },
  ],
  link: [
    {
      rel: 'canonical',
      href: new URL('webgl-spectrum-demo', runtimeConfig.public.docsSiteUrl).href,
    },
  ],
})
</script>

<template>
  <!-- AI modified: the experimental comparison stays on a dedicated route until a homepage direction is selected. -->
  <WebglSpectrumDemo />
</template>
