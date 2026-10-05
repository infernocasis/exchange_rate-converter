import { fetchUpstream } from './upstream'

export interface FinanceApiConfig {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

export function createFinanceApi({ baseUrl, apiKey, timeoutMs }: FinanceApiConfig) {
  const get = (path: string) =>
    fetchUpstream(`${baseUrl}${path}`, {
      headers: { 'x-api-key': apiKey },
      timeoutMs,
    })

  return {
    /** Источник 1: { transactions: [...], address: {...} } */
    getTransactions: () => get('/finance1'),
    /** Источник 2: ["300 USD", ...] */
    getCashPayments: () => get('/finance2'),
  }
}

export type FinanceApi = ReturnType<typeof createFinanceApi>
