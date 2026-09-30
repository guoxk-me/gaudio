<script setup lang="ts">
import { ArrowDown, ArrowRight, AudioLines, ChevronDown, Code2, Cpu } from '@lucide/vue'
import { shallowRef } from 'vue'

const { isChinese } = useDocumentationLocale()
const selectedSource = shallowRef<'native' | 'hls' | 'dash'>('native')
const isExpanded = shallowRef(false)
const sources = ['native', 'hls', 'dash'] as const
const runtimeLabel = computed(() => selectedSource.value === 'native' ? 'HTMLAudioElement' : selectedSource.value === 'hls' ? 'hls.js / native HLS' : 'dash.js')
const importLabel = computed(() => selectedSource.value === 'native' ? "import { AudioPlayer } from 'gaudio'" : selectedSource.value === 'hls' ? "import { createHlsAdapter } from 'gaudio/hls'" : "import { createDashAdapter } from 'gaudio/dash'")
// AI modified: selecting a source explains runtime routing without pretending to play another stream.
</script>

<template>
  <section class="lifecycle-section lifecycle-architecture" aria-labelledby="architecture-title">
    <div class="lifecycle-heading"><p class="eyebrow">{{ isChinese ? '统一的播放模型' : 'ONE CONSISTENT FOUNDATION' }}</p><h2 id="architecture-title">{{ isChinese ? '来源在变。\n你的 API 始终如一。' : 'Different sources.\nSame state of mind.' }}</h2><p>{{ isChinese ? '连接、控制、观察、释放。每种音频都遵循同一套生命周期。' : 'Connect, control, observe, release. Every source follows the same lifecycle.' }}</p></div>
    <div class="signal-board">
      <div class="signal-board__top"><span><i />{{ isChinese ? '交互架构图' : 'EXPLORE THE ARCHITECTURE' }}</span><code>Source → Player → Browser</code></div>
      <div class="signal-board__flow">
        <div class="signal-stage"><p>{{ isChinese ? '选择来源' : 'YOUR SOURCE' }}</p><div class="signal-source-buttons" :aria-label="isChinese ? '架构示例来源' : 'Architecture source'"><button v-for="source in sources" :key="source" type="button" :aria-pressed="selectedSource === source" @click="selectedSource = source">{{ source === 'native' ? 'Native' : source.toUpperCase() }}</button></div><small>{{ selectedSource === 'native' ? 'MP3 · WAV · AAC · OGG' : selectedSource === 'hls' ? '.m3u8 · adaptive streaming' : '.mpd · adaptive streaming' }}</small></div>
        <ArrowRight class="signal-connector" :size="24" aria-hidden="true" /><ArrowDown class="signal-connector-mobile" :size="20" aria-hidden="true" />
        <div class="signal-core"><AudioLines :size="29" stroke-width="1.5" aria-hidden="true" /><strong>gaudio</strong><span>AudioPlayer</span><div><code>state</code><code>events</code><code>cleanup</code></div></div>
        <ArrowRight class="signal-connector" :size="24" aria-hidden="true" /><ArrowDown class="signal-connector-mobile" :size="20" aria-hidden="true" />
        <div class="signal-stage signal-runtime"><Cpu :size="26" stroke-width="1.5" aria-hidden="true" /><p>{{ isChinese ? '浏览器运行时' : 'BROWSER RUNTIME' }}</p><strong :key="selectedSource">{{ runtimeLabel }}</strong><small>{{ selectedSource === 'native' ? (isChinese ? '内置于核心包' : 'Built into the core') : (isChinese ? '仅在接入时加载' : 'Only when you add the adapter') }}</small></div>
      </div>
      <div class="signal-board__import"><Code2 :size="16" aria-hidden="true" /><code>{{ importLabel }}</code></div>
      <button class="signal-board__expand" type="button" :aria-expanded="isExpanded" aria-controls="runtime-details" @click="isExpanded = !isExpanded">{{ isChinese ? '看看内部如何协作' : 'A look under the hood' }}<ChevronDown :size="16" :class="{ 'is-expanded': isExpanded }" aria-hidden="true" /></button>
      <div v-if="isExpanded" id="runtime-details" class="signal-board__details">
        <article><b>AudioEngineRouter</b><p>{{ isChinese ? '根据来源协议选择引擎，在切换时等待原资源释放。' : 'Selects an engine by source protocol and awaits cleanup when replacing a source.' }}</p></article>
        <article><b>Core + adapters</b><p>{{ isChinese ? '核心包不捆绑 hls.js 或 dash.js。通过独立入口接入需要的运行时。' : 'The core does not bundle hls.js or dash.js. Add the runtime you need through its own import.' }}</p></article>
        <article><b>Web Audio + Media Session</b><p>{{ isChinese ? '由浏览器提供频谱和系统媒体控制；播放器管理其生命周期。' : 'Browser APIs power analysis and system media controls; the player owns their lifecycle.' }}</p></article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lifecycle-architecture { padding-top: 12px; }
.signal-board { margin-top: 38px; border: 1px solid var(--border-default); border-radius: 16px; overflow: hidden; background: var(--surface-panel); }
.signal-board__top { display: flex; justify-content: space-between; padding: 17px 24px; border-bottom: 1px solid var(--border-default); color: var(--text-secondary); font: 10px 'Geist Mono Variable', monospace; }
.signal-board__top span { display: flex; align-items: center; gap: 8px; }
.signal-board__top i { width: 5px; height: 5px; background: var(--brand-primary); border-radius: 50%; }
.signal-board__flow { display: grid; grid-template-columns: 1fr 70px 1fr 70px 1fr; align-items: center; padding: 46px 42px; gap: 15px; background: radial-gradient(ellipse at 50% 50%, var(--brand-faint), transparent 60%); }
.signal-stage { min-width: 0; text-align: center; }
.signal-stage p { font: 10px 'Geist Mono Variable', monospace; letter-spacing: .08em; color: var(--text-secondary); margin: 0 0 20px; }
.signal-stage small { display: block; margin-top: 14px; font-size: 10px; color: var(--text-secondary); }
.signal-source-buttons { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; }
.signal-source-buttons button { border: 1px solid var(--border-default); border-radius: 6px; color: var(--text-secondary); background: var(--surface-bg); padding: 9px 12px; font: 11px 'Geist Mono Variable', monospace; cursor: pointer; }
.signal-source-buttons button[aria-pressed="true"] { border-color: var(--brand-primary); color: var(--brand-primary); background: var(--brand-soft); }
.signal-connector { justify-self: center; color: var(--brand-primary); }
.signal-connector-mobile { display: none; }
.signal-core { display: flex; flex-direction: column; align-items: center; padding: 22px 14px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--surface-panel); box-shadow: 0 10px 40px var(--brand-faint); }
.signal-core svg { color: var(--brand-primary); }
.signal-core strong { font-size: 29px; font-weight: 550; letter-spacing: -.055em; margin: 6px 0 0; }
.signal-core > span { font: 10px 'Geist Mono Variable', monospace; color: var(--text-secondary); }
.signal-core > div { display: flex; justify-content: center; flex-wrap: wrap; gap: 5px; margin-top: 22px; }
.signal-core code { padding: 3px 6px; border-radius: 4px; background: var(--brand-soft); color: var(--brand-primary); font: 9px 'Geist Mono Variable', monospace; }
.signal-runtime > svg { margin: 0 auto 12px; color: var(--text-secondary); }
.signal-runtime p { margin-bottom: 9px; }
.signal-runtime strong { font: 12px 'Geist Mono Variable', monospace; }
.signal-board__import { display: flex; justify-content: center; align-items: center; gap: 10px; padding: 18px 20px; border-top: 1px solid var(--border-default); color: var(--brand-primary); background: var(--surface-soft); }
.signal-board__import code { font: 11px 'Geist Mono Variable', monospace; overflow-x: auto; white-space: nowrap; }
.signal-board__expand { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 20px; border: 0; border-top: 1px solid var(--border-default); padding: 16px 24px; background: transparent; font-size: 12px; cursor: pointer; }
.signal-board__expand svg { transition: transform 180ms; }
.signal-board__expand .is-expanded { transform: rotate(180deg); }
.signal-board__details { display: grid; grid-template-columns: repeat(3, 1fr); padding: 10px 24px 24px; gap: 30px; }
.signal-board__details b { font: 11px 'Geist Mono Variable', monospace; }
.signal-board__details p { font-size: 12px; color: var(--text-secondary); margin: 8px 0 0; }
@media (max-width: 820px) { .signal-board__flow { gap: 8px; padding: 30px 15px; grid-template-columns: 1fr 25px 1fr 25px 1fr; } .signal-source-buttons button { padding: 8px; } }
@media (max-width: 600px) { .signal-board__top > code { display: none; } .signal-board__flow { grid-template-columns: 1fr; gap: 20px; } .signal-core { width: 220px; justify-self: center; } .signal-connector { display: none; } .signal-connector-mobile { display: block; justify-self: center; color: var(--brand-primary); } .signal-board__details { grid-template-columns: 1fr; gap: 20px; } }
</style>
