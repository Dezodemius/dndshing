import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import DashboardPage from './DashboardPage'
import * as campaignsApi from '../../api/campaigns'
import { apiClient } from '../../api/client'

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: vi.fn() },
  }
})

vi.mock('../../api/campaigns', async () => {
  const actual = await vi.importActual<typeof import('../../api/campaigns')>('../../api/campaigns')
  return {
    ...actual,
    listCampaigns: vi.fn(),
  }
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app']}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset().mockImplementation((path: string) => {
      if (path === '/characters') return Promise.resolve([{ id: 7, name: 'Ари' }])
      if (path === '/merchants') return Promise.resolve([{ id: 12, name: 'Лавка Борга' }])
      throw new Error(`unexpected path ${path}`)
    })
    vi.mocked(campaignsApi.listCampaigns).mockReset().mockResolvedValue({
      as_dm: [],
      as_player: [],
    })
  })

  it('links every character to its sheet', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: 'Ари' })
    expect(link).toHaveAttribute('href', '/app/characters/7')
  })

  it('links every merchant to its editor', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: 'Лавка Борга' })
    expect(link).toHaveAttribute('href', '/app/merchants/12')
  })
})
