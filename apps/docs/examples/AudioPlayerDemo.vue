<script setup lang="ts">
import { computed } from 'vue'
import { useDocumentationLocale } from '../app/composables/use-documentation-locale'
import { demoText } from './demo-i18n'
import DemoFeatureTabs from './DemoFeatureTabs.vue'
import DemoLibrarySidebar from './DemoLibrarySidebar.vue'
import DemoNowPlayingStage from './DemoNowPlayingStage.vue'
import DemoTransportBar from './DemoTransportBar.vue'
import { useGaudioDemo } from './use-gaudio-demo'

const { isChinese } = useDocumentationLocale()
const demo = useGaudioDemo()
// AI modified: Nuxt route locale now drives the same bilingual demo copy without a VitePress runtime.
const text = computed(() => demoText[isChinese.value ? 'zh' : 'en'])
</script>

<template>
  <div class="gaudio-studio not-prose w-full py-4">
    <p class="gaudio-studio__subtitle">
      {{ text.studio.subtitle }}
    </p>

    <div class="gaudio-studio__shell">
      <div
        class="gaudio-studio__backdrop"
        :style="{ backgroundImage: demo.activeCoverThumbUrl ? `url(${demo.activeCoverThumbUrl})` : 'none' }"
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
