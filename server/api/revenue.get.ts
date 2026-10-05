import type { DailyRevenue } from '#shared/types/revenue'
import { getDailyRevenue } from '../services/dailyRevenue'
import { createExchangeRatesApi } from '../utils/exchangeRatesApi'
import { createFinanceApi } from '../utils/financeApi'
import { useRevenueConfig } from '../utils/revenueConfig'
import { toApiError } from '../utils/toApiError'

export default defineEventHandler(async (event): Promise<DailyRevenue> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  try {
    const config = useRevenueConfig(event)
    return await getDailyRevenue({
      financeApi: createFinanceApi(config.finance),
      exchangeRatesApi: createExchangeRatesApi(config.exchangeRates),
      targetCurrency: config.targetCurrency,
    })
  }
  catch (error) {
    console.error('[api/revenue]', error)
    throw toApiError(error)
  }
})
