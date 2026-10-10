<script setup lang="ts">
import type { DataSource } from '#shared/types/sources'

const props = defineProps<{ source: DataSource }>()

const items = computed(() => props.source.issues.map((issue, position) => ({
  ref: position + 1,
  severity: issue.severity,
  ...describeIssue(issue),
  scope: describeIssueScope(issue, props.source.recordsTotal),
})))
</script>

<template>
  <p v-if="items.length === 0" class="text-sm text-emerald-700">
    Замечаний нет: данные приходят в ожидаемом формате.
  </p>
  <!-- Номера — это ссылки из подсвеченного ответа выше, а не порядок шагов -->
  <ol v-else class="space-y-4">
    <li
      v-for="item in items"
      :id="`${source.id}-issue-${item.ref}`"
      :key="item.ref"
      class="flex scroll-mt-6 gap-3 rounded-lg target:bg-indigo-50 target:outline target:outline-2 target:outline-offset-4 target:outline-indigo-200"
    >
      <span
        class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
        :class="TONE_CLASSES[item.severity].badge"
        aria-hidden="true"
      >{{ item.ref }}</span>
      <div class="min-w-0">
        <p class="font-medium text-slate-900">
          {{ item.title }}
        </p>
        <p class="mt-0.5 text-sm" :class="TONE_CLASSES[item.severity].text">
          {{ SEVERITY_LABEL[item.severity] }}. {{ item.scope }}
        </p>
        <p class="mt-1 max-w-prose text-sm text-slate-600">
          {{ item.explanation }}
        </p>
      </div>
    </li>
  </ol>
</template>
