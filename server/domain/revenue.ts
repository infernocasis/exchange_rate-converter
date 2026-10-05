import type { DailyRevenue } from '#shared/types/revenue'
import {
  type ExchangeRates,
  type Money,
  InvalidDataError,
  fromCents,
  getRate,
  normalizeCurrency,
  parseMoneyString,
  toCents,
  validateAmount,
} from './money'

export interface CurrencyTotal {
  currency: string
  total: number
}

interface Transaction {
  type?: unknown
  amount?: unknown
  currency?: unknown
}

function assertSourcesShape(
  orderData: unknown,
  cashPayments: unknown,
): asserts orderData is { transactions: Transaction[] } {
  if (
    orderData == null
    || typeof orderData !== 'object'
    || !Array.isArray((orderData as { transactions?: unknown }).transactions)
  ) {
    throw new InvalidDataError('Source 1 must be an object with a `transactions` array')
  }
  if (!Array.isArray(cashPayments)) {
    throw new InvalidDataError('Source 2 must be an array of money strings')
  }
}

/** Прибавляет сумму к накопителю своей валюты */
function addPayment(centsByCurrency: Map<string, number>, { amount, currency }: Money) {
  centsByCurrency.set(currency, (centsByCurrency.get(currency) ?? 0) + toCents(amount))
}

/**
 * Чистая функция: считает выручку отдельно по каждой валюте.
 * Один проход по каждому источнику, без промежуточных массивов.
 * Возвращает [{ total, currency }, ...]; пустой массив, если оплат нет.
 */
export function calculateDailyRevenue(orderData: unknown, cashPayments: unknown): CurrencyTotal[] {
  assertSourcesShape(orderData, cashPayments)

  const centsByCurrency = new Map<string, number>()

  // Источник 1: берём только paid, остальные пропускаем без валидации
  orderData.transactions.forEach((transaction, index) => {
    if (transaction?.type !== 'paid') return

    const context = `transactions[${index}]`
    addPayment(centsByCurrency, {
      amount: validateAmount(transaction.amount, context),
      currency: normalizeCurrency(transaction.currency, context),
    })
  })

  // Источник 2: каждая строка "300 USD" — оплата
  ;(cashPayments as unknown[]).forEach((value, index) => {
    addPayment(centsByCurrency, parseMoneyString(value, `cashPayments[${index}]`))
  })

  return Array.from(centsByCurrency, ([currency, cents]) => ({
    total: fromCents(cents),
    currency,
  }))
}

/**
 * Чистая функция: [{ total, currency }, ...] + курсы -> итог в целевой валюте.
 * Сначала суммируем внутри каждой валюты, потом конвертируем один раз —
 * меньше ошибок округления, чем при конвертации каждого платежа.
 */
export function convertRevenue(
  totalsByCurrency: CurrencyTotal[],
  exchangeRates: ExchangeRates,
  targetCurrency: string,
): Omit<DailyRevenue, 'ratesDate'> {
  const items = totalsByCurrency.map(({ total, currency }) => {
    const rate = getRate(currency, targetCurrency, exchangeRates)
    return {
      currency,
      total,
      rate,
      convertedCents: Math.round(toCents(total) * rate),
    }
  })

  const totalCents = items.reduce((sum, item) => sum + item.convertedCents, 0)

  const breakdown = items
    .map(({ currency, total, rate, convertedCents }) => ({
      currency,
      total,
      rate,
      converted: fromCents(convertedCents),
      share: totalCents > 0 ? convertedCents / totalCents : 0,
    }))
    .sort((a, b) => b.converted - a.converted)

  return { total: fromCents(totalCents), currency: targetCurrency, breakdown }
}
