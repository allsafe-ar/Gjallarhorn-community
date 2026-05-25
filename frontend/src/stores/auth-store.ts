import { create } from 'zustand'

const TOKEN_KEY = 'gjallarhorn_token'

export type SgsiRole = 'admin' | 'analyst' | 'viewer'

export interface SgsiUser {
  id: number | string
  username: string
  nombre?: string | null
  role: SgsiRole
  clientId?: string | null
}

interface AuthState {
  auth: {
    user: SgsiUser | null
    setUser: (user: SgsiUser | null) => void
    accessToken: string
    setAccessToken: (accessToken: string) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => {
  const initToken = localStorage.getItem(TOKEN_KEY) ?? ''
  return {
    auth: {
      user: null,
      setUser: (user) =>
        set((state) => ({ ...state, auth: { ...state.auth, user } })),
      accessToken: initToken,
      setAccessToken: (accessToken) =>
        set((state) => {
          localStorage.setItem(TOKEN_KEY, accessToken)
          return { ...state, auth: { ...state.auth, accessToken } }
        }),
      resetAccessToken: () =>
        set((state) => {
          localStorage.removeItem(TOKEN_KEY)
          return { ...state, auth: { ...state.auth, accessToken: '' } }
        }),
      reset: () =>
        set((state) => {
          localStorage.removeItem(TOKEN_KEY)
          return { ...state, auth: { ...state.auth, user: null, accessToken: '' } }
        }),
    },
  }
})
