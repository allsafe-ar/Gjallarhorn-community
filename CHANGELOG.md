# Changelog

All notable changes to Gjallarhorn Community are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows [SemVer](https://semver.org/).

## [1.4.1] - 2026-09-22

### Security
- Dependencies back to **0 known vulnerabilities**. `uuid` 9 → 11.1.1 and `express` 4.18.2 → 4.22.3, the first release that pins a `qs` outside the vulnerable range.

### Removed
- **`nodemailer`**, declared since email phishing campaigns moved to Pro in May and never imported since. It was the only high advisory left in the backend.

## [1.4.0] - 2026-09-09

### Added
- **Asset inventory and availability monitoring.** Point Gjallarhorn at the devices that matter and
  it checks them itself: ICMP (ping), TCP port or HTTP response, each with its own interval,
  timeout and failure threshold.
  - State per device, downtime and recovery history, and latency.
  - **Live board** with what is up and what is down, and a **metrics dashboard** with downtime and
    recovery over time and average latency per check type.
  - **Fleet composition panel**: how many devices there are, how many are up, how many are down,
    how many nothing is measuring, and the breakdown by operating system.
  - **Probe** that reports the operating system hint (by TTL) and the open ports of a device.
  - **Custom alias per device**: a machine can be `srv-db01` and still be "the billing server" for
    the people who use it.
  - A failure threshold means a brief blip does not flip a device to down.

> ⚠️ Monitoring only works on-premise: the server has to sit inside the network it measures.
> A ping from a public server to a private address goes nowhere.

> The Pro edition adds importing assets from your own **Zabbix** and **GLPI**, keeping the same
> device as a single record across sources without duplicating it, reporting where two sources
> disagree, email alerts on downtime, and an inventory wall display.

- **Dynamic sandbox.** Send a sample to your own analysis engine from the case and read the verdict
  where the case is, without leaving the platform or handing the file to a third party.
- **A detonation opens a case, and counts as first-class evidence.** What the sandbox found stops
  being a side note and becomes part of the record the case is built on.

### Changed
- **The case shows the evidence that originated it**, instead of making you go and look for it.
- Interface help text moved to an impersonal register: it describes what something is and what it
  requires, and stops advising the operator.

## [1.3.0] - 2026-08-25

> Community went from 1.0.1 straight to 1.3.0 to line the numbering up with the Pro edition.
> 1.1.0 and 1.2.0 were never published here, so this entry gathers everything released since 1.0.1.

### Added
- **Contextual help (HelpTip)** throughout the interface, and the **running version visible** in the
  app, so a bug report can say which build it came from.
- **Google Safe Browsing** as a URL and domain source contributing to the IOC score.

### Fixed
- IOC sources that are unconfigured or failing now show as **"Not configured"** or as an error,
  instead of reporting **"Clean"**. Reporting clean because a lookup never happened is a false
  negative, which is the worst thing this screen can do.

## [1.0.1] - 2026-06-05

### Security
- **Fail-fast on insecure `JWT_SECRET`** — the backend now refuses to start if `JWT_SECRET` is unset, left at the default, or shorter than 16 chars.
- **HTTP security headers** via `helmet`.
- **HTTP rate limiting** (`express-rate-limit`): 300 req/15 min globally, 20 req/15 min on auth endpoints.
- **Account lockout persisted in DB** (`users.failed_attempts` / `locked_until`) — survives restarts (previously in-memory only).
- **JWT revocation via `token_version`** — changing a password or disabling a user immediately invalidates existing tokens.
- **CORS no longer falls back to `*`** when `CORS_ORIGIN` is unset.

### Changed
- JWT expiry aligned to **12h** (was 24h).
- `docker-compose.yml` now **requires** `DB_PASSWORD`, `DB_ROOT_PASSWORD` and `JWT_SECRET` (no known default secrets). Added root `.env.example`.
- `install.sh`: excludes `.git/`, `node_modules/`, `screenshots/`, `docs/` from `/opt`; optional Let's Encrypt TLS when a real domain is provided.

## [1.0.0]
- Initial public release: IOC investigation (20+ sources), static file analysis, email forensics, cases & timeline, SOC integrations (Wazuh, Velociraptor, OpenVAS), JWT + TOTP 2FA + RBAC.
