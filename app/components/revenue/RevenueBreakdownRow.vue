<script setup lang="ts">
import type { RevenueBreakdownItem } from '#shared/types/revenue'

const props = defineProps<{
  item: RevenueBreakdownItem
  targetCurrency: string
}>()

const isTarget = computed(() => props.item.currency === props.targetCurrency)
const barWidth = computed(() => `${(props.item.share * 100).toFixed(2)}%`)
</script>

<template>
  <li class="py-4 first:pt-0 last:pb-0">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700">
          {{ item.currency }}
        </span>
        <span class="text-lg font-semibold tabular-nums">
          {{ formatMoney(item.total, item.currency) }}
        </span>
      </div>
      <div class="text-right">
        <p v-if="!isTarget" class="text-sm font-medium tabular-nums text-slate-700">
          ≈ {{ formatMoney(item.converted, targetCurrency) }}
        </p>
        <p class="text-xs text-slate-500">
          {{ formatPercent(item.share) }} от итога
        </p>
      </div>
    </div>
    <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
      <div class="h-full rounded-full bg-indigo-500" :style="{ width: barWidth }" />
    </div>
  </li>
</template>
