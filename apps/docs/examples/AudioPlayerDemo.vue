<script setup lang="ts">
import DemoCatalog from './DemoCatalog.vue'
import DemoControls from './DemoControls.vue'
import DemoStatus from './DemoStatus.vue'
import { useGaudioDemo } from './use-gaudio-demo'

const demo = useGaudioDemo()
</script>

<template>
  <div class="gaudio-demo">
    <p class="gaudio-demo__intro">
      Load the bundled samples or provide an external media, HLS, or DASH URL.
    </p>
    <DemoCatalog :demo="demo" />
    <div class="gaudio-demo__workspace">
      <DemoControls :demo="demo" />
      <DemoStatus :demo="demo" />
    </div>
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
