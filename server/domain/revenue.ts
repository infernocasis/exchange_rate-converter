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
  paymentsCount: number
}

interface CurrencyAccumulator {
  cents: number
  paymentsCount: number
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

/** Прибавляет сумму и одну оплату к накопителю своей валюты */
function addPayment(byCurrency: Map<string, CurrencyAccumulator>, { amount, currency }: Money) {
  const acc = byCurrency.get(currency) ?? { cents: 0, paymentsCount: 0 }
  acc.cents += toCents(amount)
  acc.paymentsCount += 1
  byCurrency.set(currency, acc)
}

/**
 * Чистая функция: считает выручку отдельно по каждой валюте.
 * Один проход по каждому источнику, без промежуточных массивов.
 * Возвращает [{ total, currency, paymentsCount }, ...]; пустой массив, если оплат нет.
 */
export function calculateDailyRevenue(orderData: unknown, cashPayments: unknown): CurrencyTotal[] {
  assertSourcesShape(orderData, cashPayments)

  const byCurrency = new Map<string, CurrencyAccumulator>()

  // Источник 1: берём только paid, остальные пропускаем без валидации
  orderData.transactions.forEach((transaction, index) => {
    if (transaction?.type !== 'paid') return

    const context = `transactions[${index}]`
    addPayment(byCurrency, {
      amount: validateAmount(transaction.amount, context),
      currency: normalizeCurrency(transaction.currency, context),
    })
  })

  // Источник 2: каждая строка "300 USD" — оплата
  ;(cashPayments as unknown[]).forEach((value, index) => {
    addPayment(byCurrency, parseMoneyString(value, `cashPayments[${index}]`))
  })

  return Array.from(byCurrency, ([currency, { cents, paymentsCount }]) => ({
    total: fromCents(cents),
    currency,
    paymentsCount,
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
  const items = totalsByCurrency.map(({ total, currency, paymentsCount }) => {
    const rate = getRate(currency, targetCurrency, exchangeRates)
    return {
      currency,
      total,
      rate,
      paymentsCount,
      convertedCents: Math.round(toCents(total) * rate),
    }
  })

  const totalCents = items.reduce((sum, item) => sum + item.convertedCents, 0)
  const paymentsCount = items.reduce((sum, item) => sum + item.paymentsCount, 0)

  const breakdown = items
    .map(({ currency, total, rate, paymentsCount, convertedCents }) => ({
      currency,
      total,
      rate,
      converted: fromCents(convertedCents),
      share: totalCents > 0 ? convertedCents / totalCents : 0,
      paymentsCount,
    }))
    .sort((a, b) => b.converted - a.converted)

  return { total: fromCents(totalCents), currency: targetCurrency, paymentsCount, breakdown }
}
