<script setup lang="ts">
import type { SelectLabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectLabel } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectLabelProps & { class?: HTMLAttributes['class'] }>()

// AI modified: preserve Reka polymorphic props while keeping wrapper classes local.
const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <SelectLabel
    data-slot="select-label"
    v-bind="delegatedProps"
    :class="cn('text-muted-foreground px-2 py-1.5 text-xs', props.class)"
  >
    <slot />
  </SelectLabel>
</template>
