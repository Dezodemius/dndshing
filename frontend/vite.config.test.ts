// @vitest-environment node

import { describe, expect, it } from 'vitest'
import viteConfig, { DEV_API_PROXY_TARGET } from './vite.config'

// Runs in the node environment on purpose: importing the Vite config pulls in esbuild,
// which refuses to load under the project-wide jsdom (its TextEncoder produces a
// Uint8Array from another realm, and esbuild treats that as a broken environment).

describe('vite dev server proxy', () => {
  // Regression guard for DND-129: src/api/client.ts falls back to the same-origin
  // `/api/v1`, so a dev server without this proxy answers every API call itself
  // with a 404 and registration/login break.
  it('forwards /api to the backend', () => {
    const proxy = viteConfig.server?.proxy

    expect(proxy).toBeDefined()
    expect(proxy?.['/api']).toMatchObject({
      target: DEV_API_PROXY_TARGET,
      changeOrigin: true,
    })
  })

  it('defaults to the local backend port, overridable for containerised dev servers', () => {
    expect(DEV_API_PROXY_TARGET).toBe(process.env.VITE_DEV_API_PROXY ?? 'http://localhost:8000')
  })
})
