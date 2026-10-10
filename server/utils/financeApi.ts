import { fetchUpstream } from './upstream'

export interface FinanceApiConfig {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

export function createFinanceApi({ baseUrl, apiKey, timeoutMs }: FinanceApiConfig) {
  const endpoints = {
    transactions: `${baseUrl}/finance1`,
    cashPayments: `${baseUrl}/finance2`,
  }
  const get = (url: string) =>
    fetchUpstream(url, {
      headers: { 'x-api-key': apiKey },
      timeoutMs,
    })

  return {
    /** Адреса без ключа (он в заголовке) — для страницы источников */
    endpoints,
    /** Источник 1: { transactions: [...], address: {...} } */
    getTransactions: () => get(endpoints.transactions),
    /** Источник 2: ["300 USD", ...] */
    getCashPayments: () => get(endpoints.cashPayments),
  }
}

export type FinanceApi = ReturnType<typeof createFinanceApi>
