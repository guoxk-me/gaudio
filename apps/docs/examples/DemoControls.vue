<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'

const props = defineProps<{
  demo: GaudioDemo
  text: DemoText
}>()

const {
  activeSampleLabel,
  adaptiveQualityChoices,
  adaptiveQualitySelection,
  applyAdaptiveQualitySelection,
  isBusy,
  isLooping,
  loadSource,
  playerState,
  preload,
  protocolOverride,
  setAutoplay,
  setLoop,
  setPreload,
  setPreservesPitch,
  shouldAutoplay,
  shouldPreservePitch,
  sourceMode,
  sourceUrl,
} = props.demo
</script>

<template>
  <section class="controls" :aria-label="text.controls.ariaLabel">
    <header class="controls__summary">
      <strong>{{ activeSampleLabel }}</strong>
      <span>{{ playerState }}</span>
    </header>

    <label class="controls__field controls__field--source">
      <span>{{ text.controls.sourceUrl }}</span>
      <input v-model="sourceUrl" type="url" autocomplete="off">
    </label>

    <label class="controls__field">
      <span>{{ text.controls.protocol }}</span>
      <span class="controls__select-shell">
        <select v-model="protocolOverride">
          <option value="auto">auto</option>
          <option value="media">media</option>
          <option value="hls">HLS</option>
          <option value="dash">DASH</option>
        </select>
      </span>
    </label>

    <label class="controls__field">
      <span>{{ text.controls.sourceMode }}</span>
      <span class="controls__select-shell">
        <select v-model="sourceMode">
          <option value="url-string">{{ text.controls.sourceModes.urlString }}</option>
          <option value="source-description">{{ text.controls.sourceModes.sourceDescription }}</option>
          <option value="http-source">{{ text.controls.sourceModes.httpSource }}</option>
          <option value="blob-source">{{ text.controls.sourceModes.blobSource }}</option>
          <option value="custom-source">{{ text.controls.sourceModes.customSource }}</option>
        </select>
      </span>
    </label>

    <label class="controls__field">
      <span>{{ text.controls.quality }}</span>
      <span class="controls__select-shell">
        <select v-model="adaptiveQualitySelection" :disabled="isBusy" @change="applyAdaptiveQualitySelection">
          <option v-for="qualityChoice in adaptiveQualityChoices" :key="qualityChoice.id" :value="qualityChoice.id">
            {{ qualityChoice.id === 'auto' ? text.controls.automaticQuality : qualityChoice.label }}
          </option>
        </select>
      </span>
    </label>

    <label class="controls__field">
      <span>{{ text.controls.preload }}</span>
      <span class="controls__select-shell">
        <select v-model="preload" @change="setPreload">
          <option value="none">none</option>
          <option value="metadata">metadata</option>
          <option value="auto">auto</option>
        </select>
      </span>
    </label>

    <div class="controls__options">
      <!-- AI modified: custom control shells avoid browser-default form styling in the demo console. -->
      <label class="controls__check">
        <input v-model="isLooping" type="checkbox" @change="setLoop">
        <span class="controls__checkmark" aria-hidden="true" />
        <span>{{ text.controls.loop }}</span>
      </label>
      <label class="controls__check">
        <input v-model="shouldAutoplay" type="checkbox" @change="setAutoplay">
        <span class="controls__checkmark" aria-hidden="true" />
        <span>{{ text.controls.autoplay }}</span>
      </label>
      <label class="controls__check">
        <input v-model="shouldPreservePitch" type="checkbox" @change="setPreservesPitch">
        <span class="controls__checkmark" aria-hidden="true" />
        <span>{{ text.controls.preservePitch }}</span>
      </label>
    </div>

    <div class="controls__actions">
      <button type="button" :disabled="isBusy" @click="loadSource">
        {{ text.controls.loadUrl }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.controls {
  display: grid;
  grid-template-columns: minmax(260px, 1.8fr) repeat(4, minmax(124px, 0.9fr)) minmax(132px, auto);
  gap: 14px;
  align-items: end;
  border: 1px solid var(--demo-border);
  border-radius: 8px;
  padding: clamp(14px, 1.8vw, 18px);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 34%),
    var(--demo-panel);
  color: var(--demo-text);
}

.controls :focus-visible {
  outline: 2px solid var(--demo-focus);
  outline-offset: 2px;
}

.controls__summary,
.controls__actions,
.controls__options {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.controls__summary {
  justify-content: space-between;
  border-bottom: 1px solid var(--demo-line);
  padding-bottom: 12px;
  align-items: center;
}

.controls__summary strong {
  font-size: clamp(16px, 1.8vw, 21px);
  line-height: 1.25;
}

.controls__summary span {
  color: var(--demo-green);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.controls__field {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: var(--demo-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.controls__field--source {
  grid-column: span 2;
}

.controls input[type="url"],
.controls select {
  width: 100%;
  min-height: 40px;
  border: 0;
  border-radius: 7px;
  padding: 0 12px;
  background: transparent;
  color: var(--demo-text);
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}

.controls input[type="url"] {
  border: 1px solid rgba(202, 183, 143, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent),
    var(--demo-input-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    0 0 0 1px rgba(0, 0, 0, 0.08);
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.controls input[type="url"]:hover,
.controls input[type="url"]:focus {
  border-color: rgba(245, 189, 100, 0.34);
  background: var(--demo-input-bg-hover);
}

.controls__select-shell {
  position: relative;
  display: grid;
  align-items: center;
  min-width: 0;
  border: 1px solid rgba(202, 183, 143, 0.18);
  border-radius: 7px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), transparent),
    var(--demo-input-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    0 0 0 1px rgba(0, 0, 0, 0.08);
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.controls__select-shell::after {
  position: absolute;
  right: 12px;
  width: 7px;
  height: 7px;
  border-right: 1.5px solid var(--demo-muted);
  border-bottom: 1.5px solid var(--demo-muted);
  content: "";
  pointer-events: none;
  transform: translateY(-2px) rotate(45deg);
}

.controls__select-shell:hover,
.controls__select-shell:focus-within {
  border-color: rgba(245, 189, 100, 0.34);
  background: var(--demo-input-bg-hover);
}

.controls__select-shell select {
  appearance: none;
  padding-right: 34px;
  cursor: pointer;
}

.controls__select-shell select:disabled {
  cursor: wait;
  opacity: 0.58;
}

.controls__options {
  grid-column: 1 / span 4;
  justify-content: flex-start;
  align-items: center;
  min-height: 40px;
}

.controls button {
  border: 1px solid rgba(245, 189, 100, 0.4);
  border-radius: 7px;
  min-height: 40px;
  padding: 0 20px;
  background:
    linear-gradient(180deg, rgba(245, 189, 100, 0.24), rgba(224, 162, 74, 0.14)),
    rgba(224, 162, 74, 0.08);
  color: var(--demo-amber-strong);
  font: inherit;
  font-size: 14px;
  font-weight: 760;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 10px 28px rgba(0, 0, 0, 0.12);
  transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
}

.controls button:hover:not(:disabled) {
  border-color: rgba(245, 189, 100, 0.72);
  background:
    linear-gradient(180deg, rgba(245, 189, 100, 0.34), rgba(224, 162, 74, 0.2)),
    rgba(224, 162, 74, 0.12);
  transform: translateY(-1px);
}

.controls button:active:not(:disabled) {
  transform: translateY(0);
}

.controls button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.controls__actions {
  grid-column: 5 / -1;
  justify-content: flex-end;
}

.controls__check {
  position: relative;
  display: flex;
  gap: 8px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 6px 8px 6px 6px;
  color: var(--demo-muted);
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
}

.controls__check:hover {
  border-color: rgba(202, 183, 143, 0.13);
  background: rgba(255, 255, 255, 0.028);
  color: var(--demo-text);
}

.controls__check input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.controls__checkmark {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(202, 183, 143, 0.32);
  border-radius: 5px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent),
    var(--demo-input-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.controls__checkmark::after {
  width: 8px;
  height: 4px;
  border-bottom: 2px solid var(--demo-check-icon);
  border-left: 2px solid var(--demo-check-icon);
  content: "";
  opacity: 0;
  transform: translateY(-1px) rotate(-45deg);
}

.controls__check input:checked + .controls__checkmark {
  border-color: rgba(245, 189, 100, 0.82);
  background: linear-gradient(180deg, var(--demo-amber-strong), var(--demo-amber));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    0 0 0 3px rgba(224, 162, 74, 0.14);
}

.controls__check input:checked + .controls__checkmark::after {
  opacity: 1;
}

.controls__check input:focus-visible + .controls__checkmark {
  outline: 2px solid var(--demo-focus);
  outline-offset: 2px;
}

@media (max-width: 1180px) {
  .controls {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .controls__summary,
  .controls__options {
    grid-column: 1 / -1;
  }

  .controls__field--source {
    grid-column: 1 / -1;
  }

  .controls__actions {
    grid-column: 3;
  }
}

@media (max-width: 760px) {
  .controls {
    grid-template-columns: 1fr;
  }

  .controls__summary,
  .controls__options,
  .controls__actions,
  .controls__field--source {
    grid-column: auto;
  }

  .controls__summary {
    align-items: flex-start;
  }

  /* AI modified: stack controls before they become cramped on phone widths. */
  .controls__actions {
    justify-content: stretch;
  }

  .controls button {
    width: 100%;
  }
}

@media (max-width: 460px) {
  .controls__options {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
