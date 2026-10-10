import type { RevenueErrorCode } from './revenue'

/** Контракт GET /api/sources — источники данных для расчёта и найденные в них проблемы */

export type SourceId = 'transactions' | 'cashPayments' | 'exchangeRates'

/** critical — ломает расчёт или искажает выручку; warning — нарушение формата, клиент обходит сам; info — замечание к контракту */
export type IssueSeverity = 'critical' | 'warning' | 'info'

export type SourceIssueCode =
  | 'SHAPE'
  | 'RECORD_INVALID'
  | 'EXTRA_FIELDS'
  | 'NO_ID'
  | 'NO_DATE'
  | 'TYPE_CASE'
  | 'TYPE_UNKNOWN'
  | 'AMOUNT_NOT_NUMBER'
  | 'AMOUNT_NEGATIVE'
  | 'AMOUNT_PRECISION'
  | 'MONEY_FORMAT'
  | 'WHITESPACE'
  | 'FLAT_STRINGS'
  | 'CURRENCY_CASE'
  | 'CURRENCY_FORMAT'
  | 'CURRENCY_NOT_ISO'
  | 'CURRENCY_NO_RATE'
  | 'RATES_NO_DATE'
  | 'RATES_STALE'
  | 'RATES_NON_ISO'

export interface IssueOccurrence {
  /** Номер записи в ответе; null — проблема всего ответа */
  index: number | null
  /** Фрагмент JSON-строки записи, который нужно подсветить; null — подсвечивать нечего */
  fragment: string | null
}

export interface SourceIssue {
  code: SourceIssueCode
  severity: IssueSeverity
  occurrences: IssueOccurrence[]
  /** Подробность для текста: список полей, возраст курсов и т. п. */
  detail?: string
}

export interface SourceRecord {
  index: number
  /** Запись ровно в том виде, в каком пришла, сериализованная в JSON */
  json: string
}

export interface DataSource {
  id: SourceId
  /** URL без секретов */
  endpoint: string
  available: boolean
  /** null — время не измерялось (например, ответ из кеша) */
  durationMs: number | null
  /** Сколько записей пришло */
  recordsTotal: number
  /** Сколько записей прошли проверку и годятся для расчёта */
  recordsUsed: number
  /** Первые записи ответа */
  records: SourceRecord[]
  /** Сколько записей не показано */
  hiddenRecords: number
  issues: SourceIssue[]
  errorCode?: RevenueErrorCode
}

export interface DataSourcesReport {
  checkedAt: string
  targetCurrency: string
  /** Сколько секунд курсы живут в серверном кеше */
  ratesCacheMaxAgeS: number
  sources: DataSource[]
}
