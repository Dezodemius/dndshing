import { useTranslation } from 'react-i18next'
import ResourceBoard from './dashboard/ResourceBoard'

export default function CharactersPage() {
  const { t } = useTranslation()

  return (
    <>
      <h1 className="board__heading">{t('pages.dashboard.characters.title')}</h1>
      <ResourceBoard sections={['characters']} />
    </>
  )
}
