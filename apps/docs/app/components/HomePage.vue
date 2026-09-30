<script setup lang="ts">
const { isChinese } = useDocumentationLocale()

useDocumentationHead({
  title: () => isChinese.value ? 'gaudio — 每一种音频，同一个播放生命周期' : 'gaudio — One lifecycle for every browser audio source',
  description: () => isChinese.value ? '通过类型安全的统一 API，管理浏览器音频的状态、事件与资源。按需接入 HLS 和 DASH，构建属于你的播放体验。' : 'Build browser audio with one typed API for playback, state, and cleanup. Connect native audio, HLS, and DASH with optional adapters.',
})
</script>

<template>
  <!-- AI modified: explain lifecycle ownership after the working player and before adoption. -->
  <div class="lifecycle-home">
    <HomeHero />
    <HomeProblem />
    <HomeArchitecture />
    <HomeCapabilities />
    <HomeAdoptionPaths />
    <HomeBoundaries />
    <HomeFinalCta />
  </div>
</template>
