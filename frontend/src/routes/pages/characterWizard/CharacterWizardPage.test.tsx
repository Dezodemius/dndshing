import { useParams } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../../../i18n'
import CharacterWizardPage from './CharacterWizardPage'
import * as contentApi from '../../../api/content'
import * as charactersApi from '../../../api/characters'
import { ApiError } from '../../../api/client'
import type { BackgroundSummary, ClassSummary, RaceSummary } from '../../../api/content'
import type { CharacterDetail } from '../../../api/characters'

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

vi.mock('../../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../../api/characters')>(
    '../../../api/characters',
  )
  return {
    ...actual,
    createCharacter: vi.fn(),
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
  locale: 'ru',
  name: 'Воин',
  hit_die: 10,
  primary_ability: 'strength',
  data: { saving_throws: ['strength', 'constitution'] },
  levels: [
    {
      id: 1,
      class_id: 1,
      level: 1,
      features: { items: [{ name: 'Боевой стиль', description: '...' }] },
      spell_slots: null,
    },
  ],
  subclasses: [],
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

const createdCharacter: CharacterDetail = {
  id: 42,
  user_id: 1,
  name: 'Тестовый Герой',
  race_id: 1,
  class_id: 1,
  subclass_id: null,
  background_id: 1,
  alignment: 'chaotic-good',
  level: 1,
  xp: 0,
  ability_scores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
  hp_max: 9,
  hp_current: 9,
  hp_temp: 0,
  ac_override: null,
  speed: 9,
  proficiencies: { saves: ['str', 'con'] },
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
    modifiers: { str: -1, dex: -1, con: -1, int: -1, wis: -1, cha: -1 },
    saving_throws: { str: 1, dex: -1, con: 1, int: -1, wis: -1, cha: -1 },
    skills: {},
    ac: 9,
    initiative: -1,
    passive_perception: 9,
    xp_to_next: 300,
    level_up_available: false,
    spell_slots: {},
  },
  spells: [],
  inventory: [],
}

function SheetStub() {
  const { characterId } = useParams<{ characterId: string }>()
  return <p>Лист персонажа {characterId}</p>
}

function renderWizard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/characters/new']}>
        <Routes>
          <Route path="/app/characters/new" element={<CharacterWizardPage />} />
          <Route path="/app/characters/:characterId" element={<SheetStub />} />
        </Routes>
      </MemoryRouter>
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

async function advanceToDetails(user: ReturnType<typeof userEvent.setup>) {
  await selectRaceAndAdvance(user)
  await selectClassAndAdvance(user)
  await screen.findByRole('heading', { name: 'Выберите предысторию' })
  await user.click(await screen.findByRole('radio'))
  await user.click(screen.getByRole('button', { name: 'Далее' }))
  await screen.findByRole('heading', { name: 'Определите характеристики' })
  // Default point-buy assignment (all 8s) is already a valid, zero-cost choice.
  await user.click(screen.getByRole('button', { name: 'Далее' }))
  await screen.findByRole('heading', { name: 'Детали персонажа' })
}

async function fillDetailsAndAdvance(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Имя'), 'Тестовый Герой')
  await user.selectOptions(screen.getByLabelText('Мировоззрение'), 'chaotic-good')
  await user.click(screen.getByRole('button', { name: 'Далее' }))
  await screen.findByRole('heading', { name: 'Проверьте персонажа' })
}

describe('CharacterWizardPage', () => {
  beforeEach(() => {
    vi.mocked(contentApi.listRaces).mockReset().mockResolvedValue([race])
    vi.mocked(contentApi.listClasses).mockReset().mockResolvedValue([klass])
    vi.mocked(contentApi.listBackgrounds).mockReset().mockResolvedValue([background])
    vi.mocked(charactersApi.createCharacter).mockReset()
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

  it('advances race -> class -> background -> abilities, accumulating the selection', async () => {
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
    expect(await screen.findByRole('heading', { name: 'Определите характеристики' })).toBeInTheDocument()
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

  it('keeps a completed standard array assignment when navigating back and forward', async () => {
    const user = userEvent.setup()
    renderWizard()

    await selectRaceAndAdvance(user)
    await selectClassAndAdvance(user)
    await screen.findByRole('heading', { name: 'Выберите предысторию' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Определите характеристики' })

    await user.click(screen.getByRole('radio', { name: 'Стандартный массив' }))
    const assignments: [string, string][] = [
      ['Сила', '15'],
      ['Ловкость', '14'],
      ['Телосложение', '13'],
      ['Интеллект', '12'],
      ['Мудрость', '10'],
      ['Харизма', '8'],
    ]
    for (const [ability, value] of assignments) {
      await user.selectOptions(screen.getByLabelText(ability), value)
    }

    await user.click(screen.getByRole('button', { name: 'Назад' }))
    await screen.findByRole('heading', { name: 'Выберите предысторию' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    // "15" is STANDARD_ARRAY[0], so the select's option value (a pool index) is "0".
    expect(await screen.findByLabelText('Сила')).toHaveValue('0')
  })

  it('blocks "Далее" on the details step until name and alignment are set', async () => {
    const user = userEvent.setup()
    renderWizard()
    await advanceToDetails(user)

    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

    await user.type(screen.getByLabelText('Имя'), 'Тестовый Герой')
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Мировоззрение'), 'chaotic-good')
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled()
  })

  it('shows the accumulated selection on the preview step before submitting', async () => {
    const user = userEvent.setup()
    renderWizard()
    await advanceToDetails(user)
    await fillDetailsAndAdvance(user)

    expect(screen.getByText('Раса: Эльф')).toBeInTheDocument()
    expect(screen.getByText('Класс: Воин')).toBeInTheDocument()
    expect(screen.getByText('Предыстория: Солдат')).toBeInTheDocument()
  })

  it('submits the CharacterCreate payload built from the wizard state', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.createCharacter).mockResolvedValue(createdCharacter)
    renderWizard()
    await advanceToDetails(user)
    await fillDetailsAndAdvance(user)

    await user.click(screen.getByRole('button', { name: 'Создать персонажа' }))

    expect(charactersApi.createCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Тестовый Герой',
        race_id: 1,
        class_id: 1,
        background_id: 1,
        alignment: 'chaotic-good',
        ability_scores: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
        hp_max: 9,
        speed: 9,
        proficiencies: { saves: ['str', 'con'] },
      }),
    )
  })

  it('supports the standard array method end-to-end', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.createCharacter).mockResolvedValue(createdCharacter)
    renderWizard()

    await selectRaceAndAdvance(user)
    await selectClassAndAdvance(user)
    await screen.findByRole('heading', { name: 'Выберите предысторию' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Определите характеристики' })

    await user.click(screen.getByRole('radio', { name: 'Стандартный массив' }))
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

    const assignments: [string, string][] = [
      ['Сила', '15'],
      ['Ловкость', '14'],
      ['Телосложение', '13'],
      ['Интеллект', '12'],
      ['Мудрость', '10'],
      ['Харизма', '8'],
    ]
    for (const [ability, value] of assignments) {
      await user.selectOptions(screen.getByLabelText(ability), value)
    }
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await fillDetailsAndAdvance(user)
    await user.click(screen.getByRole('button', { name: 'Создать персонажа' }))

    expect(charactersApi.createCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        ability_scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      }),
    )
  })

  it('supports the manual entry method end-to-end', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.createCharacter).mockResolvedValue(createdCharacter)
    renderWizard()

    await selectRaceAndAdvance(user)
    await selectClassAndAdvance(user)
    await screen.findByRole('heading', { name: 'Выберите предысторию' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Определите характеристики' })

    await user.click(screen.getByRole('radio', { name: 'Вручную' }))
    const conInput = screen.getByLabelText('Телосложение')
    await user.clear(conInput)
    await user.type(conInput, '18')
    await user.tab()

    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await fillDetailsAndAdvance(user)
    await user.click(screen.getByRole('button', { name: 'Создать персонажа' }))

    expect(charactersApi.createCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        ability_scores: { str: 10, dex: 10, con: 18, int: 10, wis: 10, cha: 10 },
        hp_max: 10 + 4, // hit_die(10) + con modifier(+4 at score 18)
      }),
    )
  })

  it('shows computed values from the real API response, not a recomputed guess', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.createCharacter).mockResolvedValue(createdCharacter)
    renderWizard()
    await advanceToDetails(user)
    await fillDetailsAndAdvance(user)

    await user.click(screen.getByRole('button', { name: 'Создать персонажа' }))

    expect(await screen.findByText('КД: 9')).toBeInTheDocument()
    expect(screen.getByText('Инициатива: -1')).toBeInTheDocument()
    expect(screen.getByText('Хиты: 9')).toBeInTheDocument()
  })

  it('shows a human-readable error when character creation fails', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.createCharacter).mockRejectedValue(new ApiError('invalid_reference', 'boom'))
    renderWizard()
    await advanceToDetails(user)
    await fillDetailsAndAdvance(user)

    await user.click(screen.getByRole('button', { name: 'Создать персонажа' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Некорректные данные — обновите страницу и попробуйте снова',
    )
  })

  it('redirects to the character sheet after creation', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.createCharacter).mockResolvedValue(createdCharacter)
    renderWizard()
    await advanceToDetails(user)
    await fillDetailsAndAdvance(user)

    await user.click(screen.getByRole('button', { name: 'Создать персонажа' }))
    await user.click(await screen.findByRole('button', { name: 'Перейти к листу' }))

    expect(await screen.findByText('Лист персонажа 42')).toBeInTheDocument()
  })
})
