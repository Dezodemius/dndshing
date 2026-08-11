import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import LoginPage from './LoginPage'
import * as client from '../../api/client'
import { ApiError } from '../../api/client'
import * as authContext from '../../auth/AuthContext'

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() },
  }
})

vi.mock('../../auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../auth/AuthContext')>(
    '../../auth/AuthContext',
  )
  return { ...actual, useAuth: vi.fn() }
})

const login = vi.fn()

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<p>кабинет</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset()
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'guest',
      user: null,
      login,
      loginWithToken: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(client.apiClient.get).mockReset().mockResolvedValue({ providers: [] })
  })

  // DND-127: the page used to render bare, unstyled form controls.
  it('renders the form inside the styled auth shell', async () => {
    const { container } = renderPage()

    expect(container.querySelector('.auth__panel')).not.toBeNull()
    expect(container.querySelector('.auth__art')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument()
    expect(screen.getByText('Возвращайтесь к своим персонажам и кампаниям.')).toBeInTheDocument()

    for (const label of ['Email', 'Пароль']) {
      expect(await screen.findByLabelText(label)).toHaveClass('auth__input')
    }
    expect(screen.getByRole('button', { name: 'Войти' })).toHaveClass('auth__submit')
  })

  it('groups the OAuth providers under a divider', async () => {
    vi.mocked(client.apiClient.get).mockResolvedValue({ providers: ['yandex'] })
    const { container } = renderPage()

    expect(await screen.findByRole('link', { name: 'Яндекс' })).toHaveClass('oauth-button')
    expect(container.querySelector('.oauth-buttons__divider')).toHaveTextContent(
      'Или войдите через:',
    )
  })

  it('signs the user in and sends them to the dashboard', async () => {
    login.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Email'), 'player@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'verysecret')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('player@example.com', 'verysecret')
    })
    expect(await screen.findByText('кабинет')).toBeInTheDocument()
  })

  it('shows a translated error when the credentials are rejected', async () => {
    login.mockRejectedValue(new ApiError('invalid_credentials', 'raw backend text'))
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Email'), 'player@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('auth__error')
    expect(alert).not.toHaveTextContent('raw backend text')
  })
})
