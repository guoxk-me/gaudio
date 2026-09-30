<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { shallowRef } from 'vue'

const props = withDefaults(defineProps<{ code: string, label?: string, isChinese?: boolean }>(), { label: 'TypeScript', isChinese: false })
const copyStatus = shallowRef<'idle' | 'copied' | 'failed'>('idle')

async function copyCode(): Promise<void> {
  // AI modified: failed clipboard permissions produce feedback instead of a misleading success state.
  try {
    await navigator.clipboard.writeText(props.code)
    copyStatus.value = 'copied'
  }
  catch {
    copyStatus.value = 'failed'
  }
}
</script>

<template>
  <div class="prototype-code">
    <div class="prototype-code__bar">
      <span>{{ label }}</span>
      <button type="button" class="prototype-code__copy" :aria-label="isChinese ? '复制代码' : 'Copy code'" @click="copyCode">
        <Check v-if="copyStatus === 'copied'" :size="14" aria-hidden="true" />
        <Copy v-else :size="14" aria-hidden="true" />
        <span aria-live="polite">{{ copyStatus === 'copied' ? (isChinese ? '已复制' : 'Copied') : copyStatus === 'failed' ? (isChinese ? '请选择代码复制' : 'Select code to copy') : (isChinese ? '复制' : 'Copy') }}</span>
      </button>
    </div>
    <pre class="prototype-code__content" tabindex="0"><code>{{ code }}</code></pre>
  </div>
</template>

<style scoped>
.prototype-code { min-width: 0; overflow: hidden; border: 1px solid var(--border-default); border-radius: 12px; background: var(--surface-raised); }
.prototype-code__bar { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 1px solid var(--border-default); padding: 12px 18px; color: var(--text-secondary); font-family: var(--font-mono); font-size: 11px; }
.prototype-code__copy { display: flex; align-items: center; gap: 7px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.prototype-code__copy:hover { color: var(--brand-primary); }
.prototype-code__content { margin: 0; overflow: auto; padding: 24px; color: var(--text-primary); font-family: var(--font-mono); font-size: 12px; line-height: 1.85; tab-size: 2; }
</style>
