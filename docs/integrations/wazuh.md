🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# Wazuh — Integration Configuration

## What it provides
SIEM / security monitoring platform. Gjallarhorn accesses the agent list and recent alerts (via OpenSearch indexer).

## Supported version

Wazuh **4.x** (tested with 4.7.5).

## Architecture

Wazuh has two components relevant to the integration:

| Component | Port | Auth | Function |
|---|---|---|---|
| Manager API | 55000 (HTTPS) | Basic → JWT | List agents, overview |
| OpenSearch Indexer | 9200 (HTTPS) | Basic | Query alerts |

## Prerequisites

### 1. Expose the indexer to the network

By default, the Wazuh OpenSearch indexer listens only on `127.0.0.1:9200`. To allow Gjallarhorn to query it remotely:

```bash
# On the Wazuh VM
sudo sed -i 's/network.host: "127.0.0.1"/network.host: "0.0.0.0"/' \
  /etc/wazuh-indexer/opensearch.yml
sudo systemctl restart wazuh-indexer
```

### 2. Get the wazuh-wui password

```bash
# On the Wazuh VM
sudo cat /usr/share/wazuh-dashboard/data/wazuh/config/wazuh.yml | grep password
# → password: "your_password_here"
```

### 3. Get the indexer password (admin user)

The `admin` user password for the indexer is in `/etc/wazuh-indexer/opensearch-security/internal_users.yml` (bcrypt hash), or you can find/reset it with:

```bash
# View/change indexer admin password
sudo /usr/share/wazuh-indexer/plugins/opensearch-security/tools/securityadmin.sh \
  -cd /etc/wazuh-indexer/opensearch-security/ \
  -icl -nhnv -cacert /etc/wazuh-indexer/certs/root-ca.pem \
  -cert /etc/wazuh-indexer/certs/admin.pem \
  -key /etc/wazuh-indexer/certs/admin-key.pem
```

## Configure in Gjallarhorn

`Settings → Integrations → Wazuh`:

| Field | Value |
|---|---|
| URL | `https://ip-wazuh:55000` |
| Username | `wazuh-wui` |
| Password | the one obtained in step 2 |

Click **Test Connection** → should show "Connected".

### Configure indexer credentials (extra_config)

The OpenSearch indexer credentials are stored in the `extra_config` field in the database. From a terminal on the Gjallarhorn server:

```bash
TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASS"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -X PUT http://localhost:3003/api/platforms/wazuh \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "extra_config": {
      "indexer_username": "admin",
      "indexer_password": "INDEXER_PASSWORD"
    }
  }'
```

## Verify from CLI

```bash
# Auth and get manager JWT
WAZUH_TOKEN=$(curl -sk -X POST \
  https://IP_WAZUH:55000/security/user/authenticate?raw=true \
  -H "Authorization: Basic $(echo -n 'wazuh-wui:PASSWORD' | base64)")

# List agents
curl -sk -H "Authorization: Bearer $WAZUH_TOKEN" \
  https://IP_WAZUH:55000/agents?limit=5 | python3 -m json.tool

# Query alerts via indexer
curl -sk -u admin:INDEXER_PASSWORD \
  "https://IP_WAZUH:9200/wazuh-alerts-4.x-*/_search?size=3" | python3 -m json.tool
```

## Available features

| Feature | Description |
|---|---|
| List agents | Status (active/disconnected/never_connected), OS, version |
| Recent alerts | Latest alerts by minimum level (configurable) |
| Automatic correlation | Extracts external IPs from critical alerts and investigates them |

## Known issues

- Agent `000` is the Wazuh Manager itself (not an external agent) — it appears in the `/agents` list but not in `/overview/agents`
- `extra_config` from MySQL arrives as a string — Gjallarhorn parses it automatically in `getPlatformCfg()`
- The correct path for agent count is `data.agent_status.connection.active` (not `data.active`)

---

<a id="español"></a>
# Wazuh — Configuración de Integración

## ¿Qué aporta?
SIEM / plataforma de monitoreo de seguridad. Gjallarhorn accede a la lista de agentes y a las alertas recientes (via OpenSearch indexer).

## Versión soportada

Wazuh **4.x** (probado con 4.7.5).

## Arquitectura

Wazuh tiene dos componentes relevantes para la integración:

| Componente | Puerto | Auth | Función |
|---|---|---|---|
| Manager API | 55000 (HTTPS) | Basic → JWT | Listar agentes, overview |
| OpenSearch Indexer | 9200 (HTTPS) | Basic | Consultar alertas |

## Prerrequisitos

### 1. Abrir el indexer hacia la red

Por defecto, el OpenSearch indexer de Wazuh escucha solo en `127.0.0.1:9200`. Para que Gjallarhorn pueda consultarlo remotamente:

```bash
# En la VM de Wazuh
sudo sed -i 's/network.host: "127.0.0.1"/network.host: "0.0.0.0"/' \
  /etc/wazuh-indexer/opensearch.yml
sudo systemctl restart wazuh-indexer
```

### 2. Obtener la contraseña de wazuh-wui

```bash
# En la VM de Wazuh
sudo cat /usr/share/wazuh-dashboard/data/wazuh/config/wazuh.yml | grep password
# → password: "tu_password_aqui"
```

### 3. Obtener la contraseña del indexer (usuario admin)

La contraseña del usuario `admin` del indexer está en `/etc/wazuh-indexer/opensearch-security/internal_users.yml` (bcrypt hash), o la podés encontrar/resetear con:

```bash
# Ver/cambiar contraseña del admin del indexer
sudo /usr/share/wazuh-indexer/plugins/opensearch-security/tools/securityadmin.sh \
  -cd /etc/wazuh-indexer/opensearch-security/ \
  -icl -nhnv -cacert /etc/wazuh-indexer/certs/root-ca.pem \
  -cert /etc/wazuh-indexer/certs/admin.pem \
  -key /etc/wazuh-indexer/certs/admin-key.pem
```

## Configurar en Gjallarhorn

`Configuración → Integraciones → Wazuh`:

| Campo | Valor |
|---|---|
| URL | `https://ip-wazuh:55000` |
| Usuario | `wazuh-wui` |
| Contraseña | la obtenida en el paso 2 |

Click **Probar conexión** → debe mostrar "Conectado".

### Configurar credenciales del indexer (extra_config)

Las credenciales del OpenSearch indexer se guardan en el campo `extra_config` de la base de datos. Desde una terminal en el servidor de Gjallarhorn:

```bash
TOKEN=$(curl -s -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"TU_PASS_ADMIN"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -X PUT http://localhost:3003/api/platforms/wazuh \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "extra_config": {
      "indexer_username": "admin",
      "indexer_password": "PASSWORD_DEL_INDEXER"
    }
  }'
```

## Verificar desde CLI

```bash
# Auth y obtener JWT del manager
WAZUH_TOKEN=$(curl -sk -X POST \
  https://IP_WAZUH:55000/security/user/authenticate?raw=true \
  -H "Authorization: Basic $(echo -n 'wazuh-wui:PASSWORD' | base64)")

# Listar agentes
curl -sk -H "Authorization: Bearer $WAZUH_TOKEN" \
  https://IP_WAZUH:55000/agents?limit=5 | python3 -m json.tool

# Consultar alertas via indexer
curl -sk -u admin:INDEXER_PASSWORD \
  "https://IP_WAZUH:9200/wazuh-alerts-4.x-*/_search?size=3" | python3 -m json.tool
```

## Funcionalidades disponibles

| Función | Descripción |
|---|---|
| Listar agentes | Estado (active/disconnected/never_connected), OS, versión |
| Alertas recientes | Últimas alertas por nivel mínimo (configurable) |
| Correlación automática | Extrae IPs externas de alertas críticas y las investiga |

## Problemas conocidos

- El agente `000` es el Wazuh Manager mismo (no un agente externo) — aparece en la lista de `/agents` pero no en `/overview/agents`
- `extra_config` de MySQL llega como string — Gjallarhorn lo parsea automáticamente en `getPlatformCfg()`
- El path correcto para el conteo de agentes es `data.agent_status.connection.active` (no `data.active`)
