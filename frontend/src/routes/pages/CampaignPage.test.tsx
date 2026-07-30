import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import CampaignPage from './CampaignPage'
import * as campaignsApi from '../../api/campaigns'
import type { CampaignDetail } from '../../api/campaigns'
import type { CharacterDetail } from '../../api/characters'

vi.mock('../../api/campaigns', async () => {
  const actual = await vi.importActual<typeof import('../../api/campaigns')>('../../api/campaigns')
  return {
    ...actual,
    getCampaign: vi.fn(),
    createCampaign: vi.fn(),
    patchCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
    regenerateInviteCode: vi.fn(),
    getCampaignCharacter: vi.fn(),
    removeCampaignCharacter: vi.fn(),
  }
})

const baseCampaign: CampaignDetail = {
  id: 1,
  dm_user_id: 1,
  name: 'Клык Змея',
  description: 'Партия ищет пропавшего кузнеца',
  next_session_at: '2026-08-01T18:00:00Z',
  next_session_place: 'у Антона',
  invite_code: 'K7Q2FD',
  participants: [{ character_id: 10, joined_at: '2026-07-20T00:00:00Z' }],
}

const participantCharacter: CharacterDetail = {
  id: 10,
  user_id: 2,
  name: 'Ари',
  race_id: 1,
  class_id: 1,
  subclass_id: null,
  background_id: null,
  alignment: 'chaotic-good',
  level: 3,
  xp: 0,
  ability_scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  hp_max: 20,
  hp_current: 18,
  hp_temp: 0,
  ac_override: null,
  speed: 30,
  proficiencies: {},
  appearance: null,
  backstory: null,
  notes: null,
  gold: 15,
  silver: 0,
  copper: 0,
  created_at: '',
  updated_at: '',
  computed: {
    prof_bonus: 2,
    modifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    saving_throws: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    skills: {},
    ac: 14,
    initiative: 0,
    passive_perception: 10,
    xp_to_next: null,
    level_up_available: false,
    spell_slots: {},
  },
  spells: [],
  inventory: [],
}

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/campaigns/1']}>
        <Routes>
          <Route path="/app/campaigns/:campaignId" element={<CampaignPage />} />
          <Route path="/app" element={<p>дашборд</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderCreate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/campaigns/new']}>
        <Routes>
          <Route path="/app/campaigns/new" element={<CampaignPage />} />
          <Route path="/app/campaigns/:campaignId" element={<CampaignPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CampaignPage', () => {
  beforeEach(() => {
    vi.mocked(campaignsApi.getCampaign).mockReset().mockResolvedValue(baseCampaign)
    vi.mocked(campaignsApi.createCampaign).mockReset()
    vi.mocked(campaignsApi.patchCampaign).mockReset()
    vi.mocked(campaignsApi.deleteCampaign).mockReset()
    vi.mocked(campaignsApi.regenerateInviteCode).mockReset()
    vi.mocked(campaignsApi.getCampaignCharacter).mockReset().mockResolvedValue(participantCharacter)
    vi.mocked(campaignsApi.removeCampaignCharacter).mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  it('renders the campaign card and the invite code', async () => {
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'Клык Змея' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('K7Q2FD')).toBeInTheDocument()
  })

  it('shows the read-only stats for a joined character', async () => {
    renderEditor()
    expect(await screen.findByText('Ари')).toBeInTheDocument()
    expect(campaignsApi.getCampaignCharacter).toHaveBeenCalledWith('1', 10)
    expect(screen.getByText('Хиты 18 / 20')).toBeInTheDocument()
    expect(screen.getByText('КД 14')).toBeInTheDocument()
  })

  it('saves the name and description via PATCH', async () => {
    const user = userEvent.setup()
    vi.mocked(campaignsApi.patchCampaign).mockResolvedValue({ ...baseCampaign, name: 'Новое имя' })
    renderEditor()

    const nameInput = await screen.findByLabelText('Название')
    await user.clear(nameInput)
    await user.type(nameInput, 'Новое имя')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(campaignsApi.patchCampaign).toHaveBeenCalledWith('1', { name: 'Новое имя' })
    })
  })

  it('copies the invite code to the clipboard', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Скопировать код' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('K7Q2FD')
    })
    expect(await screen.findByText('Скопировано')).toBeInTheDocument()
  })

  it('regenerates the invite code after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(campaignsApi.regenerateInviteCode).mockResolvedValue({
      ...baseCampaign,
      invite_code: 'NEWCODE',
    })
    renderEditor()

    await user.click(await screen.findByRole('button', { name: 'Пересоздать код' }))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(campaignsApi.regenerateInviteCode).toHaveBeenCalledWith('1')
    })
  })

  it('kicks a participant after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(campaignsApi.removeCampaignCharacter).mockResolvedValue(undefined)
    renderEditor()

    await user.click(await screen.findByRole('button', { name: 'Исключить' }))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(campaignsApi.removeCampaignCharacter).toHaveBeenCalledWith('1', 10)
    })
  })

  it('deletes the campaign after confirmation and returns to the dashboard', async () => {
    const user = userEvent.setup()
    vi.mocked(campaignsApi.deleteCampaign).mockResolvedValue(undefined)
    renderEditor()

    await user.click(await screen.findByRole('button', { name: 'Удалить кампанию' }))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(campaignsApi.deleteCampaign).toHaveBeenCalledWith('1')
    })
    expect(await screen.findByText('дашборд')).toBeInTheDocument()
  })

  it('creates a new campaign and redirects to its editor page', async () => {
    const user = userEvent.setup()
    const created = { ...baseCampaign, id: 5, name: 'Новая кампания' }
    vi.mocked(campaignsApi.createCampaign).mockResolvedValue(created)
    vi.mocked(campaignsApi.getCampaign).mockResolvedValue({ ...created, participants: [] })
    renderCreate()

    await user.type(await screen.findByLabelText('Название'), 'Новая кампания')
    await user.click(screen.getByRole('button', { name: 'Создать кампанию' }))

    await waitFor(() => {
      expect(campaignsApi.createCampaign).toHaveBeenCalledWith({
        name: 'Новая кампания',
        description: null,
        next_session_at: null,
        next_session_place: null,
      })
    })
    expect(await screen.findByRole('heading', { name: 'Новая кампания' })).toBeInTheDocument()
  })
})
