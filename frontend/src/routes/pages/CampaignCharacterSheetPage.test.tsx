import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import CampaignCharacterSheetPage from './CampaignCharacterSheetPage'
import * as campaignsApi from '../../api/campaigns'
import * as contentApi from '../../api/content'
import type { CharacterDetail } from '../../api/characters'

vi.mock('../../api/campaigns', async () => {
  const actual = await vi.importActual<typeof import('../../api/campaigns')>('../../api/campaigns')
  return {
    ...actual,
    getCampaignCharacter: vi.fn(),
  }
})

vi.mock('../../api/content', async () => {
  const actual = await vi.importActual<typeof import('../../api/content')>('../../api/content')
  return {
    ...actual,
    listItems: vi.fn(),
    listClasses: vi.fn(),
    listSpells: vi.fn(),
  }
})

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
  ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 15, cha: 8 },
  hp_max: 20,
  hp_current: 18,
  hp_temp: 2,
  ac_override: null,
  speed: 30,
  proficiencies: { skills: ['perception'], saves: ['int', 'wis'] },
  appearance: null,
  backstory: null,
  notes: 'Боится пауков',
  gold: 15,
  silver: 0,
  copper: 0,
  created_at: '',
  updated_at: '',
  computed: {
    prof_bonus: 2,
    modifiers: { str: 3, dex: 2, con: 1, int: 0, wis: 2, cha: -1 },
    saving_throws: { str: 3, dex: 2, con: 1, int: 2, wis: 4, cha: -1 },
    skills: {
      acrobatics: 2,
      'animal-handling': 2,
      arcana: 0,
      athletics: 3,
      deception: -1,
      history: 0,
      insight: 2,
      intimidation: -1,
      investigation: 0,
      medicine: 2,
      nature: 0,
      perception: 4,
      performance: -1,
      persuasion: -1,
      religion: 0,
      'sleight-of-hand': 2,
      stealth: 2,
      survival: 2,
    },
    ac: 14,
    initiative: 2,
    passive_perception: 14,
    xp_to_next: null,
    xp_level_floor: 0,
    xp_next_threshold: null,
    level_up_available: false,
    spell_slots: {},
  },
  spells: [],
  inventory: [],
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/campaigns/1/characters/10']}>
        <Routes>
          <Route
            path="/app/campaigns/:campaignId/characters/:characterId"
            element={<CampaignCharacterSheetPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CampaignCharacterSheetPage', () => {
  beforeEach(() => {
    vi.mocked(campaignsApi.getCampaignCharacter).mockReset().mockResolvedValue(participantCharacter)
    vi.mocked(contentApi.listItems).mockReset().mockResolvedValue([])
    vi.mocked(contentApi.listClasses).mockReset().mockResolvedValue([])
    vi.mocked(contentApi.listSpells).mockReset().mockResolvedValue([])
  })

  it('shows the full read-only sheet fetched via the DM-only endpoint', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Ари' })).toBeInTheDocument()
    expect(campaignsApi.getCampaignCharacter).toHaveBeenCalledWith('1', 10)

    const abilitiesSection = screen.getByText('Характеристики').closest('section') as HTMLElement
    expect(within(abilitiesSection).getByText('Сила')).toBeInTheDocument()
    expect(within(abilitiesSection).getByText('16')).toBeInTheDocument()

    const skillsSection = screen.getByText('Навыки').closest('section') as HTMLElement
    expect(within(skillsSection).getByText('Восприятие')).toBeInTheDocument()

    const combatSection = screen.getByText('Боевые параметры').closest('section') as HTMLElement
    expect(within(combatSection).getByText('КД')).toBeInTheDocument()
    expect(within(combatSection).getByText('14')).toBeInTheDocument()

    expect(screen.getByText('Боится пауков')).toBeInTheDocument()
  })

  it('has no edit controls', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Ари' })

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
