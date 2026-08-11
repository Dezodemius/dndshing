import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import MerchantEditorPage from './MerchantEditorPage'
import * as merchantsApi from '../../api/merchants'
import * as contentApi from '../../api/content'
import type { MerchantDetail } from '../../api/merchants'
import type { Item } from '../../api/content'

vi.mock('../../api/merchants', async () => {
  const actual = await vi.importActual<typeof import('../../api/merchants')>(
    '../../api/merchants',
  )
  return {
    ...actual,
    getMerchant: vi.fn(),
    createMerchant: vi.fn(),
    patchMerchant: vi.fn(),
    deleteMerchant: vi.fn(),
    addMerchantItem: vi.fn(),
    updateMerchantItem: vi.fn(),
    deleteMerchantItem: vi.fn(),
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

const potion: Item = {
  id: 11,
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

const baseMerchant: MerchantDetail = {
  id: 1,
  owner_user_id: 1,
  name: 'Лавка Боромира',
  description: 'Кузнец в порту',
  share_code: 'abc123',
  is_open: true,
  items: [
    { id: 100, merchant_id: 1, item_id: 10, price_g: null, price_s: null, price_c: null, quantity: null },
  ],
}

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/merchants/1']}>
        <Routes>
          <Route path="/app/merchants/:merchantId" element={<MerchantEditorPage />} />
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
      <MemoryRouter initialEntries={['/app/merchants/new']}>
        <Routes>
          <Route path="/app/merchants/new" element={<MerchantEditorPage />} />
          <Route path="/app/merchants/:merchantId" element={<MerchantEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MerchantEditorPage', () => {
  beforeEach(() => {
    vi.mocked(merchantsApi.getMerchant).mockReset().mockResolvedValue(baseMerchant)
    vi.mocked(merchantsApi.createMerchant).mockReset()
    vi.mocked(merchantsApi.patchMerchant).mockReset()
    vi.mocked(merchantsApi.deleteMerchant).mockReset()
    vi.mocked(merchantsApi.addMerchantItem).mockReset()
    vi.mocked(merchantsApi.updateMerchantItem).mockReset()
    vi.mocked(merchantsApi.deleteMerchantItem).mockReset()
    vi.mocked(contentApi.listItems).mockReset().mockResolvedValue([sword, potion])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  it('renders the merchant card and its items resolved from the catalog', async () => {
    renderEditor()
    expect(await screen.findByRole('heading', { name: 'Лавка Боромира' })).toBeInTheDocument()
    expect(screen.getByText('Длинный меч')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/\/shop\/abc123$/)).toBeInTheDocument()
  })

  it('saves the name and description via PATCH', async () => {
    const user = userEvent.setup()
    vi.mocked(merchantsApi.patchMerchant).mockResolvedValue({
      ...baseMerchant,
      name: 'Новое имя',
    })
    renderEditor()

    const nameInput = await screen.findByLabelText('Имя')
    await user.clear(nameInput)
    await user.type(nameInput, 'Новое имя')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      expect(merchantsApi.patchMerchant).toHaveBeenCalledWith('1', { name: 'Новое имя' })
    })
  })

  it('toggles is_open immediately when the checkbox changes', async () => {
    const user = userEvent.setup()
    vi.mocked(merchantsApi.patchMerchant).mockResolvedValue({ ...baseMerchant, is_open: false })
    renderEditor()

    const toggle = await screen.findByLabelText('Лавка открыта')
    await user.click(toggle)

    await waitFor(() => {
      expect(merchantsApi.patchMerchant).toHaveBeenCalledWith('1', { is_open: false })
    })
  })

  it('adds an item from the catalog after searching by name', async () => {
    const user = userEvent.setup()
    vi.mocked(merchantsApi.addMerchantItem).mockResolvedValue({
      id: 101,
      merchant_id: 1,
      item_id: 11,
      price_g: null,
      price_s: null,
      price_c: null,
      quantity: null,
    })
    renderEditor()

    await user.type(await screen.findByLabelText('Поиск в справочнике'), 'зелье')
    await waitFor(() => expect(contentApi.listItems).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Добавить' }))

    await waitFor(() => {
      expect(merchantsApi.addMerchantItem).toHaveBeenCalledWith('1', { item_id: 11 })
    })
  })

  it('commits an override price change on blur', async () => {
    const user = userEvent.setup()
    vi.mocked(merchantsApi.updateMerchantItem).mockResolvedValue({
      ...baseMerchant.items[0],
      price_g: 20,
    })
    renderEditor()

    await screen.findByText('Длинный меч')
    const row = screen.getByText('Длинный меч').closest('li') as HTMLElement
    const goldInput = within(row).getByPlaceholderText('зм')
    await user.type(goldInput, '20')
    await user.tab()

    await waitFor(() => {
      expect(merchantsApi.updateMerchantItem).toHaveBeenCalledWith('1', 100, { price_g: 20 })
    })
  })

  it('deletes an item after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(merchantsApi.deleteMerchantItem).mockResolvedValue(undefined)
    renderEditor()

    await screen.findByText('Длинный меч')
    const row = screen.getByText('Длинный меч').closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Удалить' }))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(merchantsApi.deleteMerchantItem).toHaveBeenCalledWith('1', 100)
    })
  })

  it('copies the shop link to the clipboard', async () => {
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Скопировать' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringMatching(/\/shop\/abc123$/),
      )
    })
    expect(await screen.findByText('Скопировано')).toBeInTheDocument()
  })

  it('deletes the merchant after confirmation and returns to the dashboard', async () => {
    const user = userEvent.setup()
    vi.mocked(merchantsApi.deleteMerchant).mockResolvedValue(undefined)
    renderEditor()

    await user.click(await screen.findByRole('button', { name: 'Удалить торговца' }))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(merchantsApi.deleteMerchant).toHaveBeenCalledWith('1')
    })
    expect(await screen.findByText('дашборд')).toBeInTheDocument()
  })

  it('creates a new merchant and redirects to its editor page', async () => {
    const user = userEvent.setup()
    const created: MerchantDetail = {
      id: 5,
      owner_user_id: 1,
      name: 'Новый торговец',
      description: null,
      share_code: 'xyz',
      is_open: true,
      items: [],
    }
    vi.mocked(merchantsApi.createMerchant).mockResolvedValue(created)
    vi.mocked(merchantsApi.getMerchant).mockResolvedValue(created)
    renderCreate()

    await user.type(await screen.findByLabelText('Имя'), 'Новый торговец')
    await user.click(screen.getByRole('button', { name: 'Создать торговца' }))

    await waitFor(() => {
      expect(merchantsApi.createMerchant).toHaveBeenCalledWith({
        name: 'Новый торговец',
        description: null,
      })
    })
    expect(await screen.findByRole('heading', { name: 'Новый торговец' })).toBeInTheDocument()
  })
})
