import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Campaign, CampaignPlayerView } from '../../../api/campaigns'

interface CampaignTileProps {
  campaign: Campaign | CampaignPlayerView
  role: 'dm' | 'player'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function CampaignTile({ campaign, role }: CampaignTileProps) {
  const { t } = useTranslation()
  const isDm = role === 'dm'
  // A campaign the user only plays in is not a link: GET /campaigns/{id} runs
  // through CampaignService.get_owned and answers a player with 404. Rendering
  // a link would send them to an error screen.
  const upcoming = campaign.next_session_at

  return (
    <article className={`tile tile--campaign${upcoming ? ' bento__item--wide' : ''}`}>
      <div className="tile__head">
        <div className="tile__titles">
          <h3 className="tile__title">
            {isDm ? (
              <Link to={`/app/campaigns/${campaign.id}`}>{campaign.name}</Link>
            ) : (
              campaign.name
            )}
          </h3>
          <p className="tile__subtitle">
            {campaign.description ?? t('pages.dashboard.campaigns.tile.noDescription')}
          </p>
        </div>
        <span className="tile__badge">
          {isDm
            ? t('pages.dashboard.campaigns.asDm')
            : t('pages.dashboard.campaigns.asPlayer')}
        </span>
      </div>

      <div className="tile__stat">
        <span className="tile__stat-label">
          {t('pages.dashboard.campaigns.tile.nextSession')}
        </span>
        <span className="tile__stat-value tile__stat-value--small">
          {upcoming
            ? campaign.next_session_place
              ? t('pages.dashboard.campaigns.tile.nextSessionValue', {
                  date: formatDate(upcoming),
                  place: campaign.next_session_place,
                })
              : formatDate(upcoming)
            : t('pages.dashboard.campaigns.tile.noNextSession')}
        </span>
      </div>

      {!isDm && <p className="tile__hint">{t('pages.dashboard.campaigns.tile.playerHint')}</p>}
    </article>
  )
}
