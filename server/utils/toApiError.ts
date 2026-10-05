import type { RevenueErrorCode, RevenueErrorData } from '#shared/types/revenue'
import { InvalidDataError } from '../domain/money'
import { ConfigError } from './revenueConfig'
import { UpstreamError } from './upstream'

function upstreamErrorCode({ status, isTimeout }: UpstreamError): RevenueErrorCode {
  if (isTimeout) return 'UPSTREAM_TIMEOUT'
  if (!status) return 'UPSTREAM_UNAVAILABLE'
  if (status === 401 || status === 403) return 'UPSTREAM_UNAUTHORIZED'
  if (status === 429) return 'UPSTREAM_RATE_LIMITED'
  if (status >= 500) return 'UPSTREAM_FAILED'
  return 'UPSTREAM_REJECTED'
}

/** Переводит внутреннюю ошибку в HTTP-ответ с машиночитаемым кодом для клиента */
export function toApiError(error: unknown) {
  if (error instanceof UpstreamError) {
    return createError<RevenueErrorData>({
      statusCode: error.isTimeout ? 504 : 502,
      message: error.message,
      data: { code: upstreamErrorCode(error), upstreamStatus: error.status },
    })
  }
  if (error instanceof ConfigError) {
    return createError<RevenueErrorData>({
      statusCode: 500,
      message: error.message,
      data: { code: 'CONFIG_MISSING' },
    })
  }
  if (error instanceof InvalidDataError) {
    return createError<RevenueErrorData>({
      statusCode: 502,
      message: error.message,
      data: { code: 'INVALID_UPSTREAM_DATA' },
    })
  }
  // Неизвестная ошибка: детали только в серверном логе
  return createError<RevenueErrorData>({
    statusCode: 500,
    message: 'Internal server error',
    data: { code: 'INTERNAL' },
  })
}
