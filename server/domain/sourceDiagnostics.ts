import type {
  IssueOccurrence,
  IssueSeverity,
  SourceIssue,
  SourceIssueCode,
  SourceRecord,
} from '#shared/types/sources'
import { AMOUNT_RE, CURRENCY_RE, type ExchangeRates } from './money'

/**
 * Чистые функции диагностики сырых ответов источников.
 * В отличие от calculateDailyRevenue не бросают ошибку на первой проблеме,
 * а собирают все — чтобы показать, что именно не так и где.
 */

const SEVERITY: Record<SourceIssueCode, IssueSeverity> = {
  SHAPE: 'critical',
  RECORD_INVALID: 'critical',
  TYPE_CASE: 'critical',
  AMOUNT_NOT_NUMBER: 'critical',
  AMOUNT_NEGATIVE: 'critical',
  MONEY_FORMAT: 'critical',
  CURRENCY_FORMAT: 'critical',
  CURRENCY_NOT_ISO: 'critical',
  CURRENCY_NO_RATE: 'critical',
  TYPE_UNKNOWN: 'warning',
  AMOUNT_PRECISION: 'warning',
  WHITESPACE: 'warning',
  CURRENCY_CASE: 'warning',
  RATES_NO_DATE: 'warning',
  RATES_STALE: 'warning',
  EXTRA_FIELDS: 'info',
  NO_ID: 'info',
  NO_DATE: 'info',
  FLAT_STRINGS: 'info',
  RATES_NON_ISO: 'info',
}
const SEVERITY_ORDER: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 }

const ISO_CURRENCIES = new Set(Intl.supportedValuesOf('currency'))
const KNOWN_TYPES = new Set(['paid', 'pending', 'rejected'])
const ID_KEYS = ['id', '_id', 'transactionId', 'uuid']
const DATE_KEYS = ['date', 'createdAt', 'paidAt', 'timestamp']
const MAX_RECORDS = 12
const STALE_RATES_H = 36

export interface SourceDiagnosis {
  recordsTotal: number
  recordsUsed: number
  records: SourceRecord[]
  hiddenRecords: number
  issues: SourceIssue[]
  /** Нормализованные коды валют, встреченные в данных */
  currencies: string[]
}

const NO_OCCURRENCE: IssueOccurrence = { index: null, fragment: null }

function createIssues() {
  const byCode = new Map<SourceIssueCode, SourceIssue>()
  return {
    add(code: SourceIssueCode, occurrence: IssueOccurrence = NO_OCCURRENCE, detail?: string) {
      let issue = byCode.get(code)
      if (!issue) {
        issue = { code, severity: SEVERITY[code], occurrences: [], ...(detail ? { detail } : {}) }
        byCode.set(code, issue)
      }
      issue.occurrences.push(occurrence)
    },
    list: () => [...byCode.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
  }
}
type Issues = ReturnType<typeof createIssues>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

function toRecords(items: unknown[]): Pick<SourceDiagnosis, 'records' | 'hiddenRecords'> {
  return {
    records: items.slice(0, MAX_RECORDS).map((item, index) => ({ index, json: JSON.stringify(item) ?? String(item) })),
    hiddenRecords: Math.max(0, items.length - MAX_RECORDS),
  }
}

function emptyDiagnosis(issues: Issues): SourceDiagnosis {
  return { recordsTotal: 0, recordsUsed: 0, records: [], hiddenRecords: 0, issues: issues.list(), currencies: [] }
}

interface CurrencyCheck {
  /** Нормализованный код, если его вообще удалось прочитать — нужен, чтобы показать курс */
  code: string | null
  /** Годится ли валюта для расчёта: существует и для неё есть курс */
  usable: boolean
}

/**
 * Проверяет код валюты.
 * fragment — как значение выглядит внутри JSON-строки записи (для подсветки).
 */
function checkCurrency(
  issues: Issues,
  raw: unknown,
  { index, fragment }: { index: number, fragment: string },
  rates: ExchangeRates | null,
): CurrencyCheck {
  if (typeof raw !== 'string' || !raw.trim()) {
    issues.add('CURRENCY_FORMAT', { index, fragment: null })
    return { code: null, usable: false }
  }
  if (raw !== raw.trim()) issues.add('WHITESPACE', { index, fragment })

  const code = raw.trim().toUpperCase()
  if (!CURRENCY_RE.test(code)) {
    issues.add('CURRENCY_FORMAT', { index, fragment })
    return { code: null, usable: false }
  }
  if (raw.trim() !== code) issues.add('CURRENCY_CASE', { index, fragment })

  if (!ISO_CURRENCIES.has(code)) {
    issues.add('CURRENCY_NOT_ISO', { index, fragment })
    return { code, usable: false }
  }
  if (rates && !(code in rates.rates)) {
    issues.add('CURRENCY_NO_RATE', { index, fragment })
    return { code, usable: false }
  }
  return { code, usable: true }
}

/** Источник 1: { transactions: [{ type, amount, currency }], ... } */
export function diagnoseTransactions(body: unknown, rates: ExchangeRates | null): SourceDiagnosis {
  const issues = createIssues()
  if (!isRecord(body) || !Array.isArray(body.transactions)) {
    issues.add('SHAPE')
    return emptyDiagnosis(issues)
  }

  const extraRoot = Object.keys(body).filter(key => key !== 'transactions')
  if (extraRoot.length) issues.add('EXTRA_FIELDS', NO_OCCURRENCE, extraRoot.join(', '))

  const { transactions } = body
  const currencies = new Set<string>()
  let used = 0
  let hasId = false
  let hasDate = false

  transactions.forEach((tx: unknown, index) => {
    if (!isRecord(tx)) {
      issues.add('RECORD_INVALID', { index, fragment: null })
      return
    }
    hasId ||= ID_KEYS.some(key => key in tx)
    hasDate ||= DATE_KEYS.some(key => key in tx)

    const { type, amount, currency } = tx
    if (typeof type === 'string' && type !== 'paid' && type.trim().toLowerCase() === 'paid') {
      issues.add('TYPE_CASE', { index, fragment: JSON.stringify(type) })
    }
    else if (typeof type !== 'string' || !KNOWN_TYPES.has(type)) {
      issues.add('TYPE_UNKNOWN', { index, fragment: typeof type === 'string' ? JSON.stringify(type) : null })
    }

    const amountFragment = `"amount":${JSON.stringify(amount)}`
    let amountOk = false
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      issues.add('AMOUNT_NOT_NUMBER', { index, fragment: amount === undefined ? null : amountFragment })
    }
    else if (amount < 0) {
      issues.add('AMOUNT_NEGATIVE', { index, fragment: amountFragment })
    }
    else {
      amountOk = true
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
        issues.add('AMOUNT_PRECISION', { index, fragment: amountFragment })
      }
    }

    const { code, usable } = checkCurrency(issues, currency, { index, fragment: JSON.stringify(currency) }, rates)
    if (code) currencies.add(code)
    if (type === 'paid' && amountOk && usable) used += 1
  })

  if (transactions.length && !hasId) issues.add('NO_ID')
  if (transactions.length && !hasDate) issues.add('NO_DATE')

  return {
    recordsTotal: transactions.length,
    recordsUsed: used,
    ...toRecords(transactions),
    issues: issues.list(),
    currencies: [...currencies],
  }
}

/** Источник 2: ["300 USD", ...] */
export function diagnoseCashPayments(body: unknown, rates: ExchangeRates | null): SourceDiagnosis {
  const issues = createIssues()
  if (!Array.isArray(body)) {
    issues.add('SHAPE')
    return emptyDiagnosis(issues)
  }
  if (body.some(item => typeof item === 'string')) issues.add('FLAT_STRINGS')

  const currencies = new Set<string>()
  let used = 0

  body.forEach((item: unknown, index) => {
    if (typeof item !== 'string') {
      issues.add('RECORD_INVALID', { index, fragment: null })
      return
    }
    const trimmed = item.trim()
    if (item !== trimmed || /\s{2,}/.test(trimmed)) issues.add('WHITESPACE', { index, fragment: null })

    const parts = trimmed.split(/\s+/)
    if (parts.length !== 2) {
      issues.add('MONEY_FORMAT', { index, fragment: null })
      return
    }
    const [rawAmount, rawCurrency] = parts as [string, string]
    const amountOk = AMOUNT_RE.test(rawAmount)
    if (!amountOk) issues.add('MONEY_FORMAT', { index, fragment: rawAmount })

    const { code, usable } = checkCurrency(issues, rawCurrency, { index, fragment: rawCurrency }, rates)
    if (code) currencies.add(code)
    if (amountOk && usable) used += 1
  })

  return {
    recordsTotal: body.length,
    recordsUsed: used,
    ...toRecords(body),
    issues: issues.list(),
    currencies: [...currencies],
  }
}

/** "2026-10-10 00:00:00+00" (формат CurrencyFreaks) -> ms; NaN, если не разобрать */
function parseRatesDate(raw: string): number {
  return Date.parse(raw.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'))
}

/**
 * Курсы: показываем только нужные для расчёта валюты.
 * checkedAt передаётся снаружи, чтобы функция оставалась детерминированной.
 */
export function diagnoseExchangeRates(
  { base, date, rates }: ExchangeRates,
  neededCurrencies: string[],
  checkedAt: Date,
): SourceDiagnosis {
  const issues = createIssues()

  if (!date || Number.isNaN(parseRatesDate(date))) {
    issues.add('RATES_NO_DATE')
  }
  else {
    const ageH = (checkedAt.getTime() - parseRatesDate(date)) / 3_600_000
    if (ageH > STALE_RATES_H) issues.add('RATES_STALE', NO_OCCURRENCE, String(Math.round(ageH)))
  }

  const codes = Object.keys(rates)
  const nonIso = codes.filter(code => !ISO_CURRENCIES.has(code)).length
  if (nonIso) issues.add('RATES_NON_ISO', NO_OCCURRENCE, String(nonIso))

  const needed = [...new Set([base, ...neededCurrencies])]
  return {
    recordsTotal: codes.length,
    recordsUsed: needed.filter(code => code in rates).length,
    ...toRecords(needed.map(code => ({ [code]: rates[code] ?? null }))),
    issues: issues.list(),
    currencies: needed,
  }
}
