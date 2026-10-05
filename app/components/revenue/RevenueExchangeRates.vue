<script setup lang="ts">
import type { RevenueBreakdownItem } from '#shared/types/revenue'

const SOURCE_URL = 'https://currencyfreaks.com'

const props = defineProps<{
  breakdown: RevenueBreakdownItem[]
  currency: string
  ratesDate: string | null
}>()

const foreign = computed(() => props.breakdown.filter(item => item.currency !== props.currency))
</script>

<template>
  <BaseCard title="Курсы валют" :subtitle="`На ${formatRatesDate(ratesDate)}`">
    <p v-if="foreign.length === 0" class="text-sm text-slate-500">
      Все платежи уже в {{ currency }} — конвертация не понадобилась.
    </p>
    <ul v-else class="grid gap-3 sm:grid-cols-2">
      <li
        v-for="{ currency: from, rate } in foreign"
        :key="from"
        class="rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
          {{ from }} → {{ currency }}
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums">
          1 {{ from }} = {{ formatRate(rate) }} {{ currency }}
        </p>
        <p class="mt-1 text-xs text-slate-500 tabular-nums">
          1 {{ currency }} = {{ formatRate(1 / rate) }} {{ from }}
        </p>
      </li>
    </ul>
    <p class="mt-4 text-xs text-slate-500">
      Источник:
      <a
        class="font-medium text-indigo-600 underline-offset-2 hover:underline"
        :href="SOURCE_URL"
        target="_blank"
        rel="noopener noreferrer"
      >CurrencyFreaks</a>
    </p>
  </BaseCard>
</template>
