import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Mirror of RequireAuth for the other direction: an already signed-in user has
// no business on /login, where OAuthButtons would start a second OAuth round
// and mint a fresh token pair for a session that already has one.
//
// Unlike RequireAuth this renders its child while the status is still
// 'loading'. A guest's refresh call is expected to fail, and blanking the page
// until it does would leave the sign-in form white on every cold visit — the
// redirect only ever needs to fire for the authenticated case, and firing it
// one tick later costs nothing.
//
// The destination is the literal '/app'. Reading it from the URL or from
// location state would turn this into an open redirect, and nothing needs it:
// OAuthCallbackPage navigates to /app on its own.
export default function RedirectIfAuthenticated() {
  const { status } = useAuth()

  if (status === 'authenticated') {
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}
