/**
 * El color de una cifra tiene que decir algo: rojo crítico, naranja alto, ámbar atención, verde cumplido.
 * Sin tono, el número va en el color del texto. Son para cifras grandes (3:1 o más en claro y en
 * oscuro); en texto chico sobre fondo claro el ámbar-600 no alcanza (3,2:1): usar TONO_TEXTO.
 */
export type TonoCifra = 'critico' | 'alto' | 'atencion' | 'ok'

export const TONO_CIFRA: Record<TonoCifra, string> = {
  critico: 'text-red-600 dark:text-red-400',
  alto: 'text-orange-600 dark:text-orange-400',
  atencion: 'text-amber-600 dark:text-amber-400',
  ok: 'text-green-600 dark:text-green-400',
}

/** Los mismos tonos para texto chico: 4,5:1 o más en claro y en oscuro. */
export const TONO_TEXTO: Record<TonoCifra, string> = {
  critico: 'text-red-700 dark:text-red-400',
  alto: 'text-orange-700 dark:text-orange-400',
  atencion: 'text-amber-700 dark:text-amber-400',
  ok: 'text-green-700 dark:text-green-400',
}

/** Clase de color para una cifra: con tono, el del significado; sin tono, el del texto. */
export function claseCifra(tono?: TonoCifra) {
  return tono ? TONO_CIFRA[tono] : 'text-foreground'
}

/** El tono solo aparece si hay algo que señalar (n > 0). */
export function siHay(n: number | null | undefined, tono: TonoCifra): TonoCifra | undefined {
  return (n ?? 0) > 0 ? tono : undefined
}
