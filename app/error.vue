<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error.statusCode === 404)
</script>

<template>
  <NuxtLayout>
    <BaseCard class="text-center">
      <p class="text-sm font-medium text-indigo-600">
        {{ error.statusCode }}
      </p>
      <h1 class="mt-1 text-2xl font-bold tracking-tight">
        {{ isNotFound ? 'Страница не найдена' : 'Что-то пошло не так' }}
      </h1>
      <button
        type="button"
        class="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        @click="clearError({ redirect: '/' })"
      >
        На главную
      </button>
    </BaseCard>
  </NuxtLayout>
</template>
