🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# Velociraptor — Integration Configuration

## What it provides
DFIR (Digital Forensics & Incident Response) platform for remote artifact collection. Gjallarhorn can list clients (agents), hunts, and flows (collections) for each client.

## Supported version

Velociraptor **0.7.x** (tested with 0.76.1 on Ubuntu 24.04).

## Authentication method

Velociraptor with `authenticator: Basic` accepts username and password directly via the REST API — no separate API keys required.

> mTLS API keys are only for the internal gRPC port (8001, localhost only). They are not needed for the web integration.

## Prerequisites

- Velociraptor configured with `authenticator: Basic` in `server.config.yaml`
- Port 8889 (HTTPS) accessible from the Gjallarhorn server

## Configure in Gjallarhorn

`Settings → Integrations → Velociraptor`:

| Field | Value |
|---|---|
| URL | `https://ip-velociraptor:8889` |
| Username | Velociraptor GUI username |
| Password | user's password |

Click **Test Connection** → should show "Connected — N clients".

## Verify from CLI

```bash
# List clients
curl -sk -u 'user:password' \
  'https://IP_VELOCIRAPTOR:8889/api/v1/SearchClients?query=all&limit=5' | python3 -m json.tool

# List hunts
curl -sk -u 'user:password' \
  'https://IP_VELOCIRAPTOR:8889/api/v1/ListHunts?count=5' | python3 -m json.tool
```

## Available features

| Feature | Description |
|---|---|
| List clients | ID, hostname, OS, last seen |
| Online status | Client seen in the last 10 minutes |
| List hunts | ID, description, status, artifact |
| View flows | Artifact collections per client |
| Create hunt | Launch a new artifact collection |

## Static IP setup — Ubuntu 24.04 (Netplan)

Ubuntu 24.04 can have two conflicting Netplan configurations (installer + cloud-init). To set a static IP:

```bash
# 1. Edit the static config
sudo nano /etc/netplan/00-installer-config.yaml
# Change addresses: to [192.168.xxx.xxx/24]

# 2. Disable cloud-init networking
echo "network: {config: disabled}" | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network.cfg
sudo rm -f /etc/netplan/50-cloud-init.yaml

# 3. Apply
sudo chmod 600 /etc/netplan/00-installer-config.yaml
sudo netplan apply
```

If Velociraptor has the old IP hardcoded in its config:
```bash
sudo sed -i 's/hostname: OLD_IP/hostname: NEW_IP/' \
  /etc/velociraptor/server.config.yaml
sudo systemctl restart velociraptor
```

## API response structure

- `SearchClients`: `{items: [{client_id, os_info, last_seen_at, ...}], total: "N"}`
  - `last_seen_at` is in **microseconds** — divide by 1,000,000 to get Unix seconds
- `ListHunts`: `{items: [{hunt_id, hunt_description, state, create_time, ...}]}`
- `GetClientFlows`: table format `{columns: [...], rows: [{json: "[val1,val2,...]"}]}`
  - Each `row.json` is a JSON array mapping indices to `columns`

## Known issues

- `GetVersion`, `GetClient` (singular), `GetHunts` return NOT_FOUND (code 5) in v0.76 — they do not exist
- The search endpoint is `SearchClients?query=all` (not `GetApiClients`)
- POST requests need the `Referer: https://ip-velociraptor:8889/` header to avoid CSRF
- `last_seen_at` in microseconds: `online = (Date.now() * 1000 - last_seen_at) / 1e6 < 600`

---

<a id="español"></a>
# Velociraptor — Configuración de Integración

## ¿Qué aporta?
Plataforma DFIR (Digital Forensics & Incident Response) para colección remota de artefactos. Gjallarhorn puede listar clientes (agentes), hunts y los flows (colecciones) de cada cliente.

## Versión soportada

Velociraptor **0.7.x** (probado con 0.76.1 en Ubuntu 24.04).

## Método de autenticación

Velociraptor con `authenticator: Basic` acepta usuario y contraseña directamente en la API REST — no requiere generar API keys separadas.

> Las API keys mTLS son solo para el puerto gRPC interno (8001, solo localhost). No se necesitan para la integración web.

## Prerrequisitos

- Velociraptor configurado con `authenticator: Basic` en `server.config.yaml`
- El puerto 8889 (HTTPS) accesible desde el servidor de Gjallarhorn

## Configurar en Gjallarhorn

`Configuración → Integraciones → Velociraptor`:

| Campo | Valor |
|---|---|
| URL | `https://ip-velociraptor:8889` |
| Usuario | usuario de la GUI de Velociraptor |
| Contraseña | contraseña del usuario |

Click **Probar conexión** → debe mostrar "Conectado — N clientes".

## Verificar desde CLI

```bash
# Listar clientes
curl -sk -u 'usuario:contraseña' \
  'https://IP_VELOCIRAPTOR:8889/api/v1/SearchClients?query=all&limit=5' | python3 -m json.tool

# Listar hunts
curl -sk -u 'usuario:contraseña' \
  'https://IP_VELOCIRAPTOR:8889/api/v1/ListHunts?count=5' | python3 -m json.tool
```

## Funcionalidades disponibles

| Función | Descripción |
|---|---|
| Listar clientes | ID, hostname, OS, última vez visto |
| Estado online | Cliente visto en los últimos 10 minutos |
| Listar hunts | ID, descripción, estado, artefacto |
| Ver flows | Colecciones de artefactos por cliente |
| Crear hunt | Lanzar una nueva colección de artefactos |

## Instalación en IP fija — Ubuntu 24.04 (Netplan)

Ubuntu 24.04 puede tener dos configuraciones Netplan en conflicto (instalador + cloud-init). Para fijar el IP:

```bash
# 1. Editar la config estática
sudo nano /etc/netplan/00-installer-config.yaml
# Cambiar addresses: a [192.168.xxx.xxx/24]

# 2. Deshabilitar cloud-init networking
echo "network: {config: disabled}" | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network.cfg
sudo rm -f /etc/netplan/50-cloud-init.yaml

# 3. Aplicar
sudo chmod 600 /etc/netplan/00-installer-config.yaml
sudo netplan apply
```

Si Velociraptor tiene el IP antiguo hardcodeado en su config:
```bash
sudo sed -i 's/hostname: IP_VIEJO/hostname: IP_NUEVO/' \
  /etc/velociraptor/server.config.yaml
sudo systemctl restart velociraptor
```

## Estructura de respuestas de la API

- `SearchClients`: `{items: [{client_id, os_info, last_seen_at, ...}], total: "N"}`
  - `last_seen_at` está en **microsegundos** — dividir por 1,000,000 para obtener segundos Unix
- `ListHunts`: `{items: [{hunt_id, hunt_description, state, create_time, ...}]}`
- `GetClientFlows`: formato tabla `{columns: [...], rows: [{json: "[val1,val2,...]"}]}`
  - Cada `row.json` es un array JSON que mapea índices a `columns`

## Problemas conocidos

- `GetVersion`, `GetClient` (singular), `GetHunts` retornan NOT_FOUND (code 5) en v0.76 — no existen
- El endpoint de búsqueda es `SearchClients?query=all` (no `GetApiClients`)
- Los POST requests necesitan header `Referer: https://ip-velociraptor:8889/` para evitar CSRF
- `last_seen_at` en microsegundos: `online = (Date.now() * 1000 - last_seen_at) / 1e6 < 600`
