import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Merchant } from '../../../api/merchants'

export default function MerchantTile({ merchant }: { merchant: Merchant }) {
  const { t } = useTranslation()

  return (
    <article className="tile tile--merchant">
      <div className="tile__head">
        <div className="tile__titles">
          <h3 className="tile__title">
            <Link to={`/app/merchants/${merchant.id}`}>{merchant.name}</Link>
          </h3>
          <p className="tile__subtitle">
            {merchant.description ?? t('pages.dashboard.merchants.tile.noDescription')}
          </p>
        </div>
      </div>

      <p className="tile__status">
        <span
          className={`tile__dot${merchant.is_open ? '' : ' tile__dot--closed'}`}
          aria-hidden="true"
        />
        {merchant.is_open
          ? t('pages.dashboard.merchants.tile.open')
          : t('pages.dashboard.merchants.tile.closed')}
      </p>

      <p className="tile__cta">
        <Link className="tile__action" to={`/shop/${merchant.share_code}`}>
          {t('pages.dashboard.merchants.tile.shopLink')}
        </Link>
      </p>
    </article>
  )
}
