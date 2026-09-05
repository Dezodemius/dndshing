import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import DashboardPage from './DashboardPage'
import * as charactersApi from '../../api/characters'
import * as campaignsApi from '../../api/campaigns'
import * as merchantsApi from '../../api/merchants'
import {
  makeCampaign,
  makeCampaignPlayerView,
  makeCharacterSummary,
  makeMerchant,
} from '../../test/fixtures'

vi.mock('../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../api/characters')>(
    '../../api/characters',
  )
  return { ...actual, listCharacters: vi.fn() }
})

vi.mock('../../api/campaigns', async () => {
  const actual = await vi.importActual<typeof import('../../api/campaigns')>('../../api/campaigns')
  return { ...actual, listCampaigns: vi.fn() }
})

vi.mock('../../api/merchants', async () => {
  const actual = await vi.importActual<typeof import('../../api/merchants')>('../../api/merchants')
  return { ...actual, listMerchants: vi.fn() }
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
    vi.mocked(charactersApi.listCharacters)
      .mockReset()
      .mockResolvedValue([makeCharacterSummary({ id: 7, name: 'Ари' })])
    vi.mocked(campaignsApi.listCampaigns)
      .mockReset()
      .mockResolvedValue({ as_dm: [], as_player: [] })
    vi.mocked(merchantsApi.listMerchants)
      .mockReset()
      .mockResolvedValue([makeMerchant({ id: 12, name: 'Лавка Борга' })])
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

  it('плитка персонажа показывает уровень, расу и класс, хиты, КД и кошелёк', async () => {
    vi.mocked(charactersApi.listCharacters).mockResolvedValue([
      makeCharacterSummary({
        id: 7,
        name: 'Ари',
        race_name: 'Полурослик',
        class_name: 'Плут',
        level: 5,
        hp_current: 38,
        hp_max: 45,
        ac: 15,
        gold: 124,
        silver: 8,
        copper: 22,
      }),
    ])
    renderPage()

    expect(await screen.findByText('5 ур.')).toBeInTheDocument()
    expect(screen.getByText('Полурослик · Плут')).toBeInTheDocument()
    expect(screen.getAllByText('38 / 45').length).toBeGreaterThan(0)
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('124 зм · 8 см · 22 мм')).toBeInTheDocument()
  })

  it('персонаж без разрешённой расы показывает подпись-заглушку, а не пустоту', async () => {
    vi.mocked(charactersApi.listCharacters).mockResolvedValue([
      makeCharacterSummary({ race_name: null, class_name: null }),
    ])
    renderPage()

    expect(await screen.findByText('Раса не найдена · Класс не найден')).toBeInTheDocument()
  })

  it('персонаж с доступным уровнем получает бейдж и ссылку на визард', async () => {
    vi.mocked(charactersApi.listCharacters).mockResolvedValue([
      makeCharacterSummary({ id: 7, level_up_available: true }),
    ])
    renderPage()

    expect(await screen.findByText('Доступен новый уровень')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Прокачать' })).toHaveAttribute(
      'href',
      '/app/characters/7/level-up',
    )
  })

  it('кампания мастера — ссылка, кампания игрока — нет', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue({
      as_dm: [makeCampaign({ id: 3, name: 'Проклятие Страда' })],
      as_player: [makeCampaignPlayerView({ id: 4, name: 'Гробница' })],
    })
    renderPage()

    expect(await screen.findByRole('link', { name: 'Проклятие Страда' })).toHaveAttribute(
      'href',
      '/app/campaigns/3',
    )
    // GET /campaigns/{id} answers a player with 404, so the name must not be
    // a link that leads them to an error screen.
    expect(screen.getByText('Гробница')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Гробница' })).toBeNull()
  })

  it('плитка кампании показывает дату следующей игры или её отсутствие', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue({
      as_dm: [
        makeCampaign({ id: 3, name: 'С датой', next_session_at: '2026-10-01T18:00:00Z' }),
        makeCampaign({ id: 5, name: 'Без даты', next_session_at: null }),
      ],
      as_player: [],
    })
    renderPage()

    expect(await screen.findByText('Дата игры не назначена')).toBeInTheDocument()
  })

  it('плитка торговца показывает статус лавки и ведёт на витрину', async () => {
    vi.mocked(merchantsApi.listMerchants).mockResolvedValue([
      makeMerchant({ id: 12, name: 'Лавка Борга', is_open: false, share_code: 'xyz789' }),
    ])
    renderPage()

    expect(await screen.findByText('Лавка закрыта')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Витрина' })).toHaveAttribute('href', '/shop/xyz789')
  })

  it('пустая секция показывает подсказку и кнопку действия', async () => {
    vi.mocked(charactersApi.listCharacters).mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('У вас пока нет персонажей.')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Создать первого персонажа/ }),
    ).toHaveAttribute('href', '/app/characters/new')
  })

  it('ошибка секции показывается человеческим текстом', async () => {
    vi.mocked(charactersApi.listCharacters).mockRejectedValue(new Error('boom'))
    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('во время загрузки виден статус загрузки', async () => {
    let release: (value: charactersApi.CharacterSummary[]) => void = () => {}
    vi.mocked(charactersApi.listCharacters).mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    renderPage()

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    release([makeCharacterSummary()])
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })
})
