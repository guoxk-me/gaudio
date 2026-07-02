<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { demoCoverThumbUrl } from './demo-samples'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const {
  activeFormatFolder,
  demoFormatGroups,
  demoTracks,
  isActiveTrack,
  isBusy,
  selectFormat,
  selectTrack,
} = props.demo
</script>

<template>
  <aside role="region" class="flex h-full min-h-0 flex-col gap-3" :aria-label="text.catalog.ariaLabel">
    <!-- AI modified: compact format controls keep the library rail aligned with the player stage. -->
    <div class="gaudio-studio__library-heading">
      <div class="min-w-0">
        <p class="text-xs font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">
          {{ text.studio.library }}
        </p>
        <p class="truncate text-xs" style="color: var(--gaudio-studio-text-muted)">
          {{ text.studio.libraryHint }}
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <p class="text-[11px] font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">
        {{ text.catalog.format }}
      </p>
      <ToggleGroup
        type="single"
        variant="outline"
        class="gaudio-studio__format-grid"
        :aria-label="text.catalog.format"
        :model-value="activeFormatFolder"
        @update:model-value="(value) => {
          if (!value || typeof value !== 'string') return
          const formatGroup = demoFormatGroups.find(group => group.folder === value)
          if (formatGroup) selectFormat(formatGroup)
        }"
      >
        <ToggleGroupItem
          v-for="formatGroup in demoFormatGroups"
          :key="formatGroup.folder"
          :value="formatGroup.folder"
          class="gaudio-studio__format-item"
          :disabled="isBusy"
        >
          {{ formatGroup.label }}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>

    <p class="text-[11px] font-semibold tracking-wide uppercase" style="color: var(--gaudio-studio-text-muted)">
      {{ text.catalog.track }}
    </p>

    <ScrollArea class="min-h-[12rem] max-h-[15rem] pr-1 lg:max-h-[18rem]">
      <div class="flex flex-col gap-1">
        <button
          v-for="track in demoTracks"
          :key="track.id"
          type="button"
          class="gaudio-studio__track-btn"
          :data-active="isActiveTrack(track.id)"
          :disabled="isBusy"
          @click="selectTrack(track)"
        >
          <img
            :src="demoCoverThumbUrl(track.coverThumb)"
            :alt="`${track.title} cover`"
            class="size-10 shrink-0 rounded-md object-cover ring-1 ring-border"
            width="40"
            height="40"
            loading="lazy"
          >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium" style="color: var(--gaudio-studio-text)">{{ track.title }}</span>
            <span class="block truncate text-xs" style="color: var(--gaudio-studio-text-muted)">{{ track.artist }}</span>
          </span>
        </button>
      </div>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  </aside>
</template>
