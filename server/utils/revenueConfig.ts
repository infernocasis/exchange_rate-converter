import type { H3Event } from 'h3'
import { normalizeCurrency } from '../domain/money'
import type { ExchangeRatesApiConfig } from './exchangeRatesApi'
import type { FinanceApiConfig } from './financeApi'

/** Окружение не настроено: не хватает переменных или они некорректны */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface RevenueConfig {
  finance: FinanceApiConfig
  exchangeRates: ExchangeRatesApiConfig
  targetCurrency: string
}

const trimSlash = (url: string) => url.replace(/\/+$/, '')

function required(value: unknown, envName: string): string {
  if (typeof value !== 'string' || !value) {
    throw new ConfigError(`Missing required env variable: ${envName}`)
  }
  return value
}

const toTimeout = (value: unknown, fallback: number) => Number(value) || fallback

/** Приватный runtimeConfig (см. nuxt.config.ts) -> проверенный конфиг сервиса */
export function useRevenueConfig(event: H3Event): RevenueConfig {
  const { finance, exchangeRates, targetCurrency } = useRuntimeConfig(event)

  let currency: string
  try {
    currency = normalizeCurrency(targetCurrency, 'NUXT_TARGET_CURRENCY')
  }
  catch (error) {
    throw new ConfigError((error as Error).message)
  }

  return {
    finance: {
      baseUrl: trimSlash(required(finance.baseUrl, 'NUXT_FINANCE_BASE_URL')),
      apiKey: required(finance.apiKey, 'NUXT_FINANCE_API_KEY'),
      timeoutMs: toTimeout(finance.timeoutMs, 60_000),
    },
    exchangeRates: {
      baseUrl: trimSlash(required(exchangeRates.baseUrl, 'NUXT_EXCHANGE_RATES_BASE_URL')),
      apiKey: required(exchangeRates.apiKey, 'NUXT_EXCHANGE_RATES_API_KEY'),
      timeoutMs: toTimeout(exchangeRates.timeoutMs, 10_000),
    },
    targetCurrency: currency,
  }
}
