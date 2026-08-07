import type { ReactNode } from 'react'
import './AuthShell.css'

interface AuthShellProps {
  title: string
  subtitle?: string
  children: ReactNode
}

// Shared split layout for /login and /register: decorative art on one side, the
// form column on the other. The art is purely decorative, so it stays a CSS
// background and is hidden from assistive tech.
export default function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <section className="auth">
      <div className="auth__panel">
        <div className="auth__art" aria-hidden="true" />
        <div className="auth__content">
          <div className="auth__head">
            <h1 className="auth__title">{title}</h1>
            {subtitle && <p className="auth__subtitle">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </section>
  )
}
