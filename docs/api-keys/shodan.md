🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# Shodan — API Key Configuration

## What it provides
Search engine for internet-connected devices. For IPs it returns open ports, service banners, detected CVEs, and **C2 framework detection** (Cobalt Strike, Metasploit, Empire, Sliver, Havoc, Brute Ratel, Mythic and more).

**Supported IOC types:** IPv4 only (the `/shodan/host/{ip}` endpoint does not apply to domains/hashes)

## Scoring in Gjallarhorn

| Condition | Points |
|---|---|
| C2 framework detected in banners | 70 pts |
| 3+ critical CVEs | 20 pts |
| No hits (or HTTP 403/404) | 0 pts |

> The free tier of Shodan returns HTTP 403 for some IPs — Gjallarhorn treats this as "not found" (0 pts), not an error.

## C2 Frameworks detected

Gjallarhorn searches for signatures of the following frameworks in Shodan banners:

- Cobalt Strike (JARM fingerprint, `/css/login.css`, `/downloads/`)
- Metasploit (`Meterpreter`, JARM)
- Empire (`/admin/get.php`, `/news.php`)
- Covenant (`/api/grunts`)
- Sliver (`multiplayer`), Havoc (`teamserver`), Brute Ratel (`brute_ratel`)
- Mythic (`/GraphQL`), Nighthawk, PoshC2

## How to get the API Key

1. Create an account at [shodan.io](https://www.shodan.io)
2. Go to **My Account** → copy the **API Key**

## Free vs paid plan

- **Free**: basic access, no advanced filters — sufficient for the `/shodan/host/{ip}` endpoint
- **Freelancer ($49/year)**: no strict rate limiting, access to more historical data

## Configure in Gjallarhorn

`Settings → API Keys → Shodan` → paste the key → Save.

## Verify

```bash
curl -s "https://api.shodan.io/shodan/host/185.220.101.45?key=YOUR_API_KEY" \
  | python3 -m json.tool | grep -E "ports|vulns|org" | head -10
```

## Notes

- Shodan returns cached data — there may be days/weeks of latency for lesser-known IPs.
- C2 signatures are searched in the `data[].data` field (raw banner) of the response.

---

<a id="español"></a>
# Shodan — Configuración de API Key

## ¿Qué aporta?
Motor de búsqueda de dispositivos conectados a Internet. Para IPs retorna puertos abiertos, banners de servicios, CVEs detectados y **detección de C2 frameworks** (Cobalt Strike, Metasploit, Empire, Sliver, Havoc, Brute Ratel, Mythic y más).

**Tipos de IOC soportados:** solo IPv4 (el endpoint `/shodan/host/{ip}` no aplica a dominios/hashes)

## Scoring en Gjallarhorn

| Condición | Puntos |
|---|---|
| C2 framework detectado en banners | 70 pts |
| 3+ CVEs críticos | 20 pts |
| Sin hits (o HTTP 403/404) | 0 pts |

> El tier gratuito de Shodan retorna HTTP 403 para algunas IPs — Gjallarhorn trata esto como "no encontrado" (0 pts), no como error.

## C2 Frameworks detectados

Gjallarhorn busca firmas de los siguientes frameworks en los banners de Shodan:

- Cobalt Strike (JARM fingerprint, `/css/login.css`, `/downloads/`)
- Metasploit (`Meterpreter`, JARM)
- Empire (`/admin/get.php`, `/news.php`)
- Covenant (`/api/grunts`)
- Sliver (`multiplayer`), Havoc (`teamserver`), Brute Ratel (`brute_ratel`)
- Mythic (`/GraphQL`), Nighthawk, PoshC2

## Cómo obtener la API Key

1. Crear cuenta en [shodan.io](https://www.shodan.io)
2. Ir a **My Account** → copiar la **API Key**

## Plan gratuito vs de pago

- **Gratuito**: acceso básico, sin filtros avanzados — suficiente para el endpoint `/shodan/host/{ip}`
- **Freelancer ($49/año)**: sin rate limiting estricto, acceso a más datos históricos

## Configurar en Gjallarhorn

`Configuración → API Keys → Shodan` → pegar la clave → Guardar.

## Verificar

```bash
curl -s "https://api.shodan.io/shodan/host/185.220.101.45?key=TU_API_KEY" \
  | python3 -m json.tool | grep -E "ports|vulns|org" | head -10
```

## Notas

- Shodan retorna datos cacheados — puede haber latencia de días/semanas para IPs poco conocidas.
- Las firmas de C2 se buscan en el campo `data[].data` (banner raw) de la respuesta.
