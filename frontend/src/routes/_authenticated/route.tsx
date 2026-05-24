import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { useAuthStore, type SgsiUser } from '@/stores/auth-store'
import { apiFetch } from '@/lib/api'

function decodeJWT(token: string): SgsiUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload?.id || !payload?.username || !payload?.role) return null
    return { id: payload.id, username: payload.username, role: payload.role, nombre: payload.nombre ?? null, clientId: payload.clientId ?? null }
  } catch {
    return null
  }
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { auth } = useAuthStore.getState()
    if (!auth.accessToken) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
  },
  loader: async () => {
    const { auth } = useAuthStore.getState()
    try {
      await apiFetch<{ has2FA: boolean }>('/auth/me')
      if (!auth.user) {
        const user = decodeJWT(auth.accessToken)
        if (user) auth.setUser(user)
      }
    } catch {
      auth.reset()
      throw redirect({ to: '/sign-in' })
    }

  },
  component: AuthenticatedLayout,
})
