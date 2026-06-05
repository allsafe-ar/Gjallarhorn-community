# Changelog

All notable changes to Gjallarhorn Community are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows [SemVer](https://semver.org/).

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
