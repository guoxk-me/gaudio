<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue'
import { demoLocaleForLang, demoText } from './demo-i18n'
import DemoCapabilities from './DemoCapabilities.vue'
import DemoControls from './DemoControls.vue'
import DemoPlayerSurface from './DemoPlayerSurface.vue'
import DemoStatus from './DemoStatus.vue'
import { useGaudioDemo } from './use-gaudio-demo'

const { isDark, lang } = useData()
const demo = useGaudioDemo()
// AI modified: keep demo UI bilingual while sharing the same playback implementation.
const text = computed(() => demoText[demoLocaleForLang(lang.value)])
const playerPanel = useTemplateRef<HTMLElement>('playerPanel')
const playerPanelHeight = shallowRef<number>()
const shouldSyncStatusHeight = shallowRef(false)
// AI modified: derive the demo palette from VitePress appearance so the site switch is the only theme control.
const demoClasses = computed(() => [
  'gaudio-demo',
  isDark.value ? 'gaudio-demo--dark' : 'gaudio-demo--light',
])
const statusHeightStyle = computed(() => (
  !shouldSyncStatusHeight.value || playerPanelHeight.value === undefined
    ? undefined
    : {
        height: `${playerPanelHeight.value}px`,
        maxHeight: `${playerPanelHeight.value}px`,
      }
))

let playerResizeObserver: ResizeObserver | undefined
let consoleLayoutQuery: MediaQueryList | undefined

function keepStatusHeightWithPlayer(): void {
  playerPanelHeight.value = playerPanel.value?.getBoundingClientRect().height
}

function updateStatusRailLayout(): void {
  shouldSyncStatusHeight.value = consoleLayoutQuery?.matches ?? window.innerWidth > 980
  keepStatusHeightWithPlayer()
}

onMounted(() => {
  consoleLayoutQuery = window.matchMedia('(min-width: 981px)')
  updateStatusRailLayout()
  window.requestAnimationFrame(updateStatusRailLayout)
  window.addEventListener('resize', updateStatusRailLayout)
  consoleLayoutQuery.addEventListener('change', updateStatusRailLayout)

  if (playerPanel.value && 'ResizeObserver' in window) {
    // AI modified: keep the status/event rail aligned to the player panel height.
    playerResizeObserver = new ResizeObserver(updateStatusRailLayout)
    playerResizeObserver.observe(playerPanel.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateStatusRailLayout)
  consoleLayoutQuery?.removeEventListener('change', updateStatusRailLayout)
  playerResizeObserver?.disconnect()
})
</script>

<template>
  <div :class="demoClasses">
    <div class="gaudio-demo__header">
      <p class="gaudio-demo__intro">
        {{ text.intro }}
      </p>
    </div>
    <DemoControls :demo="demo" :text="text" />
    <div class="gaudio-demo__console">
      <div ref="playerPanel" class="gaudio-demo__player">
        <DemoPlayerSurface :demo="demo" :text="text" />
      </div>
      <div class="gaudio-demo__status" :style="statusHeightStyle">
        <DemoStatus :demo="demo" :text="text" />
      </div>
    </div>
    <DemoCapabilities :demo="demo" :text="text" />
  </div>
</template>

<style scoped>
.gaudio-demo {
  --demo-amber: #e0a24a;
  --demo-amber-strong: #f5bd64;
  --demo-border: rgba(202, 183, 143, 0.18);
  --demo-check-icon: #141007;
  --demo-canvas: #0b0f0e;
  --demo-control: #171b18;
  --demo-focus: rgba(245, 189, 100, 0.58);
  --demo-green: #8fbc66;
  --demo-input-bg: rgba(7, 11, 10, 0.78);
  --demo-input-bg-hover: rgba(7, 11, 10, 0.92);
  --demo-line: rgba(202, 183, 143, 0.16);
  --demo-muted: #b8ad97;
  --demo-panel: #111612;
  --demo-panel-strong: #0f1412;
  --demo-surface: #101513;
  --demo-text: #f3efe6;
  --demo-thumb-border: #151008;
  --demo-transport-bg: rgba(7, 11, 10, 0.44);
  display: grid;
  gap: clamp(14px, 2vw, 20px);
  position: relative;
  /* AI modified: keep the demo below the sticky VitePress header. */
  z-index: 0;
  width: 100%;
  max-width: 1200px;
  margin: clamp(18px, 3vw, 30px) auto;
}

.gaudio-demo--light {
  --demo-amber: #c7842e;
  --demo-amber-strong: #a85f17;
  --demo-border: rgba(93, 72, 38, 0.18);
  --demo-canvas: #2b2419;
  --demo-check-icon: #fff7e7;
  --demo-control: #fff6e7;
  --demo-focus: rgba(168, 95, 23, 0.34);
  --demo-green: #567d2b;
  --demo-input-bg: rgba(255, 250, 241, 0.82);
  --demo-input-bg-hover: rgba(255, 255, 255, 0.96);
  --demo-line: rgba(93, 72, 38, 0.16);
  --demo-muted: #6f6048;
  --demo-panel: #fffaf1;
  --demo-panel-strong: #f7eddc;
  --demo-surface: #fff7e8;
  --demo-text: #261c11;
  --demo-thumb-border: #fff7e7;
  --demo-transport-bg: rgba(255, 250, 241, 0.62);
}

.gaudio-demo :deep(*) {
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    color 180ms ease;
}

.gaudio-demo__header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  align-items: center;
  justify-content: space-between;
}

.gaudio-demo__intro {
  max-width: 760px;
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 15px;
}

.gaudio-demo__console {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 0.38fr);
  gap: clamp(14px, 1.8vw, 18px);
  align-items: start;
}

.gaudio-demo__player,
.gaudio-demo__status {
  min-width: 0;
}

.gaudio-demo__status {
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 980px) {
  .gaudio-demo__console {
    grid-template-columns: 1fr;
  }

  .gaudio-demo__status {
    height: auto;
  }
}

@media (max-width: 640px) {
  .gaudio-demo {
    gap: 12px;
    margin-block: 16px;
  }

  .gaudio-demo__intro {
    font-size: 14px;
    line-height: 1.6;
  }
}
</style>
