<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const {
  adapterDiagnosticRows,
  analyzerStatus,
  applyDashSettingsUpdate,
  applyHlsConfigUpdate,
  browserSupportRows,
  eventEmitterStatus,
  errorPreviewStatus,
  frequencyPreview,
  isBusy,
  mediaSessionStatus,
  playlistStatus,
  runAnalyzerPreview,
  runErrorPreview,
  runEventEmitterPreview,
  runPlaylistPreview,
  sourceLifecycleLabel,
  waveformPreview,
} = props.demo

const capabilityRows = computed(() => props.text.capabilities.apiCoverage)
</script>

<template>
  <section :aria-label="text.capabilities.ariaLabel" class="flex flex-col gap-4">
    <div class="gaudio-studio__surface overflow-x-auto rounded-lg">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead style="background: var(--gaudio-studio-muted)">
          <tr>
            <th class="px-3 py-2 text-xs font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">
              {{ text.capabilities.api }}
            </th>
            <th class="px-3 py-2 text-xs font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">
              {{ text.capabilities.demoSurface }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[api, demoSurface] in capabilityRows" :key="api" class="border-t border-border">
            <td class="px-3 py-3 font-mono text-xs font-semibold">{{ api }}</td>
            <td class="px-3 py-3" style="color: var(--gaudio-studio-text-muted)">{{ demoSurface }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <Card class="gaudio-studio__surface">
        <CardHeader>
          <CardTitle class="text-base">
            {{ text.capabilities.browserSupport }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl class="grid gap-3 text-sm">
            <template v-for="browserSupportRow in browserSupportRows" :key="browserSupportRow.mimeType">
              <div class="grid gap-1">
                <dt class="text-muted-foreground font-medium">{{ browserSupportRow.label }}</dt>
                <dd>
                  <span>{{ browserSupportRow.support }}</span>
                  <small class="text-muted-foreground block font-mono text-xs">{{ browserSupportRow.mimeType }}</small>
                </dd>
              </div>
            </template>
          </dl>
        </CardContent>
      </Card>

      <Card class="gaudio-studio__surface">
        <CardHeader>
          <CardTitle class="text-base">
            {{ text.capabilities.adapterDiagnostics }}
          </CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <dl class="grid gap-3 text-sm">
            <template v-for="adapterDiagnosticRow in adapterDiagnosticRows" :key="adapterDiagnosticRow.label">
              <div class="grid gap-1">
                <dt class="text-muted-foreground font-medium">{{ adapterDiagnosticRow.label }}</dt>
                <dd>{{ adapterDiagnosticRow.value }}</dd>
              </div>
            </template>
          </dl>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" class="gaudio-studio__action-button" :disabled="isBusy" @click="applyHlsConfigUpdate">
              {{ text.capabilities.updateHls }}
            </Button>
            <Button variant="outline" size="sm" class="gaudio-studio__action-button" :disabled="isBusy" @click="applyDashSettingsUpdate">
              {{ text.capabilities.updateDash }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card class="gaudio-studio__surface lg:col-span-2">
        <CardHeader>
          <CardTitle class="text-base">
            {{ text.capabilities.utilityDemos }}
          </CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <dl class="grid gap-3 text-sm md:grid-cols-2">
            <div class="grid gap-1">
              <dt class="text-muted-foreground font-medium">{{ text.capabilities.sourceLifecycle }}</dt>
              <dd>{{ sourceLifecycleLabel }}</dd>
            </div>
            <div class="grid gap-1">
              <dt class="text-muted-foreground font-medium">{{ text.capabilities.playlist }}</dt>
              <dd>{{ playlistStatus }}</dd>
            </div>
            <div class="grid gap-1">
              <dt class="text-muted-foreground font-medium">{{ text.capabilities.mediaSession }}</dt>
              <dd>{{ mediaSessionStatus }}</dd>
            </div>
            <div class="grid gap-1">
              <dt class="text-muted-foreground font-medium">{{ text.capabilities.analyzer }}</dt>
              <dd>{{ analyzerStatus }}</dd>
            </div>
            <div class="grid gap-1">
              <dt class="text-muted-foreground font-medium">{{ text.capabilities.frequency }}</dt>
              <dd>{{ frequencyPreview }}</dd>
            </div>
            <div class="grid gap-1">
              <dt class="text-muted-foreground font-medium">{{ text.capabilities.waveform }}</dt>
              <dd>{{ waveformPreview }}</dd>
            </div>
            <div class="grid gap-1">
              <dt class="text-muted-foreground font-medium">{{ text.capabilities.eventEmitter }}</dt>
              <dd>{{ eventEmitterStatus }}</dd>
            </div>
            <div class="grid gap-1">
              <dt class="text-muted-foreground font-medium">{{ text.capabilities.error }}</dt>
              <dd>{{ errorPreviewStatus }}</dd>
            </div>
          </dl>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" class="gaudio-studio__action-button" :disabled="isBusy" @click="runPlaylistPreview">
              {{ text.capabilities.runPlaylist }}
            </Button>
            <Button variant="outline" size="sm" class="gaudio-studio__action-button" :disabled="isBusy" @click="runAnalyzerPreview">
              {{ text.capabilities.runAnalyzer }}
            </Button>
            <Button variant="outline" size="sm" class="gaudio-studio__action-button" @click="runEventEmitterPreview">
              {{ text.capabilities.runEventEmitter }}
            </Button>
            <Button variant="outline" size="sm" class="gaudio-studio__action-button" @click="runErrorPreview">
              {{ text.capabilities.runError }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
