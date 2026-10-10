import type { RevenueErrorCode, RevenueErrorData } from '#shared/types/revenue'

interface ErrorDescription {
  title: string
  hint: string
  details: string
}

/** Тело ответа h3 при ошибке */
interface ApiErrorBody {
  message?: string
  data?: Partial<RevenueErrorData>
}

const DESCRIPTIONS: Record<RevenueErrorCode, Omit<ErrorDescription, 'details'>> = {
  CONFIG_MISSING: {
    title: 'Не настроено окружение',
    hint: 'Создай .env по образцу .env.example и перезапусти npm run dev.',
  },
  UPSTREAM_UNAVAILABLE: {
    title: 'Нет связи с сервером',
    hint: 'Внешний сервис недоступен. Попробуй ещё раз.',
  },
  UPSTREAM_TIMEOUT: {
    title: 'Сервер не ответил вовремя',
    hint: 'Сервер на Render мог не успеть проснуться — попробуй ещё раз.',
  },
  UPSTREAM_UNAUTHORIZED: {
    title: 'Нет доступа к API',
    hint: 'Проверь API-ключи в .env и перезапусти dev-сервер.',
  },
  UPSTREAM_RATE_LIMITED: {
    title: 'Превышен лимит запросов',
    hint: 'Лимит бесплатного тарифа исчерпан. Попробуй позже.',
  },
  UPSTREAM_FAILED: {
    title: 'Сервер вернул ошибку',
    hint: 'Проблема на стороне сервиса. Попробуй ещё раз через минуту.',
  },
  UPSTREAM_REJECTED: {
    title: 'Ошибка запроса',
    hint: 'Сервер отклонил запрос.',
  },
  INVALID_UPSTREAM_DATA: {
    title: 'Не удалось посчитать выручку',
    hint: 'Данные пришли в неожиданном формате.',
  },
  INTERNAL: {
    title: 'Не удалось посчитать выручку',
    hint: 'Внутренняя ошибка сервера. Попробуй ещё раз.',
  },
}

/** Заголовок и подсказка по коду — для источника, который упал отдельно */
export const describeErrorCode = (code: RevenueErrorCode): Omit<ErrorDescription, 'details'> => DESCRIPTIONS[code]

/** Переводит ошибку useFetch в понятный пользователю заголовок и подсказку */
export function describeRevenueError(error: { message: string, data?: unknown }): ErrorDescription {
  const body = (error.data ?? {}) as ApiErrorBody
  const { code, upstreamStatus } = body.data ?? {}
  const details = body.message ?? error.message

  // Нет кода — до нашего API не достучались вовсе (сеть, dev-сервер упал)
  if (!code || !(code in DESCRIPTIONS)) {
    return { title: 'Нет связи с сервером', hint: 'Проверь интернет и попробуй ещё раз.', details }
  }

  const { title, hint } = DESCRIPTIONS[code]
  return {
    title: code === 'UPSTREAM_REJECTED' && upstreamStatus ? `${title} (${upstreamStatus})` : title,
    hint,
    details,
  }
}
