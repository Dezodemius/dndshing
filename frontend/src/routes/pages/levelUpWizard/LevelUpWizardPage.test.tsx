import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../../../i18n'
import LevelUpWizardPage from './LevelUpWizardPage'
import * as charactersApi from '../../../api/characters'
import * as contentApi from '../../../api/content'
import { ApiError } from '../../../api/client'
import type { CharacterDetail, LevelUpRecord } from '../../../api/characters'
import type { ClassSummary, Spell } from '../../../api/content'

vi.mock('../../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../../api/characters')>(
    '../../../api/characters',
  )
  return {
    ...actual,
    getCharacter: vi.fn(),
    postLevelUp: vi.fn(),
  }
})

vi.mock('../../../api/content', async () => {
  const actual = await vi.importActual<typeof import('../../../api/content')>('../../../api/content')
  return {
    ...actual,
    listClasses: vi.fn(),
    listSpells: vi.fn(),
  }
})

const fighterClass: ClassSummary = {
  id: 1,
  slug: 'fighter',
  locale: 'ru',
  name: 'Воин',
  hit_die: 10,
  primary_ability: 'str',
  data: {},
  levels: [
    { id: 1, class_id: 1, level: 1, features: { items: [] }, spell_slots: null },
    {
      id: 2,
      class_id: 1,
      level: 2,
      features: { items: [{ name: 'Всплеск действий', description: 'Доп. действие раз за бой.' }] },
      spell_slots: null,
    },
    {
      id: 3,
      class_id: 1,
      level: 3,
      features: { items: [{ name: 'Боевой архетип', description: 'Выберите архетип воина.' }] },
      spell_slots: null,
    },
  ],
  subclasses: [
    { id: 10, class_id: 1, slug: 'champion', locale: 'ru', name: 'Чемпион', unlock_level: 3, data: {} },
    {
      id: 11,
      class_id: 1,
      slug: 'battle-master',
      locale: 'ru',
      name: 'Мастер боя',
      unlock_level: 3,
      data: {},
    },
  ],
}

const wizardClass: ClassSummary = {
  id: 2,
  slug: 'wizard',
  locale: 'ru',
  name: 'Волшебник',
  hit_die: 6,
  primary_ability: 'int',
  data: {},
  levels: [
    { id: 4, class_id: 2, level: 1, features: { items: [] }, spell_slots: null },
    { id: 5, class_id: 2, level: 2, features: { items: [] }, spell_slots: null },
    {
      id: 6,
      class_id: 2,
      level: 3,
      features: { items: [{ name: 'Тайное восстановление', description: 'Восстановление ячейки.' }] },
      spell_slots: { '1': 4, '2': 2 },
    },
  ],
  subclasses: [],
}

const magicMissile: Spell = {
  id: 100,
  slug: 'magic-missile',
  locale: 'ru',
  name: 'Волшебная стрела',
  level: 1,
  school: 'evocation',
  casting_time: '1 действие',
  range: '36 метров',
  components: 'В, С',
  duration: 'Мгновенная',
  description: 'Три светящихся снаряда.',
  data: {},
}

function makeCharacter(overrides: Partial<CharacterDetail> = {}): CharacterDetail {
  return {
    id: 1,
    user_id: 1,
    name: 'Ари',
    race_id: 1,
    class_id: 1,
    subclass_id: null,
    background_id: null,
    alignment: 'lawful-good',
    level: 2,
    xp: 900,
    ability_scores: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
    hp_max: 19,
    hp_current: 19,
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
      modifiers: { str: 3, dex: 1, con: 2, int: 0, wis: 0, cha: 0 },
      saving_throws: { str: 3, dex: 1, con: 2, int: 0, wis: 0, cha: 0 },
      skills: {},
      ac: 15,
      initiative: 1,
      passive_perception: 10,
      xp_to_next: 0,
      level_up_available: true,
      spell_slots: {},
    },
    spells: [],
    inventory: [],
    ...overrides,
  }
}

function renderWizard(characterId = '1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/characters/${characterId}/level-up`]}>
        <Routes>
          <Route path="/app/characters/:characterId/level-up" element={<LevelUpWizardPage />} />
          <Route path="/app/characters/:characterId" element={<p>Лист персонажа</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LevelUpWizardPage', () => {
  beforeEach(() => {
    vi.mocked(charactersApi.getCharacter).mockReset().mockResolvedValue(makeCharacter())
    vi.mocked(charactersApi.postLevelUp).mockReset()
    vi.mocked(contentApi.listClasses).mockReset().mockResolvedValue([fighterClass])
    vi.mocked(contentApi.listSpells).mockReset().mockResolvedValue([])
  })

  it('passes 2 -> 3 end-to-end with a subclass choice and shows the resulting delta', async () => {
    const user = userEvent.setup()
    const record: LevelUpRecord = {
      id: 1,
      character_id: 1,
      from_level: 2,
      to_level: 3,
      delta: {
        hp_gained: 7,
        hp_method: 'average',
        asi: null,
        feat: null,
        subclass_chosen: 'champion',
        features_unlocked: ['items'],
        spells_learned: [],
        spells_forgotten: [],
      },
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(charactersApi.postLevelUp).mockResolvedValue(record)

    renderWizard()

    expect(await screen.findByRole('heading', { name: 'Уровень 2 → 3' })).toBeInTheDocument()
    expect(screen.getByText('Боевой архетип.')).toBeInTheDocument()

    // HP step: average is the default, just advance.
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    // Ability step: optional, skip without choosing ASI/feat.
    expect(await screen.findByRole('heading', { name: 'Улучшение характеристик или черта' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    // Subclass step: required, pick "Чемпион".
    expect(await screen.findByRole('heading', { name: 'Выберите подкласс' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: 'Чемпион' }))
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    // Confirm step: submit.
    expect(await screen.findByRole('heading', { name: 'Подтверждение' })).toBeInTheDocument()
    expect(screen.getByText('Подкласс: Чемпион')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Подтвердить прокачку' }))

    expect(await screen.findByRole('heading', { name: 'Уровень 3 достигнут!' })).toBeInTheDocument()
    expect(screen.getByText('Хиты: +7')).toBeInTheDocument()
    // The API delta only carries feature dict keys ("items"); the human-readable
    // name must come from the class-level data already loaded on the page.
    expect(screen.getByText('Новые фичи: Боевой архетип')).toBeInTheDocument()
    expect(screen.queryByText('Новые фичи: items')).not.toBeInTheDocument()
    expect(screen.getByText('Подкласс: Чемпион')).toBeInTheDocument()
    expect(vi.mocked(charactersApi.postLevelUp)).toHaveBeenCalledWith('1', {
      hp_method: 'average',
      spells_learned: [],
      subclass_id: 10,
    })
  })

  it('anchors the result screen to record.to_level even after the post-submit character refetch bumps the level', async () => {
    const user = userEvent.setup()
    // The mutation invalidates the character query on success, and the backend has
    // already applied the level-up by then, so the refetch comes back one level higher.
    vi.mocked(charactersApi.getCharacter)
      .mockReset()
      .mockResolvedValueOnce(makeCharacter({ level: 2 }))
      .mockResolvedValue(makeCharacter({ level: 3 }))

    const record: LevelUpRecord = {
      id: 4,
      character_id: 1,
      from_level: 2,
      to_level: 3,
      delta: {
        hp_gained: 7,
        hp_method: 'average',
        asi: null,
        feat: null,
        subclass_chosen: 'champion',
        features_unlocked: ['items'],
        spells_learned: [],
        spells_forgotten: [],
      },
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(charactersApi.postLevelUp).mockResolvedValue(record)

    renderWizard()

    await screen.findByRole('heading', { name: 'Уровень 2 → 3' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Улучшение характеристик или черта' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Выберите подкласс' })
    await user.click(screen.getByRole('radio', { name: 'Чемпион' }))
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Подтверждение' })
    await user.click(screen.getByRole('button', { name: 'Подтвердить прокачку' }))

    expect(await screen.findByRole('heading', { name: 'Уровень 3 достигнут!' })).toBeInTheDocument()
    // Naively deriving from the (now-refetched) character.level would look at level 4,
    // which doesn't exist for this class, or would fall back to the raw subclass slug.
    expect(screen.getByText('Новые фичи: Боевой архетип')).toBeInTheDocument()
    expect(screen.getByText('Подкласс: Чемпион')).toBeInTheDocument()
    expect(screen.queryByText('Подкласс: champion')).not.toBeInTheDocument()
  })

  it('skips the subclass and spells steps when the level does not unlock them', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.getCharacter).mockResolvedValue(makeCharacter({ level: 1, xp: 300 }))

    renderWizard()

    expect(await screen.findByRole('heading', { name: 'Уровень 1 → 2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    expect(await screen.findByRole('heading', { name: 'Улучшение характеристик или черта' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    expect(await screen.findByRole('heading', { name: 'Подтверждение' })).toBeInTheDocument()
  })

  it('treats ASI and feat as mutually exclusive on the ability step', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.click(await screen.findByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Улучшение характеристик или черта' })

    await user.click(screen.getByRole('radio', { name: 'Черта' }))
    expect(screen.getByLabelText('Название черты')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Улучшение характеристик' }))
    expect(screen.queryByLabelText('Название черты')).not.toBeInTheDocument()
    expect(screen.getByText('Распределите 2 очка между характеристиками.')).toBeInTheDocument()
  })

  it('validates the rolled HP range and sends it in the payload', async () => {
    const user = userEvent.setup()
    const record: LevelUpRecord = {
      id: 2,
      character_id: 1,
      from_level: 2,
      to_level: 3,
      delta: {
        hp_gained: 5,
        hp_method: 'rolled',
        asi: null,
        feat: null,
        subclass_chosen: 'champion',
        features_unlocked: ['items'],
        spells_learned: [],
        spells_forgotten: [],
      },
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(charactersApi.postLevelUp).mockResolvedValue(record)

    renderWizard()

    await screen.findByRole('heading', { name: 'Уровень 2 → 3' })
    await user.click(screen.getByRole('radio', { name: 'Бросок кости' }))
    const rolledInput = screen.getByLabelText('Результат броска (1–10)')

    await user.type(rolledInput, '0')
    expect(screen.getByRole('alert')).toHaveTextContent('Введите число от 1 до 10')
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()

    await user.clear(rolledInput)
    await user.type(rolledInput, '5')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    await screen.findByRole('heading', { name: 'Улучшение характеристик или черта' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    await screen.findByRole('heading', { name: 'Выберите подкласс' })
    await user.click(screen.getByRole('radio', { name: 'Чемпион' }))
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    await screen.findByRole('heading', { name: 'Подтверждение' })
    await user.click(screen.getByRole('button', { name: 'Подтвердить прокачку' }))

    expect(vi.mocked(charactersApi.postLevelUp)).toHaveBeenCalledWith('1', {
      hp_method: 'rolled',
      hp_rolled: 5,
      spells_learned: [],
      subclass_id: 10,
    })
  })

  it('distributes ASI points and sends them in the payload', async () => {
    const user = userEvent.setup()
    vi.mocked(contentApi.listClasses).mockResolvedValue([wizardClass])
    vi.mocked(charactersApi.getCharacter).mockResolvedValue(makeCharacter({ class_id: 2 }))

    renderWizard()

    await user.click(await screen.findByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Улучшение характеристик или черта' })
    await user.click(screen.getByRole('radio', { name: 'Улучшение характеристик' }))
    await user.click(screen.getByRole('button', { name: '+1 Интеллект' }))
    await user.click(screen.getByRole('button', { name: '+1 Телосложение' }))
    // The ASI cap is 2 points total — further increases must stay disabled.
    expect(screen.getByRole('button', { name: '+1 Мудрость' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    await screen.findByRole('heading', { name: 'Новые заклинания' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    await screen.findByRole('heading', { name: 'Подтверждение' })
    await user.click(screen.getByRole('button', { name: 'Подтвердить прокачку' }))

    expect(vi.mocked(charactersApi.postLevelUp)).toHaveBeenCalledWith('1', {
      hp_method: 'average',
      spells_learned: [],
      asi: { int: 1, con: 1 },
    })
  })

  it('sends selected spell ids in the payload and shows real names on the result screen', async () => {
    const user = userEvent.setup()
    vi.mocked(contentApi.listClasses).mockResolvedValue([wizardClass])
    vi.mocked(contentApi.listSpells).mockResolvedValue([magicMissile])
    vi.mocked(charactersApi.getCharacter).mockResolvedValue(makeCharacter({ class_id: 2 }))
    const record: LevelUpRecord = {
      id: 3,
      character_id: 1,
      from_level: 2,
      to_level: 3,
      delta: {
        hp_gained: 4,
        hp_method: 'average',
        asi: null,
        feat: null,
        subclass_chosen: null,
        features_unlocked: [],
        // The backend returns spell slugs, not display names.
        spells_learned: ['magic-missile'],
        spells_forgotten: [],
      },
      created_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(charactersApi.postLevelUp).mockResolvedValue(record)

    renderWizard()

    await user.click(await screen.findByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Улучшение характеристик или черта' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    await screen.findByRole('heading', { name: 'Новые заклинания' })
    await user.click(screen.getByRole('checkbox', { name: 'Волшебная стрела' }))
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    await screen.findByRole('heading', { name: 'Подтверждение' })
    await user.click(screen.getByRole('button', { name: 'Подтвердить прокачку' }))

    expect(vi.mocked(charactersApi.postLevelUp)).toHaveBeenCalledWith('1', {
      hp_method: 'average',
      spells_learned: [100],
    })

    expect(await screen.findByRole('heading', { name: 'Уровень 3 достигнут!' })).toBeInTheDocument()
    expect(screen.getByText('Выучено заклинаний: Волшебная стрела')).toBeInTheDocument()
    expect(screen.queryByText('Выучено заклинаний: magic-missile')).not.toBeInTheDocument()
  })

  it('shows a human-readable error when the confirm submission fails', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.postLevelUp).mockRejectedValue(
      new ApiError('level_up_not_available', 'boom'),
    )

    renderWizard()

    await user.click(await screen.findByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Улучшение характеристик или черта' })
    await user.click(screen.getByRole('button', { name: 'Далее' }))
    await screen.findByRole('heading', { name: 'Выберите подкласс' })
    await user.click(screen.getByRole('radio', { name: 'Чемпион' }))
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    await screen.findByRole('heading', { name: 'Подтверждение' })
    await user.click(screen.getByRole('button', { name: 'Подтвердить прокачку' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Недостаточно опыта для повышения уровня',
    )
  })

  it('shows a guard message instead of the wizard when level-up is not available', async () => {
    vi.mocked(charactersApi.getCharacter).mockResolvedValue(
      makeCharacter({ computed: { ...makeCharacter().computed, level_up_available: false } }),
    )

    renderWizard()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Для этого персонажа сейчас нет доступного повышения уровня.',
    )
    expect(screen.getByRole('link', { name: 'Вернуться к листу персонажа' })).toBeInTheDocument()
  })
})
