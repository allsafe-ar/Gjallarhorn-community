import i18n from '@/i18n'

// Idioma de la interfaz -> configuración regional para fechas y números
const REGIONES: Record<string, string> = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' }

export function localeActivo(): string {
  const idioma = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2).toLowerCase()
  return REGIONES[idioma] || 'en-US'
}
