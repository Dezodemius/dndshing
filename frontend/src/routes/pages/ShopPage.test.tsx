import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import ShopPage from './ShopPage'
import * as shopApi from '../../api/shop'
import * as charactersApi from '../../api/characters'
import * as contentApi from '../../api/content'
import type { Shop } from '../../api/shop'
import type { CharacterDetail, CharacterSummary } from '../../api/characters'
import type { Item } from '../../api/content'

const authState = vi.hoisted(() => ({
  status: 'guest' as 'guest' | 'authenticated' | 'loading',
}))

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('../../api/shop', async () => {
  const actual = await vi.importActual<typeof import('../../api/shop')>('../../api/shop')
  return {
    ...actual,
    getShop: vi.fn(),
    buyFromShop: vi.fn(),
    sellToShop: vi.fn(),
  }
})

vi.mock('../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../api/characters')>('../../api/characters')
  return {
    ...actual,
    listCharacters: vi.fn(),
    getCharacter: vi.fn(),
  }
})

vi.mock('../../api/content', async () => {
  const actual = await vi.importActual<typeof import('../../api/content')>('../../api/content')
  return {
    ...actual,
    listItems: vi.fn(),
  }
})

const sword: Item = {
  id: 10,
  slug: 'longsword',
  locale: 'ru',
  name: 'Длинный меч',
  type: 'weapon',
  rarity: 'common',
  price_g: 15,
  price_s: 0,
  price_c: 0,
  weight: 3,
  description: '',
  data: {},
}

const baseShop: Shop = {
  name: 'Лавка Барда',
  description: 'Всякая всячина',
  is_open: true,
  items: [{ id: 100, item_id: 10, name: 'Длинный меч', price_g: 15, price_s: 0, price_c: 0, quantity: 5 }],
}

const character: CharacterSummary = { id: 1, name: 'Ари', level: 3, gold: 100, silver: 0, copper: 0 }

const characterDetail: CharacterDetail = {
  id: 1,
  user_id: 1,
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
  hp_current: 20,
  hp_temp: 0,
  ac_override: null,
  speed: 30,
  proficiencies: {},
  appearance: null,
  backstory: null,
  notes: null,
  gold: 100,
  silver: 0,
  copper: 0,
  created_at: '',
  updated_at: '',
  computed: {
    prof_bonus: 2,
    modifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    saving_throws: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    skills: {},
    ac: 10,
    initiative: 0,
    passive_perception: 10,
    xp_to_next: null,
    level_up_available: false,
    spell_slots: {},
  },
  spells: [],
  inventory: [
    { id: 200, character_id: 1, item_id: 10, custom_name: null, quantity: 2, equipped: false },
    { id: 201, character_id: 1, item_id: null, custom_name: 'Загадочный амулет', quantity: 1, equipped: false },
  ],
}

function renderShop() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/shop/abc123']}>
        <Routes>
          <Route path="/shop/:shareCode" element={<ShopPage />} />
          <Route path="/login" element={<p>вход</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ShopPage', () => {
  beforeEach(() => {
    authState.status = 'guest'
    vi.mocked(shopApi.getShop).mockReset().mockResolvedValue(baseShop)
    vi.mocked(shopApi.buyFromShop).mockReset()
    vi.mocked(shopApi.sellToShop).mockReset()
    vi.mocked(charactersApi.listCharacters).mockReset().mockResolvedValue([character])
    vi.mocked(charactersApi.getCharacter).mockReset().mockResolvedValue(characterDetail)
    vi.mocked(contentApi.listItems).mockReset().mockResolvedValue([sword])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('shows the shop items and a login invitation for a guest', async () => {
    renderShop()

    expect(await screen.findByRole('heading', { name: 'Лавка Барда' })).toBeInTheDocument()
    expect(screen.getByText('Длинный меч')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Войти' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Персонаж')).not.toBeInTheDocument()
  })

  it('shows a closed banner when the shop is closed', async () => {
    vi.mocked(shopApi.getShop).mockResolvedValue({ ...baseShop, is_open: false })
    renderShop()

    expect(await screen.findByRole('alert')).toHaveTextContent('Лавка закрыта')
  })

  it('lets an authenticated player pick a character and shows the read-only wallet', async () => {
    authState.status = 'authenticated'
    const user = userEvent.setup()
    renderShop()

    const select = await screen.findByLabelText('Персонаж')
    await user.selectOptions(select, 'Ари')

    expect(await screen.findByText('100 зм 0 см 0 мм')).toBeInTheDocument()
    expect(screen.getByText('Загадочный амулет')).toBeInTheDocument()
    expect(screen.getByText('Выдано мастером «на словах» — нельзя продать торговцу')).toBeInTheDocument()
  })

  it('buys an item after confirmation and refreshes the shop and character', async () => {
    authState.status = 'authenticated'
    vi.mocked(shopApi.buyFromShop).mockResolvedValue({
      inventory_entry_id: 200,
      quantity_bought: 1,
      character_gold: 85,
      character_silver: 0,
      character_copper: 0,
      merchant_item_remaining_quantity: 4,
    })
    const user = userEvent.setup()
    renderShop()

    await user.selectOptions(await screen.findByLabelText('Персонаж'), 'Ари')
    await screen.findByText('100 зм 0 см 0 мм')
    await user.click(screen.getByRole('button', { name: 'Купить' }))

    expect(window.confirm).toHaveBeenCalledWith('Купить «Длинный меч» за 15 зм 0 см 0 мм?')
    await waitFor(() => {
      expect(shopApi.buyFromShop).toHaveBeenCalledWith('abc123', {
        character_id: 1,
        merchant_item_id: 100,
        quantity: 1,
      })
    })
  })

  it('sells a catalog item for half its card price after confirmation', async () => {
    authState.status = 'authenticated'
    vi.mocked(shopApi.sellToShop).mockResolvedValue({
      quantity_sold: 1,
      character_gold: 107,
      character_silver: 0,
      character_copper: 0,
      refund_gold: 7,
      refund_silver: 0,
      refund_copper: 0,
      inventory_entry_remaining_quantity: 1,
    })
    const user = userEvent.setup()
    renderShop()

    await user.selectOptions(await screen.findByLabelText('Персонаж'), 'Ари')
    await waitFor(() => expect(contentApi.listItems).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Продать' }))

    expect(window.confirm).toHaveBeenCalledWith('Продать «Длинный меч» за 7 зм 0 см 0 мм?')
    await waitFor(() => {
      expect(shopApi.sellToShop).toHaveBeenCalledWith('abc123', {
        character_id: 1,
        inventory_entry_id: 200,
        quantity: 1,
      })
    })
  })

  it('resets the character selection after confirming a change of character', async () => {
    authState.status = 'authenticated'
    const user = userEvent.setup()
    renderShop()

    await user.selectOptions(await screen.findByLabelText('Персонаж'), 'Ари')
    await screen.findByText('100 зм 0 см 0 мм')

    await user.click(screen.getByRole('button', { name: 'Сменить персонажа' }))

    expect(window.confirm).toHaveBeenCalledWith('Сменить персонажа? Текущий выбор будет сброшен.')
    expect(await screen.findByLabelText('Персонаж')).toBeInTheDocument()
  })
})
