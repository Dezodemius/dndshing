import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { createCharacter, type CharacterCreate, type CharacterDetail } from '../../../api/characters'
import { translateApiError } from '../../../api/errorMessages'
import { ABILITY_ALIASES, abilityModifier } from './abilityRules'
import type { WizardSelection } from './types'

interface PreviewStepProps {
  selection: WizardSelection
}

// Level-1 max HP is the one 5e value the wizard cannot get from a POST
// response, because the character does not exist yet — hit_die (max roll at
// level 1) + Con modifier is the standard starting formula. Everything else
// (ac, saving throws, skills, initiative, passive perception) is computed
// server-side and only ever read from the API response.
function buildPayload(selection: WizardSelection): CharacterCreate {
  const { race, klass, background, abilityScores, name, alignment, appearance, backstory } = selection
  if (!race || !klass || !abilityScores) {
    throw new Error('wizard selection is incomplete')
  }

  const hpMax = Math.max(1, klass.hit_die + abilityModifier(abilityScores.con))
  const saves = (klass.data.saving_throws ?? []).map(
    (ability) => ABILITY_ALIASES[ability.toLowerCase()] ?? ability,
  )

  return {
    name,
    race_id: race.id,
    class_id: klass.id,
    background_id: background?.id ?? null,
    alignment,
    ability_scores: abilityScores,
    hp_max: hpMax,
    speed: race.data.speed ?? 30,
    proficiencies: saves.length > 0 ? { saves } : {},
    appearance: appearance.trim() || undefined,
    backstory: backstory.trim() || undefined,
  }
}

export default function PreviewStep({ selection }: PreviewStepProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [created, setCreated] = useState<CharacterDetail | null>(null)

  const mutation = useMutation({
    mutationFn: () => createCharacter(buildPayload(selection)),
    onSuccess: (character) => setCreated(character),
  })

  if (created) {
    return (
      <section aria-labelledby="wizard-preview-heading">
        <h2 id="wizard-preview-heading">{t('pages.characterNew.preview.success')}</h2>
        <ul className="character-wizard__summary-list">
          <li>{t('pages.characterNew.preview.computed.hp', { value: created.hp_max })}</li>
          <li>{t('pages.characterNew.preview.computed.ac', { value: created.computed.ac })}</li>
          <li>
            {t('pages.characterNew.preview.computed.initiative', {
              value: created.computed.initiative,
            })}
          </li>
        </ul>
        <button type="button" onClick={() => navigate(`/app/characters/${created.id}`)}>
          {t('pages.characterNew.preview.goToSheet')}
        </button>
      </section>
    )
  }

  return (
    <section aria-labelledby="wizard-preview-heading">
      <h2 id="wizard-preview-heading">{t('pages.characterNew.preview.heading')}</h2>
      <ul className="character-wizard__summary-list">
        <li>{t('pages.characterNew.summary.race', { name: selection.race?.name })}</li>
        <li>{t('pages.characterNew.summary.class', { name: selection.klass?.name })}</li>
        <li>
          {selection.background
            ? t('pages.characterNew.summary.background', { name: selection.background.name })
            : t('pages.characterNew.summary.backgroundNone')}
        </li>
        <li>{t('pages.characterNew.details.name')}: {selection.name}</li>
        <li>
          {t('pages.characterNew.details.alignment')}:{' '}
          {selection.alignment ? t(`pages.characterNew.details.alignments.${selection.alignment}`) : ''}
        </li>
      </ul>
      {mutation.isError && <p role="alert">{translateApiError(t, mutation.error)}</p>}
      <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending
          ? t('pages.characterNew.preview.submitting')
          : t('pages.characterNew.preview.submit')}
      </button>
    </section>
  )
}
