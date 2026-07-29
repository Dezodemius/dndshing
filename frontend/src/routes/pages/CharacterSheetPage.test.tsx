import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import CharacterSheetPage from './CharacterSheetPage'
import * as charactersApi from '../../api/characters'
import * as contentApi from '../../api/content'
import type { CharacterDetail } from '../../api/characters'

vi.mock('../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../api/characters')>(
    '../../api/characters',
  )
  return {
    ...actual,
    getCharacter: vi.fn(),
    patchCharacter: vi.fn(),
    getLevelHistory: vi.fn(),
    postLevelRollback: vi.fn(),
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
  proficiencies: { skills: ['perception'], saves: ['int', 'wis'] },
  appearance: null,
  backstory: null,
  notes: 'старые заметки',
  gold: 0,
  silver: 0,
  copper: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
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
    ac: 12,
    initiative: 2,
    passive_perception: 14,
    xp_to_next: 300,
    level_up_available: false,
    spell_slots: { '1': 2 },
  },
  inventory: [
    { id: 1, character_id: 1, item_id: null, custom_name: 'странный ключ', quantity: 1, equipped: false },
  ],
  spells: [],
}

function renderPage(character: CharacterDetail) {
  vi.mocked(charactersApi.getCharacter).mockResolvedValue(character)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/characters/1']}>
        <Routes>
          <Route path="/app/characters/:characterId" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CharacterSheetPage', () => {
  beforeEach(() => {
    vi.mocked(charactersApi.patchCharacter).mockReset()
    vi.mocked(charactersApi.getLevelHistory).mockReset().mockResolvedValue([])
    vi.mocked(charactersApi.postLevelRollback).mockReset()
    vi.mocked(contentApi.listItems).mockReset().mockResolvedValue([])
    vi.mocked(contentApi.listClasses).mockReset().mockResolvedValue([])
    vi.mocked(contentApi.listSpells).mockReset().mockResolvedValue([])
  })

  it('renders ability modifiers, saving throws, skills and combat stats from computed', async () => {
    renderPage(baseCharacter)

    expect(await screen.findByRole('heading', { name: 'Ари' })).toBeInTheDocument()
    expect(screen.getAllByText('+3').length).toBeGreaterThan(0) // str modifier

    const savesSection = screen.getByText('Спасброски').closest('section') as HTMLElement
    expect(within(savesSection).getByText('+4')).toBeInTheDocument() // wis saving throw (proficient)

    const combatSection = screen.getByText('Боевые параметры').closest('section') as HTMLElement
    expect(within(combatSection).getByText('12')).toBeInTheDocument() // AC
    expect(within(combatSection).getByText('+2')).toBeInTheDocument() // initiative
  })

  it('does not show the level-up banner when level_up_available is false', async () => {
    renderPage(baseCharacter)
    await screen.findByRole('heading', { name: 'Ари' })
    expect(screen.queryByText('Прокачаться')).not.toBeInTheDocument()
  })

  it('shows the level-up banner linking to the level-up route when available', async () => {
    renderPage({
      ...baseCharacter,
      computed: { ...baseCharacter.computed, level_up_available: true },
    })

    const link = await screen.findByRole('link', { name: 'Прокачаться' })
    expect(link).toHaveAttribute('href', '/app/characters/1/level-up')
  })

  it('saves only the edited HP field via PATCH', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.patchCharacter).mockResolvedValue({
      ...baseCharacter,
      hp_current: 7,
    })
    renderPage(baseCharacter)

    const hpCurrentInput = await screen.findByLabelText('Текущие')
    await user.clear(hpCurrentInput)
    await user.type(hpCurrentInput, '7')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(charactersApi.patchCharacter).toHaveBeenCalledWith('1', { hp_current: 7 })
    })
  })

  it('switches to the inventory tab and shows its entries', async () => {
    const user = userEvent.setup()
    renderPage(baseCharacter)

    await screen.findByRole('heading', { name: 'Ари' })
    await user.click(screen.getByRole('tab', { name: 'Инвентарь' }))

    expect(await screen.findByText('странный ключ')).toBeInTheDocument()
  })

  it('switches to the wallet tab and shows the three currency fields', async () => {
    const user = userEvent.setup()
    renderPage(baseCharacter)

    await screen.findByRole('heading', { name: 'Ари' })
    await user.click(screen.getByRole('tab', { name: 'Кошелёк' }))

    expect(await screen.findByLabelText('Золото')).toBeInTheDocument()
    expect(screen.getByLabelText('Серебро')).toBeInTheDocument()
    expect(screen.getByLabelText('Медь')).toBeInTheDocument()
  })

  it('switches to the level history tab and shows the empty state with no records', async () => {
    const user = userEvent.setup()
    renderPage(baseCharacter)

    await screen.findByRole('heading', { name: 'Ари' })
    await user.click(screen.getByRole('tab', { name: 'История уровней' }))

    expect(
      await screen.findByText(
        'Пока нет ни одной прокачки — история появится после первого повышения уровня.',
      ),
    ).toBeInTheDocument()
  })
})
