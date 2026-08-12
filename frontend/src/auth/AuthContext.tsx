import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiClient, setAccessToken } from '../api/client'
import type { User } from './types'

type AuthStatus = 'loading' | 'authenticated' | 'guest'

interface TokenResponse {
  access_token: string
  token_type: string
}

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  loginWithToken: (accessToken: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)

  const loadUser = useCallback(async () => {
    const me = await apiClient.get<User>('/me')
    setUser(me)
    setStatus('authenticated')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const tokens = await apiClient.post<TokenResponse>('/auth/refresh')
        setAccessToken(tokens.access_token)
        if (cancelled) return
        await loadUser()
      } catch {
        if (cancelled) return
        setAccessToken(null)
        setStatus('guest')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadUser])

  const loginWithToken = useCallback(
    async (accessToken: string) => {
      setAccessToken(accessToken)
      await loadUser()
    },
    [loadUser],
  )

  const logout = useCallback(async () => {
    await apiClient.post('/auth/logout').catch(() => undefined)
    setAccessToken(null)
    setUser(null)
    setStatus('guest')
  }, [])

  const value = useMemo(
    () => ({ status, user, loginWithToken, logout }),
    [status, user, loginWithToken, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
