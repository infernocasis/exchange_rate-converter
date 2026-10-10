import type { DataSource, DataSourcesReport, SourceId } from '#shared/types/sources'
import type { ExchangeRates } from '../domain/money'
import {
  type SourceDiagnosis,
  diagnoseCashPayments,
  diagnoseExchangeRates,
  diagnoseTransactions,
} from '../domain/sourceDiagnostics'
import type { ExchangeRatesApi } from '../utils/exchangeRatesApi'
import type { FinanceApi } from '../utils/financeApi'
import { toErrorCode } from '../utils/toApiError'

interface Deps {
  financeApi: FinanceApi
  exchangeRatesApi: ExchangeRatesApi
  targetCurrency: string
  now?: () => Date
}

type Loaded<T> =
  | { ok: true, value: T, durationMs: number }
  | { ok: false, error: unknown, durationMs: number }

/** Ошибка одного источника не должна прятать остальные — ловим по отдельности */
async function load<T>(fetcher: () => Promise<T>): Promise<Loaded<T>> {
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  try {
    const value = await fetcher()
    return { ok: true, value, durationMs: elapsed() }
  }
  catch (error) {
    console.error('[api/sources]', error)
    return { ok: false, error, durationMs: elapsed() }
  }
}

function toSource(
  id: SourceId,
  endpoint: string,
  loaded: Loaded<unknown>,
  diagnosis: SourceDiagnosis | null,
  durationMs: number | null,
): DataSource {
  if (!loaded.ok || !diagnosis) {
    return {
      id,
      endpoint,
      available: false,
      durationMs,
      recordsTotal: 0,
      recordsUsed: 0,
      records: [],
      hiddenRecords: 0,
      issues: [],
      errorCode: loaded.ok ? 'INTERNAL' : toErrorCode(loaded.error),
    }
  }
  const { currencies: _currencies, ...rest } = diagnosis
  return { id, endpoint, available: true, durationMs, ...rest }
}

export async function getDataSources({
  financeApi,
  exchangeRatesApi,
  targetCurrency,
  now = () => new Date(),
}: Deps): Promise<DataSourcesReport> {
  const [transactions, cashPayments, rates] = await Promise.all([
    load(financeApi.getTransactions),
    load(financeApi.getCashPayments),
    load<ExchangeRates>(exchangeRatesApi.getLatestRates),
  ])
  const checkedAt = now()
  const rateMap = rates.ok ? rates.value : null

  const transactionsDiagnosis = transactions.ok ? diagnoseTransactions(transactions.value, rateMap) : null
  const cashDiagnosis = cashPayments.ok ? diagnoseCashPayments(cashPayments.value, rateMap) : null
  const ratesDiagnosis = rateMap
    ? diagnoseExchangeRates(rateMap, [
        targetCurrency,
        ...(transactionsDiagnosis?.currencies ?? []),
        ...(cashDiagnosis?.currencies ?? []),
      ], checkedAt)
    : null

  return {
    checkedAt: checkedAt.toISOString(),
    targetCurrency,
    ratesCacheMaxAgeS: exchangeRatesApi.cacheMaxAgeS,
    sources: [
      toSource('transactions', financeApi.endpoints.transactions, transactions, transactionsDiagnosis, transactions.durationMs),
      toSource('cashPayments', financeApi.endpoints.cashPayments, cashPayments, cashDiagnosis, cashPayments.durationMs),
      // Курсы обычно отдаются из кеша — время ответа там ничего не говорит о провайдере
      toSource('exchangeRates', exchangeRatesApi.endpoint, rates, ratesDiagnosis, null),
    ],
  }
}
