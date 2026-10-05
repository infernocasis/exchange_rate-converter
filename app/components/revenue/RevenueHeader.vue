<script setup lang="ts">
defineProps<{ isLoading: boolean }>()
defineEmits<{ refresh: [] }>()
</script>

<template>
  <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-medium text-indigo-600">
        Финансы
      </p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
        Выручка за день
      </h1>
      <p class="mt-2 text-sm text-slate-500">
        Оплаченные транзакции и платежи из двух источников по актуальному курсу
      </p>
    </div>
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="isLoading"
      @click="$emit('refresh')"
    >
      {{ isLoading ? 'Обновление…' : 'Обновить' }}
    </button>
  </header>
</template>
