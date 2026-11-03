/**
 * Aviso de versión nueva: la pantalla. Canónico (utiles/version), idéntico en todos los sistemas.
 * Se copia a `frontend/src/components/aviso-version-nueva.tsx` y se monta una vez en el layout raíz
 * (`routes/__root.tsx`): `<AvisoVersionNueva sistema='Skuld' />`.
 *
 * 🔑 **Autocontenido a propósito**, como el inventario y el mural: los textos en español, inglés y
 * portugués viven acá y solo se toma el idioma activo de react-i18next, así no hay claves que
 * mantener en los locales de cada sistema. Si el idioma es otro, español.
 *
 * 🎨 El color es el de énfasis de cada sistema porque usa las variables del tema (`text-primary` y
 * el botón por defecto, `bg-primary`). No lleva colores propios.
 */
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useVersionNueva } from '@/lib/version-nueva'

type Idioma = 'es' | 'en' | 'pt'

const TEXTOS: Record<Idioma, { aviso: (s: string) => string; recargar: string; accion: (s: string) => string }> = {
  es: {
    aviso: (s) => `Hay una versión nueva de ${s}. Recargá la página para seguir con la última.`,
    recargar: 'Recargar',
    accion: (s) => `Hay una versión nueva de ${s}. Recargá la página antes de continuar. Lo que ya guardaste no se pierde.`,
  },
  en: {
    aviso: (s) => `A new version of ${s} is available. Reload the page to keep working with the latest one.`,
    recargar: 'Reload',
    accion: (s) => `A new version of ${s} is available. Reload the page before you continue. Anything you already saved is kept.`,
  },
  pt: {
    aviso: (s) => `Há uma nova versão do ${s}. Recarregue a página para continuar com a mais recente.`,
    recargar: 'Recarregar',
    accion: (s) => `Há uma nova versão do ${s}. Recarregue a página antes de continuar. O que você já salvou não se perde.`,
  },
}

function idiomaDe(l?: string | null): Idioma {
  const c = (l || 'es').slice(0, 2)
  return c === 'en' || c === 'pt' ? c : 'es'
}

/** Textos del aviso en el idioma activo, para usarlos fuera del cartel (por ejemplo, antes de mandar un examen). */
// El hook vive al lado del cartel a propósito, para que el módulo sean tres archivos y no cuatro.
// eslint-disable-next-line react-refresh/only-export-components
export function useTextosVersionNueva(sistema: string) {
  const { i18n } = useTranslation()
  const t = TEXTOS[idiomaDe(i18n.language)]
  return { aviso: t.aviso(sistema), recargar: t.recargar, accion: t.accion(sistema) }
}

/** Aviso fijo cuando hay una versión nueva publicada: no se cierra, solo se recarga. */
export function AvisoVersionNueva({ sistema }: { sistema: string }) {
  const nueva = useVersionNueva()
  const tx = useTextosVersionNueva(sistema)
  if (!nueva) return null
  return (
    <div role='status' className='fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-xl border bg-background p-3 shadow-lg'>
      <RefreshCw className='size-5 shrink-0 text-primary' aria-hidden />
      <p className='flex-1 text-sm'>{tx.aviso}</p>
      <Button size='sm' onClick={() => window.location.reload()}>{tx.recargar}</Button>
    </div>
  )
}
