<script setup lang="ts">
import type { DataSource } from '#shared/types/sources'

const props = defineProps<{ source: DataSource }>()

const lines = computed(() => annotateRecords(props.source.records, props.source.issues))
/** У курсов строки — это валюты, а не записи ответа: номера там ничего не значат */
const showIndex = computed(() => props.source.id !== 'exchangeRates')
const issueAnchor = (ref: number) => `#${props.source.id}-issue-${ref}`
</script>

<template>
  <figure>
    <figcaption class="mb-2 text-sm text-slate-500">
      {{ showIndex ? 'Ответ сервера в том виде, в каком он пришёл' : 'Курсы, которые участвуют в расчёте' }}
    </figcaption>
    <ol class="rounded-xl border border-slate-200 bg-slate-50 py-2 font-mono text-[13px] leading-7 text-slate-800">
      <li
        v-for="line in lines"
        :key="line.index"
        class="flex gap-3 border-l-[3px] pr-3"
        :class="line.severity ? TONE_CLASSES[line.severity].bar : 'border-transparent'"
      >
        <span v-if="showIndex" class="w-9 shrink-0 select-none text-right tabular-nums text-slate-400">[{{ line.index }}]</span>
        <span v-else class="w-1 shrink-0" />
        <code class="min-w-0 whitespace-pre-wrap break-all">
          <template v-for="(segment, i) in line.segments" :key="i">
            <template v-if="segment.mark">
              <mark
                class="rounded-sm text-inherit underline decoration-wavy decoration-2 underline-offset-[5px]"
                :class="TONE_CLASSES[segment.mark.severity].mark"
              >{{ segment.text }}</mark>
              <sup class="ml-0.5 font-sans text-[10px] font-semibold">
                <a
                  v-for="ref in segment.mark.refs"
                  :key="ref"
                  :href="issueAnchor(ref)"
                  class="mr-0.5 text-slate-500 hover:text-slate-900 focus:outline-none focus-visible:underline"
                  :aria-label="`Замечание ${ref}`"
                >{{ ref }}</a>
              </sup>
            </template>
            <template v-else>{{ segment.text }}</template>
          </template>
          <sup v-if="line.lineRefs.length" class="ml-1 font-sans text-[10px] font-semibold">
            <a
              v-for="ref in line.lineRefs"
              :key="ref"
              :href="issueAnchor(ref)"
              class="mr-0.5 text-slate-500 hover:text-slate-900 focus:outline-none focus-visible:underline"
              :aria-label="`Замечание ${ref}`"
            >{{ ref }}</a>
          </sup>
        </code>
      </li>
      <li v-if="source.hiddenRecords" class="pl-15 font-sans text-xs text-slate-500">
        и ещё {{ pluralize(source.hiddenRecords, { one: 'запись', few: 'записи', many: 'записей' }) }}
      </li>
    </ol>
  </figure>
</template>
