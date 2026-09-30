<script setup lang="ts">
import { Activity, ArrowRight, AudioLines, ListMusic, MonitorPlay, Play, Radio } from '@lucide/vue'

const { isChinese } = useDocumentationLocale()
const route = useRoute()
const prefix = computed(() => isChinese.value ? '/zh' : '')
const recipes = computed(() => [
  { id: 'basic', icon: Play, label: isChinese.value ? '基础播放' : 'Basic playback', caption: isChinese.value ? '第一个音频，一套生命周期。' : 'Your first sound. The complete lifecycle.', tag: '01 / START' },
  { id: 'playlist', icon: ListMusic, label: isChinese.value ? '播放列表' : 'Playlist', caption: isChinese.value ? '歌曲切换、队列与当前曲目。' : 'A queue that knows what comes next.', tag: '02 / CONTROL' },
  { id: 'media-session', icon: MonitorPlay, label: 'Media Session', caption: isChinese.value ? '让系统媒体控件认识你的播放器。' : 'Take playback beyond the browser tab.', tag: '03 / CONNECT' },
  { id: 'analyzer', icon: Activity, label: isChinese.value ? '音频分析器' : 'Audio analyzer', caption: isChinese.value ? '读取频谱，让声音变得可见。' : 'Turn real frequency data into a visual.', tag: '04 / OBSERVE' },
  { id: 'hls', icon: Radio, label: 'HLS streaming', caption: isChinese.value ? '按需接入 hls.js 或原生 HLS。' : 'Native HLS or hls.js, on demand.', tag: '05 / STREAM' },
  { id: 'dash', icon: AudioLines, label: 'DASH streaming', caption: isChinese.value ? '用同一个 API 接入 dash.js。' : 'The same player API, powered by dash.js.', tag: '06 / STREAM' },
])
// AI modified: each recipe has a shareable independent URL while keeping one player instance active.
const selectedRecipe = computed(() => recipes.value.find(recipe => recipe.id === route.query.recipe) ?? recipes.value[0])

useDocumentationHead({
  title: () => isChinese.value ? '示例 · GAudio' : 'Examples · GAudio',
  description: () => isChinese.value ? '通过可运行的精简示例学习播放、队列、Media Session、频谱与自适应流媒体。' : 'Working recipes for playback, playlists, Media Session, audio analysis, and adaptive streaming.',
})
</script>

<template>
  <section class="recipes-page">
    <header class="recipes-page__intro">
      <p class="eyebrow">{{ isChinese ? '动手体验 / EXAMPLES' : 'LEARN BY LISTENING / EXAMPLES' }}</p>
      <h1 class="recipes-page__title">{{ isChinese ? '从一个好例子开始。' : 'Start with a working example.' }}</h1>
      <p class="recipes-page__description">{{ isChinese ? '真实音频，精简代码。选一个场景，播放、观察，然后带进你的项目。' : 'Real audio. Focused code. Pick a recipe, hear it working, and make it your own.' }}</p>
    </header>
    <nav class="recipes-page__grid" :aria-label="isChinese ? '选择示例' : 'Choose an example'">
      <NuxtLink v-for="recipe in recipes" :key="recipe.id" :to="{ path: `${prefix}/examples`, query: { recipe: recipe.id }, hash: '#recipe' }" class="recipe-card" :class="{ 'is-selected': selectedRecipe.id === recipe.id }" :aria-current="selectedRecipe.id === recipe.id ? 'true' : undefined">
        <div class="recipe-card__top"><component :is="recipe.icon" :size="20" aria-hidden="true" /><span>{{ recipe.tag }}</span></div>
        <h2 class="recipe-card__title">{{ recipe.label }}<ArrowRight :size="16" aria-hidden="true" /></h2>
        <p class="recipe-card__caption">{{ recipe.caption }}</p>
      </NuxtLink>
    </nav>
    <section id="recipe" class="recipes-page__active" :aria-label="selectedRecipe.label">
      <div class="recipes-page__section-header"><div><p class="eyebrow">{{ isChinese ? '运行与探索' : 'RUN & EXPLORE' }}</p><h2>{{ selectedRecipe.label }}</h2></div><NuxtLink :to="{ path: `${prefix}/examples`, query: { recipe: selectedRecipe.id }, hash: '#recipe' }" target="_blank" rel="noopener">{{ isChinese ? '独立打开' : 'Open separately' }} ↗</NuxtLink></div>
      <RecipePlayer :key="selectedRecipe.id" :recipe="selectedRecipe.id" :is-chinese="isChinese" />
    </section>
    <aside class="recipes-page__studio"><div><h2>{{ isChinese ? '带上你自己的音频。' : 'Bring your own source.' }}</h2><p>{{ isChinese ? '在 Player Studio 中检查媒体源、运行时和播放事件。' : 'Inspect your media URL, runtime, and playback events in Player Studio.' }}</p></div><NuxtLink :to="`${prefix}/player-studio`">Player Studio <ArrowRight :size="16" aria-hidden="true" /></NuxtLink></aside>
  </section>
</template>

<style scoped>
.recipes-page { width: min(1120px, calc(100% - 48px)); margin: auto; padding: 84px 0 100px; }
.recipes-page__intro { max-width: 740px; margin-bottom: 48px; }
.recipes-page__title { margin: 20px 0; font-size: clamp(36px, 4.4vw, 54px); line-height: 1.12; letter-spacing: -.055em; font-weight: 550; }
.recipes-page__description { color: var(--text-secondary); font-size: 17px; line-height: 1.7; max-width: 610px; }
.recipes-page__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.recipe-card { display: block; border: 1px solid var(--border-default); padding: 24px; border-radius: 12px; background: var(--surface-panel); text-decoration: none; transition: border-color .2s, background .2s; }
.recipe-card:hover, .recipe-card.is-selected { border-color: var(--brand-primary); background: var(--brand-soft); }
.recipe-card__top { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--brand-primary); }
.recipe-card__top > span { color: var(--text-secondary); font-family: var(--font-mono); font-size: 9px; letter-spacing: .07em; }
.recipe-card__title { display: flex; justify-content: space-between; align-items: center; margin: 26px 0 9px; font-size: 17px; font-weight: 550; color: var(--text-primary); }
.recipe-card__caption { margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.recipes-page__active { margin-top: 68px; scroll-margin-top: 100px; }
.recipes-page__section-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 24px; }
.recipes-page__section-header h2 { margin: 10px 0 0; font-size: 27px; letter-spacing: -.035em; font-weight: 550; }
.recipes-page__section-header > a { color: var(--text-secondary); font-size: 12px; }
.recipes-page__studio { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-top: 72px; border-top: 1px solid var(--border-default); padding-top: 36px; }
.recipes-page__studio h2 { margin: 0 0 10px; font-size: 24px; font-weight: 500; letter-spacing: -.03em; }
.recipes-page__studio p { color: var(--text-secondary); font-size: 14px; }
.recipes-page__studio > a { display: flex; align-items: center; gap: 12px; flex-shrink: 0; color: var(--brand-primary); font-size: 13px; }
@media (max-width: 760px) { .recipes-page { padding-top: 48px; } .recipes-page__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .recipe-card { padding: 18px; } .recipes-page__studio { align-items: flex-start; flex-direction: column; } }
@media (max-width: 480px) { .recipes-page { width: calc(100% - 32px); } .recipes-page__grid { grid-template-columns: 1fr; } .recipe-card__title { margin-top: 18px; } }
</style>
