import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../i18n'
import CharacterSpellsTab from './CharacterSpellsTab'
import * as contentApi from '../../api/content'
import * as charactersApi from '../../api/characters'
import type { CharacterDetail } from '../../api/characters'
import type { ClassSummary, Spell } from '../../api/content'

vi.mock('../../api/content', async () => {
  const actual = await vi.importActual<typeof import('../../api/content')>('../../api/content')
  return {
    ...actual,
    listClasses: vi.fn(),
    listSpells: vi.fn(),
  }
})

vi.mock('../../api/characters', async () => {
  const actual = await vi.importActual<typeof import('../../api/characters')>('../../api/characters')
  return {
    ...actual,
    updateSpells: vi.fn(),
  }
})

const wizardClass: ClassSummary = {
  id: 1,
  slug: 'wizard',
  locale: 'ru',
  name: 'Волшебник',
  hit_die: 6,
  primary_ability: 'int',
  data: {},
  levels: [{ id: 1, class_id: 1, level: 1, features: {}, spell_slots: { '1': 2 } }],
  subclasses: [],
}

const fighterClass: ClassSummary = {
  id: 2,
  slug: 'fighter',
  locale: 'ru',
  name: 'Воин',
  hit_die: 10,
  primary_ability: 'str',
  data: {},
  levels: [{ id: 2, class_id: 2, level: 1, features: {}, spell_slots: null }],
  subclasses: [],
}

const magicMissile: Spell = {
  id: 10,
  slug: 'magic-missile',
  locale: 'ru',
  name: 'Волшебная стрела',
  level: 1,
  school: 'evocation',
  casting_time: '1 действие',
  range: '36 м',
  components: 'В, С',
  duration: 'Мгновенная',
  description: 'Три светящихся стрелы бьют в цель.',
  data: {},
}

const fireball: Spell = {
  id: 11,
  slug: 'fireball',
  locale: 'ru',
  name: 'Огненный шар',
  level: 3,
  school: 'evocation',
  casting_time: '1 действие',
  range: '45 м',
  components: 'В, С, М',
  duration: 'Мгновенная',
  description: 'Огненный взрыв в выбранной точке.',
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
  ability_scores: { str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 },
  hp_max: 6,
  hp_current: 6,
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
    modifiers: { str: 0, dex: 0, con: 0, int: 3, wis: 0, cha: 0 },
    saving_throws: { str: 0, dex: 0, con: 0, int: 3, wis: 0, cha: 0 },
    skills: {},
    ac: 10,
    initiative: 0,
    passive_perception: 10,
    xp_to_next: 300,
    xp_level_floor: 0,
    xp_next_threshold: 300,
    level_up_available: false,
    spell_slots: { '1': 2 },
  },
  spells: [{ spell_id: magicMissile.id, prepared: true }],
  inventory: [],
}

function renderTab(character: CharacterDetail) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterSpellsTab character={character} characterId="1" />
    </QueryClientProvider>,
  )
}

describe('CharacterSpellsTab', () => {
  beforeEach(() => {
    vi.mocked(contentApi.listClasses).mockReset()
    vi.mocked(contentApi.listSpells).mockReset()
    vi.mocked(charactersApi.updateSpells).mockReset()
  })

  it('shows spell slots and the known spell for a caster', async () => {
    vi.mocked(contentApi.listClasses).mockResolvedValue([wizardClass, fighterClass])
    vi.mocked(contentApi.listSpells).mockResolvedValue([magicMissile, fireball])

    renderTab(baseCharacter)

    expect(await screen.findByText('Уровень 1')).toBeInTheDocument()
    expect(await screen.findByText('Волшебная стрела')).toBeInTheDocument()
    const knownSection = screen.getByText('Известные заклинания').closest('section') as HTMLElement
    expect(within(knownSection).getByText('Волшебная стрела')).toBeInTheDocument()
  })

  it('shows an empty state with explanation for a non-caster class', async () => {
    vi.mocked(contentApi.listClasses).mockResolvedValue([wizardClass, fighterClass])
    vi.mocked(contentApi.listSpells).mockResolvedValue([])

    renderTab({ ...baseCharacter, class_id: fighterClass.id, spells: [] })

    expect(
      await screen.findByText('Этот класс не владеет заклинаниями'),
    ).toBeInTheDocument()
    expect(contentApi.listSpells).not.toHaveBeenCalled()
  })

  it('adds a spell filtered by level via PUT with the full known list', async () => {
    const user = userEvent.setup()
    vi.mocked(contentApi.listClasses).mockResolvedValue([wizardClass, fighterClass])
    vi.mocked(contentApi.listSpells).mockResolvedValue([magicMissile, fireball])
    vi.mocked(charactersApi.updateSpells).mockResolvedValue([
      { spell_id: magicMissile.id, prepared: true },
      { spell_id: fireball.id, prepared: false },
    ])

    renderTab(baseCharacter)

    await user.click(await screen.findByRole('button', { name: 'Добавить заклинание' }))
    await user.selectOptions(screen.getByLabelText('Уровень'), '3')

    const addSection = screen.getByText('Добавить заклинание', { selector: 'h2' }).closest('section') as HTMLElement
    expect(within(addSection).queryByText('Волшебная стрела')).not.toBeInTheDocument()
    await user.click(within(addSection).getByRole('button', { name: 'Добавить' }))

    await waitFor(() => {
      expect(charactersApi.updateSpells).toHaveBeenCalledWith('1', [
        { spell_id: magicMissile.id, prepared: true },
        { spell_id: fireball.id, prepared: false },
      ])
    })
  })

  it('toggles prepared for a known spell via PUT', async () => {
    const user = userEvent.setup()
    vi.mocked(contentApi.listClasses).mockResolvedValue([wizardClass, fighterClass])
    vi.mocked(contentApi.listSpells).mockResolvedValue([magicMissile, fireball])
    vi.mocked(charactersApi.updateSpells).mockResolvedValue([
      { spell_id: magicMissile.id, prepared: false },
    ])

    renderTab(baseCharacter)

    await user.click(await screen.findByLabelText('Подготовлено'))

    await waitFor(() => {
      expect(charactersApi.updateSpells).toHaveBeenCalledWith('1', [
        { spell_id: magicMissile.id, prepared: false },
      ])
    })
  })

  it('forgets a known spell via PUT with it removed from the list', async () => {
    const user = userEvent.setup()
    vi.mocked(contentApi.listClasses).mockResolvedValue([wizardClass, fighterClass])
    vi.mocked(contentApi.listSpells).mockResolvedValue([magicMissile, fireball])
    vi.mocked(charactersApi.updateSpells).mockResolvedValue([])

    renderTab(baseCharacter)

    await user.click(await screen.findByRole('button', { name: 'Забыть' }))

    await waitFor(() => {
      expect(charactersApi.updateSpells).toHaveBeenCalledWith('1', [])
    })
  })
})
