🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# AbuseIPDB — API Key Configuration

## What it provides
Collaborative database of IPs reported for abuse. Returns a confidence percentage that the IP is malicious, report count, and country/ISP.

**Supported IOC types:** IPv4 and IPv6 only

## Scoring in Gjallarhorn

| Confidence Score | Points |
|---|---|
| ≥ 50% | 50 pts |
| ≥ 25% | score / 2 pts |
| < 25% | 0 pts |

## How to get the API Key

1. Create an account at [abuseipdb.com](https://www.abuseipdb.com)
2. Go to **Account → API** → **Create Key**
3. Copy the generated key

## Free plan

- **1,000 requests / day**
- Access to `/check` and `/report` endpoints

## Configure in Gjallarhorn

`Settings → API Keys → AbuseIPDB` → paste the key → Save.

## Verify

```bash
curl -s "https://api.abuseipdb.com/api/v2/check?ipAddress=185.220.101.45&maxAgeInDays=90" \
  -H "Key: YOUR_API_KEY" \
  -H "Accept: application/json" | python3 -m json.tool | grep -E "abuseConfidenceScore|totalReports"
```

## Notes

- Only applies to IPs. For domains, URLs, and hashes this source is skipped.
- The `abuseConfidenceScore` field is the main percentage used by Gjallarhorn.

---

<a id="español"></a>
# AbuseIPDB — Configuración de API Key

## ¿Qué aporta?
Base de datos colaborativa de IPs reportadas por abuso. Retorna un porcentaje de confianza de que la IP es maliciosa, cantidad de reportes y país/ISP.

**Tipos de IOC soportados:** solo IPv4 e IPv6

## Scoring en Gjallarhorn

| Confidence Score | Puntos |
|---|---|
| ≥ 50% | 50 pts |
| ≥ 25% | score / 2 pts |
| < 25% | 0 pts |

## Cómo obtener la API Key

1. Crear cuenta en [abuseipdb.com](https://www.abuseipdb.com)
2. Ir a **Account → API** → **Create Key**
3. Copiar la key generada

## Plan gratuito

- **1.000 consultas / día**
- Acceso a endpoint `/check` y `/report`

## Configurar en Gjallarhorn

`Configuración → API Keys → AbuseIPDB` → pegar la clave → Guardar.

## Verificar

```bash
curl -s "https://api.abuseipdb.com/api/v2/check?ipAddress=185.220.101.45&maxAgeInDays=90" \
  -H "Key: TU_API_KEY" \
  -H "Accept: application/json" | python3 -m json.tool | grep -E "abuseConfidenceScore|totalReports"
```

## Notas

- Solo aplica a IPs. Para dominios, URLs y hashes se omite esta fuente.
- El campo `abuseConfidenceScore` es el porcentaje principal que usa Gjallarhorn.
