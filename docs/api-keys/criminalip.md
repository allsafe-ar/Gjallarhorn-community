🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# Criminal IP — API Key Configuration

## What it provides
IP threat intelligence platform with a 0–100 threat score and categorization (VPN, proxy, Tor, C2, malware, phishing, etc.).

**Supported IOC types:** IPv4 only

## Scoring in Gjallarhorn

| Criminal IP Score | Points |
|---|---|
| ≥ 80 | 40 pts |
| ≥ 50 | 25 pts |
| < 50 | 0 pts |

## How to get the API Key

1. Create an account at [criminalip.io](https://www.criminalip.io)
2. Go to **My info → API** → copy the API key
3. The free account requires email verification

## Free plan

- **50 requests / day** (IP lookup)
- No access to detailed historical data

## Configure in Gjallarhorn

`Settings → API Keys → Criminal IP` → paste the key → Save.

## Verify

```bash
curl -s "https://api.criminalip.io/v1/asset/ip/report?ip=185.220.101.45" \
  -H "x-api-key: YOUR_API_KEY" | python3 -m json.tool | grep -E "score|inbound_score"
```

## Notes

- Gjallarhorn uses the `/v1/asset/ip/report` endpoint
- The relevant field is `data.score.inbound` (range 0–100)
- Categories (`tags`) are displayed in the investigation detail view

---

<a id="español"></a>
# Criminal IP — Configuración de API Key

## ¿Qué aporta?
Plataforma de threat intelligence de IPs con score de amenaza 0–100 y categorización (VPN, proxy, Tor, C2, malware, phishing, etc.).

**Tipos de IOC soportados:** solo IPv4

## Scoring en Gjallarhorn

| Score Criminal IP | Puntos |
|---|---|
| ≥ 80 | 40 pts |
| ≥ 50 | 25 pts |
| < 50 | 0 pts |

## Cómo obtener la API Key

1. Crear cuenta en [criminalip.io](https://www.criminalip.io)
2. Ir a **My info → API** → copiar la API key
3. La cuenta gratuita requiere verificación de email

## Plan gratuito

- **50 consultas / día** (IP lookup)
- Sin acceso a datos históricos detallados

## Configurar en Gjallarhorn

`Configuración → API Keys → Criminal IP` → pegar la clave → Guardar.

## Verificar

```bash
curl -s "https://api.criminalip.io/v1/asset/ip/report?ip=185.220.101.45" \
  -H "x-api-key: TU_API_KEY" | python3 -m json.tool | grep -E "score|inbound_score"
```

## Notas

- Gjallarhorn usa el endpoint `/v1/asset/ip/report`
- El campo relevante es `data.score.inbound` (rango 0–100)
- Las categorías (`tags`) se muestran en el detalle de la investigación
