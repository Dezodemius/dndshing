import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import CharacterHistoryTab from './CharacterHistoryTab'
import * as charactersApi from '../../api/characters'
import * as contentApi from '../../api/content'
import { ApiError } from '../../api/client'
import type { CharacterDetail, LevelUpRecord } from '../../api/characters'
import type { ClassSummary, Spell } from '../../api/content'

vi.mock('../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../api/characters')>(
    '../../api/characters',
  )
  return {
    ...actual,
    getLevelHistory: vi.fn(),
    postLevelRollback: vi.fn(),
  }
})

vi.mock('../../api/content', async () => {
  const actual = await vi.importActual<typeof import('../../api/content')>('../../api/content')
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
  ],
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

const baseCharacter: CharacterDetail = {
  id: 1,
  user_id: 1,
  name: 'Ари',
  race_id: 1,
  class_id: 1,
  subclass_id: 10,
  background_id: null,
  alignment: 'lawful-good',
  level: 3,
  xp: 900,
  ability_scores: { str: 18, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
  hp_max: 28,
  hp_current: 28,
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
    modifiers: { str: 4, dex: 1, con: 2, int: 0, wis: 0, cha: 0 },
    saving_throws: { str: 4, dex: 1, con: 2, int: 0, wis: 0, cha: 0 },
    skills: {},
    ac: 16,
    initiative: 1,
    passive_perception: 10,
    xp_to_next: null,
    level_up_available: false,
    spell_slots: {},
  },
  spells: [],
  inventory: [],
}

const recordOneToTwo: LevelUpRecord = {
  id: 1,
  character_id: 1,
  from_level: 1,
  to_level: 2,
  delta: {
    hp_gained: 6,
    hp_method: 'average',
    asi: null,
    feat: null,
    subclass_chosen: null,
    features_unlocked: ['items'],
    spells_learned: [],
    spells_forgotten: [],
  },
  created_at: '2026-01-02T00:00:00Z',
}

const recordTwoToThree: LevelUpRecord = {
  id: 2,
  character_id: 1,
  from_level: 2,
  to_level: 3,
  delta: {
    hp_gained: 7,
    hp_method: 'rolled',
    asi: { str: 2 },
    feat: null,
    subclass_chosen: 'champion',
    features_unlocked: ['items'],
    spells_learned: ['magic-missile'],
    spells_forgotten: [],
  },
  created_at: '2026-01-03T00:00:00Z',
}

function renderTab(character: CharacterDetail = baseCharacter) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterHistoryTab characterId="1" character={character} />
    </QueryClientProvider>,
  )
}

describe('CharacterHistoryTab', () => {
  beforeEach(() => {
    vi.mocked(charactersApi.getLevelHistory).mockReset()
    vi.mocked(charactersApi.postLevelRollback).mockReset()
    vi.mocked(contentApi.listClasses).mockReset().mockResolvedValue([fighterClass])
    vi.mocked(contentApi.listSpells).mockReset().mockResolvedValue([magicMissile])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('shows the empty state when there is no level-up history yet', async () => {
    vi.mocked(charactersApi.getLevelHistory).mockResolvedValue([])
    renderTab()
    expect(
      await screen.findByText('Пока нет ни одной прокачки — история появится после первого повышения уровня.'),
    ).toBeInTheDocument()
  })

  it('renders each delta human-readably, newest first, with names resolved from content', async () => {
    vi.mocked(charactersApi.getLevelHistory).mockResolvedValue([recordOneToTwo, recordTwoToThree])
    renderTab()

    expect(await screen.findByText('Уровень 2 → 3')).toBeInTheDocument()
    expect(screen.getByText('Уровень 1 → 2')).toBeInTheDocument()
    expect(screen.getByText('Подкласс: Чемпион')).toBeInTheDocument()
    expect(screen.getByText('Улучшение: Сила +2')).toBeInTheDocument()
    expect(await screen.findByText('Выучено заклинаний: Волшебная стрела')).toBeInTheDocument()
    expect(screen.getByText('Хиты: +6')).toBeInTheDocument()
    expect(screen.getByText('Хиты: +7')).toBeInTheDocument()

    const headings = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent)
    expect(headings).toEqual(['Уровень 2 → 3', 'Уровень 1 → 2'])
  })

  it('shows a rollback button only on the top (most recent) record', async () => {
    vi.mocked(charactersApi.getLevelHistory).mockResolvedValue([recordOneToTwo, recordTwoToThree])
    renderTab()

    await screen.findByText('Уровень 2 → 3')
    expect(screen.getAllByRole('button', { name: 'Откатить уровень' })).toHaveLength(1)
  })

  it('asks for confirmation describing what will be undone, then rolls back on confirm', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.getLevelHistory).mockResolvedValue([recordOneToTwo, recordTwoToThree])
    vi.mocked(charactersApi.postLevelRollback).mockResolvedValue({
      ...baseCharacter,
      level: 2,
    })
    renderTab()

    await screen.findByText('Уровень 2 → 3')
    await user.click(screen.getByRole('button', { name: 'Откатить уровень' }))

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Будет отменено:'),
    )
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Подкласс: Чемпион'))
    await waitFor(() => {
      expect(charactersApi.postLevelRollback).toHaveBeenCalledWith('1')
    })
  })

  it('does not roll back when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    vi.mocked(charactersApi.getLevelHistory).mockResolvedValue([recordOneToTwo, recordTwoToThree])
    renderTab()

    await screen.findByText('Уровень 2 → 3')
    await user.click(screen.getByRole('button', { name: 'Откатить уровень' }))

    expect(window.confirm).toHaveBeenCalled()
    expect(charactersApi.postLevelRollback).not.toHaveBeenCalled()
  })

  it('shows a translated error when rollback fails on an empty stack', async () => {
    const user = userEvent.setup()
    vi.mocked(charactersApi.getLevelHistory).mockResolvedValue([recordOneToTwo])
    vi.mocked(charactersApi.postLevelRollback).mockRejectedValue(
      new ApiError('rollback_empty', 'История уровней пуста — откатывать нечего'),
    )
    renderTab()

    await screen.findByText('Уровень 1 → 2')
    await user.click(screen.getByRole('button', { name: 'Откатить уровень' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'История уровней пуста — откатывать нечего',
    )
  })
})
