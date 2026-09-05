import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'
import Layout from './Layout'

const authState = vi.hoisted(() => ({
  status: 'guest' as 'guest' | 'authenticated' | 'loading',
  logout: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => authState,
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<p>лендинг</p>} />
          <Route path="login" element={<p>форма входа</p>} />
          <Route path="app" element={<p>кабинет</p>} />
          <Route path="shop/:shareCode" element={<p>витрина</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  beforeEach(() => {
    authState.status = 'guest'
    authState.logout = vi.fn()
  })

  it('не показывает «Вход» залогиненному пользователю', () => {
    authState.status = 'authenticated'
    renderAt('/app')

    expect(screen.queryByRole('link', { name: 'Вход' })).toBeNull()
  })

  it('показывает залогиненному «Обзор» и «Выйти»', () => {
    authState.status = 'authenticated'
    renderAt('/app')

    expect(screen.getByRole('link', { name: 'Обзор' })).toHaveAttribute('href', '/app')
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('показывает гостю «Главная» и «Вход» и не показывает кабинет', () => {
    renderAt('/')

    expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Вход' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Обзор' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
  })

  it('во время восстановления сессии не показывает ни «Вход», ни кабинет', () => {
    authState.status = 'loading'
    renderAt('/app')

    expect(screen.queryByRole('link', { name: 'Вход' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Обзор' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
  })

  it('кнопка «Выйти» вызывает выход', async () => {
    authState.status = 'authenticated'
    renderAt('/app')

    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

    expect(authState.logout).toHaveBeenCalledOnce()
  })

  it('бренд ведёт на /app у залогиненного и на / у гостя', () => {
    const { unmount } = renderAt('/')
    expect(screen.getByRole('link', { name: 'ДнДэшинг' })).toHaveAttribute('href', '/')
    unmount()

    authState.status = 'authenticated'
    renderAt('/app')
    expect(screen.getByRole('link', { name: 'ДнДэшинг' })).toHaveAttribute('href', '/app')
  })

  // BR §4.1: the shop must not offer any route back to sheet or wallet
  // editing. The header renders on every route, so a signed-in player opening
  // a merchant link would otherwise carry the cabinet navigation onto it.
  it('на витрине не показывает навигацию кабинета залогиненному', () => {
    authState.status = 'authenticated'
    renderAt('/shop/abc123')

    expect(screen.queryByRole('link', { name: 'Обзор' })).toBeNull()
    expect(screen.getByText('витрина')).toBeInTheDocument()
  })

  it('на витрине бренд ведёт на лендинг, а не в кабинет', () => {
    authState.status = 'authenticated'
    renderAt('/shop/abc123')

    expect(screen.getByRole('link', { name: 'ДнДэшинг' })).toHaveAttribute('href', '/')
  })

  // Arriving at a merchant link signed out is the normal case (BR §4.5: the
  // shop is readable without an account), so the guest links must survive the
  // cabinet suppression above — otherwise there is no way to sign in from here.
  it('на витрине гость по-прежнему видит «Вход»', () => {
    renderAt('/shop/abc123')

    expect(screen.getByRole('link', { name: 'Вход' })).toHaveAttribute('href', '/login')
  })
})
