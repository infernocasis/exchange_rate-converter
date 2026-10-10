import type { DataSource, IssueSeverity, SourceId, SourceIssue, SourceIssueCode } from '#shared/types/sources'

interface SourceInfo {
  title: string
  role: (context: { targetCurrency: string, cacheMinutes: number }) => string
}

export const SOURCE_INFO: Record<SourceId, SourceInfo> = {
  transactions: {
    title: 'Транзакции заказов',
    role: () => 'В выручку идут только транзакции со статусом paid. Ожидающие и отклонённые пропускаются.',
  },
  cashPayments: {
    title: 'Платежи наличными',
    role: () => 'Каждая строка — отдельная оплата в формате «сумма валюта». В выручку идут все строки.',
  },
  exchangeRates: {
    title: 'Курсы валют',
    role: ({ targetCurrency, cacheMinutes }) =>
      `Пересчитывают суммы в ${targetCurrency}. Провайдер — CurrencyFreaks, сервер обновляет курсы раз в ${cacheMinutes} мин. Ниже — только валюты, нужные для расчёта.`,
  },
}

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: 'Ломает расчёт',
  warning: 'Нарушение формата',
  info: 'Замечание',
}

interface IssueText {
  title: string
  explain: (detail?: string) => string
}

const ISSUE_TEXT: Record<SourceIssueCode, IssueText> = {
  SHAPE: {
    title: 'Ответ в неожиданном формате',
    explain: () => 'Структура ответа не совпадает с ожидаемой, поэтому прочитать данные нельзя.',
  },
  RECORD_INVALID: {
    title: 'Запись не читается',
    explain: () => 'Запись не того типа. Если это оплата, она не попадёт в выручку, а расчёт остановится с ошибкой.',
  },
  EXTRA_FIELDS: {
    title: 'Лишние данные в ответе',
    explain: detail => `Кроме транзакций приходит ${detail ? `«${detail}»` : 'что-то ещё'}. Для расчёта это не нужно; если это персональные данные, их лучше не отдавать.`,
  },
  NO_ID: {
    title: 'У записей нет идентификатора',
    explain: () => 'Без id нельзя отличить дубль от двух одинаковых оплат и сверить данные с учётной системой.',
  },
  NO_DATE: {
    title: 'У записей нет даты',
    explain: () => 'Нельзя проверить, что все оплаты относятся к сегодняшнему дню.',
  },
  TYPE_CASE: {
    title: 'Статус paid записан иначе',
    explain: () => 'Приложение ждёт ровно «paid». Такая оплата молча не попадает в выручку.',
  },
  TYPE_UNKNOWN: {
    title: 'Неизвестный статус',
    explain: () => 'Приложение считает такую транзакцию неоплаченной. Если это оплата, выручка занижена.',
  },
  AMOUNT_NOT_NUMBER: {
    title: 'Сумма не число',
    explain: () => 'Сумма пришла строкой или не пришла вовсе. Для оплаты это останавливает расчёт.',
  },
  AMOUNT_NEGATIVE: {
    title: 'Отрицательная сумма',
    explain: () => 'Для оплаты это останавливает расчёт. Возвраты должны приходить отдельным статусом.',
  },
  AMOUNT_PRECISION: {
    title: 'Больше двух знаков после запятой',
    explain: () => 'Приложение округляет до центов — возможна разница в копейках с учётной системой.',
  },
  MONEY_FORMAT: {
    title: 'Строка не в формате «сумма валюта»',
    explain: () => 'Сумма должна быть числом с точкой и не больше двух знаков, через один пробел — код валюты. Иначе расчёт останавливается.',
  },
  WHITESPACE: {
    title: 'Лишние пробелы',
    explain: () => 'Приложение их обрезает, но это признак того, что строки собираются без проверки.',
  },
  FLAT_STRINGS: {
    title: 'Платежи — просто строки',
    explain: () => 'Нет id, даты и статуса: нельзя отличить оплату от возврата или найти дубль. Формат отличается от транзакций заказов.',
  },
  CURRENCY_CASE: {
    title: 'Код валюты не заглавными буквами',
    explain: () => 'Приложение исправляет регистр само, поэтому цифры верные. Но по стандарту ISO 4217 коды пишутся заглавными, и другие потребители API могут посчитать «usd» и «USD» разными валютами.',
  },
  CURRENCY_FORMAT: {
    title: 'Код валюты не из трёх букв',
    explain: () => 'Такой код не распознаётся, и расчёт останавливается.',
  },
  CURRENCY_NOT_ISO: {
    title: 'Такой валюты не существует',
    explain: () => 'Кода нет в ISO 4217. Если у провайдера нет курса — расчёт остановится; если есть (например, криптовалюта BTC) — сумма молча пересчитается по курсу другого актива.',
  },
  CURRENCY_NO_RATE: {
    title: 'Нет курса для валюты',
    explain: () => 'Сумму не во что пересчитать, вместо выручки будет ошибка.',
  },
  RATES_NO_DATE: {
    title: 'Неизвестна дата курсов',
    explain: () => 'Нельзя понять, насколько свежий курс использован.',
  },
  RATES_STALE: {
    title: 'Курсы устарели',
    explain: detail => `Курсам ${detail ?? 'больше 36'} ч — выручка пересчитана по старому курсу.`,
  },
  RATES_NON_ISO: {
    title: 'В курсах есть не только валюты',
    explain: detail => `${detail ? pluralize(Number(detail), { one: 'код', few: 'кода', many: 'кодов' }) : 'Часть кодов'} у провайдера — криптовалюты и токены. Трёхбуквенные из них (BTC, ETH) похожи на валюты, поэтому важна проверка кодов в данных.`,
  },
}

export function describeIssue({ code, detail }: SourceIssue): { title: string, explanation: string } {
  const { title, explain } = ISSUE_TEXT[code]
  return { title, explanation: explain(detail) }
}

/** Где встретилась проблема: «в 9 из 9 записей» или «во всём ответе» */
export function describeIssueScope({ occurrences }: SourceIssue, recordsTotal: number): string {
  const records = new Set(occurrences.map(o => o.index).filter(index => index !== null))
  if (records.size === 0) return 'Во всём ответе'
  return `В ${records.size} из ${pluralize(recordsTotal, { one: 'записи', few: 'записей', many: 'записей' })}`
}

export type SourceTone = 'down' | IssueSeverity | 'ok'

/** Худшая проблема источника и короткий текст статуса */
export function describeSourceStatus(source: DataSource): { tone: SourceTone, text: string } {
  if (!source.available) return { tone: 'down', text: 'Недоступен' }

  const count = (severity: IssueSeverity) => source.issues.filter(issue => issue.severity === severity).length
  const critical = count('critical')
  const warning = count('warning')
  const info = count('info')

  const parts = [
    critical && pluralize(critical, { one: 'ошибка', few: 'ошибки', many: 'ошибок' }),
    warning && pluralize(warning, { one: 'предупреждение', few: 'предупреждения', many: 'предупреждений' }),
    info && pluralize(info, { one: 'замечание', few: 'замечания', many: 'замечаний' }),
  ].filter(Boolean)

  const tone: SourceTone = critical ? 'critical' : warning ? 'warning' : info ? 'info' : 'ok'
  return { tone, text: parts.length ? parts.join(', ') : 'Без замечаний' }
}
