import { useTranslation } from 'react-i18next'
import type { CharacterDetail } from '../../api/characters'

const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

const SKILL_ORDER = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const

export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

interface CharacterStatsSectionsProps {
  character: CharacterDetail
}

// Shared between the owner's editable sheet (CharacterSheetPage) and the
// DM's read-only view (CampaignCharacterSheetPage) — both render the same
// abilities/saves/skills/combat block from the same `computed` data.
export default function CharacterStatsSections({ character }: CharacterStatsSectionsProps) {
  const { t } = useTranslation()
  const { computed } = character
  const proficientSaves = new Set(character.proficiencies.saves ?? [])
  const proficientSkills = new Set(character.proficiencies.skills ?? [])

  return (
    <>
      <section className="character-sheet__section" aria-labelledby="sheet-abilities-heading">
        <h2 id="sheet-abilities-heading">{t('pages.characterSheet.sections.abilities')}</h2>
        <div className="character-sheet__ability-grid">
          {ABILITY_ORDER.map((ability) => (
            <div className="character-sheet__ability" key={ability}>
              <span className="character-sheet__ability-label">
                {t(`pages.characterSheet.abilities.${ability}`)}
              </span>
              <span className="character-sheet__ability-score">
                {character.ability_scores[ability]}
              </span>
              <span className="character-sheet__ability-modifier">
                {formatModifier(computed.modifiers[ability])}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="character-sheet__section" aria-labelledby="sheet-saves-heading">
        <h2 id="sheet-saves-heading">{t('pages.characterSheet.sections.savingThrows')}</h2>
        <ul className="character-sheet__list">
          {ABILITY_ORDER.map((ability) => (
            <li className="character-sheet__list-item" key={ability}>
              <span
                className={`character-sheet__proficiency-dot${
                  proficientSaves.has(ability) ? ' character-sheet__proficiency-dot--filled' : ''
                }`}
                aria-hidden="true"
              />
              <span className="character-sheet__list-label">
                {t(`pages.characterSheet.abilities.${ability}`)}
              </span>
              <span className="character-sheet__list-modifier">
                {formatModifier(computed.saving_throws[ability])}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="character-sheet__section" aria-labelledby="sheet-skills-heading">
        <h2 id="sheet-skills-heading">{t('pages.characterSheet.sections.skills')}</h2>
        <ul className="character-sheet__list">
          {SKILL_ORDER.map((skill) => (
            <li className="character-sheet__list-item" key={skill}>
              <span
                className={`character-sheet__proficiency-dot${
                  proficientSkills.has(skill) ? ' character-sheet__proficiency-dot--filled' : ''
                }`}
                aria-hidden="true"
              />
              <span className="character-sheet__list-label">
                {t(`pages.characterSheet.skills.${skill}`)}
              </span>
              <span className="character-sheet__list-modifier">
                {formatModifier(computed.skills[skill])}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="character-sheet__section" aria-labelledby="sheet-combat-heading">
        <h2 id="sheet-combat-heading">{t('pages.characterSheet.sections.combat')}</h2>
        <div className="character-sheet__combat-row">
          <div className="character-sheet__combat-stat">
            <span>{t('pages.characterSheet.combat.ac')}</span>
            <span className="character-sheet__combat-value">{computed.ac}</span>
          </div>
          <div className="character-sheet__combat-stat">
            <span>{t('pages.characterSheet.combat.initiative')}</span>
            <span className="character-sheet__combat-value">
              {formatModifier(computed.initiative)}
            </span>
          </div>
          <div className="character-sheet__combat-stat">
            <span>{t('pages.characterSheet.combat.speed')}</span>
            <span className="character-sheet__combat-value">
              {t('pages.characterSheet.combat.speedValue', { value: character.speed })}
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
