import { type ExchangeRates, InvalidDataError, normalizeCurrency } from '../domain/money'
import { fetchUpstream } from './upstream'

export interface ExchangeRatesApiConfig {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

interface CurrencyFreaksResponse {
  base?: unknown
  date?: unknown
  rates?: unknown
}

/** Курсы меняются редко, а лимит бесплатного тарифа мал — кешируем на сервере */
const RATES_CACHE_MAX_AGE_S = 10 * 60

/** CurrencyFreaks отдаёт курсы строками: { "EUR": "0.9187" } -> { EUR: 0.9187 } */
function parseRates(rawRates: unknown): Record<string, number> {
  if (rawRates == null || typeof rawRates !== 'object') {
    throw new InvalidDataError('Exchange rates response has no `rates` object')
  }
  const rates: Record<string, number> = {}
  for (const [code, value] of Object.entries(rawRates)) {
    const rate = Number(value)
    if (Number.isFinite(rate) && rate > 0) {
      rates[code.toUpperCase()] = rate
    }
  }
  return rates
}

async function fetchLatestRates({ baseUrl, apiKey, timeoutMs }: ExchangeRatesApiConfig): Promise<ExchangeRates> {
  const data = await fetchUpstream<CurrencyFreaksResponse>(`${baseUrl}/rates/latest`, {
    query: { apikey: apiKey },
    timeoutMs,
  })
  const base = normalizeCurrency(data?.base, 'exchange rates base')

  return {
    base,
    date: typeof data.date === 'string' ? data.date : null,
    rates: { ...parseRates(data.rates), [base]: 1 },
  }
}

const getCachedLatestRates = defineCachedFunction(fetchLatestRates, {
  name: 'exchange-rates',
  // Ключ без apiKey, чтобы секрет не попадал в хранилище кеша
  getKey: ({ baseUrl }: ExchangeRatesApiConfig) => baseUrl,
  maxAge: RATES_CACHE_MAX_AGE_S,
  swr: false,
})

/**
 * Адаптер к CurrencyFreaks. Наружу отдаёт формат, не зависящий от провайдера.
 * Сменится провайдер — переписывается только этот файл.
 */
export function createExchangeRatesApi(config: ExchangeRatesApiConfig) {
  return {
    /** Адрес без ключа (он уходит в query) — для страницы источников */
    endpoint: `${config.baseUrl}/rates/latest`,
    /** Сколько секунд курсы живут в серверном кеше */
    cacheMaxAgeS: RATES_CACHE_MAX_AGE_S,
    getLatestRates: () => getCachedLatestRates(config),
  }
}

export type ExchangeRatesApi = ReturnType<typeof createExchangeRatesApi>
