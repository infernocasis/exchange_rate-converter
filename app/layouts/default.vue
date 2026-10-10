<script setup lang="ts">
const LINKS = [
  { to: '/', label: 'Выручка' },
  { to: '/sources', label: 'Источники данных' },
]
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 antialiased">
    <div class="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <nav aria-label="Разделы" class="mb-8 flex gap-6 border-b border-slate-200 text-sm">
        <NuxtLink
          v-for="link in LINKS"
          :key="link.to"
          :to="link.to"
          class="-mb-px border-b-2 border-transparent pb-3 font-medium text-slate-500 transition-colors hover:text-slate-900 focus:outline-none focus-visible:text-slate-900 focus-visible:underline"
          exact-active-class="!border-indigo-600 !text-slate-900"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
      <slot />
    </div>
  </div>
</template>
