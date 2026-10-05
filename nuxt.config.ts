// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // По умолчанию dev-сервер слушает localhost -> ::1 (IPv6), а на этой машине
  // соединения по IPv6-loopback блокируются (EACCES). Явно слушаем IPv4.
  devServer: { host: '127.0.0.1' },

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Выручка за день',
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    },
  },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  /**
   * Только серверный (приватный) конфиг: ключи API не попадают в клиентский бандл.
   * Переопределяется через переменные окружения NUXT_*, см. .env.example.
   */
  runtimeConfig: {
    finance: {
      baseUrl: 'https://cpa-server-vtel.onrender.com/api', // NUXT_FINANCE_BASE_URL
      apiKey: '', // NUXT_FINANCE_API_KEY
      timeoutMs: 60_000, // NUXT_FINANCE_TIMEOUT_MS
    },
    exchangeRates: {
      baseUrl: 'https://api.currencyfreaks.com/v2.0', // NUXT_EXCHANGE_RATES_BASE_URL
      apiKey: '', // NUXT_EXCHANGE_RATES_API_KEY
      timeoutMs: 10_000, // NUXT_EXCHANGE_RATES_TIMEOUT_MS
    },
    targetCurrency: 'USD', // NUXT_TARGET_CURRENCY
  },
})
