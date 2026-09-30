<script setup lang="ts">
import { ArrowRight, Check, Copy, Play, Terminal } from '@lucide/vue'
import { onBeforeUnmount, shallowRef } from 'vue'

const { isChinese } = useDocumentationLocale()
const player = useHomeMiniPlayer()
const copyStatus = shallowRef<'idle' | 'copied' | 'failed'>('idle')
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function copyInstall(): Promise<void> {
  try {
    await navigator.clipboard.writeText('pnpm add gaudio@next')
    copyStatus.value = 'copied'
  }
  catch {
    copyStatus.value = 'failed'
  }
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copyStatus.value = 'idle' }, 2000)
}

// AI modified: the main CTA starts the same real player shown beside the product promise.
function tryPlayer(): void {
  document.getElementById('live-player')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' })
  if (player.isPaused.value) {
    void player.togglePlayback()
  }
  document.getElementById('live-player')?.focus({ preventScroll: true })
}

onBeforeUnmount(() => clearTimeout(copyTimer))
</script>

<template>
  <section class="sonic-hero" aria-labelledby="hero-title">
    <div class="sonic-hero__grid">
      <div class="sonic-hero__copy">
        <p class="sonic-hero__eyebrow"><span />{{ isChinese ? '为 Web 开发者而生的音频工具' : 'THE SOUND OF A BETTER WEB' }}</p>
        <h1 id="hero-title">
          <template v-if="isChinese">每一种音频，<br><em>同一个</em><br>播放生命周期。</template>
          <template v-else>One lifecycle.<br><em>Every audio</em><br>source.</template>
        </h1>
        <p class="sonic-hero__description">{{ isChinese ? '用一个类型安全的 API，掌控浏览器音频的播放、状态与资源清理。原生音频、HLS 和 DASH，从此有章可循。' : 'Bring playback, state, and cleanup into one typed API. Build browser audio that stays in sync, from a single MP3 to HLS and DASH.' }}</p>
        <div class="sonic-hero__actions">
          <button class="primary-action" type="button" :disabled="player.isBusy.value" @click="tryPlayer"><Play :size="14" fill="currentColor" aria-hidden="true" />{{ isChinese ? '体验播放器' : 'Try the player' }}</button>
          <NuxtLink class="secondary-action" :to="isChinese ? '/zh/guide/getting-started' : '/guide/getting-started'">{{ isChinese ? '开始使用' : 'Get started' }}<ArrowRight :size="16" aria-hidden="true" /></NuxtLink>
        </div>
        <div class="sonic-hero__install">
          <Terminal :size="14" aria-hidden="true" /><code>pnpm add gaudio@next</code>
          <button type="button" :aria-label="isChinese ? '复制安装命令' : 'Copy install command'" @click="copyInstall"><Check v-if="copyStatus === 'copied'" :size="14" aria-hidden="true" /><Copy v-else :size="14" aria-hidden="true" /></button>
          <span class="sonic-hero__copy-status" role="status">{{ copyStatus === 'copied' ? (isChinese ? '已复制' : 'Copied') : copyStatus === 'failed' ? (isChinese ? '请手动复制' : 'Please copy manually') : '' }}</span>
        </div>
        <p class="sonic-hero__release">MIT {{ isChinese ? '开源' : 'licensed' }}<span>·</span>TypeScript<span>·</span>{{ isChinese ? 'next 预发布版' : 'Currently in preview' }}</p>
      </div>
      <div id="live-player" class="sonic-hero__player" tabindex="-1" :aria-label="isChinese ? '交互播放器' : 'Interactive player'">
        <HomeMiniPlayer :controller="player" />
        <p class="sonic-hero__caption"><span />{{ isChinese ? '真实音频 · 实时频谱 · 由 gaudio 驱动' : 'REAL AUDIO. LIVE SIGNAL. POWERED BY GAUDIO.' }}</p>
      </div>
    </div>
    <div class="sonic-hero__footnote"><span>{{ isChinese ? '你的界面。你的音频。统一的播放模型。' : 'Your interface. Your audio. One consistent foundation.' }}</span><div><code>Native audio</code><span>+</span><code>HLS</code><span>+</span><code>DASH</code></div></div>
  </section>
</template>

<style scoped>
.sonic-hero { width: min(calc(100% - 64px), 1240px); margin: 0 auto; padding-top: 64px; }
.sonic-hero__grid { display: grid; grid-template-columns: 0.94fr 1.06fr; gap: 66px; align-items: center; padding-bottom: 64px; }
.sonic-hero__eyebrow { display: flex; gap: 10px; align-items: center; font: 10px 'Geist Mono Variable', monospace; letter-spacing: .11em; color: var(--text-secondary); margin: 0 0 28px; }
.sonic-hero__eyebrow > span { width: 6px; height: 6px; background: var(--brand-primary); border-radius: 50%; box-shadow: 0 0 0 4px var(--brand-faint); }
.sonic-hero h1 { font-size: clamp(46px, 4.8vw, 70px); font-weight: 530; line-height: 1.04; letter-spacing: -.065em; margin: 0; }
.sonic-hero h1 em { color: var(--brand-primary); font-style: normal; }
.sonic-hero__description { max-width: 470px; color: var(--text-secondary); font-size: 16px; line-height: 1.8; margin: 25px 0 27px; }
.sonic-hero__actions { display: flex; gap: 12px; }
.sonic-hero__install { position: relative; display: flex; width: fit-content; align-items: center; gap: 12px; margin-top: 25px; padding: 10px 0; color: var(--text-secondary); }
.sonic-hero__install code { font: 12px 'Geist Mono Variable', monospace; color: var(--text-primary); }
.sonic-hero__install button { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 5px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.sonic-hero__install button:hover { background: var(--brand-soft); color: var(--brand-primary); }
.sonic-hero__copy-status { position: absolute; top: 100%; left: 26px; font-size: 11px; color: var(--brand-primary); }
.sonic-hero__release { display: flex; gap: 10px; margin: 9px 0 0; color: var(--text-secondary); font-size: 11px; }
.sonic-hero__player { min-width: 0; position: relative; }
.sonic-hero__caption { display: flex; justify-content: center; align-items: center; gap: 8px; font: 9px 'Geist Mono Variable', monospace; letter-spacing: .07em; margin: 17px 0 0; color: var(--text-secondary); }
.sonic-hero__caption span { width: 4px; height: 4px; border-radius: 50%; background: var(--brand-primary); }
.sonic-hero__footnote { display: flex; justify-content: space-between; gap: 18px; border-top: 1px solid var(--border-default); border-bottom: 1px solid var(--border-default); padding: 24px 0; color: var(--text-secondary); font-size: 12px; }
.sonic-hero__footnote div { display: flex; align-items: center; gap: 20px; }
.sonic-hero__footnote code { color: var(--text-primary); font: 11px 'Geist Mono Variable', monospace; }
@media (max-width: 1050px) { .sonic-hero__grid { gap: 30px; } .sonic-hero h1 { font-size: 52px; } }
@media (max-width: 820px) { .sonic-hero { width: calc(100% - 40px); padding-top: 44px; } .sonic-hero__grid { grid-template-columns: 1fr; gap: 38px; padding-bottom: 40px; } .sonic-hero__copy { max-width: 580px; } .sonic-hero h1 { font-size: clamp(46px, 9vw, 68px); } .sonic-hero__player { width: 100%; max-width: 620px; margin: auto; } .sonic-hero__footnote { flex-direction: column; } }
@media (max-width: 420px) { .sonic-hero__description { font-size: 14px; } .sonic-hero__eyebrow { font-size: 9px; } .sonic-hero__actions { gap: 8px; } .sonic-hero__actions > * { padding: 0 15px; } .sonic-hero__caption { font-size: 8px; } }
</style>
