import { Link } from 'react-router-dom'

interface ActionTileProps {
  to: string
  label: string
  /** Shown when the section is empty: the tile grows and explains itself
   *  rather than sitting as a bare "+" next to nothing (ux-convention:
   *  "Empty — с подсказкой действия"). */
  hint?: string
  secondary?: { to: string; label: string }
}

export default function ActionTile({ to, label, hint, secondary }: ActionTileProps) {
  return (
    <article className={`tile tile--action${hint ? ' bento__item--wide tile--empty' : ''}`}>
      {hint && <p className="tile__hint">{hint}</p>}
      <p className="tile__cta">
        <Link className="tile__action tile__action--primary" to={to}>
          <span aria-hidden="true">+</span> {label}
        </Link>
        {secondary && (
          <Link className="tile__action" to={secondary.to}>
            {secondary.label}
          </Link>
        )}
      </p>
    </article>
  )
}
