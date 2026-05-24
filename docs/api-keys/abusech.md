🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# Abuse.ch — API Key Configuration

A single Abuse.ch API key enables three different services:

| Service | Supported IOCs | Description |
|---|---|---|
| **ThreatFox** | IP, domain, URL, hash | Malware IOC database |
| **MalwareBazaar** | MD5, SHA1, SHA256 | Malware sample repository |
| **URLhaus** | URL, domain | Malicious URL database |

## Scoring in Gjallarhorn

| Service | Condition | Points |
|---|---|---|
| ThreatFox | IOC found (exact match) | 55 pts |
| MalwareBazaar | Hash found | 70 pts |
| URLhaus | URL found | 60 pts |

## ⚠ Authentication change (~2025)

Starting in 2025, all three Abuse.ch APIs require the `Auth-Key` header for authentication. **They no longer work without this header.**

## How to get the API Key

1. Create an account at [bazaar.abuse.ch](https://bazaar.abuse.ch) (or ThreatFox/URLhaus — they share the same account)
2. Go to **Account Settings → Auth Key**
3. Copy the key

> The same key works for all three APIs (ThreatFox, MalwareBazaar, URLhaus).

## Free plan

- **No strict limits** — Abuse.ch is a security community platform, free for researchers.

## Configure in Gjallarhorn

`Settings → API Keys → Abuse.ch (ThreatFox)` → paste the key → Save.

> The key is saved under the `threatfox` label but is used for all three services.

## Verify

```bash
# ThreatFox
curl -s https://threatfox-api.abuse.ch/api/v1/ \
  -H "Auth-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"search_ioc","search_term":"185.220.101.45"}' | python3 -m json.tool | head -15

# MalwareBazaar — EICAR hash
curl -s https://mb-api.abuse.ch/api/v1/ \
  -H "Auth-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"get_info","hash":"44d88612fea8a8f36de82e1278abb02f"}' | python3 -m json.tool | head -15

# URLhaus
curl -s https://urlhaus-api.abuse.ch/v1/url/ \
  -H "Auth-Key: YOUR_API_KEY" \
  -d "url=http://example.com/malware.exe" | python3 -m json.tool | head -10
```

## Notes on ThreatFox

ThreatFox performs **partial matching** — a search for `google.com` may return results like `malware-google.com-x20.sslip.io`. Gjallarhorn filters using exact match (`item.ioc === ioc`) to avoid false positives.

---

<a id="español"></a>
# Abuse.ch — Configuración de API Key

Una sola API key de Abuse.ch habilita tres servicios diferentes:

| Servicio | IOC soportados | Descripción |
|---|---|---|
| **ThreatFox** | IP, dominio, URL, hash | Base de datos de IOCs de malware |
| **MalwareBazaar** | MD5, SHA1, SHA256 | Repositorio de muestras de malware |
| **URLhaus** | URL, dominio | Base de datos de URLs maliciosas |

## Scoring en Gjallarhorn

| Servicio | Condición | Puntos |
|---|---|---|
| ThreatFox | IOC encontrado (exact match) | 55 pts |
| MalwareBazaar | Hash encontrado | 70 pts |
| URLhaus | URL encontrada | 60 pts |

## ⚠ Cambio de autenticación (~2025)

A partir de 2025, las tres APIs de Abuse.ch requieren el header `Auth-Key` para autenticarse. **Ya no funciona sin este header.**

## Cómo obtener la API Key

1. Crear cuenta en [bazaar.abuse.ch](https://bazaar.abuse.ch) (o ThreatFox/URLhaus — comparten la misma cuenta)
2. Ir a **Account Settings → Auth Key**
3. Copiar la key

> La misma key funciona para las tres APIs (ThreatFox, MalwareBazaar, URLhaus).

## Plan gratuito

- **Sin límites estrictos** — Abuse.ch es una plataforma de la comunidad de seguridad, libre para investigadores.

## Configurar en Gjallarhorn

`Configuración → API Keys → Abuse.ch (ThreatFox)` → pegar la clave → Guardar.

> La key se guarda bajo la etiqueta `threatfox` pero se usa para los tres servicios.

## Verificar

```bash
# ThreatFox
curl -s https://threatfox-api.abuse.ch/api/v1/ \
  -H "Auth-Key: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"search_ioc","search_term":"185.220.101.45"}' | python3 -m json.tool | head -15

# MalwareBazaar — hash de EICAR
curl -s https://mb-api.abuse.ch/api/v1/ \
  -H "Auth-Key: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"get_info","hash":"44d88612fea8a8f36de82e1278abb02f"}' | python3 -m json.tool | head -15

# URLhaus
curl -s https://urlhaus-api.abuse.ch/v1/url/ \
  -H "Auth-Key: TU_API_KEY" \
  -d "url=http://example.com/malware.exe" | python3 -m json.tool | head -10
```

## Notas sobre ThreatFox

ThreatFox hace **partial matching** — una búsqueda por `google.com` puede devolver resultados como `malware-google.com-x20.sslip.io`. Gjallarhorn filtra usando exact match (`item.ioc === ioc`) para evitar falsos positivos.
