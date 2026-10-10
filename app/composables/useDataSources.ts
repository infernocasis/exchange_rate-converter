import type { DataSourcesReport } from '#shared/types/sources'

/**
 * Источники данных и их диагностика из /api/sources.
 * server: false — по той же причине, что и в useDailyRevenue: источник на Render
 * может просыпаться до минуты, SSR на это время блокировать нельзя.
 */
export function useDataSources() {
  const { data, error, status, refresh } = useFetch<DataSourcesReport>('/api/sources', {
    key: 'data-sources',
    server: false,
    lazy: true,
  })

  const isLoading = computed(() => status.value === 'idle' || status.value === 'pending')

  return {
    report: data,
    error,
    isLoading,
    refresh: () => refresh(),
  }
}
