<script setup lang="ts">
import type { RevenueBreakdownItem } from '#shared/types/revenue'

defineProps<{
  breakdown: RevenueBreakdownItem[]
  currency: string
}>()
</script>

<template>
  <BaseCard v-if="breakdown.length === 0" title="По валютам">
    <p class="text-sm text-slate-500">
      Оплат за день нет.
    </p>
  </BaseCard>
  <BaseCard v-else title="По валютам" subtitle="Суммы в исходной валюте и их вклад в итог">
    <ul class="divide-y divide-slate-100">
      <RevenueBreakdownRow
        v-for="item in breakdown"
        :key="item.currency"
        :item="item"
        :target-currency="currency"
      />
    </ul>
  </BaseCard>
</template>
