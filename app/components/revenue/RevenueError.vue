<script setup lang="ts">
const props = defineProps<{ error: { message: string, data?: unknown } }>()
defineEmits<{ retry: [] }>()

const description = computed(() => describeRevenueError(props.error))
</script>

<template>
  <section class="rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
    <div class="flex items-start gap-4">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-lg font-bold text-red-600"
        aria-hidden="true"
      >
        !
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold text-red-900">
          {{ description.title }}
        </h2>
        <p class="mt-1 text-sm text-red-800">
          {{ description.hint }}
        </p>
        <details class="mt-3 text-sm text-red-700">
          <summary class="cursor-pointer select-none font-medium">
            Подробности
          </summary>
          <pre class="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-red-100/70 p-3 font-mono text-xs">{{ description.details }}</pre>
        </details>
        <button
          type="button"
          class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          @click="$emit('retry')"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  </section>
</template>
