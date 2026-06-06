# Google Safe Browsing

Reputación de **URLs y dominios** contra el dataset de Google (phishing, malware,
software no deseado). Suma al score de Investigación IOC junto al resto de fuentes.

Gjallarhorn Community usa la **Safe Browsing API v4** (gratuita, ~10.000 lookups/día).

> ⚠️ La API gratuita v4 es para **uso NO comercial**. Para un producto/servicio comercial,
> Google requiere la **Web Risk API** (de pago), disponible en Gjallarhorn Pro.

## Obtener la API key

1. Entrá a [Google Cloud Console](https://console.cloud.google.com/) y creá (o elegí) un proyecto.
2. **APIs y servicios → Biblioteca** → habilitá **Safe Browsing API**.
3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. (Recomendado) Restringí la key a la Safe Browsing API.

## Configurar en Gjallarhorn

1. **Configuración → API Keys**.
2. Pegá la key en **Google Safe Browsing** y guardá.
3. Investigá una URL o dominio: la tarjeta **Google Safe Browsing** aparece en la pestaña
   *Fuentes* y contribuye al score (URLs maliciosas suman +60).

## Nota de privacidad

La Lookup API envía la URL/dominio consultado a Google. Para IOCs externos (URLs maliciosas)
no representa un problema; tenelo en cuenta si analizás URLs internas sensibles.
