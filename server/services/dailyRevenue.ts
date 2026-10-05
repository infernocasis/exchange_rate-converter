import type { DailyRevenue } from '#shared/types/revenue'
import { calculateDailyRevenue, convertRevenue } from '../domain/revenue'
import type { ExchangeRatesApi } from '../utils/exchangeRatesApi'
import type { FinanceApi } from '../utils/financeApi'

interface Deps {
  financeApi: FinanceApi
  exchangeRatesApi: ExchangeRatesApi
  targetCurrency: string
}

/** Все три запроса идут параллельно: оба источника и курсы */
export async function getDailyRevenue({
  financeApi,
  exchangeRatesApi,
  targetCurrency,
}: Deps): Promise<DailyRevenue> {
  const [orderData, cashPayments, exchangeRates] = await Promise.all([
    financeApi.getTransactions(),
    financeApi.getCashPayments(),
    exchangeRatesApi.getLatestRates(),
  ])

  const totalsByCurrency = calculateDailyRevenue(orderData, cashPayments)
  const result = convertRevenue(totalsByCurrency, exchangeRates, targetCurrency)

  return { ...result, ratesDate: exchangeRates.date }
}
