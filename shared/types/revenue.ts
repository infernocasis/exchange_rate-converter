/** Контракт GET /api/revenue — общий для сервера и клиента */

export interface RevenueBreakdownItem {
  currency: string
  /** Сумма в исходной валюте */
  total: number
  /** 1 currency = rate целевой валюты */
  rate: number
  /** Сумма, пересчитанная в целевую валюту */
  converted: number
  /** Доля в итоге, 0..1 */
  share: number
  /** Количество оплат в этой валюте */
  paymentsCount: number
}

export interface DailyRevenue {
  total: number
  currency: string
  /** Количество оплат по всем валютам */
  paymentsCount: number
  breakdown: RevenueBreakdownItem[]
  ratesDate: string | null
}

export type RevenueErrorCode =
  | 'CONFIG_MISSING'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAUTHORIZED'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_FAILED'
  | 'UPSTREAM_REJECTED'
  | 'INVALID_UPSTREAM_DATA'
  | 'INTERNAL'

/** Содержимое поля `data` в ответе с ошибкой */
export interface RevenueErrorData {
  code: RevenueErrorCode
  upstreamStatus?: number
}
