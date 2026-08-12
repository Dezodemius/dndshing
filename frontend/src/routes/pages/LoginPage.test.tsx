import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import LoginPage from './LoginPage'
import * as client from '../../api/client'

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn() },
  }
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(client.apiClient.get).mockReset().mockResolvedValue({ providers: [] })
  })

  it('renders inside the styled auth shell', async () => {
    const { container } = renderPage()

    expect(container.querySelector('.auth__panel')).not.toBeNull()
    expect(container.querySelector('.auth__art')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
  })

  it('shows a button for every configured OAuth provider', async () => {
    vi.mocked(client.apiClient.get).mockResolvedValue({ providers: ['yandex', 'vk'] })
    renderPage()

    expect(await screen.findByRole('link', { name: 'Яндекс' })).toHaveClass('oauth-button')
    expect(screen.getByRole('link', { name: 'VK' })).toHaveClass('oauth-button')
  })

  it('renders nothing extra when no provider is configured', async () => {
    const { container } = renderPage()

    await screen.findByRole('heading', { name: 'Вход' })
    expect(container.querySelector('.oauth-buttons')).toBeNull()
  })
})
