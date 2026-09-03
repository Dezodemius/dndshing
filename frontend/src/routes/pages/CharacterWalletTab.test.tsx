import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import CharacterWalletTab from './CharacterWalletTab'
import * as charactersApi from '../../api/characters'
import type { CharacterDetail } from '../../api/characters'

vi.mock('../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../api/characters')>(
    '../../api/characters',
  )
  return {
    ...actual,
    patchCharacter: vi.fn(),
  }
})

const baseCharacter: CharacterDetail = {
  id: 1,
  user_id: 1,
  name: 'Ари',
  race_id: 1,
  class_id: 1,
  subclass_id: null,
  background_id: null,
  alignment: 'chaotic-good',
  level: 1,
  xp: 0,
  ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 15, cha: 8 },
  hp_max: 8,
  hp_current: 5,
  hp_temp: 0,
  ac_override: null,
  speed: 30,
  proficiencies: {},
  appearance: null,
  backstory: null,
  notes: null,
  gold: 10,
  silver: 5,
  copper: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  computed: {
    prof_bonus: 2,
    modifiers: { str: 3, dex: 2, con: 1, int: 0, wis: 2, cha: -1 },
    saving_throws: { str: 3, dex: 2, con: 1, int: 2, wis: 4, cha: -1 },
    skills: {},
    ac: 12,
    initiative: 2,
    passive_perception: 14,
    xp_to_next: 300,
    xp_level_floor: 0,
    xp_next_threshold: 300,
    level_up_available: false,
    spell_slots: {},
  },
  inventory: [],
  spells: [],
}

function renderTab(character: CharacterDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterWalletTab characterId="1" character={character} />
    </QueryClientProvider>,
  )
}

describe('CharacterWalletTab', () => {
  beforeEach(() => {
    vi.mocked(charactersApi.patchCharacter).mockReset()
  })

  it('renders the three independent currency fields', () => {
    renderTab(baseCharacter)
    expect(screen.getByLabelText('Золото')).toHaveValue(10)
    expect(screen.getByLabelText('Серебро')).toHaveValue(5)
    expect(screen.getByLabelText('Медь')).toHaveValue(0)
  })

  it('saves only the edited currency field via PATCH', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.patchCharacter).mockResolvedValue({ ...baseCharacter, gold: 20 })
    renderTab(baseCharacter)

    const goldInput = screen.getByLabelText('Золото')
    await user.clear(goldInput)
    await user.type(goldInput, '20')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(charactersApi.patchCharacter).toHaveBeenCalledWith('1', { gold: 20 })
    })
  })

  it('rejects negative currency values', async () => {
    const user = userEvent.setup()
    renderTab(baseCharacter)

    const silverInput = screen.getByLabelText('Серебро')
    await user.clear(silverInput)
    await user.type(silverInput, '-1')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findAllByText('Введите число не меньше нуля')).toHaveLength(1)
    expect(charactersApi.patchCharacter).not.toHaveBeenCalled()
  })
})
