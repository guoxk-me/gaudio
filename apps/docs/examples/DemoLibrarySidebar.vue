<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { demoCoverThumbUrl } from './demo-samples'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()
const publicAssetBase = useRuntimeConfig().app.baseURL

const {
  activeFormatFolder,
  demoFormatGroups,
  demoTracks,
  isActiveFormat,
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
      >
        <!-- AI modified: direct activation lets an already-selected format retry a failed source. -->
        <ToggleGroupItem
          v-for="formatGroup in demoFormatGroups"
          :key="formatGroup.folder"
          :value="formatGroup.folder"
          class="gaudio-studio__format-item"
          :disabled="isBusy"
          :aria-pressed="isActiveFormat(formatGroup.folder)"
          @click="selectFormat(formatGroup)"
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
          :aria-current="isActiveTrack(track.id) ? 'true' : undefined"
          :disabled="isBusy"
          @click="selectTrack(track)"
        >
          <!-- AI modified: the adjacent track title names this decorative cover for assistive technology. -->
          <img
            :src="demoCoverThumbUrl(publicAssetBase, track.coverThumb)"
            alt=""
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
      <!-- AI modified: the shared ScrollArea owns the single vertical scrollbar. -->
    </ScrollArea>
  </aside>
</template>
