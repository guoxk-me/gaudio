<script setup lang="ts">
import { ArrowRight, CircleCheck, CircleMinus, CircleX } from '@lucide/vue'

const { isChinese } = useDocumentationLocale()
const supportedFacts = computed(() => isChinese.value
  ? ['浏览器优先的播放与能力检测', '包含 TypeScript 声明', 'SSR 安全的核心与 HLS 导入', '可选 HLS 与 DASH 依赖']
  : ['Browser-first playback and capability detection', 'TypeScript declarations included', 'SSR-safe core and HLS imports', 'Optional HLS and DASH dependencies'])
const serviceBoundaries = computed(() => isChinese.value
  ? ['音频托管或 CDN 管理', '服务端转码', 'DRM 授权服务', '账户、项目或分析后端']
  : ['Audio hosting or CDN management', 'Server-side transcoding', 'DRM licensing services', 'Account, project, or analytics backends'])
</script>

<template>
  <section id="compatibility" class="home-wireframe-section home-wireframe-boundaries" aria-labelledby="boundaries-title">
    <p class="eyebrow">
      CLEAR EXPECTATIONS
    </p>
    <h2 id="boundaries-title">
      {{ isChinese ? '了解 GAudio 的能力边界。' : 'Know where GAudio fits.' }}
    </h2>

    <div class="home-wireframe-boundaries__grid">
      <article>
        <header><CircleCheck :size="20" aria-hidden="true" /><h3>{{ isChinese ? '为现代 Web 应用设计' : 'Designed for modern web applications' }}</h3></header>
        <ul>
          <li v-for="supportedFact in supportedFacts" :key="supportedFact">
            <CircleCheck :size="14" aria-hidden="true" />{{ supportedFact }}
          </li>
        </ul>
        <NuxtLink :to="isChinese ? '/zh/guide/configuration' : '/guide/configuration'">
          {{ isChinese ? '阅读兼容性与 SSR' : 'Read Compatibility & SSR' }}
          <ArrowRight :size="14" aria-hidden="true" />
        </NuxtLink>
      </article>

      <article class="is-boundary">
        <header><CircleX :size="20" aria-hidden="true" /><h3>{{ isChinese ? 'GAudio 是播放库' : 'GAudio is a playback library' }}</h3></header>
        <p>{{ isChinese ? '它不提供以下媒体基础设施服务：' : 'It does not provide these media infrastructure services:' }}</p>
        <ul>
          <li v-for="serviceBoundary in serviceBoundaries" :key="serviceBoundary">
            <CircleMinus :size="14" aria-hidden="true" />{{ serviceBoundary }}
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>
