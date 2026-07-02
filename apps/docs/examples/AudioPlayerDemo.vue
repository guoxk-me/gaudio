<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'
import { demoLocaleForLang, demoText } from './demo-i18n'
import DemoFeatureTabs from './DemoFeatureTabs.vue'
import DemoLibrarySidebar from './DemoLibrarySidebar.vue'
import DemoNowPlayingStage from './DemoNowPlayingStage.vue'
import DemoTransportBar from './DemoTransportBar.vue'
import { useGaudioDemo } from './use-gaudio-demo'

const { lang } = useData()
const demo = useGaudioDemo()
// AI modified: keep the demo workbench on the same document grid as the API coverage table.
const text = computed(() => demoText[demoLocaleForLang(lang.value)])
</script>

<template>
  <div class="gaudio-studio not-prose w-full py-4">
    <p class="gaudio-studio__subtitle">
      {{ text.studio.subtitle }}
    </p>

    <div class="gaudio-studio__shell">
      <div
        class="gaudio-studio__backdrop"
        :style="{ backgroundImage: `url(${demo.activeCoverThumbUrl})` }"
        aria-hidden="true"
      />

      <div class="gaudio-studio__layout">
        <div class="gaudio-studio__main-grid">
          <div class="gaudio-studio__rail">
            <DemoLibrarySidebar :demo="demo" :text="text" />
          </div>

          <div class="gaudio-studio__playback">
            <div class="gaudio-studio__stage">
              <DemoNowPlayingStage :demo="demo" :text="text" />
            </div>
            <DemoTransportBar :demo="demo" :text="text" />
          </div>
        </div>

        <DemoFeatureTabs :demo="demo" :text="text" />
      </div>
    </div>
  </div>
</template>
