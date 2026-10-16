import { Fragment } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { NavGroup } from './nav-group'
import { type NavGroup as NavGroupProps } from './types'

/**
 * Dibuja los grupos del menú con sus líneas divisorias: una corta y neutra entre los grupos
 * generales y el primer frente, y una larga con el color de acento donde cambia de frente.
 * Los grupos que el rol no ve se descartan antes, para que una línea no quede colgada.
 */
export function GruposMenu({ grupos }: { grupos: NavGroupProps[] }) {
  const role = useAuthStore((s) => s.auth.user?.role) || ''
  const visibles = grupos.filter((g) =>
    !(g.adminOnly && role !== 'admin') &&
    !((g as { roles?: string[] }).roles && !(g as { roles?: string[] }).roles!.includes(role)))
  return (
    <>
      {visibles.map((g, i) => {
        const previo = visibles[i - 1]
        const corte = !!(g.frente && previo?.frente && previo.frente !== g.frente)
        const corteGeneral = !!(g.frente && previo && !previo.frente)
        return (
          <Fragment key={g.title}>
            {corteGeneral && <div aria-hidden className='mx-4 my-1 h-0.5 w-1/2 shrink-0 rounded-full bg-muted-foreground/25' />}
            {corte && <div aria-hidden className='mx-4 my-2 h-0.5 shrink-0 rounded-full bg-gradient-to-r from-primary to-primary/40' />}
            <NavGroup {...g} />
          </Fragment>
        )
      })}
    </>
  )
}
