<script setup lang="ts">
import { Pause, Play } from '@lucide/vue'
import { useData, withBase } from 'vitepress'
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { demoLocaleForLang, demoText } from '../../../examples/demo-i18n'
import { useHomeMiniPlayer } from '../composables/use-home-mini-player'

const { lang } = useData()
const text = computed(() => demoText[demoLocaleForLang(lang.value)].homeMini)
const examplesHref = computed(() => withBase(lang.value === 'zh' ? '/zh/examples/' : '/examples/'))

const {
  coverThumbUrl,
  defaultTrack,
  isBusy,
  isPaused,
  isReady,
  playerState,
  togglePlayback,
} = useHomeMiniPlayer()
</script>

<template>
  <section role="region" class="home-mini-player not-prose mx-auto my-8 w-full max-w-4xl px-6" :aria-label="text.ariaLabel">
    <Card class="border-border bg-card shadow-md">
      <CardContent class="flex flex-col gap-4 p-5 md:flex-row md:items-center">
        <div class="flex min-w-0 flex-1 items-center gap-4">
          <img
            :src="coverThumbUrl"
            :alt="`${defaultTrack.title} cover art`"
            class="size-20 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-border md:size-24"
            width="512"
            height="512"
            decoding="async"
          >

          <div class="min-w-0 flex-1">
            <p class="text-primary mb-1 text-xs font-semibold tracking-wide uppercase">
              {{ text.kicker }}
            </p>
            <h2 class="text-foreground truncate text-xl font-semibold tracking-tight md:text-2xl">
              {{ defaultTrack.title }}
            </h2>
            <p class="text-muted-foreground truncate text-sm">
              {{ defaultTrack.artist }}
            </p>
            <Badge variant="secondary" class="mt-2">
              {{ isReady ? playerState : text.loading }}
            </Badge>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 md:justify-end">
          <Button
            size="lg"
            class="rounded-full px-6"
            :disabled="!isReady || isBusy"
            :aria-label="isPaused ? 'Play' : 'Pause'"
            @click="togglePlayback"
          >
            <Play v-if="isPaused" />
            <Pause v-else />
            {{ isPaused ? 'Play' : 'Pause' }}
          </Button>
          <Button variant="outline" as="a" :href="examplesHref">
            {{ text.openFullDemo }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<style scoped>
.home-mini-player :deep(a) {
  text-decoration: none;
}
</style>
