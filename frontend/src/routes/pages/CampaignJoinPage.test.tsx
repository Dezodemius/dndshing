import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import CampaignJoinPage from './CampaignJoinPage'
import * as campaignsApi from '../../api/campaigns'
import * as charactersApi from '../../api/characters'
import { ApiError } from '../../api/client'
import type { CharacterSummary } from '../../api/characters'

vi.mock('../../api/campaigns', async () => {
  const actual = await vi.importActual<typeof import('../../api/campaigns')>('../../api/campaigns')
  return {
    ...actual,
    joinCampaign: vi.fn(),
  }
})

vi.mock('../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../api/characters')>('../../api/characters')
  return {
    ...actual,
    listCharacters: vi.fn(),
  }
})

const characters: CharacterSummary[] = [
  { id: 1, name: 'Ари', level: 3 },
  { id: 2, name: 'Бором', level: 5 },
]

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/campaigns/join']}>
        <Routes>
          <Route path="/app/campaigns/join" element={<CampaignJoinPage />} />
          <Route path="/app" element={<p>дашборд</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CampaignJoinPage', () => {
  beforeEach(() => {
    vi.mocked(charactersApi.listCharacters).mockReset().mockResolvedValue(characters)
    vi.mocked(campaignsApi.joinCampaign).mockReset()
  })

  it('joins a campaign with the entered code and selected character', async () => {
    vi.mocked(campaignsApi.joinCampaign).mockResolvedValue({
      id: 1,
      dm_user_id: 2,
      name: 'Клык Змея',
      description: null,
      next_session_at: null,
      next_session_place: null,
    })
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Инвайт-код'), 'K7Q2FD')
    await user.selectOptions(await screen.findByLabelText('Персонаж'), 'Ари')
    await user.click(screen.getByRole('button', { name: 'Присоединиться' }))

    await waitFor(() => {
      expect(campaignsApi.joinCampaign).toHaveBeenCalledWith({
        invite_code: 'K7Q2FD',
        character_id: 1,
      })
    })
    expect(
      await screen.findByText('Персонаж «Ари» присоединился к кампании «Клык Змея»!'),
    ).toBeInTheDocument()
  })

  it('shows a message and disables submit when the player has no characters', async () => {
    vi.mocked(charactersApi.listCharacters).mockResolvedValue([])
    renderPage()

    expect(
      await screen.findByText('У вас нет персонажей — сначала создайте персонажа.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Присоединиться' })).toBeDisabled()
  })

  it('shows a translated error when the invite code is invalid', async () => {
    vi.mocked(campaignsApi.joinCampaign).mockRejectedValue(
      new ApiError('invite_code_invalid', 'Инвайт-код недействителен'),
    )
    const user = userEvent.setup()
    renderPage()

    await user.type(await screen.findByLabelText('Инвайт-код'), 'BADCODE')
    await user.selectOptions(await screen.findByLabelText('Персонаж'), 'Ари')
    await user.click(screen.getByRole('button', { name: 'Присоединиться' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Инвайт-код недействителен')
  })
})
