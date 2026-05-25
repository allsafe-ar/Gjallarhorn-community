[![Español](https://img.shields.io/badge/lang-es-blue)](README.es.md)

<div align="center">
  <img src="logo.png" alt="Gjallarhorn Logo" width="500"/>

  # Gjallarhorn Community — Blue Team Platform

  **Open-source SOC platform for Blue Team operations**

  *Powered by [AllSafe Security Solutions](https://www.allsafe.com.ar)*

  ![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)
  ![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
  ![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?style=flat-square&logo=mysql&logoColor=white)
  ![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square)
  ![Version](https://img.shields.io/badge/Version-Community-blue?style=flat-square)
</div>

---

Gjallarhorn Community is a free, open-source web platform for security teams that integrates threat investigation, malware analysis, email forensics, and phishing simulation into a single interface.

> The name comes from the Gjallarhorn — Heimdall's horn in Norse mythology. When it sounds, it warns the gods' army of imminent danger.

---

## What is Gjallarhorn Community?

Gjallarhorn Community includes:

- **20+ Threat Intelligence sources** (VirusTotal, Shodan, AbuseIPDB, AlienVault OTX, GreyNoise, Criminal IP and more) to investigate IPs, domains, URLs and hashes
- **SOC integrations**: Wazuh, Velociraptor and OpenVAS/GVM
- **Static file analysis**: PE executables, PowerShell/Batch/VBS scripts, Office documents, PDFs — with ransomware detection, Cobalt Strike beacon detection, and C2 framework identification
- **Email forensics**: SPF/DKIM/DMARC analysis, phishing detection and BEC (Business Email Compromise)
- **Phishing simulation**: native phishing campaign engine — 90+ pre-loaded email templates (EN/ES), landing pages with credential capture, awareness emails, and full lifecycle management
- **Case management** with notes, linked analyses, and attachments
- **Detection rule generation**: KQL (Sentinel/Defender), SPL (Splunk), SIGMA, YARA
- **STIX 2.1 export** for sharing intelligence in a standard format

> Looking for **TheHive**, **Nessus**, **AI analysis**, or **automatic correlation playbooks**? Those features are available in [Gjallarhorn Pro](https://www.allsafe.com.ar).

---

## Screenshots

<div align="center">

**Main Dashboard**
<br/>
<img src="screenshots/dashboard.png" alt="Main Dashboard" width="900"/>

<br/><br/>

| **IOC Investigation** | **File Analysis** |
|:---:|:---:|
| <img src="screenshots/investigacion-ioc.png" alt="IOC Investigation" width="440"/> | <img src="screenshots/analisis-archivos.png" alt="File Analysis" width="440"/> |

<br/>

| **Email Forensics** | **Cases** |
|:---:|:---:|
| <img src="screenshots/forense-email.png" alt="Email Forensics" width="440"/> | <img src="screenshots/casos.png" alt="Cases" width="440"/> |

<br/>

**Integration Settings**
<br/>
<img src="screenshots/configuracion.png" alt="Settings" width="900"/>

<br/><br/>

**Phishing Simulation — Campaigns**
<br/>
<img src="screenshots/phishing-campanas.png" alt="Phishing Campaigns" width="900"/>

<br/><br/>

| **Phishing — Email Templates** | **Phishing — Campaign Results** |
|:---:|:---:|
| <img src="screenshots/phishing-plantillas.png" alt="Phishing Templates" width="440"/> | <img src="screenshots/phishing-resultados.png" alt="Phishing Results" width="440"/> |

</div>

---

## Key Features

### IOC Investigation
- Parallel queries to 20+ sources using `Promise.allSettled()`
- Automatic scoring 0–100 with CLEAN / SUSPICIOUS / MALICIOUS / UNKNOWN verdict
- DGA detection (Domain Generation Algorithm) with 7 heuristics: Shannon entropy, consonant/vowel ratio, rare bigrams, known DGA families (GameOverZeus, Qakbot, Suppobox)
- C2 detection in Shodan banners: Cobalt Strike, Metasploit, Empire, Sliver, Havoc, Mythic and more
- Domain age via WHOIS (domains <7 days receive maximum penalty)
- Automatic generation of KQL, SPL, SIGMA and YARA detection rules

### SOC Integration
| Platform | Functionality |
|---|---|
| Wazuh | Agents, alerts (via OpenSearch indexer at :9200) |
| Velociraptor | Clients, hunts, artifact flows |
| OpenVAS / GVM | Scans and vulnerabilities (via GMP proxy at :9391) |

### File Analysis
- PE executables: entropy, sections, imports/exports, packer detection
- Scripts: PowerShell, Batch, JavaScript, VBScript — deobfuscation and IOC extraction
- Documents: Office (macros, OLE), PDF
- Ransomware detection: AES/ChaCha20 constants, ransom notes, VSS deletion
- Cobalt Strike Beacon detection: XOR decryption, config parsing, C2 extraction

### Email Forensics
- SPF, DKIM, DMARC, ARC analysis
- Received header chain and geolocation
- 10+ phishing checks: brand impersonation, lookalike domains, hyperlink mismatch
- BEC detection: urgency patterns, financial language, executive impersonation
- Automatic IOC extraction (IPs, domains, attachment hashes)

### Phishing Simulation

Native phishing campaign engine — no GoPhish wrapper, integrated with Gjallarhorn's RBAC and timeline.

- **90+ pre-loaded templates** in English and Spanish (AWS, Microsoft, Google, banks, HR)
- **Landing pages** with credential capture (pre-loaded, read-only in Community)
- **Awareness emails**: sent automatically on campaign completion, 3 levels (opened / clicked / submitted) with anti-phishing tips
- **Full lifecycle**: wizard → launch → tracking → complete
- **Tracking**: open pixel, link clicks, credential capture — all logged with IP and timestamp
- **Rate-limited sending**: configurable via SMTP settings (emails/minute)
- **Roles**: `phishing_analyst` (phishing only), `analyst_full` (all tools)

> **Community limitations**: templates and landing pages are read-only (90+ pre-loaded). PDF campaign reports and response pages are available in [Gjallarhorn Pro](https://www.allsafe.com.ar).

### Incident Management
- **Cases**: full lifecycle (open → investigating → resolved → closed), notes, observables, attachments
- **Timeline**: unified chronological log of all system events (IOCs, analyses, phishing campaigns, alerts, cases)

---

## Community vs Pro

| Feature | Community | Pro |
|---|:---:|:---:|
| IOC Investigation (20+ sources) | ✅ | ✅ |
| File Analysis | ✅ | ✅ |
| Email Forensics | ✅ | ✅ |
| Cases & Timeline | ✅ | ✅ |
| Wazuh integration | ✅ | ✅ |
| Velociraptor integration | ✅ | ✅ |
| OpenVAS / GVM integration | ✅ | ✅ |
| Phishing simulation (90+ templates) | ✅ | ✅ |
| Custom phishing templates/pages | ❌ | ✅ |
| Phishing PDF reports | ❌ | ✅ |
| TheHive integration | ❌ | ✅ |
| Nessus integration | ❌ | ✅ |
| Automatic correlation playbooks | ❌ | ✅ |
| Advanced analysis engine | ❌ | ✅ |
| PDF export for audit reports | ❌ | ✅ |

> **Upgrade path**: Community and Pro share the same database schema. Upgrading = replace files + `npm install` + `pm2 restart`. No migration needed.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20 + Express |
| Frontend | React 18 + Vite |
| Database | MySQL 8.0+ or MariaDB 10.6+ |
| Auth | JWT (12h) + TOTP 2FA |
| Web server | Nginx |
| Process manager | PM2 |

---

## Documentation

### Installation
- [Full installation guide](INSTALL.md)

### API Keys Configuration (Threat Intelligence)
| Service | Documentation |
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

### SOC Integration Configuration
| Platform | Documentation |
|---|---|
| Wazuh | [docs/integrations/wazuh.md](docs/integrations/wazuh.md) |
| Velociraptor | [docs/integrations/velociraptor.md](docs/integrations/velociraptor.md) |
| OpenVAS / GVM | [docs/integrations/openvas.md](docs/integrations/openvas.md) |

---

## Acknowledgements

Gjallarhorn would not be possible without the work of the following organizations and open-source projects:

- [MITRE ATT&CK](https://attack.mitre.org/) — adversarial tactics and techniques framework
- [Wazuh](https://wazuh.com/) — open-source SIEM and threat detection platform
- [Velociraptor](https://docs.velociraptor.app/) — DFIR platform for remote artifact collection
- [Greenbone / OpenVAS](https://www.greenbone.net/) — open-source vulnerability scanner
- [VirusTotal](https://www.virustotal.com/) — file and threat indicator analysis
- [Abuse.ch](https://abuse.ch/) — free intelligence feeds: ThreatFox, MalwareBazaar and URLhaus
- [AbuseIPDB](https://www.abuseipdb.com/) — collaborative database of malicious IPs
- [Shodan](https://www.shodan.io/) — search engine for internet-exposed devices
- [AlienVault OTX](https://otx.alienvault.com/) — collaborative threat intelligence platform
- [GreyNoise](https://www.greynoise.io/) — internet noise classification vs. real threats
- [Nodemailer](https://nodemailer.com/) — email sending library for the phishing simulation module

---

## Legal Notice

Gjallarhorn is designed exclusively for use in authorized environments: security research, Blue Team operations, and forensic analysis on own infrastructure or with explicit permission from the owner.

Analyzing indicators, files, or systems without authorization may constitute a legal violation in many jurisdictions. The authors assume no responsibility for misuse of this tool.

---

## Author

Created by **Eduardo Emiliano Alaniz** ([@h4wkby73](https://github.com/h4wkby73))
[AllSafe Security Solutions](https://www.allsafe.com.ar)

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE) file.

If you modify and deploy Gjallarhorn Community as a service, you must publish your modifications under the same license.

---

## Security

Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md).

---

<div align="center">
  <sub>Powered by <a href="https://www.allsafe.com.ar">AllSafe Security Solutions</a></sub>
</div>
