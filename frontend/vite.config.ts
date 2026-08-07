import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app talks to a same-origin `/api/v1` by default (see src/api/client.ts), so the
// dev server has to forward `/api` to the backend. Without this proxy every call lands
// on Vite itself and comes back 404 — registration and login fail with no hint why.
//
// The default suits `npm run dev` on the host. Running the dev server inside a
// container needs VITE_DEV_API_PROXY, because there `localhost` is the container
// itself, not the API (e.g. `http://api:8000` on a shared compose network).
export function resolveDevApiProxyTarget(value: string | undefined): string {
  return value?.trim() || 'http://localhost:8000'
}

export const DEV_API_PROXY_TARGET = resolveDevApiProxyTarget(process.env.VITE_DEV_API_PROXY)

// Kept an object rather than a config callback: vitest.config.ts merges this export,
// and mergeConfig() refuses callbacks.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: DEV_API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
})
