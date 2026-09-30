<script setup lang="ts">
import { ArrowRight, Check, Copy, Terminal } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'
type CopyTarget = 'install' | 'code'

const { isChinese } = useDocumentationLocale()
const packageManagers: readonly PackageManager[] = ['pnpm', 'npm', 'yarn', 'bun']
const installCommands: Record<PackageManager, string> = {
  pnpm: 'pnpm add gaudio@next',
  npm: 'npm install gaudio@next',
  yarn: 'yarn add gaudio@next',
  bun: 'bun add gaudio@next',
}
const exampleCode = `import { AudioPlayer } from 'gaudio'

const player = new AudioPlayer({
  source: '/audio/mp3/aurora-loop.mp3',
})

await player.load()
await player.play()`
const selectedPackageManager = shallowRef<PackageManager>('pnpm')
const copyStatus = shallowRef<{ target: CopyTarget, succeeded: boolean }>()
let copyStatusTimer: ReturnType<typeof setTimeout> | undefined

const installCommand = computed(() => installCommands[selectedPackageManager.value])

async function copyText(target: CopyTarget, content: string): Promise<void> {
  clearTimeout(copyStatusTimer)
  try {
    await navigator.clipboard.writeText(content)
    copyStatus.value = { target, succeeded: true }
  }
  catch {
    copyStatus.value = { target, succeeded: false }
  }
  copyStatusTimer = setTimeout(() => {
    copyStatus.value = undefined
  }, 1800)
}

function copyLabel(target: CopyTarget): string {
  if (copyStatus.value?.target !== target) {
    return isChinese.value ? '复制' : 'Copy'
  }
  if (!copyStatus.value.succeeded) {
    return isChinese.value ? '复制失败' : 'Copy failed'
  }
  return isChinese.value ? '已复制' : 'Copied'
}

onMounted(() => {
  const savedPackageManager = localStorage.getItem('gaudio-package-manager')
  if (packageManagers.includes(savedPackageManager as PackageManager)) {
    selectedPackageManager.value = savedPackageManager as PackageManager
  }
})

watch(selectedPackageManager, (packageManager) => {
  if (import.meta.client) {
    localStorage.setItem('gaudio-package-manager', packageManager)
  }
})

onBeforeUnmount(() => clearTimeout(copyStatusTimer))
</script>

<template>
  <section id="quick-start" class="home-wireframe-quick-start" aria-labelledby="quick-start-title">
    <div class="home-wireframe-quick-start__panel">
      <header class="home-wireframe-quick-start__header">
        <div>
          <Terminal :size="16" aria-hidden="true" />
          <h2 id="quick-start-title">
            {{ isChinese ? '快速开始' : 'Quick start' }}
          </h2>
        </div>
        <code>~5 min</code>
      </header>

      <div class="home-wireframe-quick-start__body">
        <div class="home-wireframe-quick-start__install">
          <div class="home-wireframe-package-tabs" role="tablist" :aria-label="isChinese ? '包管理器' : 'Package manager'">
            <button
              v-for="packageManager in packageManagers"
              :key="packageManager"
              type="button"
              role="tab"
              :aria-selected="selectedPackageManager === packageManager"
              :class="{ 'is-active': selectedPackageManager === packageManager }"
              @click="selectedPackageManager = packageManager"
            >
              {{ packageManager }}
            </button>
          </div>
          <div class="home-wireframe-install-command">
            <code><b>›</b>{{ installCommand }}</code>
            <button type="button" :aria-label="`${copyLabel('install')}: ${installCommand}`" @click="copyText('install', installCommand)">
              <Check v-if="copyStatus?.target === 'install' && copyStatus.succeeded" :size="14" aria-hidden="true" />
              <Copy v-else :size="14" aria-hidden="true" />
              {{ copyLabel('install') }}
            </button>
          </div>
          <p class="eyebrow">
            FROM DEMO TO CODE
          </p>
          <h3>{{ isChinese ? '五分钟让示例运行起来。' : 'Make this example work in five minutes.' }}</h3>
          <p>{{ isChinese ? '安装核心包，创建 AudioPlayer，然后播放。HLS 与 DASH 始终是可选能力。' : 'Install the core package, create AudioPlayer, then press play. HLS and DASH remain optional.' }}</p>
          <NuxtLink :to="isChinese ? '/zh/guide/getting-started' : '/guide/getting-started'">
            {{ isChinese ? '打开快速开始' : 'Open Quick Start' }}
            <ArrowRight :size="14" aria-hidden="true" />
          </NuxtLink>
        </div>

        <div class="home-wireframe-code">
          <header>
            <span><i aria-hidden="true" />main.ts</span>
            <button type="button" :aria-label="copyLabel('code')" @click="copyText('code', exampleCode)">
              <Check v-if="copyStatus?.target === 'code' && copyStatus.succeeded" :size="14" aria-hidden="true" />
              <Copy v-else :size="14" aria-hidden="true" />
              {{ copyLabel('code') }}
            </button>
          </header>
          <pre tabindex="0"><code>{{ exampleCode }}</code></pre>
        </div>
      </div>
    </div>
    <p class="home-wireframe-copy-status" role="status">
      <template v-if="copyStatus">
        {{ copyStatus.succeeded ? (isChinese ? '内容已复制到剪贴板。' : 'Copied to clipboard.') : (isChinese ? '无法访问剪贴板，请手动复制。' : 'Clipboard access failed. Copy manually.') }}
      </template>
    </p>
  </section>
</template>
