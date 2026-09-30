<script setup lang="ts">
import { Cable, RefreshCw, Trash2 } from '@lucide/vue'

const { isChinese } = useDocumentationLocale()
// AI modified: connect the lifecycle promise to concrete integration work developers recognize.
const challenges = computed(() => [
  { icon: RefreshCw, title: isChinese.value ? '状态始终一致' : 'Keep state in sync.', body: isChinese.value ? '加载、暂停、切歌、重试。让界面跟上播放的每一次变化。' : 'Loading, pausing, switching, retrying. Keep your interface in step with what is actually playing.' },
  { icon: Cable, title: isChinese.value ? '切换来源，延续控制' : 'Switch sources, keep control.', body: isChinese.value ? '从一个 MP3 到自适应流，用同一套控制和事件接住变化。' : 'Move from an MP3 to an adaptive stream with the same controls and event vocabulary.' },
  { icon: Trash2, title: isChinese.value ? '结束时，清理到位' : 'Leave nothing playing.', body: isChinese.value ? '组件卸载后，释放播放器拥有的音频、监听器和分析器。' : 'When a view unmounts, release its owned audio, listeners, and analyzer together.' },
])
</script>

<template>
  <section class="lifecycle-section lifecycle-problem" aria-labelledby="problem-title">
    <div class="lifecycle-heading"><p class="eyebrow">{{ isChinese ? '从播放，到交付' : 'BEYOND THE PLAY BUTTON' }}</p><h2 id="problem-title">{{ isChinese ? '播放很简单。\n让体验可靠，需要更多。' : 'Playing is the easy part.\nEverything around it adds up.' }}</h2><p>{{ isChinese ? 'gaudio 接住播放背后的复杂度，让你专注于用户听到的体验。' : 'gaudio handles the moving parts, so you can focus on the experience people hear.' }}</p></div>
    <div class="lifecycle-problem__grid"><article v-for="challenge in challenges" :key="challenge.title"><component :is="challenge.icon" :size="22" stroke-width="1.5" aria-hidden="true" /><h3>{{ challenge.title }}</h3><p>{{ challenge.body }}</p></article></div>
  </section>
</template>

<style scoped>
.lifecycle-problem__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px; margin-top: 40px; }
.lifecycle-problem__grid article { border-top: 1px solid var(--border-default); padding-top: 26px; }
.lifecycle-problem__grid svg { color: var(--brand-primary); margin-bottom: 20px; }
.lifecycle-problem__grid h3 { font-size: 17px; font-weight: 550; letter-spacing: -.025em; margin: 0 0 9px; }
.lifecycle-problem__grid p { font-size: 13px; line-height: 1.8; color: var(--text-secondary); margin: 0; }
@media (max-width: 700px) { .lifecycle-problem__grid { grid-template-columns: 1fr; gap: 26px; } }
</style>
