import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import CharacterInventoryTab from './CharacterInventoryTab'
import * as charactersApi from '../../api/characters'
import * as contentApi from '../../api/content'
import type { CharacterDetail } from '../../api/characters'
import type { Item } from '../../api/content'

vi.mock('../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../api/characters')>(
    '../../api/characters',
  )
  return {
    ...actual,
    addInventoryItem: vi.fn(),
    updateInventoryItem: vi.fn(),
    deleteInventoryItem: vi.fn(),
  }
})

vi.mock('../../api/content', async () => {
  const actual = await vi.importActual<typeof import('../../api/content')>('../../api/content')
  return {
    ...actual,
    listItems: vi.fn(),
  }
})

const potion: Item = {
  id: 10,
  slug: 'healing-potion',
  locale: 'ru',
  name: 'Зелье лечения',
  type: 'potion',
  rarity: 'common',
  price_g: 50,
  price_s: 0,
  price_c: 0,
  weight: 0.5,
  description: '',
  data: {},
}

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
  gold: 0,
  silver: 0,
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
    level_up_available: false,
    spell_slots: {},
  },
  inventory: [
    { id: 1, character_id: 1, item_id: 10, custom_name: null, quantity: 2, equipped: false },
    { id: 2, character_id: 1, item_id: null, custom_name: 'странный ключ', quantity: 1, equipped: true },
  ],
  spells: [],
}

function renderTab(character: CharacterDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterInventoryTab characterId="1" character={character} />
    </QueryClientProvider>,
  )
}

describe('CharacterInventoryTab', () => {
  beforeEach(() => {
    vi.mocked(charactersApi.addInventoryItem).mockReset()
    vi.mocked(charactersApi.updateInventoryItem).mockReset()
    vi.mocked(charactersApi.deleteInventoryItem).mockReset()
    vi.mocked(contentApi.listItems).mockReset().mockResolvedValue([potion])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('renders catalog items by name and custom entries by their text', async () => {
    renderTab(baseCharacter)
    expect(await screen.findByText('Зелье лечения')).toBeInTheDocument()
    expect(screen.getByText('странный ключ')).toBeInTheDocument()
  })

  it('shows the empty state when inventory has no entries', () => {
    renderTab({ ...baseCharacter, inventory: [] })
    expect(screen.getByText('Инвентарь пуст')).toBeInTheDocument()
  })

  it('adds an item from the catalog after searching by name', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.addInventoryItem).mockResolvedValue({
      id: 3,
      character_id: 1,
      item_id: 10,
      custom_name: null,
      quantity: 1,
      equipped: false,
    })
    renderTab(baseCharacter)

    await user.type(screen.getByLabelText('Поиск в справочнике'), 'зелье')
    await waitFor(() => expect(contentApi.listItems).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Добавить' }))

    await waitFor(() => {
      expect(charactersApi.addInventoryItem).toHaveBeenCalledWith('1', {
        item_id: 10,
        quantity: 1,
      })
    })
  })

  it('adds a custom text entry', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.addInventoryItem).mockResolvedValue({
      id: 4,
      character_id: 1,
      item_id: null,
      custom_name: 'выдано мастером',
      quantity: 1,
      equipped: false,
    })
    renderTab(baseCharacter)

    await user.type(screen.getByLabelText('Название'), 'выдано мастером')
    await user.click(screen.getByRole('button', { name: 'Добавить как текст' }))

    await waitFor(() => {
      expect(charactersApi.addInventoryItem).toHaveBeenCalledWith('1', {
        custom_name: 'выдано мастером',
        quantity: 1,
      })
    })
  })

  it('deletes an entry after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.deleteInventoryItem).mockResolvedValue(undefined)
    renderTab(baseCharacter)

    await screen.findByText('странный ключ')
    const row = screen.getByText('странный ключ').closest('li') as HTMLElement
    const { within } = await import('@testing-library/react')
    await user.click(within(row).getByRole('button', { name: 'Удалить' }))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(charactersApi.deleteInventoryItem).toHaveBeenCalledWith('1', 2)
    })
  })
})
