<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import DemoCapabilities from './DemoCapabilities.vue'
import DemoStatus from './DemoStatus.vue'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const {
  activeSampleLabel,
  activeSamplePath,
  adaptiveQualityChoices,
  adaptiveQualitySelection,
  adaptiveVariants,
  adapterDiagnosticRows,
  applyAdaptiveQualitySelection,
  applyDashSettingsUpdate,
  applyHlsConfigUpdate,
  browserSupportRows,
  isBusy,
  isLooping,
  loadSource,
  mediaSessionStatus,
  playlistStatus,
  preload,
  protocolOverride,
  runAnalyzerPreview,
  runErrorPreview,
  runEventEmitterPreview,
  runPlaylistPreview,
  selectAdaptiveQuality,
  setAutoplay,
  setLoop,
  setPreload,
  setPreservesPitch,
  shouldAutoplay,
  shouldPreservePitch,
  sourceLifecycleLabel,
  sourceMode,
  sourceUrl,
} = props.demo

const demo = props.demo

const hasAdaptiveVariants = computed(() => adaptiveVariants.value.length > 0)
const adaptiveVariantSummary = computed(() => (
  hasAdaptiveVariants.value
    ? adaptiveVariants.value.map(variant => `${Math.round(variant.bitrate / 1000)} kbps`).join(' / ')
    : props.text.adaptiveQuality.waiting
))

const protocolOptions = [
  { value: 'auto', label: 'auto' },
  { value: 'media', label: 'media' },
  { value: 'hls', label: 'HLS' },
  { value: 'dash', label: 'DASH' },
]

const preloadOptions = [
  { value: 'none', label: 'none' },
  { value: 'metadata', label: 'metadata' },
  { value: 'auto', label: 'auto' },
]

const sourceModeOptions = computed(() => [
  { value: 'url-string', label: props.text.controls.sourceModes.urlString },
  { value: 'source-description', label: props.text.controls.sourceModes.sourceDescription },
  { value: 'http-source', label: props.text.controls.sourceModes.httpSource },
  { value: 'blob-source', label: props.text.controls.sourceModes.blobSource },
  { value: 'custom-source', label: props.text.controls.sourceModes.customSource },
])

const qualityOptions = computed(() => adaptiveQualityChoices.value.map(qualityChoice => ({
  value: qualityChoice.id,
  label: qualityChoice.id === 'auto' ? props.text.controls.automaticQuality : qualityChoice.label,
})))

function updateLoop(checked: boolean | 'indeterminate'): void {
  isLooping.value = checked === true
  setLoop()
}

function updateAutoplay(checked: boolean | 'indeterminate'): void {
  shouldAutoplay.value = checked === true
  setAutoplay()
}

function updatePreservePitch(checked: boolean | 'indeterminate'): void {
  shouldPreservePitch.value = checked === true
  setPreservesPitch()
}
</script>

<template>
  <section class="gaudio-studio__features" :aria-label="text.studio.featureDeck">
    <!-- AI modified: API controls now share the studio grid instead of rendering as a detached card. -->
    <Tabs default-value="source" class="gap-3">
      <TabsList class="gaudio-studio__feature-tabs">
        <TabsTrigger value="source" class="flex-none text-xs sm:text-sm">
          {{ text.studio.tabs.source }}
        </TabsTrigger>
        <TabsTrigger value="playlist" class="flex-none text-xs sm:text-sm">
          {{ text.studio.tabs.playlist }}
        </TabsTrigger>
        <TabsTrigger value="adaptive" class="flex-none text-xs sm:text-sm">
          {{ text.studio.tabs.adaptive }}
        </TabsTrigger>
        <TabsTrigger value="live" class="flex-none text-xs sm:text-sm">
          {{ text.studio.tabs.live }}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="source" role="region" aria-label="Source" class="gaudio-studio__panel gaudio-studio__source-panel mt-0">
        <div class="gaudio-studio__source-summary">
          <div class="min-w-0">
            <strong class="block truncate text-sm" style="color: var(--gaudio-studio-text)">{{ activeSampleLabel }}</strong>
            <code class="block truncate text-[11px]" style="color: var(--gaudio-studio-text-muted)">{{ activeSamplePath }}</code>
          </div>
        </div>

        <div class="gaudio-studio__field-grid">
          <div class="gaudio-studio__field gaudio-studio__field--wide">
            <Label for="source-url" style="color: var(--gaudio-studio-text)">{{ text.controls.sourceUrl }}</Label>
            <Input id="source-url" v-model="sourceUrl" type="url" autocomplete="off" />
          </div>

          <div class="gaudio-studio__field">
            <Label style="color: var(--gaudio-studio-text)">{{ text.controls.protocol }}</Label>
            <Select v-model="protocolOverride">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="option in protocolOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="gaudio-studio__field">
            <Label style="color: var(--gaudio-studio-text)">{{ text.controls.sourceMode }}</Label>
            <Select v-model="sourceMode">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="option in sourceModeOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="gaudio-studio__field">
            <Label style="color: var(--gaudio-studio-text)">{{ text.controls.quality }}</Label>
            <Select v-model="adaptiveQualitySelection" :disabled="isBusy" @update:model-value="applyAdaptiveQualitySelection">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="option in qualityOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="gaudio-studio__field">
            <Label style="color: var(--gaudio-studio-text)">{{ text.controls.preload }}</Label>
            <Select v-model="preload" @update:model-value="setPreload">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="option in preloadOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="gaudio-studio__option-strip">
            <div class="gaudio-studio__option-toggle">
              <Checkbox id="studio-loop" :checked="isLooping" @update:checked="updateLoop" />
              <Label for="studio-loop" class="text-sm" style="color: var(--gaudio-studio-text)">{{ text.controls.loop }}</Label>
            </div>
            <div class="gaudio-studio__option-toggle">
              <Checkbox id="studio-autoplay" :checked="shouldAutoplay" @update:checked="updateAutoplay" />
              <Label for="studio-autoplay" class="text-sm" style="color: var(--gaudio-studio-text)">{{ text.controls.autoplay }}</Label>
            </div>
            <div class="gaudio-studio__option-toggle">
              <Checkbox id="studio-pitch" :checked="shouldPreservePitch" @update:checked="updatePreservePitch" />
              <Label for="studio-pitch" class="text-sm" style="color: var(--gaudio-studio-text)">{{ text.controls.preservePitch }}</Label>
            </div>
          </div>

          <div class="gaudio-studio__panel-actions">
            <Button class="gaudio-studio__load-button" :disabled="isBusy" @click="loadSource">
              {{ text.controls.loadUrl }}
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="playlist" class="gaudio-studio__panel gaudio-studio__panel-scroll mt-0">
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="gaudio-studio__stat-card">
            <span class="text-xs font-semibold uppercase" style="color: var(--gaudio-studio-text-muted)">{{ text.capabilities.playlist }}</span>
            <p class="text-sm" style="color: var(--gaudio-studio-text)">
              {{ playlistStatus }}
            </p>
          </div>
          <div class="gaudio-studio__stat-card">
            <span class="text-xs font-semibold uppercase" style="color: var(--gaudio-studio-text-muted)">{{ text.capabilities.mediaSession }}</span>
            <p class="text-sm" style="color: var(--gaudio-studio-text)">
              {{ mediaSessionStatus }}
            </p>
          </div>
          <div class="gaudio-studio__stat-card">
            <span class="text-xs font-semibold uppercase" style="color: var(--gaudio-studio-text-muted)">{{ text.capabilities.sourceLifecycle }}</span>
            <p class="text-sm" style="color: var(--gaudio-studio-text)">
              {{ sourceLifecycleLabel }}
            </p>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
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
      </TabsContent>

      <TabsContent value="adaptive" role="region" aria-label="Adaptive" class="gaudio-studio__panel gaudio-studio__panel-scroll mt-0 flex flex-col gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          class="gaudio-studio__segmented flex flex-wrap justify-start"
          :model-value="adaptiveQualitySelection"
          @update:model-value="(value) => value && typeof value === 'string' && selectAdaptiveQuality(value)"
        >
          <ToggleGroupItem
            v-for="qualityChoice in adaptiveQualityChoices"
            :key="qualityChoice.id"
            :value="qualityChoice.id"
            class="text-xs"
            :disabled="isBusy || (!hasAdaptiveVariants && qualityChoice.id !== 'auto')"
          >
            {{ qualityChoice.id === 'auto' ? text.controls.automaticQuality : qualityChoice.label }}
          </ToggleGroupItem>
        </ToggleGroup>

        <p class="font-mono text-xs" style="color: var(--gaudio-studio-text-muted)">
          {{ text.adaptiveQuality.variants }}: {{ adaptiveVariantSummary }}
        </p>

        <div class="grid gap-2 sm:grid-cols-2">
          <div v-for="row in browserSupportRows" :key="row.mimeType" class="gaudio-studio__stat-card">
            <p class="text-sm font-medium" style="color: var(--gaudio-studio-text)">
              {{ row.label }}
            </p>
            <p class="text-xs" style="color: var(--gaudio-studio-text-muted)">
              {{ row.support }} · {{ row.mimeType }}
            </p>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <div v-for="row in adapterDiagnosticRows" :key="row.label" class="gaudio-studio__stat-card">
            <p class="text-xs uppercase" style="color: var(--gaudio-studio-text-muted)">
              {{ row.label }}
            </p>
            <p class="font-mono text-xs" style="color: var(--gaudio-studio-text)">
              {{ row.value }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" class="gaudio-studio__action-button" :disabled="isBusy" @click="applyHlsConfigUpdate">
            {{ text.capabilities.updateHls }}
          </Button>
          <Button variant="outline" size="sm" class="gaudio-studio__action-button" :disabled="isBusy" @click="applyDashSettingsUpdate">
            {{ text.capabilities.updateDash }}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="live" role="region" :aria-label="text.status.ariaLabel" class="gaudio-studio__panel gaudio-studio__panel-scroll mt-0">
        <Tabs default-value="status" class="gap-2">
          <TabsList class="gaudio-studio__segmented h-auto flex-wrap justify-start">
            <TabsTrigger value="status" class="flex-none text-xs sm:text-sm">
              {{ text.panels.statusTab }}
            </TabsTrigger>
            <TabsTrigger value="events" class="flex-none text-xs sm:text-sm">
              {{ text.panels.eventsTab }}
            </TabsTrigger>
            <TabsTrigger value="api" class="flex-none text-xs sm:text-sm">
              {{ text.panels.apiTab }}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="status">
            <DemoStatus :demo="demo" :text="text" />
          </TabsContent>
          <TabsContent value="events">
            <DemoStatus :demo="demo" :text="text" events-only />
          </TabsContent>
          <TabsContent value="api">
            <DemoCapabilities :demo="demo" :text="text" />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  </section>
</template>
