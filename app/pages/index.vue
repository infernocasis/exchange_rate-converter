<script setup lang="ts">
useSeoMeta({
  title: 'Выручка за день',
  description: 'Оплаченные транзакции и платежи из двух источников по актуальному курсу',
})

const { revenue, error, isLoading, refresh } = useDailyRevenue()
</script>

<template>
  <div>
    <RevenueHeader :is-loading="isLoading" @refresh="refresh" />

    <main class="space-y-6" aria-live="polite" :aria-busy="isLoading">
      <RevenueSkeleton v-if="isLoading" />
      <RevenueError v-else-if="error" :error="error" @retry="refresh" />
      <template v-else-if="revenue">
        <RevenueTotalCard :revenue="revenue" />
        <RevenueBreakdown :breakdown="revenue.breakdown" :currency="revenue.currency" />
        <RevenueExchangeRates
          :breakdown="revenue.breakdown"
          :currency="revenue.currency"
          :rates-date="revenue.ratesDate"
        />
      </template>
    </main>
  </div>
</template>
