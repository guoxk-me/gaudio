<script setup lang="ts">
import type { VariantProps } from 'class-variance-authority'
import type { ToggleGroupItemProps } from 'reka-ui'
import type { ComputedRef, HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { ToggleGroupItem, useForwardProps } from 'reka-ui'
import { computed, inject } from 'vue'
import { toggleVariants } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

type ToggleGroupVariants = VariantProps<typeof toggleVariants> & {
  spacing?: number
}

const props = defineProps<ToggleGroupItemProps & {
  class?: HTMLAttributes['class']
  variant?: ToggleGroupVariants['variant']
  size?: ToggleGroupVariants['size']
}>()

const context = inject<ComputedRef<ToggleGroupVariants>>('toggleGroup')

// AI modified: item presentation now reacts to group changes while preserving explicit fallbacks.
const itemVariant = computed(() => context?.value.variant ?? props.variant)
const itemSize = computed(() => context?.value.size ?? props.size)
const itemSpacing = computed(() => context?.value.spacing)

const delegatedProps = reactiveOmit(props, 'class', 'size', 'variant')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <ToggleGroupItem
    v-slot="slotProps"
    data-slot="toggle-group-item"
    :data-variant="itemVariant"
    :data-size="itemSize"
    :data-spacing="itemSpacing"
    v-bind="forwardedProps"
    :class="cn(
      toggleVariants({
        variant: itemVariant,
        size: itemSize,
      }),
      'w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10',
      'data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l',
      props.class)"
  >
    <slot v-bind="slotProps" />
  </ToggleGroupItem>
</template>
