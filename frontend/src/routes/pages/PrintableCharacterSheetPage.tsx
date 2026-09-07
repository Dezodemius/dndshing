import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch, type Path, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  buildSheetModel,
  characterSheetSchema,
  createCharacterSheetSchema,
  formatModifier,
  getChangedCharacterSheetFields,
  getCharacterSheetFormDefaults,
  toCharacterSheetPatch,
  type CharacterSheetFormValues,
} from '../../features/characters/sheet'
import { getCharacterSheet, patchCharacter, type CharacterSheet } from '../../api/characters'
import { translateApiError } from '../../api/errorMessages'
import './PrintableCharacterSheetPage.css'

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

const SKILLS = [
  'acrobatics',
  'investigation',
  'athletics',
  'perception',
  'survival',
  'performance',
  'intimidation',
  'history',
  'sleight-of-hand',
  'arcana',
  'medicine',
  'deception',
  'nature',
  'insight',
  'religion',
  'stealth',
  'persuasion',
  'animal-handling',
] as const

type SheetFields = Record<string, string | number | boolean>
type FormPath = Path<CharacterSheetFormValues>
type FormRegister = UseFormRegister<CharacterSheetFormValues>
type Translate = ReturnType<typeof useTranslation>['t']

const BLOCK_ROWS: Record<string, number> = {
  identity: 1,
  abilities: 1,
  inspiration: 2,
  saves: 3,
  skills: 4,
  'passive-perception': 5,
  proficiencies: 6,
  combat: 1,
  attacks: 2,
  currency: 3,
  equipment: 4,
  personality: 1,
  ideals: 2,
  bonds: 3,
  flaws: 4,
  'features-summary': 5,
  portrait: 1,
  appearance: 2,
  backstory: 3,
  goals: 4,
  allies: 1,
  feats: 2,
  extra_features: 3,
  treasures: 4,
  features: 1,
  notes: 1,
  spells: 1,
}

function fieldValue(fields: SheetFields, id: string): string {
  const value = fields[id]
  return value === undefined || value === null ? '' : String(value)
}

function completeFormValues(
  defaults: CharacterSheetFormValues,
  values: Partial<CharacterSheetFormValues>,
): CharacterSheetFormValues {
  return {
    ...defaults,
    ...values,
    attacks: {
      ...defaults.attacks,
      ...values.attacks,
      items: values.attacks?.items ?? defaults.attacks.items,
    },
    spell_slots_spent: {
      ...defaults.spell_slots_spent,
      ...values.spell_slots_spent,
    },
  }
}

function DisplayField({
  fields,
  id,
  className,
  signed = false,
  displayValue,
}: {
  fields: SheetFields
  id: string
  className?: string
  signed?: boolean
  displayValue?: string
}) {
  const value = fieldValue(fields, id)
  const visibleValue = displayValue ?? (
    signed && typeof fields[id] === 'number'
      ? formatModifier(fields[id] as number)
      : value
  )
  return (
    <output className={className} data-sheet-field={id} data-sheet-value={value}>
      {visibleValue}
    </output>
  )
}

function PaperBlock({
  id,
  title,
  children,
  className = '',
  column,
}: {
  id: string
  title: string
  children: React.ReactNode
  className?: string
  column?: 'left' | 'center' | 'right' | 'all'
}) {
  return (
    <section
      className={`printable-sheet__block ${className}`}
      data-sheet-block={id}
      data-sheet-row={BLOCK_ROWS[id]}
      data-sheet-page-column={column}
    >
      <div className="printable-sheet__block-content">{children}</div>
      <h2>{title}</h2>
    </section>
  )
}

function EditableInput({
  id,
  path,
  register,
  type = 'text',
  className,
  min,
  max,
  ariaLabel,
  printValue,
  tracked = true,
}: {
  id: string
  path: FormPath
  register: FormRegister
  type?: 'text' | 'number'
  className?: string
  min?: number
  max?: number
  ariaLabel: string
  printValue: string
  tracked?: boolean
}) {
  return (
    <>
      <input
        className={`printable-sheet__input-control ${className ?? ''}`}
        data-sheet-field={tracked ? id : undefined}
        aria-label={ariaLabel}
        type={type}
        min={min}
        max={max}
        {...register(
          path,
          type === 'number'
            ? { setValueAs: (value) => value === '' ? null : Number(value) }
            : undefined,
        )}
      />
      <output
        className={`printable-sheet__input-print ${className ?? ''}`}
        data-sheet-field={tracked ? id : undefined}
        data-sheet-value={printValue}
      >
        {printValue}
      </output>
    </>
  )
}

function EditableText({
  id,
  path,
  register,
  ariaLabel,
  printValue,
}: {
  id: string
  path: FormPath
  register: FormRegister
  ariaLabel: string
  printValue: string
}) {
  return (
    <>
      <textarea
        data-sheet-field={id}
        data-overflow-watch
        aria-label={ariaLabel}
        className="printable-sheet__lined-input printable-sheet__edit-control"
        {...register(path)}
      />
      <output
        className="printable-sheet__print-text"
        data-sheet-field={id}
        data-sheet-value={printValue}
        data-overflow-watch
      >
        {printValue}
      </output>
    </>
  )
}

function TextBlock({
  id,
  path,
  title,
  fields,
  register,
  t,
  grow = false,
}: {
  id: string
  path: FormPath
  title: string
  fields: SheetFields
  register: FormRegister
  t: Translate
  grow?: boolean
}) {
  const fieldId = id === 'personality'
    ? 'personality_traits'
    : id === 'features-summary'
      ? 'extra_features'
      : id
  return (
    <PaperBlock id={id} title={title} className={grow ? 'printable-sheet__block--grow' : ''}>
      <EditableText
        id={fieldId}
        path={path}
        register={register}
        ariaLabel={t('pages.printableSheet.labels.editField', { field: title })}
        printValue={fieldValue(fields, fieldId)}
      />
    </PaperBlock>
  )
}

function PageHeader({ fields, register, t }: {
  fields: SheetFields
  register: FormRegister
  t: Translate
}) {
  return (
    <header className="printable-sheet__header" data-sheet-block="identity" data-sheet-row="1" data-sheet-page-column="all">
      <div className="printable-sheet__name">
        <EditableInput id="identity.name" path="name" register={register} ariaLabel={t('pages.printableSheet.labels.characterName')} printValue={fieldValue(fields, 'identity.name')} />
        <span>{t('pages.printableSheet.labels.characterName')}</span>
      </div>
      <div className="printable-sheet__identity-grid">
        <div>
          <span className="printable-sheet__joined-values"><DisplayField fields={fields} id="identity.class" /><DisplayField fields={fields} id="identity.subclass" /></span>
          <span>{t('pages.printableSheet.labels.class')}</span>
        </div>
        <div><DisplayField fields={fields} id="identity.background" /><span>{t('pages.printableSheet.labels.background')}</span></div>
        <div><EditableInput id="identity.player_name" path="player_name" register={register} ariaLabel={t('pages.printableSheet.labels.playerName')} printValue={fieldValue(fields, 'identity.player_name')} /><span>{t('pages.printableSheet.labels.playerName')}</span></div>
        <div><DisplayField fields={fields} id="identity.race" /><span>{t('pages.printableSheet.labels.race')}</span></div>
        <div><EditableInput id="identity.alignment" path="alignment" register={register} ariaLabel={t('pages.printableSheet.labels.alignment')} printValue={fieldValue(fields, 'identity.alignment')} /><span>{t('pages.printableSheet.labels.alignment')}</span></div>
        <div className="printable-sheet__identity-pair">
          <div><EditableInput id="identity.xp" path="xp" register={register} type="number" min={0} ariaLabel={t('pages.printableSheet.labels.xp')} printValue={fieldValue(fields, 'identity.xp')} /><span>{t('pages.printableSheet.labels.xp')}</span></div>
          <div><DisplayField fields={fields} id="identity.level" /><span>{t('pages.printableSheet.labels.level')}</span></div>
        </div>
      </div>
    </header>
  )
}

function PageOne({ fields, register, t }: {
  fields: SheetFields
  register: FormRegister
  t: Translate
}) {
  const inventoryNames = Object.keys(fields).filter((id) => id.startsWith('inventory.') && id.endsWith('.name'))

  return (
    <article className="printable-sheet__page printable-sheet__page--one" data-sheet-page="1">
      <PageHeader fields={fields} register={register} t={t} />
      <div className="printable-sheet__page-grid printable-sheet__page-grid--three">
        <div className="printable-sheet__column printable-sheet__column--left" data-sheet-page-column="left">
          <div className="printable-sheet__left-main">
            <section className="printable-sheet__stats" data-sheet-block="abilities" data-sheet-row="1">
              {ABILITIES.map((ability) => (
                <div key={ability} className="printable-sheet__stat">
                  <span>{t(`abilities.${ability}`)}</span>
                  <DisplayField fields={fields} id={`ability.${ability}.modifier`} className="printable-sheet__stat-modifier" signed />
                  <DisplayField fields={fields} id={`ability.${ability}.score`} className="printable-sheet__stat-score" />
                </div>
              ))}
            </section>
            <div className="printable-sheet__checks">
              <label className="printable-sheet__inspiration" data-sheet-block="inspiration" data-sheet-row="2">
                <input className="printable-sheet__checkbox-control" type="checkbox" data-sheet-field="inspiration" aria-label={t('pages.printableSheet.labels.inspiration')} {...register('inspiration')} />
                <output className="printable-sheet__checkbox-print" data-sheet-field="inspiration">{fields.inspiration ? '☑' : '☐'}</output>
                {t('pages.printableSheet.labels.inspiration')}
              </label>
              <div className="printable-sheet__proficiency-bonus"><DisplayField fields={fields} id="proficiency.bonus" signed /><span>{t('pages.printableSheet.labels.proficiencyBonus')}</span></div>
              <PaperBlock id="saves" title={t('pages.printableSheet.blocks.saves')}>
                {ABILITIES.map((ability) => <p key={ability}><span className="printable-sheet__dot" /><DisplayField fields={fields} id={`save.${ability}`} signed /> {t(`abilities.${ability}`)}</p>)}
              </PaperBlock>
              <PaperBlock id="skills" title={t('pages.printableSheet.blocks.skills')} className="printable-sheet__skills">
                {SKILLS.map((skill) => <p key={skill}><span className="printable-sheet__dot" /><DisplayField fields={fields} id={`skill.${skill}`} signed /> {t(`pages.printableSheet.skills.${skill}`)}</p>)}
              </PaperBlock>
            </div>
          </div>
          <div className="printable-sheet__passive" data-sheet-block="passive-perception" data-sheet-row="5"><DisplayField fields={fields} id="passive_perception" /> {t('pages.printableSheet.labels.passivePerception')}</div>
          <PaperBlock id="proficiencies" title={t('pages.printableSheet.blocks.proficiencies')} className="printable-sheet__block--grow">
            {['languages', 'tools', 'armor', 'weapons'].map((key) => <p key={key}><strong>{t(`pages.printableSheet.labels.${key}`)}</strong> <DisplayField fields={fields} id={`proficiencies.${key}`} /></p>)}
          </PaperBlock>
        </div>

        <div className="printable-sheet__column" data-sheet-page-column="center">
          <section className="printable-sheet__combat" data-sheet-block="combat" data-sheet-row="1">
            <div><DisplayField fields={fields} id="combat.ac" /><span>{t('pages.printableSheet.labels.ac')}</span></div>
            <div><DisplayField fields={fields} id="combat.initiative" signed /><span>{t('pages.printableSheet.labels.initiative')}</span></div>
            <div><DisplayField fields={fields} id="combat.speed" /><span>{t('pages.printableSheet.labels.speed')}</span></div>
            <div className="printable-sheet__base-values">
              <label><span>{t('pages.printableSheet.labels.acOverride')}</span><EditableInput id="combat.ac_override" path="ac_override" register={register} type="number" min={0} ariaLabel={t('pages.printableSheet.labels.acOverride')} printValue={fieldValue(fields, 'combat.ac_override')} /></label>
              <label><span>{t('pages.printableSheet.labels.speedBase')}</span><EditableInput id="combat.speed_base" path="speed" register={register} type="number" min={0} ariaLabel={t('pages.printableSheet.labels.speedBase')} printValue={fieldValue(fields, 'combat.speed_base')} /></label>
              <label><span>{t('pages.printableSheet.labels.hpMaxBase')}</span><EditableInput id="combat.hp_max_base" path="hp_max" register={register} type="number" min={1} ariaLabel={t('pages.printableSheet.labels.hpMaxBase')} printValue={fieldValue(fields, 'combat.hp_max_base')} /></label>
            </div>
            <div className="printable-sheet__hp"><span>{t('pages.printableSheet.labels.hpMax')} <DisplayField fields={fields} id="combat.hp_max" /></span><EditableInput id="combat.hp_current" path="hp_current" register={register} type="number" min={0} ariaLabel={t('pages.printableSheet.labels.hpCurrent')} printValue={fieldValue(fields, 'combat.hp_current')} /><span>{t('pages.printableSheet.labels.hpCurrent')}</span></div>
            <div className="printable-sheet__hp"><EditableInput id="combat.hp_temp" path="hp_temp" register={register} type="number" min={0} ariaLabel={t('pages.printableSheet.labels.hpTemp')} printValue={fieldValue(fields, 'combat.hp_temp')} /><span>{t('pages.printableSheet.labels.hpTemp')}</span></div>
            <div className="printable-sheet__hit-dice"><span><DisplayField fields={fields} id="combat.hit_dice_total" /> × d<DisplayField fields={fields} id="combat.hit_die" /></span><EditableInput id="combat.hit_dice_spent" path="hit_dice_spent" register={register} type="number" min={0} ariaLabel={t('pages.printableSheet.labels.hitDice')} printValue={fieldValue(fields, 'combat.hit_dice_spent')} /><span>{t('pages.printableSheet.labels.hitDice')}</span></div>
            <div className="printable-sheet__death"><EditableInput id="combat.death_save_successes" path="death_save_successes" register={register} type="number" min={0} max={3} ariaLabel={t('pages.printableSheet.labels.deathSuccesses')} printValue={fieldValue(fields, 'combat.death_save_successes')} /><EditableInput id="combat.death_save_failures" path="death_save_failures" register={register} type="number" min={0} max={3} ariaLabel={t('pages.printableSheet.labels.deathFailures')} printValue={fieldValue(fields, 'combat.death_save_failures')} /><span>{t('pages.printableSheet.labels.deathSaves')}</span></div>
          </section>

          <PaperBlock id="attacks" title={t('pages.printableSheet.blocks.attacks')} className="printable-sheet__attacks">
            <div className="printable-sheet__attacks-head"><span>{t('pages.printableSheet.labels.attackName')}</span><span>{t('pages.printableSheet.labels.attackBonus')}</span><span>{t('pages.printableSheet.labels.damage')}</span></div>
            {[0, 1, 2].map((index) => {
              const tracked = `attack.${index}.name` in fields
              return (
                <div className="printable-sheet__attack-row" key={index}>
                  <EditableInput id={`attack.${index}.name`} path={`attacks.items.${index}.name` as FormPath} register={register} tracked={tracked} ariaLabel={t('pages.printableSheet.labels.attackName')} printValue={fieldValue(fields, `attack.${index}.name`)} />
                  <EditableInput id={`attack.${index}.bonus`} path={`attacks.items.${index}.bonus` as FormPath} register={register} tracked={tracked} ariaLabel={t('pages.printableSheet.labels.attackBonus')} printValue={fieldValue(fields, `attack.${index}.bonus`)} />
                  <EditableInput id={`attack.${index}.damage`} path={`attacks.items.${index}.damage` as FormPath} register={register} tracked={tracked} ariaLabel={t('pages.printableSheet.labels.damage')} printValue={fieldValue(fields, `attack.${index}.damage`)} />
                </div>
              )
            })}
            <EditableText id="attacks.note" path="attacks.note" register={register} ariaLabel={t('pages.printableSheet.blocks.attacks')} printValue={fieldValue(fields, 'attacks.note')} />
          </PaperBlock>

          <section className="printable-sheet__coins" data-sheet-block="currency" data-sheet-row="3">
            {(['gold', 'silver', 'copper'] as const).map((key) => <div key={key}><EditableInput id={`currency.${key}`} path={key} register={register} type="number" min={0} ariaLabel={t(`pages.printableSheet.labels.${key}`)} printValue={fieldValue(fields, `currency.${key}`)} /><span>{t(`pages.printableSheet.labels.${key}`)}</span></div>)}
          </section>

          <PaperBlock id="equipment" title={t('pages.printableSheet.blocks.equipment')} className="printable-sheet__block--grow">
            <div className="printable-sheet__inventory-list" data-overflow-watch>
              {inventoryNames.map((nameId) => {
                const prefix = nameId.slice(0, -'.name'.length)
                return (
                  <p className="printable-sheet__inventory-row" key={prefix}>
                    <input className="printable-sheet__checkbox-control" type="checkbox" readOnly checked={fields[`${prefix}.equipped`] === true} data-sheet-field={`${prefix}.equipped`} aria-label={t('pages.printableSheet.labels.equipped')} />
                    <output className="printable-sheet__checkbox-print" data-sheet-field={`${prefix}.equipped`}>{fields[`${prefix}.equipped`] === true ? '☑' : '☐'}</output>
                    <DisplayField fields={fields} id={nameId} className="printable-sheet__inventory-name" />
                    <DisplayField fields={fields} id={`${prefix}.quantity`} />
                    <DisplayField fields={fields} id={`${prefix}.type`} />
                    <DisplayField fields={fields} id={`${prefix}.weight`} />
                  </p>
                )
              })}
            </div>
          </PaperBlock>
        </div>

        <div className="printable-sheet__column" data-sheet-page-column="right">
          <TextBlock id="personality" path="personality_traits" title={t('pages.printableSheet.blocks.personality')} fields={fields} register={register} t={t} />
          <TextBlock id="ideals" path="ideals" title={t('pages.printableSheet.blocks.ideals')} fields={fields} register={register} t={t} />
          <TextBlock id="bonds" path="bonds" title={t('pages.printableSheet.blocks.bonds')} fields={fields} register={register} t={t} />
          <TextBlock id="flaws" path="flaws" title={t('pages.printableSheet.blocks.flaws')} fields={fields} register={register} t={t} />
          <TextBlock id="features-summary" path="extra_features" title={t('pages.printableSheet.blocks.features')} fields={fields} register={register} t={t} grow />
        </div>
      </div>
    </article>
  )
}

function PageTwo({ fields, register, t }: { fields: SheetFields; register: FormRegister; t: Translate }) {
  return (
    <article className="printable-sheet__page printable-sheet__page--two" data-sheet-page="2">
      <header className="printable-sheet__header" data-sheet-block="identity" data-sheet-row="1" data-sheet-page-column="all">
        <div className="printable-sheet__name"><DisplayField fields={fields} id="identity.name" /><span>{t('pages.printableSheet.labels.characterName')}</span></div>
        <div className="printable-sheet__identity-grid printable-sheet__identity-grid--three">
          <div><EditableInput id="age" path="age" register={register} type="number" min={0} ariaLabel={t('pages.printableSheet.labels.age')} printValue={fieldValue(fields, 'age')} /><span>{t('pages.printableSheet.labels.age')}</span></div>
          <div><EditableInput id="height" path="height" register={register} ariaLabel={t('pages.printableSheet.labels.height')} printValue={fieldValue(fields, 'height')} /><span>{t('pages.printableSheet.labels.height')}</span></div>
          <div><EditableInput id="weight" path="weight" register={register} ariaLabel={t('pages.printableSheet.labels.weight')} printValue={fieldValue(fields, 'weight')} /><span>{t('pages.printableSheet.labels.weight')}</span></div>
        </div>
      </header>
      <div className="printable-sheet__page-grid printable-sheet__page-grid--two">
        <div className="printable-sheet__column" data-sheet-page-column="left">
          <PaperBlock id="portrait" title={t('pages.printableSheet.blocks.portrait')} className="printable-sheet__portrait"><span aria-hidden="true" /></PaperBlock>
          <TextBlock id="appearance" path="appearance" title={t('pages.printableSheet.blocks.appearance')} fields={fields} register={register} t={t} />
          <TextBlock id="backstory" path="backstory" title={t('pages.printableSheet.blocks.backstory')} fields={fields} register={register} t={t} grow />
          <TextBlock id="goals" path="goals" title={t('pages.printableSheet.blocks.goals')} fields={fields} register={register} t={t} grow />
        </div>
        <div className="printable-sheet__column" data-sheet-page-column="right">
          <TextBlock id="allies" path="allies" title={t('pages.printableSheet.blocks.allies')} fields={fields} register={register} t={t} grow />
          <TextBlock id="feats" path="feats" title={t('pages.printableSheet.blocks.feats')} fields={fields} register={register} t={t} grow />
          <TextBlock id="extra_features" path="extra_features" title={t('pages.printableSheet.blocks.extraFeatures')} fields={fields} register={register} t={t} grow />
          <TextBlock id="treasures" path="treasures" title={t('pages.printableSheet.blocks.treasures')} fields={fields} register={register} t={t} grow />
        </div>
      </div>
    </article>
  )
}

function PageThree({ fields, register, t }: { fields: SheetFields; register: FormRegister; t: Translate }) {
  const features = Object.keys(fields).filter((id) => id.startsWith('feature.'))
  return (
    <article className="printable-sheet__page printable-sheet__page--three" data-sheet-page="3">
      <header className="printable-sheet__header" data-sheet-block="identity" data-sheet-row="1" data-sheet-page-column="all">
        <div className="printable-sheet__name"><DisplayField fields={fields} id="identity.name" /><span>{t('pages.printableSheet.labels.characterName')}</span></div>
      </header>
      <div className="printable-sheet__page-grid printable-sheet__page-grid--notes">
        <PaperBlock id="features" title={t('pages.printableSheet.blocks.features')} className="printable-sheet__block--feature-text" column="left">
          <div data-overflow-watch>{features.map((id) => <DisplayField fields={fields} id={id} key={id} />)}</div>
        </PaperBlock>
        <PaperBlock id="notes" title={t('pages.printableSheet.blocks.notes')} className="printable-sheet__block--grow" column="right">
          <EditableText id="notes" path="notes" register={register} ariaLabel={t('pages.printableSheet.labels.editField', { field: t('pages.printableSheet.blocks.notes') })} printValue={fieldValue(fields, 'notes')} />
        </PaperBlock>
      </div>
    </article>
  )
}

function PageFour({ fields, register, t, isCaster }: { fields: SheetFields; register: FormRegister; t: Translate; isCaster: boolean }) {
  const spellNames = Object.keys(fields).filter((id) => id.startsWith('spell.') && id.endsWith('.name'))
  const levels = [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9]] as const
  const subclass = fieldValue(fields, 'identity.subclass')
  const spellClass = `${fieldValue(fields, 'identity.class')}${subclass ? ` / ${subclass}` : ''}`
  const spellsAtLevel = (level: number) => spellNames.filter((id) => {
    const value = fieldValue(fields, id.replace('.name', '.level'))
    return value === String(level) || (level === 0 && value === '')
  })

  return (
    <article className="printable-sheet__page printable-sheet__page--four" data-sheet-page="4">
      <div className="printable-sheet__spells" data-sheet-block="spells" data-sheet-row="1" data-sheet-page-column="all">
        <header className="printable-sheet__spell-header">
          <div className="printable-sheet__spell-class"><span className="printable-sheet__plain-value">{isCaster ? spellClass : t('pages.printableSheet.labels.nonCaster')}</span><span>{t('pages.printableSheet.labels.spellClass')}</span></div>
          <div><DisplayField fields={fields} id="spellcasting.ability" displayValue={fieldValue(fields, 'spellcasting.ability') ? t(`abilities.${fieldValue(fields, 'spellcasting.ability')}`) : ''} /><span>{t('pages.printableSheet.labels.spellAbility')}</span></div>
          <div><DisplayField fields={fields} id="spellcasting.save_dc" /><span>{t('pages.printableSheet.labels.spellSaveDc')}</span></div>
          <div><DisplayField fields={fields} id="spellcasting.attack_bonus" signed /><span>{t('pages.printableSheet.labels.spellAttackBonus')}</span></div>
        </header>
        <div className="printable-sheet__spell-columns">
          {levels.map((column, columnIndex) => (
            <div className="printable-sheet__spell-column" data-sheet-page-column={columnIndex === 0 ? 'left' : columnIndex === 1 ? 'center' : 'right'} key={columnIndex}>
              {column.map((level) => (
                <section className="printable-sheet__spell-level" key={level}>
                  <header>
                    <strong>{level}</strong>
                    {level === 0 ? <span>{t('pages.printableSheet.labels.cantrips')}</span> : (
                      <>
                        <span><small>{t('pages.printableSheet.labels.slotsTotal')}</small><DisplayField fields={fields} id={`spell_slots.${level}.total`} /></span>
                        <label><small>{t('pages.printableSheet.labels.slotsSpent')}</small><EditableInput id={`spell_slots.${level}.spent`} path={`spell_slots_spent.${level}` as FormPath} register={register} type="number" min={0} max={Number(fields[`spell_slots.${level}.total`] ?? 0)} ariaLabel={t('pages.printableSheet.labels.spellSlotsSpent', { level })} printValue={fieldValue(fields, `spell_slots.${level}.spent`)} /></label>
                      </>
                    )}
                  </header>
                  <div data-overflow-watch>
                    {spellsAtLevel(level).map((nameId) => {
                      const prefix = nameId.slice(0, -'.name'.length)
                      return (
                        <p key={prefix}>
                          <input className="printable-sheet__checkbox-control" type="checkbox" readOnly checked={fields[`${prefix}.prepared`] === true} data-sheet-field={`${prefix}.prepared`} aria-label={t('pages.printableSheet.labels.prepared')} />
                          <output className="printable-sheet__checkbox-print" data-sheet-field={`${prefix}.prepared`}>{fields[`${prefix}.prepared`] === true ? '☑' : '☐'}</output>
                          <DisplayField fields={fields} id={nameId} />
                          <DisplayField fields={fields} id={`${prefix}.school`} />
                          <DisplayField fields={fields} id={`${prefix}.level`} />
                        </p>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

function hasOverflow(root: HTMLElement): boolean {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-overflow-watch]')).some((element) => (
    element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1
  ))
}

export default function PrintableCharacterSheetPage() {
  const { t } = useTranslation()
  const { characterId } = useParams<{ characterId: string }>()
  const queryClient = useQueryClient()
  const documentRef = useRef<HTMLElement | null>(null)
  const savePromise = useRef<Promise<boolean> | null>(null)
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid' | 'overflow'>('idle')
  const query = useQuery({
    queryKey: ['character', characterId, 'sheet'],
    queryFn: () => getCharacterSheet(characterId as string),
    enabled: Boolean(characterId),
  })
  const capacities = query.data?.computed.spell_slots ?? {}
  const form = useForm<CharacterSheetFormValues>({
    resolver: zodResolver(query.data ? createCharacterSheetSchema(capacities, query.data.computed.hit_dice_total) : characterSheetSchema),
    values: query.data ? getCharacterSheetFormDefaults(query.data) : undefined,
    resetOptions: { keepDirtyValues: true },
  })
  const watchedValues = useWatch({ control: form.control }) as Partial<CharacterSheetFormValues>
  const values = useMemo(() => query.data ? completeFormValues(getCharacterSheetFormDefaults(query.data), watchedValues) : undefined, [query.data, watchedValues])
  const model = useMemo(() => query.data && values ? buildSheetModel(query.data, values, {
    itemName: (id) => t('pages.printableSheet.unknownItem', { id }),
    spellName: (id) => t('pages.printableSheet.unknownSpell', { id }),
  }) : null, [query.data, t, values])
  const mutation = useMutation({ mutationFn: (payload: ReturnType<typeof toCharacterSheetPatch>) => patchCharacter(characterId as string, payload) })

  async function save(): Promise<boolean> {
    if (!query.data || !form.formState.isDirty) return true
    if (savePromise.current) return savePromise.current
    savePromise.current = (async () => {
      try {
        const valid = await form.trigger()
        if (!valid) {
          setStatus('invalid')
          return false
        }
        const currentValues = form.getValues()
        const changedFields = getChangedCharacterSheetFields(
          currentValues,
          getCharacterSheetFormDefaults(query.data),
        )
        const payload = toCharacterSheetPatch(currentValues, changedFields)
        const updated = await mutation.mutateAsync(payload)
        const merged = { ...query.data, ...updated, content: query.data.content } as CharacterSheet
        queryClient.setQueryData(['character', characterId, 'sheet'], merged)
        queryClient.setQueryData(['character', characterId], updated)
        await queryClient.invalidateQueries({ queryKey: ['characters'] })
        form.reset(getCharacterSheetFormDefaults(merged))
        setStatus('saved')
        return true
      } catch {
        return false
      } finally {
        savePromise.current = null
      }
    })()
    return savePromise.current
  }

  async function print() {
    if (!(await save())) return
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    const root = documentRef.current
    if (root && hasOverflow(root)) {
      setStatus('overflow')
      return
    }
    setStatus('idle')
    window.print()
  }

  if (query.isError) return <p className="printable-sheet__status" role="alert">{translateApiError(t, query.error)}</p>
  if (query.isLoading || !model) return <p className="printable-sheet__status">{t('common.loading')}</p>

  return (
    <main className="printable-sheet" data-sheet-document ref={documentRef}>
      <div className="printable-sheet__toolbar">
        <Link to={`/app/characters/${characterId}`}>{t('pages.printableSheet.back')}</Link>
        <span>{form.formState.isDirty ? t('pages.printableSheet.dirty') : status === 'saved' ? t('pages.printableSheet.saved') : ''}</span>
        <button type="button" disabled={mutation.isPending} onClick={() => { void save() }}>{mutation.isPending ? t('pages.printableSheet.saving') : t('pages.printableSheet.save')}</button>
        <button type="button" disabled={mutation.isPending} onClick={() => { void print() }}>{t('pages.printableSheet.print')}</button>
        {status === 'invalid' && <p role="alert">{t('pages.printableSheet.invalid')}</p>}
        {status === 'overflow' && <p role="alert">{t('pages.printableSheet.overflow')}</p>}
        {mutation.isError && <p role="alert">{translateApiError(t, mutation.error)}</p>}
      </div>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void save() }}>
        <PageOne fields={model.fields} register={form.register} t={t} />
        <PageTwo fields={model.fields} register={form.register} t={t} />
        <PageThree fields={model.fields} register={form.register} t={t} />
        <PageFour fields={model.fields} register={form.register} t={t} isCaster={model.isCaster} />
      </form>
    </main>
  )
}
