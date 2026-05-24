🇬🇧 [English](#english) · 🇪🇸 [Español](#español)

---

<a id="english"></a>
# OpenVAS / GVM — Integration Configuration

## What it provides
Open-source vulnerability scanner by Greenbone. Gjallarhorn can list scans (tasks) and detected vulnerabilities.

## Why a proxy is needed

gsad (the GVM web server on port 9392) is a **React SPA** that returns HTML for all routes — it does not expose a JSON REST API.

The native GVM protocol is **GMP** (Greenbone Management Protocol), an XML protocol over a Unix socket at `/run/gvmd/gvmd.sock`. It is not accessible via TCP directly without configuring TLS with custom CA certificates.

**Solution:** install a small Python HTTP proxy on the OpenVAS VM that translates REST JSON calls ↔ GMP XML via the Unix socket.

## Supported version

GVM 22.x / gsad 24.x (tested with GVM 22.7 on Debian 12).

## Proxy installation (on the OpenVAS VM)

### 1. Install python-gvm

```bash
pip3 install gvm-tools
```

### 2. Create the proxy script

Download `gvm_proxy.py` from the `docs/integrations/` directory of this repo and copy it:

```bash
sudo cp gvm_proxy.py /usr/local/bin/gvm_proxy.py
sudo chmod 755 /usr/local/bin/gvm_proxy.py
```

### 3. Create the systemd service

```bash
sudo tee /etc/systemd/system/gvm-proxy.service << 'EOF'
[Unit]
Description=GVM HTTP Proxy for Gjallarhorn
After=gvmd.service
Requires=gvmd.service

[Service]
Type=simple
User=gvm
Group=gvm
Environment=GMP_USER=admin
Environment=GMP_PASS=YOUR_GMP_PASSWORD
ExecStart=/usr/bin/python3 /usr/local/bin/gvm_proxy.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable gvm-proxy
sudo systemctl start gvm-proxy
```

### 4. Verify the proxy

```bash
# From the OpenVAS VM
curl -s -H 'Authorization: Bearer YOUR_GMP_PASSWORD' \
  http://127.0.0.1:9391/api/v1/health
# → {"status": "ok"}

# From the Gjallarhorn server
curl -s -H 'Authorization: Bearer YOUR_GMP_PASSWORD' \
  http://IP_OPENVAS:9391/api/v1/health
# → {"status": "ok"}
```

## Configure in Gjallarhorn

`Settings → Integrations → OpenVAS / GVM`:

| Field | Value |
|---|---|
| URL | `http://ip-openvas:9391` (the PROXY, not the UI) |
| GMP Password | the GVM admin user password |

Click **Test Connection** → should show "Connected".

## Proxy endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Proxy status and GMP connection |
| GET | `/api/v1/tasks` | List of scans (tasks) |
| GET | `/api/v1/tasks/:id/results` | Vulnerabilities from a scan |
| GET | `/api/v1/results` | All vulns (last 200) |
| GET | `/api/v1/reports` | Generated reports |
| GET | `/api/v1/configs` | Scan configurations |
| GET | `/api/v1/targets` | Defined targets |
| POST | `/api/v1/tasks` | Create scan |
| POST | `/api/v1/tasks/:id/start` | Start scan |

## Known issues

- **Initial gvmd sync**: on first start, gvmd can take **hours** synchronizing the NVT feed (SCAP data). During this time endpoints return empty lists — this is normal. Wait until `systemctl status gvmd` shows only the main process.
- **gvm-proxy 500 "Connection refused"**: occurs if gvmd restarted and the socket is not yet available. The service recovers automatically after a few seconds.
- `python-gvm` v26: `UnixSocketConnection` requires `path=` as a keyword argument — `UnixSocketConnection(path='/run/gvmd/gvmd.sock')`
- `Gmp.authenticate()` only exists inside the context manager: `with Gmp(...) as g: g.authenticate(...)`

---

<a id="español"></a>
# OpenVAS / GVM — Configuración de Integración

## ¿Qué aporta?
Escáner de vulnerabilidades open-source de Greenbone. Gjallarhorn puede listar scans (tasks) y vulnerabilidades detectadas.

## Por qué se necesita un proxy

gsad (el servidor web de GVM en el puerto 9392) es una **SPA React** que devuelve HTML para todas las rutas — no expone una REST API JSON.

El protocolo nativo de GVM es **GMP** (Greenbone Management Protocol), un protocolo XML sobre Unix socket en `/run/gvmd/gvmd.sock`. No es accesible por TCP directamente sin configurar TLS con certificados CA propios.

**Solución:** instalar un pequeño proxy HTTP Python en la VM de OpenVAS que traduce llamadas REST JSON ↔ GMP XML via el socket Unix.

## Versión soportada

GVM 22.x / gsad 24.x (probado con GVM 22.7 en Debian 12).

## Instalación del proxy (en la VM de OpenVAS)

### 1. Instalar python-gvm

```bash
pip3 install gvm-tools
```

### 2. Crear el script del proxy

Descargar `gvm_proxy.py` del directorio `docs/integrations/` de este repo y copiarlo:

```bash
sudo cp gvm_proxy.py /usr/local/bin/gvm_proxy.py
sudo chmod 755 /usr/local/bin/gvm_proxy.py
```

### 3. Crear el servicio systemd

```bash
sudo tee /etc/systemd/system/gvm-proxy.service << 'EOF'
[Unit]
Description=GVM HTTP Proxy for Gjallarhorn
After=gvmd.service
Requires=gvmd.service

[Service]
Type=simple
User=gvm
Group=gvm
Environment=GMP_USER=admin
Environment=GMP_PASS=TU_PASSWORD_GMP
ExecStart=/usr/bin/python3 /usr/local/bin/gvm_proxy.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable gvm-proxy
sudo systemctl start gvm-proxy
```

### 4. Verificar el proxy

```bash
# Desde la VM de OpenVAS
curl -s -H 'Authorization: Bearer TU_PASSWORD_GMP' \
  http://127.0.0.1:9391/api/v1/health
# → {"status": "ok"}

# Desde el servidor de Gjallarhorn
curl -s -H 'Authorization: Bearer TU_PASSWORD_GMP' \
  http://IP_OPENVAS:9391/api/v1/health
# → {"status": "ok"}
```

## Configurar en Gjallarhorn

`Configuración → Integraciones → OpenVAS / GVM`:

| Campo | Valor |
|---|---|
| URL | `http://ip-openvas:9391` (el PROXY, no la UI) |
| GMP Password | la contraseña del usuario admin de GVM |

Click **Probar conexión** → debe mostrar "Conectado".

## Endpoints del proxy

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1/health` | Estado del proxy y conexión GMP |
| GET | `/api/v1/tasks` | Lista de scans (tasks) |
| GET | `/api/v1/tasks/:id/results` | Vulnerabilidades de un scan |
| GET | `/api/v1/results` | Todas las vulns (últimas 200) |
| GET | `/api/v1/reports` | Reportes generados |
| GET | `/api/v1/configs` | Configuraciones de scan |
| GET | `/api/v1/targets` | Objetivos definidos |
| POST | `/api/v1/tasks` | Crear scan |
| POST | `/api/v1/tasks/:id/start` | Iniciar scan |

## Problemas conocidos

- **gvmd sync inicial**: en el primer arranque, gvmd puede tardar **horas** sincronizando el feed NVT (SCAP data). Durante este tiempo los endpoints devuelven listas vacías — es normal. Esperar a que `systemctl status gvmd` muestre solo el proceso principal.
- **gvm-proxy 500 "Connection refused"**: ocurre si gvmd se reinició y el socket no está disponible aún. El servicio se recupera solo tras unos segundos.
- `python-gvm` v26: `UnixSocketConnection` requiere `path=` como keyword arg — `UnixSocketConnection(path='/run/gvmd/gvmd.sock')`
- `Gmp.authenticate()` solo existe dentro del context manager: `with Gmp(...) as g: g.authenticate(...)`
