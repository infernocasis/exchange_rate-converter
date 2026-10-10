<script setup lang="ts">
defineProps<{
  isLoading: boolean
  checkedAt?: string
}>()
defineEmits<{ recheck: [] }>()
</script>

<template>
  <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
        Источники данных
      </h1>
      <p class="mt-2 max-w-prose text-sm text-slate-500">
        Откуда приложение берёт цифры для выручки и что в этих данных не так прямо сейчас.
        <template v-if="checkedAt && !isLoading">
          Проверено в {{ formatTime(checkedAt) }}.
        </template>
      </p>
    </div>
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="isLoading"
      @click="$emit('recheck')"
    >
      {{ isLoading ? 'Проверяем…' : 'Проверить снова' }}
    </button>
  </header>
</template>
