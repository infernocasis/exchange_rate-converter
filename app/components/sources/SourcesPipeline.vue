<script setup lang="ts">
import type { DataSource } from '#shared/types/sources'

const props = defineProps<{
  sources: DataSource[]
  targetCurrency: string
}>()

const rows = computed(() => props.sources.map(source => ({
  id: source.id,
  title: SOURCE_INFO[source.id].title,
  status: describeSourceStatus(source),
})))
</script>

<template>
  <BaseCard title="Из чего складывается выручка">
    <!-- Скобка справа показывает, что три источника сходятся в один расчёт -->
    <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_1.5rem_auto] sm:items-stretch">
      <ul class="space-y-1">
        <li v-for="row in rows" :key="row.id">
          <a
            :href="`#source-${row.id}`"
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <span class="font-medium text-slate-900">{{ row.title }}</span>
            <span class="flex items-center gap-2 text-sm" :class="TONE_CLASSES[row.status.tone].text">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="TONE_CLASSES[row.status.tone].dot" aria-hidden="true" />
              {{ row.status.text }}
            </span>
          </a>
        </li>
      </ul>
      <div class="my-4 hidden rounded-r-lg border-y-2 border-r-2 border-slate-300 sm:block" aria-hidden="true" />
      <NuxtLink
        to="/"
        class="flex flex-col justify-center rounded-xl bg-indigo-50 px-5 py-3 text-indigo-950 transition-colors hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span class="text-sm text-indigo-700">Расчёт</span>
        <span class="font-semibold">Выручка в {{ targetCurrency }}</span>
      </NuxtLink>
    </div>
  </BaseCard>
</template>
