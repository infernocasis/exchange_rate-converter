const LOCALE = 'ru-RU'
const moneyFormatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(amount: number, currency: string): string {
  let formatter = moneyFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency })
    moneyFormatters.set(currency, formatter)
  }
  return formatter.format(amount)
}

const rateFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
export const formatRate = (rate: number): string => rateFormatter.format(rate)

const percentFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  maximumFractionDigits: 1,
})
export const formatPercent = (value: number): string => percentFormatter.format(value)

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'long',
  timeStyle: 'short',
})

/** CurrencyFreaks отдаёт дату как "2026-09-30 00:00:00+00" — приводим к ISO */
export function formatRatesDate(raw: string | null): string {
  if (!raw) return 'дата неизвестна'
  const iso = raw
    .trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00')
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? raw : dateFormatter.format(date)
}
