import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base relativa: funciona igual en GitHub Pages (/repo/) que en la raíz.
export default defineConfig(({ mode }) => ({
  base: './',
  // `vite build --mode artifact`: vista previa para el visor de artefactos (sin service worker)
  build: mode === 'artifact' ? { outDir: 'dist-artifact' } : undefined,
  define: mode === 'artifact' ? { 'import.meta.env.VITE_ARTIFACT': 'true' } : undefined,
  plugins: [
    react(),
    mode !== 'artifact' &&
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-180.png'],
      manifest: {
        name: 'Entreno',
        short_name: 'Entreno',
        description: 'Tu plan de entrenamiento y alimentación',
        lang: 'es-ES',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Todo funciona sin conexión salvo las llamadas a la API
        navigateFallback: 'index.html',
      },
    }),
  ],
}))
