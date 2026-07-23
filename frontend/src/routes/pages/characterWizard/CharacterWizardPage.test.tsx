import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../../i18n'
import CharacterWizardPage from './CharacterWizardPage'
import * as contentApi from '../../../api/content'
import { ApiError } from '../../../api/client'
import type { BackgroundSummary, ClassSummary, RaceSummary } from '../../../api/content'

vi.mock('../../../api/content', async () => {
  const actual = await vi.importActual<typeof import('../../../api/content')>(
    '../../../api/content',
  )
  return {
    ...actual,
    listRaces: vi.fn(),
    listClasses: vi.fn(),
    listBackgrounds: vi.fn(),
  }
})

const race: RaceSummary = {
  id: 1,
  slug: 'elf',
  name: 'Эльф',
  data: {
    speed: 9,
    darkvision: 18,
    ability_bonuses: { dex: 2 },
    traits: [{ name: 'Тёмное зрение', description: 'Видит в темноте.' }],
  },
}

const klass: ClassSummary = {
  id: 1,
  slug: 'fighter',
  name: 'Воин',
  hit_die: 10,
  primary_ability: 'strength',
  data: { saving_throws: ['strength', 'constitution'] },
  levels: [{ level: 1, features: { items: [{ name: 'Боевой стиль', description: '...' }] } }],
}

const background: BackgroundSummary = {
  id: 1,
  slug: 'soldier',
  name: 'Солдат',
  data: {
    skill_proficiencies: ['атлетика'],
    feature: { name: 'Воинское звание', description: '...' },
  },
}

function renderWizard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterWizardPage />
    </QueryClientProvider>,
  )
}

async function selectRaceAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('radio')
  await user.click(screen.getByRole('radio'))
  await user.click(screen.getByRole('button', { name: 'Далее' }))
}

async function selectClassAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('radio')
  await user.click(screen.getByRole('radio'))
  await user.click(screen.getByRole('button', { name: 'Далее' }))
}

describe('CharacterWizardPage', () => {
  beforeEach(() => {
    vi.mocked(contentApi.listRaces).mockReset().mockResolvedValue([race])
    vi.mocked(contentApi.listClasses).mockReset().mockResolvedValue([klass])
    vi.mocked(contentApi.listBackgrounds).mockReset().mockResolvedValue([background])
  })

  it('shows a loading state, then race cards once loaded', async () => {
    renderWizard()
    expect(screen.getByText('Загрузка…')).toBeInTheDocument()
    expect(await screen.findByRole('radio', { name: /Эльф/ })).toBeInTheDocument()
  })

  it('shows a human-readable error when race loading fails', async () => {
    vi.mocked(contentApi.listRaces).mockReset().mockRejectedValue(new ApiError('boom', 'boom'))
    renderWizard()
    expect(await screen.findByRole('alert')).toHaveTextContent('Что-то пошло не так, попробуйте позже')
  })

  it('keeps "Далее" disabled on the race step until a race is selected', async () => {
    const user = userEvent.setup()
    renderWizard()

    await screen.findByRole('radio')
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

    await user.click(screen.getByRole('radio'))
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled()
  })

  it('advances race -> class -> background, accumulating the selection', async () => {
    const user = userEvent.setup()
    renderWizard()

    await selectRaceAndAdvance(user)
    expect(await screen.findByRole('heading', { name: 'Выберите класс' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

    await selectClassAndAdvance(user)
    expect(await screen.findByRole('heading', { name: 'Выберите предысторию' })).toBeInTheDocument()
    // background is optional: "Далее" is enabled without a selection
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(await screen.findByRole('heading', { name: 'Выбор сохранён' })).toBeInTheDocument()
    expect(screen.getByText('Раса: Эльф')).toBeInTheDocument()
    expect(screen.getByText('Класс: Воин')).toBeInTheDocument()
    expect(screen.getByText('Предыстория: не выбрана')).toBeInTheDocument()
  })

  it('shows the chosen background name in the summary when one was picked', async () => {
    const user = userEvent.setup()
    renderWizard()

    await selectRaceAndAdvance(user)
    await selectClassAndAdvance(user)
    await screen.findByRole('heading', { name: 'Выберите предысторию' })
    await user.click(await screen.findByRole('radio'))
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    expect(await screen.findByText('Предыстория: Солдат')).toBeInTheDocument()
  })

  it('goes back to the previous step keeping the earlier selection', async () => {
    const user = userEvent.setup()
    renderWizard()

    await selectRaceAndAdvance(user)
    await screen.findByRole('heading', { name: 'Выберите класс' })

    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(await screen.findByRole('heading', { name: 'Выберите расу' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Эльф/ })).toBeChecked()
  })
})
