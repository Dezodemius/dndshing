import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { listCharacters } from '../../../api/characters'
import { listCampaigns } from '../../../api/campaigns'
import { listMerchants } from '../../../api/merchants'
import { translateApiError } from '../../../api/errorMessages'
import CharacterTile from './CharacterTile'
import CampaignTile from './CampaignTile'
import MerchantTile from './MerchantTile'
import ActionTile from './ActionTile'
import './dashboard.css'

export type BoardSection = 'characters' | 'campaigns' | 'merchants'

interface ResourceBoardProps {
  sections: readonly BoardSection[]
  /** Dashboard mode: cap each section and link to its own tab. */
  preview?: boolean
}

const PREVIEW_LIMIT = 6

function TileSkeleton() {
  return <div className="tile tile--skeleton" aria-hidden="true" />
}

interface SectionProps {
  id: string
  title: string
  isLoading: boolean
  error: unknown
  allTo?: string
  allLabel?: string
  children: ReactNode
}

function Section({ id, title, isLoading, error, allTo, allLabel, children }: SectionProps) {
  const { t } = useTranslation()

  return (
    <section className="board__section" aria-labelledby={id}>
      <div className="board__section-head">
        <h2 id={id}>{title}</h2>
        {allTo && allLabel && (
          <Link className="board__all" to={allTo}>
            {allLabel}
          </Link>
        )}
      </div>
      {error ? (
        <p role="alert">{translateApiError(t, error)}</p>
      ) : isLoading ? (
        <>
          {/* The skeletons are decoration; the status line is what a screen
              reader announces. */}
          <p className="board__sr-only" role="status">
            {t('common.loading')}
          </p>
          <div className="bento">
            <TileSkeleton />
            <TileSkeleton />
            <TileSkeleton />
          </div>
        </>
      ) : (
        <div className="bento">{children}</div>
      )}
    </section>
  )
}

export default function ResourceBoard({ sections, preview = false }: ResourceBoardProps) {
  const { t } = useTranslation()
  const wants = (section: BoardSection) => sections.includes(section)

  // Query keys are shared with the rest of the app on purpose: ShopPage and
  // CampaignJoinPage already cache the character list under ['characters'].
  // A board-specific key would fetch the same data a second time and would
  // not see invalidations from elsewhere.
  const charactersQuery = useQuery({
    queryKey: ['characters'],
    queryFn: listCharacters,
    enabled: wants('characters'),
    retry: false,
  })
  const campaignsQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: listCampaigns,
    enabled: wants('campaigns'),
    retry: false,
  })
  const merchantsQuery = useQuery({
    queryKey: ['merchants'],
    queryFn: listMerchants,
    enabled: wants('merchants'),
    retry: false,
  })

  const characters = charactersQuery.data ?? []
  const campaignsDm = campaignsQuery.data?.as_dm ?? []
  const campaignsPlayer = campaignsQuery.data?.as_player ?? []
  const merchants = merchantsQuery.data ?? []

  const shownCharacters = preview ? characters.slice(0, PREVIEW_LIMIT) : characters
  const shownDm = preview ? campaignsDm.slice(0, PREVIEW_LIMIT) : campaignsDm
  const shownPlayer = preview ? campaignsPlayer.slice(0, PREVIEW_LIMIT) : campaignsPlayer
  const shownMerchants = preview ? merchants.slice(0, PREVIEW_LIMIT) : merchants
  const campaignsTotal = campaignsDm.length + campaignsPlayer.length

  return (
    <div className="board">
      {wants('characters') && (
        <Section
          id="board-characters"
          title={t('pages.dashboard.characters.title')}
          isLoading={charactersQuery.isLoading}
          error={charactersQuery.error}
          allTo={preview && characters.length > PREVIEW_LIMIT ? '/app/characters' : undefined}
          allLabel={t('pages.dashboard.characters.all', { count: characters.length })}
        >
          {shownCharacters.map((character, index) => (
            // The first card is the large one. Deliberately positional rather
            // than "most recently updated": updated_at moves on every HP edit,
            // and with grid-auto-flow: dense the whole board would reshuffle
            // after each save.
            <CharacterTile key={character.id} character={character} hero={index === 0} />
          ))}
          <ActionTile
            to="/app/characters/new"
            label={
              characters.length === 0
                ? t('pages.dashboard.characters.create')
                : t('pages.dashboard.characters.createShort')
            }
            hint={characters.length === 0 ? t('pages.dashboard.characters.empty') : undefined}
          />
        </Section>
      )}

      {wants('campaigns') && (
        <Section
          id="board-campaigns"
          title={t('pages.dashboard.campaigns.title')}
          isLoading={campaignsQuery.isLoading}
          error={campaignsQuery.error}
          allTo={preview && campaignsTotal > PREVIEW_LIMIT ? '/app/campaigns' : undefined}
          allLabel={t('pages.dashboard.campaigns.all', { count: campaignsTotal })}
        >
          {shownDm.map((campaign) => (
            <CampaignTile key={`dm-${campaign.id}`} campaign={campaign} role="dm" />
          ))}
          {shownPlayer.map((campaign) => (
            <CampaignTile key={`player-${campaign.id}`} campaign={campaign} role="player" />
          ))}
          <ActionTile
            to="/app/campaigns/new"
            label={
              campaignsTotal === 0
                ? t('pages.dashboard.campaigns.create')
                : t('pages.dashboard.campaigns.createShort')
            }
            hint={campaignsTotal === 0 ? t('pages.dashboard.campaigns.empty') : undefined}
            secondary={{ to: '/app/campaigns/join', label: t('pages.dashboard.campaigns.join') }}
          />
        </Section>
      )}

      {wants('merchants') && (
        <Section
          id="board-merchants"
          title={t('pages.dashboard.merchants.title')}
          isLoading={merchantsQuery.isLoading}
          error={merchantsQuery.error}
          allTo={preview && merchants.length > PREVIEW_LIMIT ? '/app/merchants' : undefined}
          allLabel={t('pages.dashboard.merchants.all', { count: merchants.length })}
        >
          {shownMerchants.map((merchant) => (
            <MerchantTile key={merchant.id} merchant={merchant} />
          ))}
          <ActionTile
            to="/app/merchants/new"
            label={
              merchants.length === 0
                ? t('pages.dashboard.merchants.create')
                : t('pages.dashboard.merchants.createShort')
            }
            hint={merchants.length === 0 ? t('pages.dashboard.merchants.empty') : undefined}
          />
        </Section>
      )}
    </div>
  )
}
