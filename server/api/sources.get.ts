import type { DataSourcesReport } from '#shared/types/sources'
import { getDataSources } from '../services/dataSources'
import { createExchangeRatesApi } from '../utils/exchangeRatesApi'
import { createFinanceApi } from '../utils/financeApi'
import { useRevenueConfig } from '../utils/revenueConfig'
import { toApiError } from '../utils/toApiError'

export default defineEventHandler(async (event): Promise<DataSourcesReport> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  try {
    const config = useRevenueConfig(event)
    return await getDataSources({
      financeApi: createFinanceApi(config.finance),
      exchangeRatesApi: createExchangeRatesApi(config.exchangeRates),
      targetCurrency: config.targetCurrency,
    })
  }
  catch (error) {
    console.error('[api/sources]', error)
    throw toApiError(error)
  }
})
