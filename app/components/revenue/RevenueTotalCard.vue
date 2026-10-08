<script setup lang="ts">
import type { DailyRevenue } from '#shared/types/revenue'

const props = defineProps<{ revenue: DailyRevenue }>()

const caption = computed(() => {
  const { breakdown, currency, paymentsCount } = props.revenue
  if (paymentsCount === 0) return 'Оплат за день нет'

  const payments = formatPaymentsCount(paymentsCount)
  return breakdown.length > 1
    ? `${payments}, пересчитано в ${currency} из ${breakdown.length} валют`
    : `${payments}, все в ${breakdown[0]?.currency ?? currency}`
})
</script>

<template>
  <section class="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-lg sm:p-8">
    <p class="text-sm font-medium text-indigo-100">
      Итого, {{ revenue.currency }}
    </p>
    <p class="mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
      {{ formatMoney(revenue.total, revenue.currency) }}
    </p>
    <p class="mt-3 text-sm text-indigo-100">
      {{ caption }}
    </p>
  </section>
</template>
