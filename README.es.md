[![English](https://img.shields.io/badge/lang-en-blue)](README.md)

<div align="center">
  <img src="logo.png" alt="Gjallarhorn Logo" width="500"/>

  # Gjallarhorn Community — Blue Team Platform

  **Plataforma SOC open-source para operaciones Blue Team**

  *Powered by [AllSafe Security Solutions](https://www.allsafe.com.ar)*

  ![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)
  ![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
  ![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?style=flat-square&logo=mysql&logoColor=white)
  ![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square)
  ![Version](https://img.shields.io/badge/Version-Community-blue?style=flat-square)
</div>

---

Gjallarhorn Community es una plataforma SOC gratuita y open-source para operaciones Blue Team — integra investigación de amenazas, análisis de malware, forense de email, gestión de casos e integraciones con herramientas SOC en una única interfaz.

> El nombre proviene del Gjallarhorn — el cuerno de Heimdall en la mitología nórdica. Cuando suena, advierte al ejército de los dioses del peligro inminente.

---

## ¿Qué es Gjallarhorn Community?

Gjallarhorn Community incluye:

- **20+ fuentes de Threat Intelligence** (VirusTotal, Shodan, AbuseIPDB, AlienVault OTX, GreyNoise, Criminal IP y más) para investigar IPs, dominios, URLs y hashes
- **Integraciones SOC**: Wazuh, Velociraptor y OpenVAS/GVM
- **Análisis estático de archivos**: ejecutables PE, scripts PowerShell/Batch/VBS, documentos Office, PDFs — con detección de ransomware, Cobalt Strike beacon y frameworks C2
- **Forense de email**: análisis SPF/DKIM/DMARC, detección de phishing y BEC (Business Email Compromise)
- **Gestión de casos** con notas, análisis vinculados y adjuntos
- **Generación de reglas de detección**: KQL (Sentinel/Defender), SPL (Splunk), SIGMA, YARA
- **Exportación STIX 2.1** para compartir inteligencia en formato estándar
- **Auth**: JWT (12h), TOTP 2FA (RFC 6238), lockout de cuenta, control de acceso por rol (`admin` / `analyst` / `viewer`)

> ¿Buscás **campañas de phishing por email**, **phishing WiFi (Munin)**, **TheHive**, **Nessus**, **análisis con IA** o **playbooks de correlación automática**? Esas funcionalidades están disponibles en [Gjallarhorn Pro](https://www.allsafe.com.ar).

---

## Screenshots

<div align="center">

**Dashboard Principal**
<br/>
<img src="screenshots/dashboard.png" alt="Dashboard Principal" width="900"/>

<br/><br/>

| **Investigación IOC** | **Análisis de Archivos** |
|:---:|:---:|
| <img src="screenshots/investigacion-ioc.png" alt="Investigación IOC" width="440"/> | <img src="screenshots/analisis-archivos.png" alt="Análisis de Archivos" width="440"/> |

<br/>

| **Forense de Email** | **Casos** |
|:---:|:---:|
| <img src="screenshots/forense-email.png" alt="Forense de Email" width="440"/> | <img src="screenshots/casos.png" alt="Casos" width="440"/> |

<br/>

**Configuración de Integraciones**
<br/>
<img src="screenshots/configuracion.png" alt="Configuración" width="900"/>

</div>

---

## Características principales

### Investigación IOC
- Consultas paralelas a 20+ fuentes usando `Promise.allSettled()`
- Scoring automático 0–100 con veredicto CLEAN / SUSPICIOUS / MALICIOUS / UNKNOWN
- Detección DGA (Domain Generation Algorithm) con 7 heurísticas: entropía Shannon, ratio consonante/vocal, bigramas raros, familias DGA conocidas (GameOverZeus, Qakbot, Suppobox)
- Detección C2 en banners Shodan: Cobalt Strike, Metasploit, Empire, Sliver, Havoc, Mythic y más
- Edad de dominio via WHOIS (dominios <7 días reciben penalización máxima)
- Generación automática de reglas KQL, SPL, SIGMA y YARA

### Integración SOC
| Plataforma | Funcionalidad |
|---|---|
| Wazuh | Agentes, alertas (via indexer OpenSearch en :9200) |
| Velociraptor | Clientes, hunts, flujos de artifacts |
| OpenVAS / GVM | Scans y vulnerabilidades (via proxy GMP en :9391) |

### Análisis de Archivos
- Ejecutables PE: entropía, secciones, imports/exports, detección de packers
- Scripts: PowerShell, Batch, JavaScript, VBScript — deobfuscación y extracción de IOCs
- Documentos: Office (macros, OLE), PDF
- Detección de ransomware: constantes AES/ChaCha20, ransom notes, eliminación de VSS
- Detección de Cobalt Strike Beacon: descifrado XOR, parsing de config, extracción de C2

### Forense de Email
- Análisis SPF, DKIM, DMARC, ARC
- Cadena de headers Received y geolocalización
- 10+ checks de detección de phishing: brand impersonation, lookalike domains, hyperlink mismatch
- Detección BEC: patrones de urgencia, lenguaje financiero, suplantación de ejecutivos
- Extracción automática de IOCs (IPs, dominios, hashes de adjuntos)

### Gestión de Incidentes
- **Casos**: ciclo de vida completo (abierto → investigando → resuelto → cerrado), notas, observables, adjuntos
- **Timeline**: registro cronológico unificado de todos los eventos del sistema (IOCs, análisis, alertas, casos)

---

## Community vs Pro

| Funcionalidad | Community | Pro |
|---|:---:|:---:|
| Investigación IOC (20+ fuentes) | ✅ | ✅ |
| Análisis de archivos | ✅ | ✅ |
| Forense de email | ✅ | ✅ |
| Casos y Timeline | ✅ | ✅ |
| Integración Wazuh | ✅ | ✅ |
| Integración Velociraptor | ✅ | ✅ |
| Integración OpenVAS / GVM | ✅ | ✅ |
| TOTP 2FA + lockout de cuenta | ✅ | ✅ |
| Roles: admin / analyst / viewer | ✅ | ✅ |
| Audit log | ✅ | ✅ |
| Campañas de phishing por email | ❌ | ✅ |
| Phishing WiFi / evil twin (Munin) | ❌ | ✅ |
| Módulo de capacitaciones presenciales | ❌ | ✅ |
| Integración TheHive | ❌ | ✅ |
| Integración Nessus | ❌ | ✅ |
| Playbooks de correlación automática | ❌ | ✅ |
| Motor de análisis avanzado | ❌ | ✅ |
| Exportación PDF para informes de auditoría | ❌ | ✅ |

> **Upgrade path**: Community y Pro comparten el mismo esquema de base de datos. Actualizar = reemplazar archivos + `npm install` + `pm2 restart`. Sin migraciones.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + Express |
| Frontend | React 18 + Vite |
| Base de datos | MySQL 8.0+ o MariaDB 10.6+ |
| Auth | JWT (12h) + TOTP 2FA |
| Servidor web | Nginx |
| Process manager | PM2 |

---

## Documentación

### Instalación
- [Guía de instalación completa](INSTALL.md)

### Configuración de API Keys (Threat Intelligence)
| Servicio | Documentación |
|---|---|
| VirusTotal | [docs/api-keys/virustotal.md](docs/api-keys/virustotal.md) |
| AbuseIPDB | [docs/api-keys/abuseipdb.md](docs/api-keys/abuseipdb.md) |
| Shodan | [docs/api-keys/shodan.md](docs/api-keys/shodan.md) |
| AlienVault OTX | [docs/api-keys/alienvault-otx.md](docs/api-keys/alienvault-otx.md) |
| GreyNoise | [docs/api-keys/greynoise.md](docs/api-keys/greynoise.md) |
| URLScan.io | [docs/api-keys/urlscan.md](docs/api-keys/urlscan.md) |
| Criminal IP | [docs/api-keys/criminalip.md](docs/api-keys/criminalip.md) |
| IPQualityScore | [docs/api-keys/ipqualityscore.md](docs/api-keys/ipqualityscore.md) |
| Abuse.ch (ThreatFox / MalwareBazaar / URLhaus) | [docs/api-keys/abusech.md](docs/api-keys/abusech.md) |
| Hybrid Analysis | [docs/api-keys/hybrid-analysis.md](docs/api-keys/hybrid-analysis.md) |

### Configuración de Integraciones SOC
| Plataforma | Documentación |
|---|---|
| Wazuh | [docs/integrations/wazuh.md](docs/integrations/wazuh.md) |
| Velociraptor | [docs/integrations/velociraptor.md](docs/integrations/velociraptor.md) |
| OpenVAS / GVM | [docs/integrations/openvas.md](docs/integrations/openvas.md) |

---

## Agradecimientos

Gjallarhorn no sería posible sin el trabajo de las siguientes organizaciones y proyectos open-source:

- [MITRE ATT&CK](https://attack.mitre.org/) — framework de tácticas y técnicas adversariales
- [Wazuh](https://wazuh.com/) — plataforma SIEM open-source de detección de amenazas
- [Velociraptor](https://docs.velociraptor.app/) — plataforma DFIR para recolección remota de artifacts
- [Greenbone / OpenVAS](https://www.greenbone.net/) — scanner de vulnerabilidades open-source
- [VirusTotal](https://www.virustotal.com/) — análisis de archivos e indicadores de amenazas
- [Abuse.ch](https://abuse.ch/) — feeds de inteligencia gratuitos: ThreatFox, MalwareBazaar y URLhaus
- [AbuseIPDB](https://www.abuseipdb.com/) — base de datos colaborativa de IPs maliciosas
- [Shodan](https://www.shodan.io/) — motor de búsqueda de dispositivos expuestos a internet
- [AlienVault OTX](https://otx.alienvault.com/) — plataforma colaborativa de threat intelligence
- [GreyNoise](https://www.greynoise.io/) — clasificación de ruido de internet vs. amenazas reales

---

## Aviso Legal

Gjallarhorn está diseñado exclusivamente para su uso en entornos autorizados: investigación de seguridad, operaciones Blue Team y análisis forense sobre infraestructura propia o con permiso explícito del propietario.

Analizar indicadores, archivos o sistemas sin autorización puede constituir una violación legal en muchas jurisdicciones. Los autores no asumen responsabilidad alguna por el uso indebido de esta herramienta.

---

## Autor

Creado por **Eduardo Emiliano Alaniz** ([@h4wkby73](https://github.com/h4wkby73))
[AllSafe Security Solutions](https://www.allsafe.com.ar)

---

## Licencia

GNU Affero General Public License v3.0 — ver archivo [LICENSE](LICENSE).

Si modificás y desplegás Gjallarhorn Community como servicio, debés publicar tus modificaciones bajo la misma licencia.

---

## Seguridad

¿Encontraste una vulnerabilidad? Por favor reportala de forma privada — ver [SECURITY.md](SECURITY.md).

---

<div align="center">
  <sub>Powered by <a href="https://www.allsafe.com.ar">AllSafe Security Solutions</a></sub>
</div>
