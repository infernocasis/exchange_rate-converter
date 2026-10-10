/** Данные от источника не соответствуют ожидаемому формату */
export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDataError'
  }
}

export interface Money {
  amount: number
  currency: string
}

/** Формат курсов, не зависящий от провайдера */
export interface ExchangeRates {
  base: string
  date: string | null
  /** rates[X] = сколько X дают за 1 единицу base */
  rates: Record<string, number>
}

export const CURRENCY_RE = /^[A-Z]{3}$/ // ISO 4217: ровно 3 латинские буквы
export const AMOUNT_RE = /^\d+(\.\d{1,2})?$/ // целое или до 2 знаков после точки

/** "usd" / " Usd " -> "USD"; всё, что не 3 латинские буквы, -> ошибка */
export function normalizeCurrency(currency: unknown, context: string): string {
  if (typeof currency !== 'string') {
    throw new InvalidDataError(`Currency must be a string (${context})`)
  }
  const normalized = currency.trim().toUpperCase()
  if (!CURRENCY_RE.test(normalized)) {
    throw new InvalidDataError(`Invalid currency code "${currency}" (${context})`)
  }
  return normalized
}

export function validateAmount(amount: unknown, context: string): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new InvalidDataError(`Amount must be a finite number (${context})`)
  }
  if (amount < 0) {
    throw new InvalidDataError(`Amount cannot be negative (${context})`)
  }
  return amount
}

/** Строгий парсинг: Number() сам по себе пропускает "", "1e3", "0x10", "Infinity" */
export function parseAmount(raw: string, context: string): number {
  if (!AMOUNT_RE.test(raw)) {
    throw new InvalidDataError(`Invalid amount "${raw}" (${context})`)
  }
  return validateAmount(Number(raw), context)
}

export const toCents = (amount: number): number => Math.round(amount * 100)
export const fromCents = (cents: number): number => cents / 100

/** "300 USD" -> { amount: 300, currency: "USD" } */
export function parseMoneyString(value: unknown, context: string): Money {
  if (typeof value !== 'string') {
    throw new InvalidDataError(
      `Money value must be a string, got ${typeof value} (${context})`,
    )
  }
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 2) {
    throw new InvalidDataError(
      `Invalid money string "${value}", expected "<amount> <CURRENCY>" (${context})`,
    )
  }
  const [rawAmount, rawCurrency] = parts as [string, string]
  return {
    amount: parseAmount(rawAmount, context),
    currency: normalizeCurrency(rawCurrency, context),
  }
}

/** Курс from -> to через базовую валюту провайдера: 1 from = rates[to] / rates[from] to */
export function getRate(from: string, to: string, { base, rates }: ExchangeRates): number {
  if (from === to) return 1

  const fromRate = rates[from]
  const toRate = rates[to]
  if (!fromRate) throw new InvalidDataError(`No exchange rate for ${from} (base ${base})`)
  if (!toRate) throw new InvalidDataError(`No exchange rate for ${to} (base ${base})`)

  return toRate / fromRate
}
