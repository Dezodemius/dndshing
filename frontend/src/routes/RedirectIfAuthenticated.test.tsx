import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RedirectIfAuthenticated from './RedirectIfAuthenticated'

const authState = vi.hoisted(() => ({
  status: 'guest' as 'guest' | 'authenticated' | 'loading',
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => authState,
}))

function renderAtLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<p>форма входа</p>} />
        </Route>
        <Route path="/app" element={<p>кабинет</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RedirectIfAuthenticated', () => {
  beforeEach(() => {
    authState.status = 'guest'
  })

  it('уводит залогиненного с /login на /app', () => {
    authState.status = 'authenticated'
    renderAtLogin()

    expect(screen.getByText('кабинет')).toBeInTheDocument()
    expect(screen.queryByText('форма входа')).toBeNull()
  })

  it('гостю показывает форму входа', () => {
    renderAtLogin()

    expect(screen.getByText('форма входа')).toBeInTheDocument()
  })

  // A guest's refresh call fails by design, so 'loading' is the normal first
  // state on a cold visit to /login. Blanking the page until it settles would
  // show a white screen exactly where the sign-in buttons belong.
  it('во время восстановления сессии показывает форму входа, а не пустоту', () => {
    authState.status = 'loading'
    renderAtLogin()

    expect(screen.getByText('форма входа')).toBeInTheDocument()
    expect(screen.queryByText('кабинет')).toBeNull()
  })
})
