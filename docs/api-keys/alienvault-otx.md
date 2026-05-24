🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# AlienVault OTX — API Key Configuration

## What it provides
Open Threat Exchange — collaborative threat intelligence platform. Returns the number of "pulses" (researcher reports) that mention the IOC.

**Supported IOC types:** IP, domain, URL, MD5, SHA1, SHA256

## Scoring in Gjallarhorn

| Pulses | Points |
|---|---|
| ≥ 10 | 40 pts |
| ≥ 5 | 30 pts |
| ≥ 1 | 15 pts |
| 0 | 0 pts |

## ⚠ Note on noise

OTX is a **community** platform and can generate false positives:

- **Shared infrastructure**: domains like `amazon.com`, `cloudflare.com` appear in many pulses because malware legitimately abuses them. The SUSPICIOUS verdict is technically correct, but must be interpreted in context.
- **Test hashes**: values like the MD5 of "hello" or the SHA256 of the empty file circulate in research datasets and can accumulate 10+ pulses.

Gjallarhorn always shows all data from each source so the analyst can evaluate context.

## How to get the API Key

1. Create an account at [otx.alienvault.com](https://otx.alienvault.com)
2. Go to **Settings → API Integration**
3. Copy the **OTX Key**

## Free plan

- Full access with no strict limits for individual queries
- The public API is free

## Configure in Gjallarhorn

`Settings → API Keys → AlienVault OTX` → paste the key → Save.

## Verify

```bash
curl -s "https://otx.alienvault.com/api/v1/indicators/IPv4/185.220.101.45/general" \
  -H "X-OTX-API-KEY: YOUR_API_KEY" | python3 -m json.tool | grep pulse_info
```

## Notes

- Gjallarhorn uses the endpoint `/api/v1/indicators/{type}/{ioc}/general`
- For hashes it uses the type `file`
- For IPv4 it uses the type `IPv4`
- The relevant field is `pulse_info.count`

---

<a id="español"></a>
# AlienVault OTX — Configuración de API Key

## ¿Qué aporta?
Open Threat Exchange — plataforma colaborativa de threat intelligence. Retorna el número de "pulses" (reportes de investigadores) que mencionan el IOC.

**Tipos de IOC soportados:** IP, dominio, URL, MD5, SHA1, SHA256

## Scoring en Gjallarhorn

| Pulses | Puntos |
|---|---|
| ≥ 10 | 40 pts |
| ≥ 5 | 30 pts |
| ≥ 1 | 15 pts |
| 0 | 0 pts |

## ⚠ Nota sobre ruido

OTX es una plataforma **comunitaria** y puede generar falsos positivos:

- **Infraestructura compartida**: dominios como `amazon.com`, `cloudflare.com` aparecen en muchos pulses porque el malware abusa de ellos legítimamente. El veredicto SUSPICIOUS es técnicamente correcto, pero hay que interpretarlo en contexto.
- **Hashes de test**: valores como el MD5 de "hello" o el SHA256 del archivo vacío circulan en datasets de investigación y pueden acumular 10+ pulses.

Gjallarhorn siempre muestra todos los datos de cada fuente para que el analista pueda evaluar el contexto.

## Cómo obtener la API Key

1. Crear cuenta en [otx.alienvault.com](https://otx.alienvault.com)
2. Ir a **Settings → API Integration**
3. Copiar la **OTX Key**

## Plan gratuito

- Acceso completo sin límites estrictos para consultas individuales
- La API pública es gratuita

## Configurar en Gjallarhorn

`Configuración → API Keys → AlienVault OTX` → pegar la clave → Guardar.

## Verificar

```bash
curl -s "https://otx.alienvault.com/api/v1/indicators/IPv4/185.220.101.45/general" \
  -H "X-OTX-API-KEY: TU_API_KEY" | python3 -m json.tool | grep pulse_info
```

## Notas

- Gjallarhorn usa el endpoint `/api/v1/indicators/{type}/{ioc}/general`
- Para hashes usa el tipo `file`
- Para IPv4 usa el tipo `IPv4`
- El campo relevante es `pulse_info.count`
