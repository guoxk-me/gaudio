<script setup lang="ts">
import { ArrowRight, Braces } from '@lucide/vue'

const { isChinese } = useDocumentationLocale()
</script>

<template>
  <section class="home-wireframe-final-cta">
    <p class="eyebrow">
      TIME TO FIRST AUDIO
    </p>
    <h2>{{ isChinese ? '五分钟播放你的第一段音频。' : 'Play your first audio in five minutes.' }}</h2>
    <p>{{ isChinese ? '先使用核心包，在产品需要时再添加自适应流能力。' : 'Start with the core package, then add adaptive streaming only when your product needs it.' }}</p>
    <div>
      <NuxtLink class="primary-action" :to="isChinese ? '/zh/guide/getting-started' : '/guide/getting-started'">
        {{ isChinese ? '打开快速开始' : 'Open Quick Start' }}
        <ArrowRight :size="16" aria-hidden="true" />
      </NuxtLink>
      <NuxtLink class="secondary-action" :to="isChinese ? '/zh/api' : '/api'">
        <Braces :size="15" aria-hidden="true" />
        {{ isChinese ? '浏览 API' : 'Browse API' }}
      </NuxtLink>
    </div>
  </section>
</template>
