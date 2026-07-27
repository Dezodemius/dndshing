import { useTranslation } from 'react-i18next'

const ALIGNMENTS = [
  'lawful-good',
  'neutral-good',
  'chaotic-good',
  'lawful-neutral',
  'true-neutral',
  'chaotic-neutral',
  'lawful-evil',
  'neutral-evil',
  'chaotic-evil',
] as const

export interface DetailsValue {
  name: string
  alignment: string
  appearance: string
  backstory: string
}

interface DetailsStepProps extends DetailsValue {
  onChange: (patch: Partial<DetailsValue>) => void
}

export default function DetailsStep({
  name,
  alignment,
  appearance,
  backstory,
  onChange,
}: DetailsStepProps) {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="wizard-details-heading">
      <h2 id="wizard-details-heading">{t('pages.characterNew.details.heading')}</h2>
      <div className="character-wizard__field">
        <label htmlFor="wizard-name">{t('pages.characterNew.details.name')}</label>
        <input
          id="wizard-name"
          value={name}
          placeholder={t('pages.characterNew.details.namePlaceholder')}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className="character-wizard__field">
        <label htmlFor="wizard-alignment">{t('pages.characterNew.details.alignment')}</label>
        <select
          id="wizard-alignment"
          value={alignment}
          onChange={(event) => onChange({ alignment: event.target.value })}
        >
          <option value="">{t('pages.characterNew.details.alignmentPlaceholder')}</option>
          {ALIGNMENTS.map((slug) => (
            <option key={slug} value={slug}>
              {t(`pages.characterNew.details.alignments.${slug}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="character-wizard__field">
        <label htmlFor="wizard-appearance">{t('pages.characterNew.details.appearance')}</label>
        <textarea
          id="wizard-appearance"
          value={appearance}
          placeholder={t('pages.characterNew.details.appearancePlaceholder')}
          onChange={(event) => onChange({ appearance: event.target.value })}
        />
      </div>
      <div className="character-wizard__field">
        <label htmlFor="wizard-backstory">{t('pages.characterNew.details.backstory')}</label>
        <textarea
          id="wizard-backstory"
          value={backstory}
          placeholder={t('pages.characterNew.details.backstoryPlaceholder')}
          onChange={(event) => onChange({ backstory: event.target.value })}
        />
      </div>
    </section>
  )
}
