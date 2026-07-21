import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import NotFoundPage from './NotFoundPage'

describe('NotFoundPage', () => {
  it('renders the not-found heading', () => {
    render(<NotFoundPage />)
    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument()
  })
})
