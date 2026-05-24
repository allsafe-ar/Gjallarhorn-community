🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# VirusTotal — API Key Configuration

## What it provides
VirusTotal analyzes IPs, domains, URLs, and hashes against **90+ antivirus engines** and reputation lists. It is the highest-weighted source in Gjallarhorn's scoring.

**Supported IOC types:** IP, domain, URL, MD5, SHA1, SHA256

## Scoring in Gjallarhorn

| Detections / Total | Points |
|---|---|
| ≥ 10 / total | 80 pts |
| ≥ 5 / total | 60 pts |
| ≥ 3 / total | 40 pts |
| ≥ 1 / total | 20 pts |
| 0 / total | 0 pts |

## How to get the API Key

1. Create a free account at [virustotal.com](https://www.virustotal.com)
2. Go to your profile → **API Key**
3. Copy the API key

## Free plan

- **500 requests / day**
- **4 requests / minute**
- No access to private analyses or retrohunting

For high-volume production environments, the Premium plan is recommended.

## Configure in Gjallarhorn

`Settings → API Keys → VirusTotal` → paste the key → Save.

## Verify

```bash
curl -s "https://www.virustotal.com/api/v3/ip_addresses/8.8.8.8" \
  -H "x-apikey: YOUR_API_KEY" | python3 -m json.tool | head -20
```

Expected response: JSON with `last_analysis_stats`.

## Notes

- For hashes, Gjallarhorn queries the `/files/{hash}` endpoint
- For IPs: `/ip_addresses/{ip}`
- For domains: `/domains/{domain}`
- For URLs: first submits for scanning, then retrieves the analysis

---

<a id="español"></a>
# VirusTotal — Configuración de API Key

## ¿Qué aporta?
VirusTotal analiza IPs, dominios, URLs y hashes contra **90+ motores antivirus** y listas de reputación. Es la fuente con mayor peso en el scoring de Gjallarhorn.

**Tipos de IOC soportados:** IP, dominio, URL, MD5, SHA1, SHA256

## Scoring en Gjallarhorn

| Detecciones / Total | Puntos |
|---|---|
| ≥ 10 / total | 80 pts |
| ≥ 5 / total | 60 pts |
| ≥ 3 / total | 40 pts |
| ≥ 1 / total | 20 pts |
| 0 / total | 0 pts |

## Cómo obtener la API Key

1. Crear cuenta gratuita en [virustotal.com](https://www.virustotal.com)
2. Ir a tu perfil → **API Key**
3. Copiar la API key

## Plan gratuito

- **500 consultas / día**
- **4 consultas / minuto**
- Sin acceso a análisis privados ni retrohunting

Para entornos de producción con volumen alto se recomienda el plan Premium.

## Configurar en Gjallarhorn

`Configuración → API Keys → VirusTotal` → pegar la clave → Guardar.

## Verificar

```bash
curl -s "https://www.virustotal.com/api/v3/ip_addresses/8.8.8.8" \
  -H "x-apikey: TU_API_KEY" | python3 -m json.tool | head -20
```

Respuesta esperada: JSON con `last_analysis_stats`.

## Notas

- Para hashes, Gjallarhorn consulta el endpoint `/files/{hash}`
- Para IPs: `/ip_addresses/{ip}`
- Para dominios: `/domains/{domain}`
- Para URLs: primero hace submit y luego consulta el análisis
