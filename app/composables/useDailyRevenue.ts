import type { DailyRevenue } from '#shared/types/revenue'

/**
 * Выручка за день из /api/revenue.
 * server: false — сервер-источник на Render может просыпаться до минуты,
 * блокировать на это время SSR нельзя: страница сразу отдаётся со скелетоном,
 * а данные догружаются на клиенте.
 */
export function useDailyRevenue() {
  const { data, error, status, refresh } = useFetch<DailyRevenue>('/api/revenue', {
    key: 'daily-revenue',
    server: false,
    lazy: true,
  })

  const isLoading = computed(() => status.value === 'idle' || status.value === 'pending')

  return {
    revenue: data,
    error,
    isLoading,
    refresh: () => refresh(),
  }
}
