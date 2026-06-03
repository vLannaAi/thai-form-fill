export default defineNuxtConfig({
  compatibilityDate: '2025-11-01',

  // Client-side-only SPA: no server rendering. `nuxt generate` emits a static
  // bundle (.output/public) suitable for GitHub Pages.
  ssr: false,

  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],

  app: {
    // GitHub Pages project sites live under /<repo>/. Set NUXT_APP_BASE_URL at
    // build time (e.g. NUXT_APP_BASE_URL=/thai-form-fill/ npm run generate).
    baseURL: process.env.NUXT_APP_BASE_URL || '/',
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap',
        },
      ],
    },
  },
})
