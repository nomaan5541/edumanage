import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const isTauri = process.env.TAURI_ENV_PLATFORM != null

const pwa = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico'],
  manifest: {
    name: 'EduManage',
    short_name: 'EduManage',
    description: 'Multi-school school management platform',
    theme_color: '#0f172a',
    background_color: '#0f172a',
    display: 'standalone',
    icons: [],
  },
  workbox: {
    // Never cache API/auth traffic; only cache the static app shell.
    navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/storage\//, /^\/functions\//],
    runtimeCaching: [],
  },
})

// https://vite.dev/config/
export default defineConfig({
  // Keep rustc errors visible when the Tauri CLI drives `vite`.
  clearScreen: false,
  // Relative asset URLs so the desktop custom protocol can load the same dist/.
  // Web `npm run build` does not set TAURI_ENV_PLATFORM, so it stays `/`.
  base: isTauri ? './' : '/',
  plugins: [
    react(),
    tailwindcss(),
    // Service workers fight desktop webviews; keep PWA on the web target only.
    ...(isTauri ? [] : [pwa]),
  ],
  resolve: {
    alias: {
      '@': `${import.meta.dirname}/src`,
    },
  },
  server: {
    // Tauri watches src-tauri itself; ignoring it avoids extra Vite reloads.
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    // Only pin the port when Tauri is driving the dev server so `npm run dev`
    // can still pick a free port.
    strictPort: isTauri,
  },
})
