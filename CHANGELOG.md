# Changelog

All notable changes to Gjallarhorn Community are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows [SemVer](https://semver.org/).

## [1.5.4] - 2026-10-28

### Security
- `qs` 6.16.2 in the backend (moderate advisory GHSA-6pq8-jhm2-2vcw, denial of service in `qs.stringify`). Back to **0 known vulnerabilities**.
- `install.sh` now requires **Node.js 24.22.1 or later**, the same as the README and `engines`. Before, any 24.x passed the check, including releases without the Brotli fix (CVE-2026-111497). If the installed Node.js is older, it upgrades it from NodeSource and stops with a clear message if it still cannot meet the minimum.

### Fixed
- **Reinstalling with `install.sh` left the app without database access.** If the database user already existed, it kept its old password and the backend could not connect. The installer now sets the new password on the existing user.
- `install.sh` is committed as executable.
- **Docker: first start no longer restarts the app.** The database healthcheck now checks over TCP. Over the socket it passed while MySQL was still on its temporary first-run server, and the app connected too early and restarted until the real server came up.

## [1.5.3] - 2026-10-24

### Security
- **Node.js 24 LTS.** The Docker image moves from `node:20-alpine` to `node:24-alpine` and the install script sets up Node.js 24. Node.js 20 reached end of life and did not get the October 2026 security fixes (among them a remote code execution in the Brotli decoder). `engines` now asks for 24.22.1 or later.
- **MySQL 8.4 LTS** in `docker-compose.yml` (was 8.0, end of life). An existing data volume is upgraded in place on first start.
- Dependencies back to **0 known vulnerabilities** (backend and frontend): `body-parser`, `proxy-addr`, `multer`, `mailparser`, `nodemailer`, `dompurify`, `follow-redirects`, `seroval`, `zod`, `vite`, `source-map-js` and the TanStack router tooling.

### Changed
- README (EN/ES): requirements section, stack versions (Node.js 24, React 19, MySQL 8.4) and version badge brought up to date.

## [1.5.2] - 2026-10-19

### Changed
- Asset spreadsheet import recognises the serial number and, without an identifier, matches the row by name, so re-importing does not duplicate.

## [1.5.1] - 2026-10-19

### Changed
- Shared asset module updated (risk valuation in the list, safer internal code). Inventory sync with Skuld GRC stays a Pro feature and is not mounted here.

## [1.5.0] - 2026-10-19

### Added
- **Asset inventory with lifecycle and expiration tracking**, the same module as Gjallarhorn Pro and Skuld GRC: full taxonomy, owner and custodian, classification, warranty / support / EOL / license / contract dates with a traffic-light view and a 12-month renewal forecast, handover and return, CSV import (Spanish and English column names) and export, field-level history, decommissioning with disposal method.
- Each device's monitoring is now a tab in its asset record.

### Changed
- `monitor_activos` is migrated once into the shared `activos` table (same ids); checks and events hang from it. The old table is kept as a backup. Removing a device is now a soft delete.
- `/api/health` reports the real version.

## [1.4.2] - 2026-09-22

### Fixed
- **The monitoring screen would not open.** When this edition was split from Pro, the email-alerts button and its state were removed but the dialog markup stayed behind, referencing variables that no longer existed. That throws on render, so asset inventory and availability monitoring, the headline of 1.4.0, could not be reached at all.
- **Account security was unusable.** `apiFetch` did not serialise object bodies in this edition, so five calls were sending a useless string instead of JSON: change password, enable two-factor, disable two-factor, create a TheHive case and create a Velociraptor hunt. It now serialises the same way the Pro edition does, and anything already passed as a string goes through untouched.
- **The profile page showed an empty name.** The signed-in user was read from the wrong place in the store, so it always came back undefined: the profile header rendered blank and the two-factor enrolment URI was built without an account name, which leaves an unlabelled entry in your authenticator app. The same mistake hid the create buttons in the TheHive and Velociraptor views for every role, including admin.
- The calendar's grid class was declared under `table`, which react-day-picker renamed to `month_grid` in 10, so it was silently ignored.

### Changed
- The frontend build now type-checks (`tsc -b && vite build`). It was running plain `vite build`, which is why none of the above was caught. 61 latent type errors are down to zero.

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
