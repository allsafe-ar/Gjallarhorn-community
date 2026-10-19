/**
 * Inventario de activos de Gjallarhorn Community. Desde la 1.5.0 la pantalla es el componente único
 * `components/inventario` (canónico en utiles/activos/ui, el mismo que usa Skuld). Lo propio de
 * Gjallarhorn entra como pestaña de la ficha: qué se le mide al equipo y cómo está.
 *
 * Community recibe el inventario y los vencimientos con su semáforo; los avisos por correo, la
 * lectura automática de certificados y la sincronización con Skuld son de la edición Pro.
 */
import { useTranslation } from 'react-i18next'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { apiFetch } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { InventarioBase } from '@/components/inventario/inventario-base'
import type { Fetcher } from '@/components/inventario/tipos'
import { CuerpoMonitoreo } from '@/features/monitoreo/detalle'

const fetcher: Fetcher = (path, init) => apiFetch(path, init)

/** El CSV necesita el token: se baja con fetch. */
async function descargar(path: string, nombre: string) {
  const token = localStorage.getItem('gjallarhorn_token')
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error('No se pudo descargar el archivo.')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ActivosView() {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  // Hasta los permisos por módulo, escribir en el inventario es de administración (como el
  // alta y la baja de activos monitoreados). El backend lo hace cumplir igual.
  const esAdmin = auth.user?.role === 'admin'
  const puede = { editar: esAdmin, borrar: esAdmin, administrar: esAdmin }
  return (
    <>
      {/* El encabezado ya trae el menú de usuario: no se repite acá. */}
      <Header fixed />
      <Main>
        <div className='mb-6'>
          <h1 className='text-2xl font-bold tracking-tight flex items-center gap-2'>
            {t('monitoreo.tituloActivos')}
          </h1>
          <p className='text-sm text-muted-foreground'>{t('monitoreo.subtituloActivos')}</p>
        </div>
        <InventarioBase
          fetcher={fetcher}
          descargar={descargar}
          alcance=''
          puede={puede}
          sistema='Gjallarhorn'
          extraFicha={(a) => (a.categoria === 'hardware' || a.tipo === 'expuesto' ? <CuerpoMonitoreo id={a.id} /> : (
            <p className='text-muted-foreground text-sm'>Este tipo de activo no se monitorea por red.</p>
          ))}
          extraFichaTitulo='Monitoreo'
        />
      </Main>
    </>
  )
}
