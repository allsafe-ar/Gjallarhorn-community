🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# URLScan.io — API Key Configuration

## What it provides
URL analysis service that takes a screenshot and analyzes website behavior. Detects phishing, malware, suspicious redirects, and extracts IOCs from the DOM/network traffic.

**Supported IOC types:** URL, domain

## Behavior in Gjallarhorn

URLScan works **asynchronously**:
1. Gjallarhorn submits the URL for scanning
2. The response includes a `result_url` with the analysis UUID
3. The analysis takes ~30-60 seconds to complete on the platform

Therefore, the `score_contribution` is 0 in the immediate response — the visual analysis is available via the result link.

## How to get the API Key

1. Create an account at [urlscan.io](https://urlscan.io)
2. Go to **Settings → API Key** → **Create API Key**
3. Copy the generated key

## Free plan

- **5,000 scans / month** on the free tier
- Public results are visible to anyone

Private scans (not publicly visible) require a paid plan.

## Configure in Gjallarhorn

`Settings → API Keys → URLScan.io` → paste the key → Save.

## Verify

```bash
curl -s "https://urlscan.io/api/v1/scan/" \
  -H "API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","visibility":"public"}' | python3 -m json.tool
```

Expected response: JSON with `uuid` and `result` (analysis URL).

## Notes

- Gjallarhorn uses the `POST /api/v1/scan/` endpoint with `visibility: "public"`
- The `result` field in the response contains the direct link to the visual analysis
- To see the full result, open the link in a browser

---

<a id="español"></a>
# URLScan.io — Configuración de API Key

## ¿Qué aporta?
Servicio de análisis de URLs que hace una captura de pantalla y análisis del comportamiento del sitio web. Detecta phishing, malware, redirecciones sospechosas y extrae IOCs del DOM/red.

**Tipos de IOC soportados:** URL, dominio

## Comportamiento en Gjallarhorn

URLScan funciona de forma **asíncrona**:
1. Gjallarhorn hace submit de la URL al escaneo
2. La respuesta incluye un `result_url` con el UUID del análisis
3. El análisis tarda ~30-60 segundos en completarse en la plataforma

Por eso, el `score_contribution` es 0 en la respuesta inmediata — el análisis visual está disponible en el link del resultado.

## Cómo obtener la API Key

1. Crear cuenta en [urlscan.io](https://urlscan.io)
2. Ir a **Settings → API Key** → **Create API Key**
3. Copiar la key generada

## Plan gratuito

- **5.000 scans / mes** con el tier gratuito
- Los resultados públicos son visibles por cualquiera

Para scans privados (no visibles públicamente) se requiere un plan de pago.

## Configurar en Gjallarhorn

`Configuración → API Keys → URLScan.io` → pegar la clave → Guardar.

## Verificar

```bash
curl -s "https://urlscan.io/api/v1/scan/" \
  -H "API-Key: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","visibility":"public"}' | python3 -m json.tool
```

Respuesta esperada: JSON con `uuid` y `result` (URL del análisis).

## Notas

- Gjallarhorn usa el endpoint `POST /api/v1/scan/` con `visibility: "public"`
- El campo `result` en la respuesta contiene el link directo al análisis visual
- Para ver el resultado completo, abrir el link en el navegador
