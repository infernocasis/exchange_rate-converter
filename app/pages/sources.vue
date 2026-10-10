<script setup lang="ts">
useSeoMeta({
  title: 'Источники данных',
  description: 'Откуда берутся данные для расчёта выручки и какие в них есть проблемы',
})

const { report, error, isLoading, refresh } = useDataSources()
</script>

<template>
  <div>
    <SourcesHeader :is-loading="isLoading" :checked-at="report?.checkedAt" @recheck="refresh" />

    <main class="space-y-6" aria-live="polite" :aria-busy="isLoading">
      <RevenueSkeleton v-if="isLoading" />
      <RevenueError v-else-if="error" :error="error" @retry="refresh" />
      <template v-else-if="report">
        <SourcesPipeline :sources="report.sources" :target-currency="report.targetCurrency" />
        <SourcesSection
          v-for="source in report.sources"
          :key="source.id"
          :source="source"
          :target-currency="report.targetCurrency"
          :rates-cache-max-age-s="report.ratesCacheMaxAgeS"
        />
      </template>
    </main>
  </div>
</template>
