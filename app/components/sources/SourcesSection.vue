<script setup lang="ts">
import type { DataSource } from '#shared/types/sources'

const props = defineProps<{
  source: DataSource
  targetCurrency: string
  ratesCacheMaxAgeS: number
}>()

const info = computed(() => SOURCE_INFO[props.source.id])
const role = computed(() => info.value.role({
  targetCurrency: props.targetCurrency,
  cacheMinutes: Math.round(props.ratesCacheMaxAgeS / 60),
}))
const status = computed(() => describeSourceStatus(props.source))
const failure = computed(() => (props.source.errorCode ? describeErrorCode(props.source.errorCode) : null))

const facts = computed(() => {
  const { id, durationMs, recordsTotal, recordsUsed } = props.source
  const list: { term: string, value: string }[] = []
  if (durationMs !== null) list.push({ term: 'Ответ за', value: formatDuration(durationMs) })
  if (id === 'exchangeRates') {
    list.push({ term: 'Курсов у провайдера', value: String(recordsTotal) })
    list.push({ term: 'Нужно для расчёта', value: String(recordsUsed) })
  }
  else {
    list.push({ term: 'Записей пришло', value: String(recordsTotal) })
    list.push({ term: 'Годятся для расчёта', value: String(recordsUsed) })
  }
  return list
})
</script>

<template>
  <BaseCard :id="`source-${source.id}`" class="scroll-mt-6">
    <header class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="text-lg font-semibold text-slate-900">
        {{ info.title }}
      </h2>
      <span class="flex items-center gap-2 text-sm" :class="TONE_CLASSES[status.tone].text">
        <span class="h-2 w-2 shrink-0 rounded-full" :class="TONE_CLASSES[status.tone].dot" aria-hidden="true" />
        {{ status.text }}
      </span>
    </header>
    <p class="mt-1 break-all font-mono text-xs text-slate-500">
      GET {{ source.endpoint }}
    </p>
    <p class="mt-3 max-w-prose text-sm text-slate-600">
      {{ role }}
    </p>

    <div v-if="failure" class="mt-5 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
      <p class="font-medium text-red-900">
        {{ failure.title }}
      </p>
      <p class="mt-1 text-sm text-red-800">
        {{ failure.hint }}
      </p>
    </div>

    <template v-else>
      <dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <div v-for="fact in facts" :key="fact.term">
          <dt class="text-xs text-slate-500">
            {{ fact.term }}
          </dt>
          <dd class="text-lg font-semibold tabular-nums text-slate-900">
            {{ fact.value }}
          </dd>
        </div>
      </dl>

      <div class="mt-6">
        <SourcesResponse :source="source" />
      </div>

      <div class="mt-6">
        <SourcesIssueList :source="source" />
      </div>
    </template>
  </BaseCard>
</template>
