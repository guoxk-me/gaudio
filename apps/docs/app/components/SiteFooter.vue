<script setup lang="ts">
const runtimeConfig = useRuntimeConfig()
const { alternatePath, isChinese } = useDocumentationLocale()
const brandMarkUrl = useDocumentationAsset('visuals/gaudio-brand-mark.png')
const licenseUrl = useDocumentationAsset('THIRD_PARTY_LICENSES.txt')
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__navigation">
      <section class="site-footer__identity">
        <NuxtLink class="site-footer__brand" :to="isChinese ? '/zh' : '/'">
          <img :src="brandMarkUrl" width="28" height="28" alt="">
          <strong>GAudio</strong>
        </NuxtLink>
        <p>{{ isChinese ? '浏览器优先的 TypeScript 音频播放库，HLS 与 DASH 保持可选。' : 'Browser-first TypeScript audio playback with optional HLS and DASH adapters.' }}</p>
        <code>next · pre-release · v{{ runtimeConfig.public.docsVersion }}</code>
      </section>
      <section>
        <strong>{{ isChinese ? '学习' : 'Learn' }}</strong>
        <NuxtLink :to="isChinese ? '/zh/guide/getting-started' : '/guide/getting-started'">
          {{ isChinese ? '快速开始' : 'Quick Start' }}
        </NuxtLink>
        <NuxtLink :to="isChinese ? '/zh/guide/configuration' : '/guide/configuration'">
          {{ isChinese ? '核心指南' : 'Core Guides' }}
        </NuxtLink>
        <NuxtLink :to="isChinese ? '/zh/guide/adaptive-playback' : '/guide/adaptive-playback'">
          {{ isChinese ? '自适应流' : 'Adaptive Streaming' }}
        </NuxtLink>
      </section>
      <section>
        <strong>{{ isChinese ? '参考' : 'Reference' }}</strong>
        <NuxtLink :to="isChinese ? '/zh/api' : '/api'">
          {{ isChinese ? 'API 总览' : 'API Overview' }}
        </NuxtLink>
        <NuxtLink :to="isChinese ? '/zh/guide/events' : '/guide/events'">
          {{ isChinese ? '事件与错误' : 'Events & Errors' }}
        </NuxtLink>
        <NuxtLink :to="isChinese ? '/zh/examples' : '/examples'">{{ isChinese ? '运行示例' : 'Examples' }}</NuxtLink>
        <NuxtLink :to="isChinese ? '/zh/player-studio' : '/player-studio'">
          Player Studio
        </NuxtLink>
      </section>
      <section>
        <strong>{{ isChinese ? '项目' : 'Project' }}</strong>
        <a href="https://github.com/guoxk-me/gaudio">Repository</a>
        <a href="https://github.com/guoxk-me/gaudio/issues">Issues</a>
        <a href="https://github.com/guoxk-me/gaudio/blob/main/SECURITY.md">Security</a>
        <a :href="licenseUrl">{{ isChinese ? '第三方许可' : 'Third-party licenses' }}</a>
      </section>
    </div>
    <div class="site-footer__bottom">
      <code>© 2026 GAudio · MIT License</code>
      <div>
        <NuxtLink :to="alternatePath">
          {{ isChinese ? 'English' : '简体中文' }}
        </NuxtLink>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/guoxk-me/gaudio">GitHub</a>
      </div>
    </div>
  </footer>
</template>
