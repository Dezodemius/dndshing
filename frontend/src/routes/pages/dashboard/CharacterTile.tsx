import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CharacterSummary } from '../../../api/characters'

interface CharacterTileProps {
  character: CharacterSummary
  /** Set on the first character: the tile spans 2×2 on wide screens. */
  hero?: boolean
}

// Colour the bar by how hurt the character is, not by a fixed accent — this is
// the number a player glances at mid-session (ux-convention: "числа персонажа
// читаются мельком").
function hpTone(current: number, max: number): string {
  if (max <= 0) return 'tile__hp-fill--ok'
  const share = current / max
  if (share > 0.5) return 'tile__hp-fill--ok'
  if (share >= 0.25) return 'tile__hp-fill--warn'
  return 'tile__hp-fill--danger'
}

export default function CharacterTile({ character, hero = false }: CharacterTileProps) {
  const { t } = useTranslation()
  const classes = [
    'tile',
    'tile--character',
    hero ? 'bento__item--hero' : '',
    character.level_up_available && !hero ? 'bento__item--wide' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const hpShare = character.hp_max > 0 ? character.hp_current / character.hp_max : 0

  return (
    <article className={classes}>
      <div className="tile__head">
        {/* No portrait column exists yet (DND-106 adds one); a monogram is a
            deliberate stand-in rather than an empty frame. */}
        <span className="tile__emblem" aria-hidden="true">
          {character.name.slice(0, 1)}
        </span>
        <div className="tile__titles">
          {/* <article> rather than a wrapping <a>: the tile holds a second
              link (level-up), and nesting anchors is invalid. The title link
              is stretched over the tile with ::after instead. */}
          <h3 className="tile__title">
            <Link to={`/app/characters/${character.id}`}>{character.name}</Link>
          </h3>
          <p className="tile__subtitle">
            {t('pages.dashboard.characters.tile.raceClass', {
              race: character.race_name ?? t('pages.dashboard.characters.tile.unknownRace'),
              class: character.class_name ?? t('pages.dashboard.characters.tile.unknownClass'),
            })}
          </p>
        </div>
        <span className="tile__badge">
          {t('pages.dashboard.characters.tile.level', { level: character.level })}
        </span>
      </div>

      <div className="tile__stats">
        <div className="tile__stat">
          <span className="tile__stat-label">{t('pages.dashboard.characters.tile.hp')}</span>
          <span className="tile__stat-value">
            {t('pages.dashboard.characters.tile.hpValue', {
              current: character.hp_current,
              max: character.hp_max,
            })}
          </span>
        </div>
        <div className="tile__stat">
          <span className="tile__stat-label">{t('pages.dashboard.characters.tile.ac')}</span>
          <span className="tile__stat-value">{character.ac}</span>
        </div>
      </div>

      <div
        className="tile__hp-bar"
        role="img"
        aria-label={t('pages.dashboard.characters.tile.hpValue', {
          current: character.hp_current,
          max: character.hp_max,
        })}
      >
        <span
          className={`tile__hp-fill ${hpTone(character.hp_current, character.hp_max)}`}
          style={{ width: `${Math.max(0, Math.min(1, hpShare)) * 100}%` }}
        />
      </div>

      <p className="tile__wallet">
        {t('pages.dashboard.characters.tile.wallet', {
          gold: character.gold,
          silver: character.silver,
          copper: character.copper,
        })}
      </p>

      {character.level_up_available && (
        <p className="tile__cta">
          <span className="tile__flag">{t('pages.dashboard.characters.tile.levelUp')}</span>
          <Link className="tile__action" to={`/app/characters/${character.id}/level-up`}>
            {t('pages.dashboard.characters.tile.levelUpCta')}
          </Link>
        </p>
      )}
    </article>
  )
}
