<script setup lang="ts">
import type { GaudioDemo } from './use-gaudio-demo'

const props = defineProps<{
  demo: GaudioDemo
}>()

const {
  activeFormatGroup,
  activeSamplePath,
  activeTrack,
  demoFormatGroups,
  demoTracks,
  isActiveFormat,
  isActiveTrack,
  isBusy,
  nextTrack,
  prevTrack,
  selectFormat,
  selectTrack,
} = props.demo
</script>

<template>
  <section class="catalog" aria-label="Local sample catalog">
    <div class="catalog__header">
      <div>
        <p class="catalog__eyebrow">
          Bundled sample
        </p>
        <h2>{{ activeTrack.title }}</h2>
        <p class="catalog__meta">
          {{ activeTrack.artist }} · {{ activeFormatGroup.label }} · {{ activeFormatGroup.mimeType }}
        </p>
      </div>
      <div class="catalog__navigation">
        <button type="button" :disabled="isBusy" @click="prevTrack">
          Previous
        </button>
        <button type="button" :disabled="isBusy" @click="nextTrack">
          Next
        </button>
      </div>
    </div>

    <p class="catalog__label">
      Format
    </p>
    <div class="catalog__formats" role="tablist" aria-label="Audio format">
      <button
        v-for="formatGroup in demoFormatGroups"
        :key="formatGroup.folder"
        type="button"
        role="tab"
        :aria-selected="isActiveFormat(formatGroup.folder)"
        :class="{ 'catalog__choice--active': isActiveFormat(formatGroup.folder) }"
        :disabled="isBusy"
        @click="selectFormat(formatGroup)"
      >
        {{ formatGroup.label }}
        <small>{{ formatGroup.extension }}</small>
      </button>
    </div>

    <p class="catalog__label">
      Track
    </p>
    <div class="catalog__tracks">
      <button
        v-for="track in demoTracks"
        :key="track.id"
        type="button"
        :class="{ 'catalog__choice--active': isActiveTrack(track.id) }"
        :disabled="isBusy"
        @click="selectTrack(track)"
      >
        <strong>{{ track.title }}</strong>
        <small>{{ track.artist }}</small>
      </button>
    </div>

    <code class="catalog__path">{{ activeSamplePath }}</code>
  </section>
</template>

<style scoped>
.catalog {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 18px;
  background: var(--vp-c-bg-soft);
}

.catalog__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}

.catalog__header h2,
.catalog__meta,
.catalog__eyebrow,
.catalog__label {
  margin: 0;
}

.catalog__eyebrow,
.catalog__label {
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.catalog__meta {
  color: var(--vp-c-text-2);
}

.catalog__navigation,
.catalog__formats,
.catalog__tracks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.catalog__label {
  margin-top: 16px;
  margin-bottom: 8px;
}

.catalog button {
  display: grid;
  gap: 2px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.catalog button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.catalog__choice--active {
  border-color: var(--vp-c-brand-1) !important;
  color: var(--vp-c-brand-1) !important;
}

.catalog__path {
  display: block;
  margin-top: 16px;
  overflow-wrap: anywhere;
}
</style>
