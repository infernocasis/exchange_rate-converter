<script setup lang="ts">
/** Базовая карточка с необязательным заголовком секции */
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <header v-if="title" class="mb-4">
      <h2 class="text-base font-semibold text-slate-900">
        {{ title }}
      </h2>
      <p v-if="subtitle" class="mt-1 text-sm text-slate-500">
        {{ subtitle }}
      </p>
    </header>
    <slot />
  </section>
</template>
