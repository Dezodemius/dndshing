import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import RegisterPage from './RegisterPage'
import * as client from '../../api/client'
import { ApiError } from '../../api/client'

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn(), post: vi.fn() },
  }
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/register']}>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, password = 'verysecret') {
  await user.type(await screen.findByLabelText('Email'), 'player@example.com')
  await user.type(screen.getByLabelText('Имя'), 'Ари')
  await user.type(screen.getByLabelText('Пароль'), 'verysecret')
  await user.type(screen.getByLabelText('Повторите пароль'), password)
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.mocked(client.apiClient.get).mockReset().mockResolvedValue({ providers: [] })
    vi.mocked(client.apiClient.post).mockReset()
  })

  // DND-127: the page used to render bare, unstyled form controls.
  it('renders the form inside the styled auth shell', async () => {
    const { container } = renderPage()

    expect(container.querySelector('.auth__panel')).not.toBeNull()
    expect(container.querySelector('.auth__art')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Регистрация' })).toBeInTheDocument()
    expect(
      screen.getByText('Заведите аккаунт, чтобы собрать первого персонажа.'),
    ).toBeInTheDocument()

    for (const label of ['Email', 'Имя', 'Пароль', 'Повторите пароль']) {
      expect(await screen.findByLabelText(label)).toHaveClass('auth__input')
    }
    expect(screen.getByRole('button', { name: 'Зарегистрироваться' })).toHaveClass('auth__submit')
  })

  it('registers the account and keeps the confirmation inside the shell', async () => {
    vi.mocked(client.apiClient.post).mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = renderPage()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await waitFor(() => {
      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/register', {
        email: 'player@example.com',
        password: 'verysecret',
        display_name: 'Ари',
      })
    })
    expect(
      await screen.findByText(
        'Мы отправили письмо со ссылкой для подтверждения email. Перейдите по ней, чтобы завершить регистрацию.',
      ),
    ).toBeInTheDocument()
    expect(container.querySelector('.auth__panel')).not.toBeNull()
  })

  it('reports mismatched passwords next to the field', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillForm(user, 'othersecret')
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Пароли не совпадают')
    expect(alert).toHaveClass('auth__error')
    expect(client.apiClient.post).not.toHaveBeenCalled()
  })

  it('shows a translated error when the email is already taken', async () => {
    vi.mocked(client.apiClient.post).mockRejectedValue(
      new ApiError('email_already_registered', 'raw backend text'),
    )
    const user = userEvent.setup()
    renderPage()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('auth__error--form')
    expect(alert).not.toHaveTextContent('raw backend text')
  })
})
