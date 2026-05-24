🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# GreyNoise — API Key Configuration

## What it provides
Classifies IPs as **noise** (automated scanners/bots, not human actors), **riot** (known legitimate infrastructure such as CDNs/DNS resolvers), or **malicious**. Helps filter out noise and prioritize genuinely suspicious IPs.

**Supported IOC types:** IPv4 only

## Scoring in Gjallarhorn

| Classification | Points |
|---|---|
| `malicious` | 40 pts |
| `benign` / `riot` | 0 pts (reduces false positives) |
| `unknown` / `noise` | 0 pts |

## How to get the API Key

1. Create an account at [greynoise.io](https://www.greynoise.io)
2. Go to **Account → API Key**
3. Copy the key

## Free plan (Community)

- The `/v3/community/{ip}` endpoint is **public** — Gjallarhorn can use it even without a valid API key.
- With a free account you get more fields in the response.
- The paid plan unlocks advanced filters and more historical data.

## Configure in Gjallarhorn

`Settings → API Keys → GreyNoise` → paste the key → Save.

> If you don't have an API key, you can enter any text — the community endpoint works without authentication. That said, registering a free account is recommended for greater reliability.

## Verify

```bash
# Without key (community endpoint)
curl -s "https://api.greynoise.io/v3/community/185.220.101.45" | python3 -m json.tool

# With key
curl -s "https://api.greynoise.io/v3/community/8.8.8.8" \
  -H "key: YOUR_API_KEY" | python3 -m json.tool
```

## Notes

- An IP marked as `riot` (like 8.8.8.8 — Google DNS) lowers the effective score because it is known legitimate infrastructure.
- An IP marked as `noise` (automated scanner) is not necessarily malicious — it could be a honeypot or researcher.

---

<a id="español"></a>
# GreyNoise — Configuración de API Key

## ¿Qué aporta?
Clasifica IPs como **noise** (scanners/bots automáticos, no actores humanos), **riot** (infraestructura legítima conocida como CDNs/DNS resolvers) o **malicious**. Ayuda a filtrar ruido y priorizar IPs realmente sospechosas.

**Tipos de IOC soportados:** solo IPv4

## Scoring en Gjallarhorn

| Clasificación | Puntos |
|---|---|
| `malicious` | 40 pts |
| `benign` / `riot` | 0 pts (reduce falsos positivos) |
| `unknown` / `noise` | 0 pts |

## Cómo obtener la API Key

1. Crear cuenta en [greynoise.io](https://www.greynoise.io)
2. Ir a **Account → API Key**
3. Copiar la key

## Plan gratuito (Community)

- El endpoint `/v3/community/{ip}` es **público** — Gjallarhorn puede usarlo incluso sin una API key válida.
- Con cuenta gratuita se obtienen más campos en la respuesta.
- El plan de pago desbloquea filtros avanzados y más histórico.

## Configurar en Gjallarhorn

`Configuración → API Keys → GreyNoise` → pegar la clave → Guardar.

> Si no tenés API key, podés poner cualquier texto — el endpoint community funciona sin autenticación. De todas formas, se recomienda registrar una cuenta gratuita para mayor fiabilidad.

## Verificar

```bash
# Sin key (endpoint community)
curl -s "https://api.greynoise.io/v3/community/185.220.101.45" | python3 -m json.tool

# Con key
curl -s "https://api.greynoise.io/v3/community/8.8.8.8" \
  -H "key: TU_API_KEY" | python3 -m json.tool
```

## Notas

- Una IP marcada como `riot` (como 8.8.8.8 de Google DNS) reduce el score efectivo porque es infraestructura legítima conocida.
- Una IP marcada como `noise` (scanner automático) no necesariamente es maliciosa — puede ser un honeypot o investigador.
