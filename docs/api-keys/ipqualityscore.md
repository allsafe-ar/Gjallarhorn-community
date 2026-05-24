🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# IPQualityScore — API Key Configuration

## What it provides
Proxy, VPN, Tor exit node detection and fraud scoring for IPs. Useful for identifying IPs used for detection evasion or fraudulent activities.

**Supported IOC types:** IPv4 only

## Scoring in Gjallarhorn

| Fraud Score | Points |
|---|---|
| ≥ 90 | 40 pts |
| ≥ 75 | 25 pts |
| < 75 | 0 pts |

Additionally, if the IP is a **Tor exit node** or **known proxy**, it is reported in the detail view.

## How to get the API Key

1. Create an account at [ipqualityscore.com](https://www.ipqualityscore.com)
2. Go to **My Account → API Keys** → copy the free key
3. No credit card required

## Free plan

- **5,000 requests / month**
- Access to proxy/VPN/Tor detection and basic fraud score

## Configure in Gjallarhorn

`Settings → API Keys → IPQualityScore` → paste the key → Save.

## Verify

```bash
curl -s "https://ipqualityscore.com/api/json/ip/YOUR_API_KEY/185.220.101.45" \
  | python3 -m json.tool | grep -E "fraud_score|proxy|tor|vpn"
```

## Notes

- Gjallarhorn uses the `GET /api/json/ip/{key}/{ip}` endpoint
- The `proxy`, `vpn`, and `tor` fields are booleans
- The `fraud_score` field is the main indicator (0–100)

---

<a id="español"></a>
# IPQualityScore — Configuración de API Key

## ¿Qué aporta?
Detección de proxies, VPNs, Tor exit nodes y scoring de fraude para IPs. Útil para identificar IPs usadas para evasión de detección o actividades fraudulentas.

**Tipos de IOC soportados:** solo IPv4

## Scoring en Gjallarhorn

| Fraud Score | Puntos |
|---|---|
| ≥ 90 | 40 pts |
| ≥ 75 | 25 pts |
| < 75 | 0 pts |

Además, si la IP es **Tor exit node** o **proxy conocido**, se reporta en el detalle.

## Cómo obtener la API Key

1. Crear cuenta en [ipqualityscore.com](https://www.ipqualityscore.com)
2. Ir a **My Account → API Keys** → copiar la key gratuita
3. No requiere tarjeta de crédito

## Plan gratuito

- **5.000 consultas / mes**
- Acceso a detección de proxy/VPN/Tor y fraud score básico

## Configurar en Gjallarhorn

`Configuración → API Keys → IPQualityScore` → pegar la clave → Guardar.

## Verificar

```bash
curl -s "https://ipqualityscore.com/api/json/ip/TU_API_KEY/185.220.101.45" \
  | python3 -m json.tool | grep -E "fraud_score|proxy|tor|vpn"
```

## Notas

- Gjallarhorn usa el endpoint `GET /api/json/ip/{key}/{ip}`
- Los campos `proxy`, `vpn` y `tor` son booleanos
- El campo `fraud_score` es el principal indicador (0–100)
