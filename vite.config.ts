import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The security headers live in vercel.json (what production sends). The local preview server
// used for testing sends the very same ones, so tests run under the real policy.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers?: { headers: { key: string; value: string }[] }[]
}
const securityHeaders = Object.fromEntries((vercel.headers ?? []).flatMap((rule) => rule.headers.map((h) => [h.key, h.value])))

// https://vite.dev/config/
export default defineConfig({
  preview: { headers: securityHeaders },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Notes',
        short_name: 'Notes',
        description: 'Personal notes that work offline and sync everywhere.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // API calls must never be answered from the app-shell fallback.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
