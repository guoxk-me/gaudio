<script setup lang="ts">
import { Pause, Play, SkipForward, Volume2 } from '@lucide/vue'

const props = defineProps<{
  isPlaying: boolean
  isBusy: boolean
  currentTime: number
  duration: number
  volume: number
  state: string
  title: string
  cover?: string
  canSkip?: boolean
  isChinese?: boolean
}>()

const emit = defineEmits<{ toggle: [], seek: [seconds: number], volume: [volume: number], next: [] }>()
const currentTimeLabel = computed(() => `${Math.floor(props.currentTime / 60)}:${String(Math.floor(props.currentTime % 60)).padStart(2, '0')}`)
const durationLabel = computed(() => `${Math.floor(props.duration / 60)}:${String(Math.floor(props.duration % 60)).padStart(2, '0')}`)

function seek(event: Event): void {
  emit('seek', Number((event.target as HTMLInputElement).value))
}

function changeVolume(event: Event): void {
  emit('volume', Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div class="prototype-transport">
    <div class="prototype-transport__track">
      <img v-if="cover" :src="cover" alt="" class="prototype-transport__cover" width="56" height="56">
      <div class="prototype-transport__identity">
        <span class="prototype-transport__title">{{ title }}</span>
        <span class="prototype-transport__state" role="status"><span :class="{ 'is-playing': isPlaying }" />{{ state }}</span>
      </div>
      <button type="button" class="prototype-transport__play" :disabled="isBusy" :aria-label="isPlaying ? (isChinese ? '暂停' : 'Pause') : (isChinese ? '播放' : 'Play')" @click="emit('toggle')">
        <Pause v-if="isPlaying" :size="19" fill="currentColor" aria-hidden="true" />
        <Play v-else :size="19" fill="currentColor" aria-hidden="true" />
      </button>
      <button v-if="canSkip" type="button" class="prototype-transport__skip" :disabled="isBusy" :aria-label="isChinese ? '下一首' : 'Next track'" @click="emit('next')">
        <SkipForward :size="18" aria-hidden="true" />
      </button>
    </div>
    <div class="prototype-transport__timeline">
      <span>{{ currentTimeLabel }}</span>
      <input class="prototype-transport__range" type="range" min="0" :max="duration || 1" step="0.1" :value="currentTime" :disabled="!duration || isBusy" :aria-label="isChinese ? '播放进度' : 'Playback position'" @change="seek">
      <span>{{ durationLabel }}</span>
    </div>
    <label class="prototype-transport__volume">
      <Volume2 :size="14" aria-hidden="true" />
      <span class="sr-only">{{ isChinese ? '音量' : 'Volume' }}</span>
      <input type="range" min="0" max="1" step="0.05" :value="volume" @input="changeVolume">
    </label>
  </div>
</template>

<style scoped>
.prototype-transport { padding: 24px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--surface-panel); }
.prototype-transport__track { display: flex; align-items: center; gap: 14px; }
.prototype-transport__cover { flex: none; border-radius: 9px; object-fit: cover; }
.prototype-transport__identity { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6px; }
.prototype-transport__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 550; }
.prototype-transport__state { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
.prototype-transport__state > span { width: 5px; height: 5px; border-radius: 50%; background: var(--text-secondary); }
.prototype-transport__state > .is-playing { background: var(--brand-primary); box-shadow: 0 0 8px var(--brand-primary); }
.prototype-transport__play { display: grid; place-items: center; flex: none; width: 42px; height: 42px; border: 0; border-radius: 50%; color: white; background: var(--brand-primary); cursor: pointer; }
.prototype-transport__skip { border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.prototype-transport__play:disabled, .prototype-transport__skip:disabled { opacity: .5; cursor: wait; }
.prototype-transport__timeline { display: flex; align-items: center; gap: 10px; margin-top: 24px; font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); }
.prototype-transport__range { width: 100%; min-width: 0; accent-color: var(--brand-primary); }
.prototype-transport__volume { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 14px; color: var(--text-secondary); }
.prototype-transport__volume input { width: 78px; accent-color: var(--brand-primary); }
</style>
