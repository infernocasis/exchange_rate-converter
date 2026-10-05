/** Ошибка обращения к внешнему API */
export class UpstreamError extends Error {
  readonly status?: number
  readonly url: string
  readonly isTimeout: boolean

  constructor(
    message: string,
    { status, url, isTimeout = false, cause }: { status?: number, url: string, isTimeout?: boolean, cause?: unknown },
  ) {
    super(message, { cause })
    this.name = 'UpstreamError'
    this.status = status
    this.url = url
    this.isTimeout = isTimeout
  }
}

interface FetchUpstreamOptions {
  headers?: Record<string, string>
  query?: Record<string, string>
  timeoutMs: number
}

/** Убираем query-string из сообщений: там могут быть API-ключи */
const safeUrl = (url: string) => url.split('?')[0] ?? url

/**
 * GET к внешнему API. Сообщение исходной ошибки ofetch содержит полный URL
 * вместе с query (а значит и ключ), поэтому формируем собственное.
 */
export async function fetchUpstream<T = unknown>(
  url: string,
  { headers, query, timeoutMs }: FetchUpstreamOptions,
): Promise<T> {
  const label = safeUrl(url)
  try {
    // Внешний URL: типизация внутренних роутов Nitro тут не нужна
    return await $fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      query,
      timeout: timeoutMs,
      retry: 0,
    }) as T
  }
  catch (error) {
    const { response, cause } = error as { response?: Response, cause?: { name?: string } }

    if (response) {
      throw new UpstreamError(`Request to ${label} failed with status ${response.status}`, {
        status: response.status,
        url: label,
      })
    }

    const isTimeout = cause?.name === 'TimeoutError'
    const reason = isTimeout ? `timeout after ${timeoutMs} ms` : 'network error'
    throw new UpstreamError(`Request to ${label} failed: ${reason}`, {
      url: label,
      isTimeout,
      cause,
    })
  }
}
