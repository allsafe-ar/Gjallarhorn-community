# Gjallar — Blue Team Platform — Roadmap

## Versiones

| Versión | Alcance | Estado |
|---------|---------|--------|
| **v1.0** | Etapas 1–7: plataforma SOC consolidada, feature-parity con CABTA + integraciones SOC reales | **COMPLETADA ✓** |
| **v1.x** | Correcciones, mejoras UX, ajustes de estabilidad sobre v1.0 | En progreso |
| **v2.0** | Etapa 8: Agent Investigation — motor de análisis avanzado con playbooks automáticos | Planificada |

### v1.x — Mejoras pendientes (no críticas)
- OTX noise: falsos positivos SUSPICIOUS en hashes de test (MD5"hello", SHA256 vacío) y dominios de infraestructura compartida (amazon.com)
- Deduplicación de casos al crear desde análisis (evitar doble click)
- Posible whitelist de hashes/IPs "known-good" para reducir OTX noise

---

## Visión
Plataforma SOC que incorpora toda la funcionalidad de CABTA (adaptada a Node.js/React) más integración real con herramientas SOC (TheHive, Wazuh, Velociraptor, OpenVAS, Nessus). La seguridad y UX de AllSafe SGSI, la potencia analítica de CABTA, y la orquestación SOC como identidad propia de Gjallar.

---

## Arquitectura de Menú Final

```
├── Dashboard              ← métricas SOC unificadas (datos reales)
├── Investigación IOC      ← 20+ fuentes threat intel (≡ CABTA IOC Lookup)
├── Análisis de Archivos   ← malware, PE, scripts, beacons (≡ CABTA File Analysis)
├── Forense de Email       ← .eml phishing/BEC detection (≡ CABTA Email Forensics)
├── Plataformas SOC        ← TheHive / Wazuh / Velociraptor / OpenVAS / Nessus
│   ├── TheHive            ← casos, alertas
│   ├── Wazuh              ← agentes, alertas activas
│   ├── Velociraptor       ← clientes, hunts
│   └── OpenVAS / Nessus   ← scans, vulnerabilidades
├── Casos                  ← gestión de casos con notas y análisis linkados
├── Reportes               ← exportar JSON / HTML / MITRE ATT&CK
└── Configuración
    ├── API Keys           ← VirusTotal, Shodan, AbuseIPDB, OTX, GreyNoise, etc.
    ├── Plataformas        ← TheHive, Wazuh, Velociraptor, OpenVAS, Nessus (actual PlatformsView)
    ├── Usuarios           ← CRUD (actual UsersView, admin only)
    └── Audit Logs         ← (actual LogsView)
```

---

## Etapa 1 — Base + Auth + Dashboard de Conectividad
**Estado: COMPLETADA ✓** (v0.1)

- [x] Auth JWT 12h + TOTP 2FA + rate limiting + bloqueo 15min
- [x] RBAC: admin / analyst / viewer
- [x] Audit logs con auto-trim 5000 entradas
- [x] Dashboard con estado de conectividad de 5 plataformas
- [x] Config y test de conexión por plataforma
- [x] Gestión de usuarios (admin)
- [x] Setup y remoción de 2FA desde perfil
- [x] Cambio de contraseña

---

## Etapa 2 — Integraciones SOC Activas
**Estado: COMPLETADA ✓** (v0.2)

Conectar con las herramientas reales del SOC y mostrar datos en el Dashboard.
Esto es lo que CABTA no tiene — la identidad diferencial de Gjallar.

### Backend: módulos en `backend/integrations/`

**thehive.js**
- `getCases(limit)` → GET /api/case con filtro estado
- `getAlerts(limit)` → GET /api/alert
- `createCase(data)` → POST /api/case
- `createAlert(data)` → POST /api/alert
- `addObservable(caseId, data)` → POST /api/case/:id/observable

**wazuh.js**
- `getAgents()` → GET /agents con status active/disconnected
- `getAlerts(limit, minLevel)` → GET /alerts últimas alertas por severidad
- `getAgentAlerts(agentId, limit)` → GET /agents/:id/alerts
- `executeActiveResponse(agentId, command)` → POST /active-response

**velociraptor.js**
- `getClients()` → GET /api/v1/GetClients
- `getHunts()` → GET /api/v1/ListHunts
- `createHunt(artifact, params)` → POST /api/v1/CreateHunt
- `getHuntResults(huntId)` → GET /api/v1/GetHuntResults/:id
- `collectArtifact(clientId, artifact)` → POST /api/v1/CollectArtifact

**openvas.js**
- `getScans()` → GET /tasks
- `getResults(scanId)` → GET /results con filtro task_id
- `getTargets()` → GET /targets

**nessus.js**
- `getScans()` → GET /scans
- `getScanDetail(scanId)` → GET /scans/:id
- `getHosts(scanId)` → GET /scans/:id/hosts
- `getVulns(scanId)` → GET /scans/:id/vulnerabilities

### API Endpoints nuevos

```
GET /api/soc/thehive/cases
GET /api/soc/thehive/alerts
POST /api/soc/thehive/cases
GET /api/soc/wazuh/agents
GET /api/soc/wazuh/alerts
GET /api/soc/velociraptor/clients
GET /api/soc/velociraptor/hunts
POST /api/soc/velociraptor/hunts
GET /api/soc/openvas/scans
GET /api/soc/nessus/scans
GET /api/soc/dashboard/summary  ← métricas unificadas para el Dashboard
```

### Dashboard actualizado

Stats reales en el header:
- Casos abiertos TheHive (por severidad)
- Alertas Wazuh activas (últimas 24h, por nivel)
- Agentes Wazuh activos / inactivos
- Hunts Velociraptor en curso
- CVEs críticos pendientes (OpenVAS + Nessus)

Vistas nuevas en el frontend:
- `TheHiveView` — tabla de casos y alertas, botón crear caso
- `WazuhView` — tabla de agentes, alertas por agente
- `VelociraptorView` — clientes, hunts, botón lanzar hunt
- `OpenVASView` + `NessusView` — scans y vulnerabilidades

### DB nuevas tablas
```sql
-- Cache de datos SOC (polling cada 60s)
CREATE TABLE soc_cache (
  key_name VARCHAR(100) PRIMARY KEY,
  data     JSON,
  fetched_at DATETIME
);
```

---

## Etapa 3 — Investigación IOC
**Estado: COMPLETADA ✓** (v0.3)
*Equivalente a CABTA IOC Lookup — adaptado a Node.js con las mismas 20+ fuentes*

### Fuentes de threat intel (paralelas con Promise.allSettled)

**Premium (requieren API key):**
| Fuente | Tipos IOC | Qué retorna |
|--------|-----------|-------------|
| VirusTotal | IP, dominio, URL, hash | detecciones/total, score |
| AbuseIPDB | IP | confidence %, reportes |
| Shodan | IP | puertos, CVEs, detección C2 frameworks |
| AlienVault OTX | IP, dominio, URL, hash | pulses count |
| GreyNoise | IP | noise/riot classification |
| URLScan.io | URL, dominio | screenshot, veredicto |
| Criminal IP | IP | score, categoría |
| IPQualityScore | IP | fraud score, proxy/VPN |

**Free (sin API key):**
| Fuente | Tipos IOC |
|--------|-----------|
| Abuse.ch URLhaus | URL |
| Abuse.ch MalwareBazaar | hash |
| Abuse.ch ThreatFox | IP, dominio, URL, hash |
| Abuse.ch FeodoTracker | IP |
| C2 Trackers (10 feeds GitHub) | IP, dominio |
| Tor Exit Nodes | IP |
| Spamhaus | IP |
| PhishTank | URL |
| OpenPhish | URL |
| ThreatCrowd | IP, dominio |
| CIRCL MISP | dominio |
| Malpedia | hash |

### Enriquecimiento de dominio
- **Domain Age** (WHOIS): <7d crítico, <30d alto, <90d medio, <1y bajo
- **Detección DGA** (7 heurísticas): Shannon entropy ≥3.5, ratio consonante/vocal >0.65, n-gram analysis, length ≥20, digit ratio ≥15%, DGA family classification (Conficker, CryptoLocker, Necurs)

### Detección C2 en Shodan
Firmas en banners para: Cobalt Strike, Metasploit, Empire, Covenant, PoshC2, Sliver, Havoc, Brute Ratel, Mythic, Nighthawk

### Scoring
- 70-100: MALICIOUS
- 40-69: SUSPICIOUS
- 1-39: CLEAN
- 0: UNKNOWN

### Generación de reglas de detección
- **KQL** (Microsoft Sentinel / Defender)
- **SPL** (Splunk)
- **SIGMA** (universal)
- **YARA** (archivos)

### Exportación STIX 2.1
- Indicadores en formato estándar
- TLP marking (CLEAR / GREEN / AMBER / RED)
- Compatible con TAXII, OpenCTI, MISP

### Integración TheHive
- Botón "Crear caso en TheHive" si score ≥ umbral configurable (default 70)
- Agrega el IOC como observable al caso

### DB nuevas tablas
```sql
CREATE TABLE ioc_investigations (
  id          VARCHAR(36) PRIMARY KEY,
  ts          DATETIME DEFAULT NOW(),
  ioc_value   VARCHAR(500),
  ioc_type    ENUM('ipv4','domain','url','hash','email','cve'),
  threat_score INT,
  verdict     ENUM('MALICIOUS','SUSPICIOUS','CLEAN','UNKNOWN'),
  sources_data JSON,
  analyst     VARCHAR(100),
  thehive_case_id VARCHAR(100)
);

-- API keys de threat intel (separado de platform_configs)
-- Se agrega columna a tabla settings o tabla nueva api_keys:
CREATE TABLE api_keys (
  service    VARCHAR(50) PRIMARY KEY,
  key_value  TEXT,
  enabled    BOOLEAN DEFAULT TRUE,
  updated_at DATETIME,
  updated_by VARCHAR(100)
);
```

### API Endpoints
```
POST /api/ioc/investigate        ← { ioc: "1.2.3.4" } → resultado completo
GET  /api/ioc/history            ← investigaciones pasadas
GET  /api/ioc/:id                ← resultado de una investigación
POST /api/ioc/:id/create-case    ← crear caso en TheHive desde IOC
GET  /api/ioc/:id/rules          ← reglas de detección generadas
GET  /api/ioc/:id/stix           ← exportar STIX 2.1
GET  /api/ioc/:id/report         ← reporte HTML
```

---

## Etapa 4 — Análisis de Archivos
**Estado: COMPLETADA ✓** (v0.4)
*Equivalente a CABTA File Analysis — adaptado a Node.js*

### Tipos de archivo soportados

| Tipo | Análisis |
|------|---------|
| PE (.exe, .dll, .sys) | entropy, secciones, imports, exports, strings, packer detection, timestamps |
| Scripts (.ps1, .bat, .js, .vbs) | deobfuscación, extracción IOC, patrones sospechosos |
| Documentos Office | macros, OLE streams, objetos embebidos |
| PDF | scripts embebidos, objetos sospechosos |
| APK | permisos, APIs sospechosas, obfuscación |
| Archivos (.zip, .rar, .7z) | extracción anidada, path traversal, contenido sospechoso |
| Binarios genéricos | strings, entropy, IOC extraction |

### Detecciones especiales
- **Ransomware**: constantes AES/ChaCha20/RSA, notas de rescate (README*.txt, DECRYPT*.txt), patrones VSS deletion, referencias Bitcoin/Onion
- **Cobalt Strike Beacon**: XOR decryption (0x69, 0x2E), TLV config parsing, extracción de C2 servers
- **C2 Frameworks**: firmas de Metasploit meterpreter, Empire, Sliver, Havoc

### Deobfuscadores
- PowerShell: base64, char codes, IEX, concatenación
- JavaScript: eval chains, hex encoding, Unicode escapes
- Batch/CMD: variable substitution, carets, escape sequences
- VBScript: Chr(), Asc(), Execute()

### Lookup en threat intel
- Hash MD5/SHA1/SHA256 consultado automáticamente en VirusTotal, MalwareBazaar, ThreatFox
- Si score alto → botón "Crear caso en TheHive"

### DB nuevas tablas
```sql
CREATE TABLE file_analyses (
  id           VARCHAR(36) PRIMARY KEY,
  ts           DATETIME DEFAULT NOW(),
  filename     VARCHAR(500),
  file_size    INT,
  md5          VARCHAR(32),
  sha1         VARCHAR(40),
  sha256       VARCHAR(64),
  file_type    VARCHAR(50),
  threat_score INT,
  verdict      ENUM('MALICIOUS','SUSPICIOUS','CLEAN','UNKNOWN'),
  analysis_data JSON,
  analyst      VARCHAR(100),
  thehive_case_id VARCHAR(100)
);
```

### API Endpoints
```
POST /api/files/analyze          ← multipart/form-data con el archivo
GET  /api/files/history
GET  /api/files/:id
POST /api/files/:id/create-case
GET  /api/files/:id/report
```

---

## Etapa 5 — Forense de Email
**Estado: COMPLETADA ✓** (v0.5)
*Equivalente a CABTA Email Forensics — adaptado a Node.js*

### Análisis de autenticación
- **SPF**: extracción y validación del registro SPF
- **DKIM**: verificación de firma
- **DMARC**: chequeo de alineación
- **ARC**: cadena de autenticación recibida

### Análisis forense de headers
- Cadena de Received headers (routing, timing, hop profiling)
- Detección de inconsistencias de timezone
- Reply-To domain mismatch
- Message-ID format validation
- Geolocalización de IP originante

### Detección de phishing (10+ checks)
- Brand impersonation (lista de marcas conocidas)
- Lookalike domains (typosquatting, homograph, subdomain tricks)
- Hyperlink integrity (href vs. texto visible mismatch)
- Display name vs. sender domain mismatch
- URL shorteners y redirect chains
- Tracking pixels y beacons
- Formularios ocultos y CSS obfuscado (zero-size fonts, white-on-white)
- Contenido base64 sospechoso
- Presencia de QR codes
- Carga de recursos externos

### Detección BEC (Business Email Compromise)
- Patrones de urgencia ("urgent", "asap", "confidential")
- Patrones financieros (wire transfer, routing number, gift cards, crypto)
- Impersonación ejecutiva (CEO, CFO, Chairman + "on behalf of")
- Free email providers spoofing (gmail/yahoo desde título ejecutivo)
- Reply-To domain mismatch
- Scoring compuesto: categorías con multiplicadores

### IOC extraction del email
- IPs en headers → lookup automático en threat intel
- Dominios en links → lookup
- Hashes de adjuntos → MalwareBazaar

### Generación de reglas de email
- Microsoft 365 / Exchange Online Protection
- FortiMail content filters
- Proofpoint protection rules
- Mimecast policy configurations

### DB nuevas tablas
```sql
CREATE TABLE email_analyses (
  id           VARCHAR(36) PRIMARY KEY,
  ts           DATETIME DEFAULT NOW(),
  subject      VARCHAR(1000),
  sender       VARCHAR(500),
  recipient    VARCHAR(500),
  verdict      ENUM('MALICIOUS','SUSPICIOUS','CLEAN','UNKNOWN'),
  bec_detected BOOLEAN DEFAULT FALSE,
  phishing_score INT,
  analysis_data  JSON,
  analyst        VARCHAR(100),
  thehive_case_id VARCHAR(100)
);
```

### API Endpoints
```
POST /api/emails/analyze         ← multipart/form-data con .eml
GET  /api/emails/history
GET  /api/emails/:id
POST /api/emails/:id/create-case
GET  /api/emails/:id/report
GET  /api/emails/:id/rules       ← reglas para M365, FortiMail, Proofpoint
```

---

## Etapa 6 — Gestión de Casos y Reportes
**Estado: COMPLETADA ✓** (v0.6)
*Equivalente a CABTA Cases + Reports — extendido con integración TheHive*

### Casos en Gjallar (internos)
- Crear caso manual o desde cualquier análisis (IOC / archivo / email)
- Listar casos con filtros (estado, severidad, analista)
- Agregar notas con timestamp
- Linkear múltiples análisis a un mismo caso
- Cambiar estado: open / investigating / resolved / closed
- Push opcional a TheHive (crear/actualizar caso espejo)

### Reportes
- **JSON**: datos crudos del análisis
- **HTML**: reporte visual con veredicto, fuentes, IOCs, reglas
- **MITRE ATT&CK Navigator**: layer JSON con técnicas detectadas

### DB nuevas tablas
```sql
CREATE TABLE cases (
  id          VARCHAR(36) PRIMARY KEY,
  ts          DATETIME DEFAULT NOW(),
  title       VARCHAR(500),
  description TEXT,
  severity    ENUM('low','medium','high','critical'),
  status      ENUM('open','investigating','resolved','closed'),
  created_by  VARCHAR(100),
  thehive_case_id VARCHAR(100)
);

CREATE TABLE case_analyses (
  case_id     VARCHAR(36),
  analysis_id VARCHAR(36),
  analysis_type ENUM('ioc','file','email'),
  linked_at   DATETIME,
  PRIMARY KEY (case_id, analysis_id)
);

CREATE TABLE case_notes (
  id       VARCHAR(36) PRIMARY KEY,
  case_id  VARCHAR(36),
  ts       DATETIME DEFAULT NOW(),
  content  TEXT,
  author   VARCHAR(100)
);
```

### API Endpoints
```
POST /api/cases
GET  /api/cases
GET  /api/cases/:id
PATCH /api/cases/:id
POST /api/cases/:id/notes
POST /api/cases/:id/analyses    ← linkear análisis
POST /api/cases/:id/push-thehive
GET  /api/reports/:analysisType/:id/json
GET  /api/reports/:analysisType/:id/html
GET  /api/reports/:analysisType/:id/mitre
```

---

## Etapa 7 — Correlación y Orquestación
**Estado: COMPLETADA ✓** (v1.0)
*Funcionalidad exclusiva de Gjallar — no existe en CABTA*

### Correlaciones automáticas

**Wazuh → IOC → TheHive:**
- Polling de alertas Wazuh críticas (nivel ≥ 12) cada 5 min
- Extracción de IPs/dominios de los campos de alerta
- Enriquecimiento automático en threat intel
- Si score ≥ 70 → crear caso en TheHive automáticamente
- Agrega el IOC como observable + datos del agente afectado

**OpenVAS/Nessus → Wazuh → TheHive:**
- Import de CVEs críticos (CVSS ≥ 9.0) desde scans
- Match de host IP con agente Wazuh
- Si agente activo → agregar al caso del agente en TheHive

**Velociraptor → Wazuh:**
- Resultados de hunt → correlacionar con alertas Wazuh del mismo agente
- Timeline unificado por host

### Dashboard unificado (polling configurable, default 60s)
- Gráfico de actividad analítica (IOC/archivo/email por día)
- Timeline de eventos cruzados (Wazuh + TheHive + Velociraptor)
- Alertas críticas en tiempo real
- Estado de correlaciones activas

### Playbooks simples (sin YAML, configurables desde UI)
- Trigger: alerta Wazuh ≥ nivel X
  → extraer IOCs → enriquecer → si score ≥ Y crear caso TheHive → lanzar hunt Velociraptor
- Trigger: scan Nessus completado
  → importar CVEs ≥ CVSS X → crear caso por host

### DB nuevas tablas
```sql
CREATE TABLE events_timeline (
  id           VARCHAR(36) PRIMARY KEY,
  ts           DATETIME DEFAULT NOW(),
  source       ENUM('thehive','wazuh','velociraptor','openvas','nessus','ioc','file','email'),
  event_type   VARCHAR(100),
  severity     ENUM('low','medium','high','critical'),
  data         JSON,
  correlated_ids JSON
);

CREATE TABLE playbook_configs (
  id          VARCHAR(36) PRIMARY KEY,
  name        VARCHAR(200),
  enabled     BOOLEAN DEFAULT TRUE,
  trigger_type ENUM('wazuh_alert','nessus_scan','manual'),
  config      JSON,
  created_by  VARCHAR(100),
  created_at  DATETIME
);
```

---

## Reestructura de Configuración (Etapa 2 en adelante)

Mover el menú actual de "Plataformas" dentro de "Configuración":

```
Configuración
├── API Keys           ← nueva tabla api_keys en DB
│   ├── VirusTotal
│   ├── AbuseIPDB
│   ├── Shodan
│   ├── AlienVault OTX
│   ├── GreyNoise
│   ├── URLScan.io
│   ├── Criminal IP
│   ├── IPQualityScore
│   └── Abuse.ch (ThreatFox)
├── Plataformas SOC    ← actual PlatformsView sin cambios de lógica
│   ├── TheHive
│   ├── Wazuh
│   ├── Velociraptor
│   ├── OpenVAS
│   └── Nessus
├── Usuarios           ← actual UsersView
└── Audit Logs         ← actual LogsView
```

---

## Comparativa Final: CABTA vs Gjallar

| Funcionalidad | CABTA | Gjallar |
|---|---|---|
| IOC Investigation (20+ fuentes) | ✓ | ✓ Etapa 3 |
| File Analysis (PE, scripts, docs) | ✓ | ✓ Etapa 4 |
| Email Forensics (phishing, BEC) | ✓ | ✓ Etapa 5 |
| Generación de reglas (KQL, SPL, SIGMA, YARA) | ✓ | ✓ Etapa 3+4+5 |
| STIX 2.1 export | ✓ | ✓ Etapa 3 |
| Casos internos | ✓ | ✓ Etapa 6 |
| Reportes HTML/JSON/MITRE | ✓ | ✓ Etapa 6 |
| Settings > API Keys | ✓ | ✓ Etapa 2 (reestructura) |
| Agent Investigation (AI) | ✓ Python/motor local | — futuro |
| Playbooks YAML | ✓ | simplificado Etapa 7 |
| TheHive integration | ✗ | ✓ Etapa 2 |
| Wazuh integration | ✗ | ✓ Etapa 2 |
| Velociraptor integration | ✗ | ✓ Etapa 2 |
| OpenVAS / Nessus | ✗ | ✓ Etapa 2 |
| Correlación Wazuh→TheHive | ✗ | ✓ Etapa 7 |
| Correlación Nessus→Wazuh | ✗ | ✓ Etapa 7 |
| JWT + 2FA + RBAC | ✗ | ✓ Etapa 1 (hecho) |
| Audit logs | ✗ | ✓ Etapa 1 (hecho) |
| Multi-usuario con roles | ✗ | ✓ Etapa 1 (hecho) |

---

---

## Etapa 8 — Agent Investigation (v2.0)
**Estado: PLANIFICADA — post v1.0**

Investigación autónoma con IA. El analista describe un objetivo en lenguaje natural y el agente ejecuta un ciclo THINK → ACT → OBSERVE de forma autónoma, usando todas las herramientas de Gjallar como instrumentos.

### Modelo de razonamiento
- Loop ReAct (Reasoning + Acting): el agente razona qué herramienta usar, la ejecuta, observa el resultado y decide el próximo paso
- Motor de análisis configurable (local o cloud)
- Límite configurable de pasos (default 50, máx 200)
- Human-in-the-loop: pausa para aprobación en acciones de alto impacto (crear caso, lanzar hunt)
- Timeout de aprobación: 30 minutos antes de cancelar automáticamente

### Herramientas disponibles para el agente
- Todas las funciones de Investigación IOC
- Análisis de archivos y email por hash/indicador
- Consulta de casos TheHive y alertas Wazuh
- Lanzamiento de hunts en Velociraptor (con aprobación)
- Creación de casos en TheHive (con aprobación)
- Consulta de vulnerabilidades OpenVAS/Nessus por host

### Memoria del agente
- Cache de IOCs investigados (TTL 24h) en DB
- Historial de sesiones de investigación con resultados
- Detección de patrones recurrentes entre sesiones
- Correlación automática con investigaciones previas del mismo IOC

### Playbooks avanzados (YAML desde UI)
- Definición de flujos condicionales: `if score > 70 → create_case`
- Iteración sobre listas: `for each agent in wazuh_agents`
- Soporte de variables: `{{ioc}}`, `{{agent_id}}`, `{{case_id}}`
- Anidamiento de playbooks
- Branching on-success / on-failure
- Timeouts y guards por paso

### Chat de investigación
- Interfaz de chat donde el analista da instrucciones en español
- El agente responde con pasos ejecutados, evidencia y veredicto
- Sesiones guardadas y consultables
- Exportar conversación como reporte

### DB nuevas tablas
```sql
CREATE TABLE agent_sessions (
  id           VARCHAR(36) PRIMARY KEY,
  ts           DATETIME DEFAULT NOW(),
  goal         TEXT,
  status       ENUM('running','paused','completed','cancelled'),
  steps_taken  INT DEFAULT 0,
  verdict      TEXT,
  full_log     JSON,
  analyst      VARCHAR(100)
);

CREATE TABLE agent_memory (
  ioc_value    VARCHAR(500) PRIMARY KEY,
  ioc_type     VARCHAR(20),
  last_seen    DATETIME,
  times_seen   INT DEFAULT 1,
  last_verdict VARCHAR(20),
  cached_data  JSON,
  expires_at   DATETIME
);

CREATE TABLE playbook_runs (
  id           VARCHAR(36) PRIMARY KEY,
  playbook_id  VARCHAR(36),
  ts           DATETIME DEFAULT NOW(),
  status       ENUM('running','completed','failed','cancelled'),
  steps_log    JSON,
  analyst      VARCHAR(100)
);
```

### API Endpoints
```
POST /api/agent/investigate          ← { goal: "Investigar IP 1.2.3.4..." }
GET  /api/agent/sessions
GET  /api/agent/sessions/:id
POST /api/agent/sessions/:id/approve ← human-in-the-loop
POST /api/agent/sessions/:id/cancel
POST /api/chat                       ← mensaje al agente en sesión activa
GET  /api/chat/sessions/:id
GET  /api/agent/memory/:ioc
GET  /api/playbooks
POST /api/playbooks/:id/run
GET  /api/playbooks/:id/runs/:runId
```

---

## Notas de Implementación

- Todas las llamadas a APIs externas: `Promise.allSettled()` con timeout 15s individual
- Archivos: multer para upload, análisis en Node.js nativo (sin binarios externos)
- Análisis PE: librería `pe-parser` o implementación propia en JS
- Deobfuscación: regex patterns portados de Python a JS (1:1 funcional)
- Email parsing: librería `mailparser` para .eml
- Scoring: mismo sistema de pesos que CABTA portado a JS
- DGA detection: algoritmos portados 1:1 de Python (no requieren librerías externas)
- Domain age: WHOIS vía `whois` npm package o rdap.org API
- C2 feeds: fetch en paralelo con cache en DB (TTL 1 hora)
- Reportes HTML: plantilla generada en Node.js con los datos del análisis
- STIX: generación manual de JSON siguiendo spec 2.1 (sin librería)
