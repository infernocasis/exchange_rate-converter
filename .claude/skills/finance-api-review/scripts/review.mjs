#!/usr/bin/env node
/**
 * Аудит ответов финансового API: /finance1, /finance2 и курсы CurrencyFreaks.
 * Ищет проблемы на стороне сервера и пишет отчёт для backend-разработчиков.
 *
 * Запуск из корня проекта:
 *   node .claude/skills/finance-api-audit/scripts/audit.mjs            — живые запросы
 *   node .claude/skills/finance-api-audit/scripts/audit.mjs --snapshot <file.json>
 *   ... --out <dir>   — куда писать (по умолчанию docs/reports/api-audit/<дата-время>)
 *
 * Результат: <out>/snapshot.json, <out>/findings.json, <out>/report.md
 * Ключи API читаются из .env и никуда не пишутся.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = process.cwd()
const { values: args } = parseArgs({
  options: { out: { type: 'string' }, snapshot: { type: 'string' } },
})

const DEFAULTS = {
  NUXT_FINANCE_BASE_URL: 'https://cpa-server-vtel.onrender.com/api',
  NUXT_FINANCE_TIMEOUT_MS: '60000',
  NUXT_EXCHANGE_RATES_BASE_URL: 'https://api.currencyfreaks.com/v2.0',
  NUXT_EXCHANGE_RATES_TIMEOUT_MS: '10000',
}

const ISO_CURRENCIES = new Set(Intl.supportedValuesOf('currency'))
const CURRENCY_RE = /^[A-Z]{3}$/
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
const KNOWN_TYPES = new Set(['paid', 'pending', 'rejected'])
const EXPECTED_TX_KEYS = new Set(['type', 'amount', 'currency'])
const ID_KEYS = ['id', '_id', 'transactionId', 'uuid']
const DATE_KEYS = ['date', 'createdAt', 'paidAt', 'timestamp', 'time']
const SLOW_RESPONSE_MS = 10_000
const STALE_RATES_H = 36
const MAX_EXAMPLES = 8

const SEVERITY = {
  critical: { order: 0, icon: '🔴', label: 'Критично' },
  warning: { order: 1, icon: '🟡', label: 'Предупреждение' },
  info: { order: 2, icon: '🔵', label: 'К сведению' },
}

const ENDPOINT_LABEL = {
  finance1: 'GET /finance1',
  finance2: 'GET /finance2',
  rates: 'GET /rates/latest (CurrencyFreaks)',
}

/**
 * Каталог проверок. impact — что видит клиент, fix — что сделать на сервере.
 * Проверки CUR-* общие для обоих источников, в отчёте группируются по эндпоинту.
 */
const CHECKS = {
  'HTTP-STATUS': {
    severity: 'critical',
    title: 'Эндпоинт не вернул успешный ответ',
    impact: 'Страница выручки показывает ошибку, расчёт невозможен.',
    fix: 'Проверить доступность сервиса, авторизацию по `x-api-key` и логи сервера.',
  },
  'HTTP-JSON': {
    severity: 'critical',
    title: 'Тело ответа — не валидный JSON',
    impact: 'Клиент не может разобрать ответ, расчёт падает.',
    fix: 'Всегда отдавать JSON, в том числе в ответах с ошибкой.',
  },
  'HTTP-CONTENT-TYPE': {
    severity: 'warning',
    title: 'Content-Type не application/json',
    impact: 'HTTP-клиенты могут не распарсить тело автоматически.',
    fix: 'Отдавать `Content-Type: application/json; charset=utf-8`.',
  },
  'HTTP-SLOW': {
    severity: 'info',
    title: `Ответ дольше ${SLOW_RESPONSE_MS / 1000} с`,
    impact: 'Пользователь долго видит скелетон загрузки. Похоже на «холодный старт» хостинга.',
    fix: 'Держать инстанс «тёплым» или перейти на тариф без засыпания.',
  },

  'F1-SHAPE': {
    severity: 'critical',
    title: 'Ответ не объект с массивом `transactions`',
    impact: 'Клиент не может прочитать транзакции, расчёт падает.',
    fix: 'Вернуть `{ "transactions": [...] }`.',
  },
  'F1-EMPTY': {
    severity: 'info',
    title: 'Список транзакций пуст',
    impact: 'Выручка из источника 1 равна нулю. Если за день были оплаты — это ошибка выборки.',
    fix: 'Убедиться, что пустой список — ожидаемое состояние.',
  },
  'F1-ROOT-EXTRA': {
    severity: 'info',
    title: 'В ответе есть поля, не относящиеся к транзакциям',
    impact: 'Клиент их игнорирует. Если это персональные данные — лишняя утечка наружу.',
    fix: 'Убрать из финансового эндпоинта поля, которые не нужны для расчёта, или вынести в отдельный эндпоинт.',
  },
  'F1-RECORD-NOT-OBJECT': {
    severity: 'critical',
    title: 'Транзакция — не объект',
    impact: 'Запись не читается; если это оплата — она потеряна.',
    fix: 'Каждый элемент `transactions` — объект `{ type, amount, currency }`.',
  },
  'F1-TYPE-MISSING': {
    severity: 'critical',
    title: 'У транзакции нет строкового `type`',
    impact: 'Невозможно понять, оплачена ли транзакция; клиент её пропускает.',
    fix: 'Поле `type` обязательно, строка из фиксированного набора.',
  },
  'F1-TYPE-CASE': {
    severity: 'critical',
    title: 'Статус `paid` в другом регистре или с пробелами',
    impact: 'Клиент сравнивает строго с `"paid"` — такая оплата **молча не попадает в выручку**.',
    fix: 'Отдавать статусы строго в нижнем регистре без пробелов: `paid`, `pending`, `rejected`.',
  },
  'F1-TYPE-UNKNOWN': {
    severity: 'warning',
    title: 'Неизвестный статус транзакции',
    impact: 'Клиент считает такую транзакцию неоплаченной. Если это разновидность оплаты — выручка занижена.',
    fix: 'Задокументировать полный список статусов или привести к известным.',
  },
  'F1-AMOUNT-TYPE': {
    severity: 'critical',
    title: 'Сумма передана строкой, а не числом',
    impact: 'Для оплаты (`paid`) клиент отклоняет весь ответ (`INVALID_UPSTREAM_DATA`).',
    fix: 'Передавать `amount` числом: `100.5`, а не `"100.5"`.',
  },
  'F1-AMOUNT-INVALID': {
    severity: 'critical',
    title: 'Сумма отсутствует или не конечное число',
    impact: 'Для оплаты клиент отклоняет весь ответ.',
    fix: '`amount` — обязательное конечное число.',
  },
  'F1-AMOUNT-NEGATIVE': {
    severity: 'critical',
    title: 'Отрицательная сумма',
    impact: 'Для оплаты клиент отклоняет весь ответ. Возвраты должны иметь свой статус, а не минус в `paid`.',
    fix: 'Суммы неотрицательные; возвраты — отдельным `type`.',
  },
  'F1-AMOUNT-PRECISION': {
    severity: 'warning',
    title: 'Больше 2 знаков после запятой',
    impact: 'Клиент округляет до центов — возможно расхождение на копейки с учётной системой.',
    fix: 'Отдавать суммы с точностью до минимальной единицы валюты (2 знака) или в целых центах.',
  },
  'F1-AMOUNT-ZERO': {
    severity: 'info',
    title: 'Оплата на нулевую сумму',
    impact: 'Не влияет на сумму, но подозрительна для `paid`.',
    fix: 'Проверить, должна ли такая запись иметь статус `paid`.',
  },
  'F1-EXTRA-FIELDS': {
    severity: 'info',
    title: 'Неожиданные поля в транзакции',
    impact: 'Клиент их игнорирует. Может означать, что контракт изменился без уведомления.',
    fix: 'Согласовать изменение контракта или убрать поля.',
  },
  'F1-NO-ID': {
    severity: 'info',
    title: 'У транзакций нет уникального идентификатора',
    impact: 'Невозможно отличить дубль от двух одинаковых оплат и сверить данные с учётной системой.',
    fix: 'Добавить `id` в каждую транзакцию.',
  },
  'F1-NO-DATE': {
    severity: 'info',
    title: 'У транзакций нет даты',
    impact: 'Клиент не может проверить, что все оплаты относятся к нужному дню.',
    fix: 'Добавить дату оплаты в ISO 8601 (`2026-10-10T12:00:00Z`).',
  },
  'F1-DUPLICATE': {
    severity: 'info',
    title: 'Полностью одинаковые оплаты',
    impact: 'Без `id` нельзя понять, это две оплаты или дубль. Если дубль — выручка завышена.',
    fix: 'Добавить `id`; проверить выборку на дубли.',
  },

  'F2-SHAPE': {
    severity: 'critical',
    title: 'Ответ — не массив',
    impact: 'Клиент не может прочитать платежи, расчёт падает.',
    fix: 'Вернуть массив платежей.',
  },
  'F2-ITEM-TYPE': {
    severity: 'critical',
    title: 'Элемент массива — не строка',
    impact: 'Клиент отклоняет весь ответ.',
    fix: 'Каждый элемент — строка формата `"<сумма> <ВАЛЮТА>"`.',
  },
  'F2-FORMAT': {
    severity: 'critical',
    title: 'Строка не в формате `"<сумма> <ВАЛЮТА>"`',
    impact: 'Клиент отклоняет весь ответ.',
    fix: 'Ровно две части через один пробел: `"300.50 USD"`.',
  },
  'F2-WHITESPACE': {
    severity: 'warning',
    title: 'Лишние пробелы в строке платежа',
    impact: 'Клиент их обрезает, но это признак ручной/непроверенной сборки строк.',
    fix: 'Формировать строку без пробелов по краям и с одним пробелом между частями.',
  },
  'F2-AMOUNT-FORMAT': {
    severity: 'critical',
    title: 'Сумма в строке в недопустимом формате',
    impact: 'Клиент отклоняет весь ответ (запятая, знак, экспонента, >2 знаков — не принимаются).',
    fix: 'Сумма — неотрицательное число с точкой и не более 2 знаков: `300`, `300.5`, `300.50`.',
  },
  'F2-STRUCTURE': {
    severity: 'info',
    title: 'Платежи — плоские строки без структуры',
    impact: 'Нет id, даты и статуса: нельзя сверить, отфильтровать неоплаченные или найти дубли. Форматы двух источников разные.',
    fix: 'Отдавать объекты в том же формате, что и `/finance1`: `{ id, type, amount, currency, date }`.',
  },

  'CUR-MISSING': {
    severity: 'critical',
    title: 'Код валюты отсутствует или не строка',
    impact: 'Для оплаты клиент отклоняет весь ответ.',
    fix: 'Валюта обязательна: строка ISO 4217.',
  },
  'CUR-WHITESPACE': {
    severity: 'warning',
    title: 'Пробелы вокруг кода валюты',
    impact: 'Клиент обрезает их сам, но это нарушение контракта.',
    fix: 'Отдавать код без пробелов.',
  },
  'CUR-CASE': {
    severity: 'warning',
    title: 'Код валюты не в верхнем регистре',
    impact: 'Клиент нормализует регистр сам, поэтому расчёт верный. Но ISO 4217 требует верхний регистр, и любой другой потребитель API со строгим сравнением (`=== "USD"`) получит ошибку или разнесёт одну валюту на две.',
    fix: 'Отдавать коды валют в верхнем регистре: `USD`, `EUR`.',
  },
  'CUR-FORMAT': {
    severity: 'critical',
    title: 'Код валюты не из 3 латинских букв',
    impact: 'Клиент отклоняет весь ответ.',
    fix: 'Использовать коды ISO 4217 (3 буквы).',
  },
  'CUR-NOT-ISO': {
    severity: 'critical',
    title: 'Код валюты не существует в ISO 4217',
    impact: 'Если у провайдера курсов нет такого кода — расчёт падает. Если есть (например, крипто-тикер `BTC`) — сумма **молча пересчитается** по курсу другого актива.',
    fix: 'Принимать и отдавать только коды ISO 4217; валидировать на входе в систему.',
  },
  'CUR-NO-RATE': {
    severity: 'critical',
    title: 'Для валюты нет курса у провайдера',
    impact: 'Клиент не может пересчитать сумму и показывает ошибку вместо выручки.',
    fix: 'Согласовать список поддерживаемых валют или проверить, что код корректен.',
  },
  'CUR-INCONSISTENT': {
    severity: 'warning',
    title: 'Одна валюта записана по-разному',
    impact: 'Клиент приводит написание к одному виду, но потребитель без нормализации посчитает одну валюту как несколько.',
    fix: 'Единый формат кода валюты во всех эндпоинтах.',
  },

  'R-SHAPE': {
    severity: 'critical',
    title: 'Ответ провайдера без `base` или `rates`',
    impact: 'Конвертация невозможна.',
    fix: 'Проверить тариф и ключ CurrencyFreaks.',
  },
  'R-DATE': {
    severity: 'warning',
    title: 'Нет даты курсов или она в неожиданном формате',
    impact: 'Пользователь не видит, на какую дату курс.',
    fix: 'Сообщить провайдеру / обработать формат на клиенте.',
  },
  'R-STALE': {
    severity: 'warning',
    title: `Курсы старше ${STALE_RATES_H} ч`,
    impact: 'Выручка пересчитана по устаревшему курсу.',
    fix: 'Проверить тариф провайдера и кеш.',
  },
  'R-VALUE-INVALID': {
    severity: 'warning',
    title: 'Нечисловые или неположительные курсы',
    impact: 'Клиент отбрасывает такие курсы; если валюта нужна — расчёт упадёт.',
    fix: 'Сообщить провайдеру.',
  },
  'R-VALUE-STRING': {
    severity: 'info',
    title: 'Курсы переданы строками',
    impact: 'Клиент приводит к числу сам. Поведение задокументировано у провайдера.',
    fix: 'Действий не требуется.',
  },
  'R-NON-ISO': {
    severity: 'info',
    title: 'В списке курсов есть не-ISO коды (криптовалюты, токены)',
    impact: 'Трёхбуквенные тикеры (`BTC`, `ETH`, `SOL`…) проходят проверку формата — поэтому важна проверка `CUR-NOT-ISO` на стороне API.',
    fix: 'Действий от провайдера не требуется; учитывать на стороне API/клиента.',
  },
}

// ---------- окружение и загрузка данных ----------

function loadEnv() {
  const env = { ...DEFAULTS }
  const file = path.join(ROOT, '.env')
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (match && match[2]) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('NUXT_') && process.env[key]) env[key] = process.env[key]
  }
  return env
}

const trimSlash = url => url.replace(/\/+$/, '')

async function fetchEndpoint(url, { headers = {}, query = {}, timeoutMs }) {
  const target = new URL(url)
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value)

  const started = performance.now()
  const result = { url, status: null, contentType: null, durationMs: 0, body: undefined }
  try {
    const response = await fetch(target, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    result.status = response.status
    result.contentType = response.headers.get('content-type')
    try {
      result.body = JSON.parse(text)
    }
    catch {
      result.jsonError = true
      result.bodyPreview = text.slice(0, 300)
    }
  }
  catch (error) {
    // Сообщение без URL: в query у CurrencyFreaks лежит ключ
    result.error = error?.name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : `network error (${error?.cause?.code ?? error?.name})`
  }
  result.durationMs = Math.round(performance.now() - started)
  return result
}

async function takeSnapshot() {
  const env = loadEnv()
  const missing = ['NUXT_FINANCE_API_KEY', 'NUXT_EXCHANGE_RATES_API_KEY'].filter(key => !env[key])
  if (missing.length) {
    console.error(`Не заданы переменные окружения: ${missing.join(', ')} (см. .env.example)`)
    process.exit(2)
  }

  const financeBase = trimSlash(env.NUXT_FINANCE_BASE_URL)
  const ratesBase = trimSlash(env.NUXT_EXCHANGE_RATES_BASE_URL)
  const financeOptions = {
    headers: { 'x-api-key': env.NUXT_FINANCE_API_KEY },
    timeoutMs: Number(env.NUXT_FINANCE_TIMEOUT_MS) || 60_000,
  }

  // Один запрос на эндпоинт: у провайдера курсов маленький лимит
  const [finance1, finance2, rates] = await Promise.all([
    fetchEndpoint(`${financeBase}/finance1`, financeOptions),
    fetchEndpoint(`${financeBase}/finance2`, financeOptions),
    fetchEndpoint(`${ratesBase}/rates/latest`, {
      query: { apikey: env.NUXT_EXCHANGE_RATES_API_KEY },
      timeoutMs: Number(env.NUXT_EXCHANGE_RATES_TIMEOUT_MS) || 10_000,
    }),
  ])

  return { takenAt: new Date().toISOString(), mode: 'live', endpoints: { finance1, finance2, rates } }
}

// ---------- проверки ----------

function createCollector() {
  const findings = new Map()
  const evaluated = new Set()

  const keyOf = (id, endpoint) => `${id}@${endpoint}`

  return {
    ran(endpoint, ...ids) {
      ids.forEach(id => evaluated.add(keyOf(id, endpoint)))
    },
    hit(id, endpoint, where, value, note) {
      const key = keyOf(id, endpoint)
      evaluated.add(key)
      if (!findings.has(key)) findings.set(key, { id, endpoint, ...CHECKS[id], occurrences: [] })
      findings.get(key).occurrences.push({ where, value, note })
    },
    result() {
      const list = [...findings.values()].sort((a, b) =>
        SEVERITY[a.severity].order - SEVERITY[b.severity].order || a.id.localeCompare(b.id))
      const passed = [...evaluated]
        .filter(key => !findings.has(key))
        .map((key) => {
          const [id, endpoint] = key.split('@')
          return { id, endpoint, title: CHECKS[id].title }
        })
        .sort((a, b) => a.endpoint.localeCompare(b.endpoint) || a.id.localeCompare(b.id))
      return { findings: list, passed }
    },
  }
}

const show = value => (typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value) ?? String(value))

function checkTransport(c, name, ep) {
  c.ran(name, 'HTTP-STATUS', 'HTTP-JSON', 'HTTP-CONTENT-TYPE', 'HTTP-SLOW')
  if (ep.error || !ep.status || ep.status >= 400) {
    c.hit('HTTP-STATUS', name, ENDPOINT_LABEL[name], ep.error ?? `HTTP ${ep.status}`)
    return false
  }
  if (ep.jsonError) {
    c.hit('HTTP-JSON', name, ENDPOINT_LABEL[name], ep.bodyPreview)
    return false
  }
  if (!/application\/json/i.test(ep.contentType ?? '')) {
    c.hit('HTTP-CONTENT-TYPE', name, ENDPOINT_LABEL[name], ep.contentType ?? '(нет заголовка)')
  }
  if (ep.durationMs > SLOW_RESPONSE_MS) {
    c.hit('HTTP-SLOW', name, ENDPOINT_LABEL[name], `${(ep.durationMs / 1000).toFixed(1)} с`)
  }
  return true
}

/** Проверяет код валюты; возвращает нормализованный код или null */
function checkCurrency(c, endpoint, where, raw, rates, spellings) {
  c.ran(endpoint, 'CUR-MISSING', 'CUR-WHITESPACE', 'CUR-CASE', 'CUR-FORMAT', 'CUR-NOT-ISO')
  if (rates) c.ran(endpoint, 'CUR-NO-RATE')

  if (typeof raw !== 'string' || !raw.trim()) {
    c.hit('CUR-MISSING', endpoint, where, show(raw))
    return null
  }
  if (raw !== raw.trim()) c.hit('CUR-WHITESPACE', endpoint, where, show(raw))

  const code = raw.trim().toUpperCase()
  if (!CURRENCY_RE.test(code)) {
    c.hit('CUR-FORMAT', endpoint, where, show(raw))
    return null
  }
  if (raw.trim() !== code) c.hit('CUR-CASE', endpoint, where, show(raw), `ожидается "${code}"`)

  if (!spellings.has(code)) spellings.set(code, new Map())
  const bySpelling = spellings.get(code)
  bySpelling.set(raw, (bySpelling.get(raw) ?? new Set()).add(endpoint))

  if (!ISO_CURRENCIES.has(code)) {
    const hasRate = rates && code in rates
    c.hit('CUR-NOT-ISO', endpoint, where, show(raw), hasRate
      ? 'у провайдера есть курс — сумма молча пересчитается'
      : 'курса нет — расчёт упадёт')
  }
  else if (rates && !(code in rates)) {
    c.hit('CUR-NO-RATE', endpoint, where, show(raw))
  }
  return code
}

function describeAmountProblem(raw) {
  if (raw.includes(',')) return 'запятая вместо точки'
  if (/^[+-]/.test(raw)) return 'знак перед суммой'
  if (/e/i.test(raw)) return 'экспоненциальная запись'
  if (/^\d+\.\d{3,}$/.test(raw)) return 'больше 2 знаков после точки'
  if (/^\./.test(raw) || /\.$/.test(raw)) return 'неполная дробь'
  return 'не число'
}

function checkFinance1(c, body, rates, spellings, stats) {
  const ep = 'finance1'
  c.ran(ep, 'F1-SHAPE')
  if (body == null || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.transactions)) {
    c.hit('F1-SHAPE', ep, 'body', show(body).slice(0, 120))
    return
  }

  c.ran(ep, 'F1-EMPTY', 'F1-ROOT-EXTRA')
  const extraRoot = Object.keys(body).filter(key => key !== 'transactions')
  if (extraRoot.length) c.hit('F1-ROOT-EXTRA', ep, 'body', extraRoot.join(', '))

  const { transactions } = body
  if (transactions.length === 0) c.hit('F1-EMPTY', ep, 'transactions', '[]')

  c.ran(ep, 'F1-RECORD-NOT-OBJECT', 'F1-TYPE-MISSING', 'F1-TYPE-CASE', 'F1-TYPE-UNKNOWN',
    'F1-AMOUNT-TYPE', 'F1-AMOUNT-INVALID', 'F1-AMOUNT-NEGATIVE', 'F1-AMOUNT-PRECISION',
    'F1-AMOUNT-ZERO', 'F1-EXTRA-FIELDS', 'F1-NO-ID', 'F1-NO-DATE', 'F1-DUPLICATE')

  const seenPaid = new Map()
  let hasId = false
  let hasDate = false

  transactions.forEach((tx, index) => {
    const where = `transactions[${index}]`
    if (tx == null || typeof tx !== 'object' || Array.isArray(tx)) {
      c.hit('F1-RECORD-NOT-OBJECT', ep, where, show(tx))
      return
    }
    hasId ||= ID_KEYS.some(key => key in tx)
    hasDate ||= DATE_KEYS.some(key => key in tx)

    const extra = Object.keys(tx).filter(key => !EXPECTED_TX_KEYS.has(key) && !ID_KEYS.includes(key) && !DATE_KEYS.includes(key))
    if (extra.length) c.hit('F1-EXTRA-FIELDS', ep, where, extra.join(', '))

    const { type, amount, currency } = tx
    if (typeof type !== 'string') {
      c.hit('F1-TYPE-MISSING', ep, where, show(type))
    }
    else if (type !== 'paid' && type.trim().toLowerCase() === 'paid') {
      c.hit('F1-TYPE-CASE', ep, where, show(type), `сумма ${show(amount)} ${show(currency)} не учтена`)
    }
    else if (!KNOWN_TYPES.has(type)) {
      c.hit('F1-TYPE-UNKNOWN', ep, where, show(type))
    }
    const isPaid = type === 'paid'
    stats.types.set(type, (stats.types.get(type) ?? 0) + 1)

    const scope = isPaid ? '' : `статус ${show(type)} — клиент не учитывает`
    if (typeof amount === 'string') {
      c.hit('F1-AMOUNT-TYPE', ep, where, show(amount), scope)
    }
    else if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      c.hit('F1-AMOUNT-INVALID', ep, where, show(amount), scope)
    }
    else {
      if (amount < 0) c.hit('F1-AMOUNT-NEGATIVE', ep, where, show(amount), scope)
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) c.hit('F1-AMOUNT-PRECISION', ep, where, show(amount), scope)
      if (amount === 0 && isPaid) c.hit('F1-AMOUNT-ZERO', ep, where, show(amount))
    }

    const code = checkCurrency(c, ep, where, currency, rates, spellings)
    if (isPaid) {
      const key = JSON.stringify(tx)
      seenPaid.set(key, [...(seenPaid.get(key) ?? []), index])
      if (code && typeof amount === 'number') {
        stats.paid.set(code, (stats.paid.get(code) ?? 0) + Math.round(amount * 100))
      }
    }
  })

  // Значения в отчёте и так в `code` — без вложенных обратных кавычек
  if (transactions.length && !hasId) c.hit('F1-NO-ID', ep, 'transactions[*]', `нет полей ${ID_KEYS.join(' / ')}`)
  if (transactions.length && !hasDate) c.hit('F1-NO-DATE', ep, 'transactions[*]', `нет полей ${DATE_KEYS.join(' / ')}`)
  if (!hasId) {
    for (const [key, indexes] of seenPaid) {
      if (indexes.length > 1) c.hit('F1-DUPLICATE', ep, indexes.map(i => `[${i}]`).join(', '), key)
    }
  }
}

function checkFinance2(c, body, rates, spellings, stats) {
  const ep = 'finance2'
  c.ran(ep, 'F2-SHAPE')
  if (!Array.isArray(body)) {
    c.hit('F2-SHAPE', ep, 'body', show(body).slice(0, 120))
    return
  }
  c.ran(ep, 'F2-ITEM-TYPE', 'F2-FORMAT', 'F2-WHITESPACE', 'F2-AMOUNT-FORMAT', 'F2-STRUCTURE')
  const firstString = body.find(item => typeof item === 'string')
  if (firstString !== undefined) {
    c.hit('F2-STRUCTURE', ep, '[*]', `${body.length} элементов вида ${show(firstString)}`)
  }

  body.forEach((item, index) => {
    const where = `[${index}]`
    if (typeof item !== 'string') {
      c.hit('F2-ITEM-TYPE', ep, where, show(item))
      return
    }
    const trimmed = item.trim()
    if (item !== trimmed || /\s{2,}/.test(trimmed)) c.hit('F2-WHITESPACE', ep, where, show(item))

    const parts = trimmed.split(/\s+/)
    if (parts.length !== 2) {
      c.hit('F2-FORMAT', ep, where, show(item))
      return
    }
    const [rawAmount, rawCurrency] = parts
    const amountOk = AMOUNT_RE.test(rawAmount)
    if (!amountOk) c.hit('F2-AMOUNT-FORMAT', ep, where, show(item), describeAmountProblem(rawAmount))

    const code = checkCurrency(c, ep, where, rawCurrency, rates, spellings)
    if (code && amountOk) {
      stats.cash.set(code, (stats.cash.get(code) ?? 0) + Math.round(Number(rawAmount) * 100))
    }
  })
}

/** Возвращает карту курсов { CODE: number } или null */
function checkRates(c, body, takenAt) {
  const ep = 'rates'
  c.ran(ep, 'R-SHAPE')
  if (body == null || typeof body !== 'object' || typeof body.base !== 'string' || body.rates == null || typeof body.rates !== 'object') {
    c.hit('R-SHAPE', ep, 'body', show(body).slice(0, 120))
    return null
  }
  c.ran(ep, 'R-DATE', 'R-STALE', 'R-VALUE-INVALID', 'R-VALUE-STRING', 'R-NON-ISO')

  const rates = {}
  const invalid = []
  let strings = 0
  for (const [code, value] of Object.entries(body.rates)) {
    if (typeof value === 'string') strings += 1
    const rate = Number(value)
    if (Number.isFinite(rate) && rate > 0) rates[code.toUpperCase()] = rate
    else invalid.push(`${code}=${show(value)}`)
  }
  rates[body.base.trim().toUpperCase()] = 1

  if (invalid.length) c.hit('R-VALUE-INVALID', ep, 'rates', invalid.slice(0, 10).join(', '), `всего ${invalid.length}`)
  if (strings) c.hit('R-VALUE-STRING', ep, 'rates', `${strings} из ${Object.keys(body.rates).length}`)

  const nonIso = Object.keys(body.rates).filter(code => !ISO_CURRENCIES.has(code.toUpperCase()))
  if (nonIso.length) {
    const threeLetter = nonIso.filter(code => CURRENCY_RE.test(code.toUpperCase()))
    c.hit('R-NON-ISO', ep, 'rates', `${nonIso.length} кодов, из них ${threeLetter.length} трёхбуквенных`, `например: ${threeLetter.slice(0, 12).join(', ')}`)
  }

  if (typeof body.date !== 'string') {
    c.hit('R-DATE', ep, 'date', show(body.date))
  }
  else {
    const iso = body.date.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
    const time = Date.parse(iso)
    if (Number.isNaN(time)) {
      c.hit('R-DATE', ep, 'date', show(body.date))
    }
    else {
      const ageH = (Date.parse(takenAt) - time) / 3_600_000
      if (ageH > STALE_RATES_H) c.hit('R-STALE', ep, 'date', show(body.date), `возраст ${Math.round(ageH)} ч`)
    }
  }
  return rates
}

function audit(snapshot) {
  const c = createCollector()
  const spellings = new Map()
  const stats = { types: new Map(), paid: new Map(), cash: new Map() }
  const { finance1, finance2, rates } = snapshot.endpoints

  const ratesOk = checkTransport(c, 'rates', rates)
  const rateMap = ratesOk ? checkRates(c, rates.body, snapshot.takenAt) : null
  if (checkTransport(c, 'finance1', finance1)) checkFinance1(c, finance1.body, rateMap, spellings, stats)
  if (checkTransport(c, 'finance2', finance2)) checkFinance2(c, finance2.body, rateMap, spellings, stats)

  // Одна валюта в разном написании — смотрим по обоим источникам сразу
  c.ran('finance1+finance2', 'CUR-INCONSISTENT')
  for (const [code, bySpelling] of spellings) {
    if (bySpelling.size > 1) {
      const variants = [...bySpelling].map(([raw, eps]) => `${show(raw)} в ${[...eps].join(', ')}`)
      c.hit('CUR-INCONSISTENT', 'finance1+finance2', code, variants.join('; '))
    }
  }

  return { ...c.result(), stats, rateMap }
}

// ---------- отчёт ----------

const md = {
  cell: value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' '),
  money: cents => (cents / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}

function endpointLabel(endpoint) {
  return endpoint.split('+').map(name => ENDPOINT_LABEL[name] ?? name).join(' + ')
}

function countRecords(name, body) {
  if (name === 'finance1') return Array.isArray(body?.transactions) ? body.transactions.length : '—'
  if (name === 'finance2') return Array.isArray(body) ? body.length : '—'
  if (name === 'rates') return body?.rates && typeof body.rates === 'object' ? Object.keys(body.rates).length : '—'
  return '—'
}

function renderFinding(f) {
  const sev = SEVERITY[f.severity]
  const lines = [
    `### ${sev.icon} ${f.id} — ${f.title}`,
    '',
    `**Где:** ${endpointLabel(f.endpoint)} · **Важность:** ${sev.label} · **Найдено:** ${f.occurrences.length}`,
    '',
    '| Где | Значение | Комментарий |',
    '|---|---|---|',
    ...f.occurrences.slice(0, MAX_EXAMPLES).map(o =>
      `| \`${md.cell(o.where)}\` | \`${md.cell(o.value)}\` | ${md.cell(o.note)} |`),
  ]
  if (f.occurrences.length > MAX_EXAMPLES) {
    lines.push(`| … | ещё ${f.occurrences.length - MAX_EXAMPLES} | полный список в \`findings.json\` |`)
  }
  lines.push('', `**Влияние:** ${f.impact}`, '', `**Как исправить:** ${f.fix}`, '')
  return lines.join('\n')
}

function autoSummary(apiFindings) {
  if (apiFindings.length === 0) return 'Проблем в ответах финансового API не найдено.'
  // Одна проверка может сработать на нескольких эндпоинтах — в резюме упоминаем её один раз
  const listOf = sev => [...new Map(apiFindings
    .filter(f => f.severity === sev)
    .map(f => [f.id, `${f.id} (${f.title})`])).values()].join('; ')
  const parts = []
  const critical = listOf('critical')
  const warning = listOf('warning')
  parts.push(critical
    ? `Критичные проблемы, которые ломают расчёт или искажают выручку: ${critical}.`
    : 'Критичных проблем, ломающих расчёт, нет.')
  if (warning) parts.push(`Нарушения контракта, которые клиент сейчас обходит сам: ${warning}.`)
  return parts.join('\n\n')
}

function renderReport(snapshot, result, { snapshotFile }) {
  const { findings, passed, stats } = result
  const apiFindings = findings.filter(f => f.endpoint !== 'rates')
  const providerFindings = findings.filter(f => f.endpoint === 'rates')
  const count = sev => findings.filter(f => f.severity === sev).length
  const takenAt = new Date(snapshot.takenAt).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'long' })

  const out = [
    '# Аудит ответов финансового API',
    '',
    '| | |',
    '|---|---|',
    `| Дата проверки | ${takenAt} |`,
    `| Данные | ${snapshot.mode === 'live' ? 'живые ответы API' : `снимок \`${snapshotFile}\``} — сырые ответы в \`snapshot.json\` |`,
    `| Итог | ${SEVERITY.critical.icon} критичных: ${count('critical')} · ${SEVERITY.warning.icon} предупреждений: ${count('warning')} · ${SEVERITY.info.icon} к сведению: ${count('info')} |`,
    '',
    '## Резюме',
    '',
    '<!-- SUMMARY:START -->',
    autoSummary(apiFindings),
    '<!-- SUMMARY:END -->',
    '',
    '## Эндпоинты',
    '',
    '| Эндпоинт | HTTP | Время | Content-Type | Записей |',
    '|---|---|---|---|---|',
    ...Object.entries(snapshot.endpoints).map(([name, ep]) =>
      `| ${ENDPOINT_LABEL[name]} | ${ep.status ?? md.cell(ep.error)} | ${(ep.durationMs / 1000).toFixed(1)} с | ${md.cell(ep.contentType ?? '—')} | ${countRecords(name, ep.body)} |`),
    '',
    '## Сводка данных',
    '',
    `- Статусы транзакций в /finance1: ${[...stats.types].map(([type, n]) => `\`${type}\` × ${n}`).join(', ') || '—'}`,
    `- Оплаты /finance1 (\`paid\`) по валютам: ${[...stats.paid].map(([code, cents]) => `${md.money(cents)} ${code}`).join(', ') || '—'}`,
    `- Платежи /finance2 по валютам: ${[...stats.cash].map(([code, cents]) => `${md.money(cents)} ${code}`).join(', ') || '—'}`,
    '',
    '## Проблемы в финансовом API',
    '',
    apiFindings.length ? apiFindings.map(renderFinding).join('\n') : 'Не найдено.\n',
    '## Провайдер курсов CurrencyFreaks (к сведению)',
    '',
    'Сторонний сервис, не входит в зону backend-команды. Приведено для полноты картины.',
    '',
    providerFindings.length ? providerFindings.map(renderFinding).join('\n') : 'Замечаний нет.\n',
    '## Проверки без замечаний',
    '',
    ...passed.map(p => `- ✅ \`${p.id}\` (${endpointLabel(p.endpoint)}) — ${p.title}`),
    '',
    '## Ожидаемый контракт',
    '',
    '`GET /finance1`:',
    '',
    '```json',
    '{ "transactions": [ { "type": "paid", "amount": 100.5, "currency": "USD" } ] }',
    '```',
    '',
    '- `type` — строка в нижнем регистре: `paid` | `pending` | `rejected`; в выручку идёт только `paid`.',
    '- `amount` — число ≥ 0, не более 2 знаков после точки.',
    '- `currency` — код ISO 4217, 3 латинские буквы в верхнем регистре.',
    '',
    '`GET /finance2`:',
    '',
    '```json',
    '["300 USD", "150.50 EUR"]',
    '```',
    '',
    '- Каждая строка — `"<сумма> <ВАЛЮТА>"`: сумма с точкой и ≤ 2 знаками, один пробел, код ISO 4217 в верхнем регистре.',
    '',
    '## Как воспроизвести',
    '',
    '```bash',
    'curl -H "x-api-key: $FINANCE_API_KEY" https://cpa-server-vtel.onrender.com/api/finance1',
    'curl -H "x-api-key: $FINANCE_API_KEY" https://cpa-server-vtel.onrender.com/api/finance2',
    '```',
    '',
  ]
  return out.join('\n')
}

// ---------- main ----------

const pad = n => String(n).padStart(2, '0')
function defaultOutDir() {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  return path.join(ROOT, 'docs', 'reports', 'api-audit', stamp)
}

const snapshot = args.snapshot
  // mode из файла важнее: повторный разбор живого снимка остаётся «живыми ответами»
  ? { mode: 'snapshot', ...JSON.parse(fs.readFileSync(path.resolve(args.snapshot), 'utf8')) }
  : await takeSnapshot()

const outDir = path.resolve(args.out ?? defaultOutDir())
fs.mkdirSync(outDir, { recursive: true })

const result = audit(snapshot)
const { rateMap, ...findingsData } = result
const stats = {
  types: Object.fromEntries(result.stats.types),
  paidCents: Object.fromEntries(result.stats.paid),
  cashCents: Object.fromEntries(result.stats.cash),
}

fs.writeFileSync(path.join(outDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2))
fs.writeFileSync(path.join(outDir, 'findings.json'), JSON.stringify({ ...findingsData, stats }, null, 2))
fs.writeFileSync(path.join(outDir, 'report.md'), renderReport(snapshot, result, { snapshotFile: args.snapshot }))

const count = sev => result.findings.filter(f => f.severity === sev).length
console.log(JSON.stringify({
  outDir: path.relative(ROOT, outDir) || '.',
  critical: count('critical'),
  warning: count('warning'),
  info: count('info'),
  findings: result.findings.map(f => `${f.severity}:${f.id}@${f.endpoint}×${f.occurrences.length}`),
}, null, 2))
