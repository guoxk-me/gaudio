<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'
import { demoLocaleForLang, demoText } from './demo-i18n'
import DemoCapabilities from './DemoCapabilities.vue'
import DemoCatalog from './DemoCatalog.vue'
import DemoControls from './DemoControls.vue'
import DemoPlayerSurface from './DemoPlayerSurface.vue'
import DemoStatus from './DemoStatus.vue'
import DemoVisualization from './DemoVisualization.vue'
import { useGaudioDemo } from './use-gaudio-demo'

const { lang } = useData()
const demo = useGaudioDemo()
// AI modified: keep demo UI bilingual while sharing the same playback implementation.
const text = computed(() => demoText[demoLocaleForLang(lang.value)])
</script>

<template>
  <div class="gaudio-demo">
    <p class="gaudio-demo__intro">
      {{ text.intro }}
    </p>
    <DemoPlayerSurface :demo="demo" :text="text" />
    <DemoCatalog :demo="demo" :text="text" />
    <div class="gaudio-demo__workspace">
      <DemoControls :demo="demo" :text="text" />
      <DemoStatus :demo="demo" :text="text" />
    </div>
    <DemoVisualization :text="text" />
    <DemoCapabilities :demo="demo" :text="text" />
  </div>
</template>

<style scoped>
.gaudio-demo {
  --demo-border: var(--vp-c-divider);
  --demo-muted: var(--vp-c-text-2);
  --demo-surface: var(--vp-c-bg-soft);
  margin: 20px 0;
}

.gaudio-demo__intro {
  color: var(--demo-muted);
}

.gaudio-demo__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  gap: 16px;
  margin-top: 16px;
  align-items: start;
}

@media (max-width: 800px) {
  .gaudio-demo__workspace {
    grid-template-columns: 1fr;
  }
}
</style>
