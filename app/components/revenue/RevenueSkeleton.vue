<template>
  <BaseCard>
    <div class="h-4 w-32 animate-pulse rounded bg-slate-200" />
    <div class="mt-4 h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
    <p class="mt-4 text-sm text-slate-500">
      Загружаем данные… Сервер на Render может просыпаться до минуты.
    </p>
  </BaseCard>
  <BaseCard>
    <div class="space-y-3">
      <div
        v-for="width in ['w-full', 'w-5/6', 'w-2/3']"
        :key="width"
        class="h-4 animate-pulse rounded bg-slate-200"
        :class="width"
      />
    </div>
  </BaseCard>
</template>
