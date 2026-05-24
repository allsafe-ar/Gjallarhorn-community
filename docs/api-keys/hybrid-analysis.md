🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# Hybrid Analysis — API Key Configuration

## What it provides
Free malware analysis sandbox by CrowdStrike. Allows querying whether a hash has been previously analyzed and viewing the sandbox verdict.

**Supported IOC types:** MD5, SHA1, SHA256

## Scoring in Gjallarhorn

| Hybrid Analysis Verdict | Points |
|---|---|
| `malicious` | 60 pts |
| `suspicious` | 30 pts |
| `no-threat` / no result | 0 pts |

## How to get the API Key

1. Create a free account at [hybrid-analysis.com](https://www.hybrid-analysis.com)
2. Go to **Profile → API Key** → **Generate API Key**
3. Copy the key

## Free plan

- **200 analyses / day**, **5 analyses / minute**
- Access to hash search endpoint with no strict limits

## Configure in Gjallarhorn

`Settings → API Keys → Hybrid Analysis` → paste the key → Save.

## Verify

```bash
curl -s "https://www.hybrid-analysis.com/api/v2/search/hash" \
  -H "api-key: YOUR_API_KEY" \
  -H "User-Agent: Falcon Sandbox" \
  -d "hash=44d88612fea8a8f36de82e1278abb02f" | python3 -m json.tool | grep -E "verdict|threat_score" | head -5
```

## Notes

- Gjallarhorn uses the `POST /api/v2/search/hash` endpoint
- The relevant field is `verdict` in each search result
- If the hash has not been analyzed before, it returns an empty array (0 pts, not an error)

---

<a id="español"></a>
# Hybrid Analysis — Configuración de API Key

## ¿Qué aporta?
Sandbox de análisis de malware gratuito de CrowdStrike. Permite consultar si un hash ya fue analizado previamente y ver el veredicto del sandbox.

**Tipos de IOC soportados:** MD5, SHA1, SHA256

## Scoring en Gjallarhorn

| Veredicto Hybrid Analysis | Puntos |
|---|---|
| `malicious` | 60 pts |
| `suspicious` | 30 pts |
| `no-threat` / sin resultado | 0 pts |

## Cómo obtener la API Key

1. Crear cuenta gratuita en [hybrid-analysis.com](https://www.hybrid-analysis.com)
2. Ir a **Profile → API Key** → **Generate API Key**
3. Copiar la key

## Plan gratuito

- **200 análisis / día**, **5 análisis / minuto**
- Acceso al endpoint de búsqueda por hash sin límites estrictos

## Configurar en Gjallarhorn

`Configuración → API Keys → Hybrid Analysis` → pegar la clave → Guardar.

## Verificar

```bash
curl -s "https://www.hybrid-analysis.com/api/v2/search/hash" \
  -H "api-key: TU_API_KEY" \
  -H "User-Agent: Falcon Sandbox" \
  -d "hash=44d88612fea8a8f36de82e1278abb02f" | python3 -m json.tool | grep -E "verdict|threat_score" | head -5
```

## Notas

- Gjallarhorn usa el endpoint `POST /api/v2/search/hash`
- El campo relevante es `verdict` en cada resultado de la búsqueda
- Si el hash no fue analizado antes, retorna array vacío (0 pts, no es un error)
