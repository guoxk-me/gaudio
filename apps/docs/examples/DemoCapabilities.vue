<script setup lang="ts">
import type { DemoText } from './demo-i18n'
import type { GaudioDemo } from './use-gaudio-demo'
import { computed } from 'vue'

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
  frequencyPreview,
  isBusy,
  runAnalyzerPreview,
  runEventEmitterPreview,
  sourceLifecycleLabel,
  waveformPreview,
} = props.demo

const capabilityRows = computed(() => props.text.capabilities.apiCoverage)
</script>

<template>
  <section class="capabilities" :aria-label="text.capabilities.ariaLabel">
    <h2>{{ text.capabilities.title }}</h2>

    <div class="capabilities__layout">
      <table class="capabilities__table">
        <thead>
          <tr>
            <th>{{ text.capabilities.api }}</th>
            <th>{{ text.capabilities.demoSurface }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[api, demoSurface] in capabilityRows" :key="api">
            <td>{{ api }}</td>
            <td>{{ demoSurface }}</td>
          </tr>
        </tbody>
      </table>

      <div class="capabilities__panels">
        <article class="capabilities__panel">
          <h3>{{ text.capabilities.browserSupport }}</h3>
          <dl>
            <template v-for="browserSupportRow in browserSupportRows" :key="browserSupportRow.mimeType">
              <dt>{{ browserSupportRow.label }}</dt>
              <dd>
                <span>{{ browserSupportRow.support }}</span>
                <small>{{ browserSupportRow.mimeType }}</small>
              </dd>
            </template>
          </dl>
        </article>

        <article class="capabilities__panel">
          <h3>{{ text.capabilities.adapterDiagnostics }}</h3>
          <dl>
            <template v-for="adapterDiagnosticRow in adapterDiagnosticRows" :key="adapterDiagnosticRow.label">
              <dt>{{ adapterDiagnosticRow.label }}</dt>
              <dd>{{ adapterDiagnosticRow.value }}</dd>
            </template>
          </dl>
          <div class="capabilities__actions">
            <button type="button" :disabled="isBusy" @click="applyHlsConfigUpdate">
              {{ text.capabilities.updateHls }}
            </button>
            <button type="button" :disabled="isBusy" @click="applyDashSettingsUpdate">
              {{ text.capabilities.updateDash }}
            </button>
          </div>
        </article>

        <article class="capabilities__panel">
          <h3>{{ text.capabilities.utilityDemos }}</h3>
          <dl>
            <dt>{{ text.capabilities.sourceLifecycle }}</dt>
            <dd>{{ sourceLifecycleLabel }}</dd>
            <dt>{{ text.capabilities.analyzer }}</dt>
            <dd>{{ analyzerStatus }}</dd>
            <dt>{{ text.capabilities.frequency }}</dt>
            <dd>{{ frequencyPreview }}</dd>
            <dt>{{ text.capabilities.waveform }}</dt>
            <dd>{{ waveformPreview }}</dd>
            <dt>{{ text.capabilities.eventEmitter }}</dt>
            <dd>{{ eventEmitterStatus }}</dd>
          </dl>
          <div class="capabilities__actions">
            <button type="button" :disabled="isBusy" @click="runAnalyzerPreview">
              {{ text.capabilities.runAnalyzer }}
            </button>
            <button type="button" @click="runEventEmitterPreview">
              {{ text.capabilities.runEventEmitter }}
            </button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.capabilities {
  margin-top: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 18px;
  background: var(--vp-c-bg-soft);
}

.capabilities h2,
.capabilities h3 {
  margin-top: 0;
}

.capabilities__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  gap: 16px;
  align-items: start;
}

.capabilities__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.capabilities__table th,
.capabilities__table td {
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 10px 8px;
  text-align: left;
  vertical-align: top;
}

.capabilities__table td:first-child {
  width: 180px;
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
  font-weight: 700;
}

.capabilities__panels {
  display: grid;
  gap: 12px;
}

.capabilities__panel {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 14px;
  background: var(--vp-c-bg);
}

.capabilities__panel dl {
  display: grid;
  grid-template-columns: minmax(96px, 0.8fr) minmax(0, 1.2fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 13px;
}

.capabilities__panel dt {
  color: var(--vp-c-text-2);
  font-weight: 700;
}

.capabilities__panel dd {
  display: grid;
  gap: 2px;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.capabilities__panel small {
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.capabilities__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.capabilities__actions button {
  border: 0;
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--vp-c-brand-1);
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.capabilities__actions button:disabled {
  cursor: wait;
  opacity: 0.6;
}

@media (max-width: 900px) {
  .capabilities__layout {
    grid-template-columns: 1fr;
  }
}
</style>
