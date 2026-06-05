// Copyright (c) 2026 Eduardo Emiliano Alaniz - AllSafe Security Solutions
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/allsafe-ar/Gjallarhorn-community

"use strict";
require("dotenv").config();

const express  = require("express");
const jwt      = require("jsonwebtoken");
const bcrypt   = require("bcryptjs");
const cors     = require("cors");
const helmet   = require("helmet");
const rateLimit = require("express-rate-limit");
const mysql    = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");
const https    = require("https");
const http     = require("http");
const path     = require("path");
const fs       = require("fs");

// ── SOC Integrations ─────────────────────────────────────────────────────────
const wazuhInt        = require("./integrations/wazuh");
const velociraptorInt = require("./integrations/velociraptor");
const openvasInt      = require("./integrations/openvas");

// ── IOC Investigation ─────────────────────────────────────────────────────────
const threatIntel  = require("./integrations/threat-intel");
const iocAnalyzer  = require("./integrations/ioc-analyzer");

// ── File Analysis ─────────────────────────────────────────────────────────────
const multer       = require("multer");
const fileAnalyzer = require("./integrations/file-analyzer");

// ── Email Forensics ───────────────────────────────────────────────────────────
const emailAnalyzer = require("./integrations/email-analyzer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 }, // 20MB max
});

const ATTACH_DIR = path.join(__dirname, "uploads", "case-attachments");
fs.mkdirSync(ATTACH_DIR, { recursive: true });
const attachUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ATTACH_DIR),
    filename:    (_req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

// ── Config ────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT       || 3003;
const JWT_SECRET = process.env.JWT_SECRET || "gjallar_jwt_secret_CHANGE_IN_PROD";
if (!process.env.JWT_SECRET || JWT_SECRET === "gjallar_jwt_secret_CHANGE_IN_PROD" || JWT_SECRET.length < 16) {
  console.error("[Gjallar] FATAL: JWT_SECRET no configurado o inseguro. Configurá uno aleatorio de >=32 caracteres en .env");
  process.exit(1);
}

const VALID_PLATFORMS = ["wazuh", "velociraptor", "openvas"];

// ── MySQL Pool ────────────────────────────────────────────────────────────────
const db = mysql.createPool({
  host:               process.env.DB_HOST     || "localhost",
  user:               process.env.DB_USER     || "gjallar",
  password:           process.env.DB_PASSWORD || "your_strong_password_here",
  database:           process.env.DB_NAME     || "gjallar",
  waitForConnections: true,
  connectionLimit:    10,
  charset:            "utf8mb4",
});

const qRows = async (sql, p) => { const [r] = await db.execute(sql, p || []); return r; };
const qRow  = async (sql, p) => { const r = await qRows(sql, p); return r[0] || null; };
const qRun  = (sql, p) => db.execute(sql, p || []);

// ── TOTP ──────────────────────────────────────────────────────────────────────
function verifyTOTP(secret, token) {
  try {
    const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const ch of secret.toUpperCase().replace(/=+$/, "")) {
      const idx = B32.indexOf(ch);
      if (idx === -1) continue;
      bits += idx.toString(2).padStart(5, "0");
    }
    const key = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) key.push(parseInt(bits.slice(i, i + 8), 2));
    const crypto = require("crypto");
    const step   = Math.floor(Date.now() / 1000 / 30);
    for (let i = -10; i <= 10; i++) {
      const t   = step + i;
      const msg = Buffer.alloc(8);
      msg.writeUInt32BE(Math.floor(t / 0x100000000), 0);
      msg.writeUInt32BE(t & 0xffffffff, 4);
      const hmac = crypto.createHmac("sha1", Buffer.from(key)).update(msg).digest();
      const off  = hmac[19] & 0xf;
      const code = ((hmac[off] & 0x7f) << 24 | hmac[off+1] << 16 | hmac[off+2] << 8 | hmac[off+3]) % 1000000;
      if (code === parseInt(token, 10)) return true;
    }
    return false;
  } catch { return false; }
}

// ── Audit log ─────────────────────────────────────────────────────────────────
async function auditLog(action, detail, username, role, ip, result) {
  try {
    await db.execute(
      "INSERT INTO audit_logs (id, action, detail, username, role, ip, result) VALUES (?,?,?,?,?,?,?)",
      [uuidv4(), action, detail || "", username || "—", role || "—", ip || "—", result]
    );
    const [cnt] = await db.execute("SELECT COUNT(*) as c FROM audit_logs");
    if (cnt[0].c > 5000) {
      await db.execute(
        "DELETE FROM audit_logs WHERE id IN (SELECT id FROM (SELECT id FROM audit_logs ORDER BY ts ASC LIMIT ?) t)",
        [cnt[0].c - 5000]
      );
    }
  } catch (e) { console.error("[audit]", e.message); }
}

// ── HTTP helper (para test de plataformas) ────────────────────────────────────
function httpRequest(urlStr, { method = "GET", headers = {}, body = null, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try { urlObj = new URL(urlStr); }
    catch { return reject(new Error("URL inválida")); }

    const isHttps = urlObj.protocol === "https:";
    const mod     = isHttps ? https : http;
    const opts    = {
      hostname:           urlObj.hostname,
      port:               urlObj.port || (isHttps ? 443 : 80),
      path:               urlObj.pathname + urlObj.search,
      method,
      headers:            { "Content-Type": "application/json", ...headers },
      rejectUnauthorized: false, // self-signed certs (Wazuh, Nessus, Velociraptor)
    };

    const req = mod.request(opts, (res) => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });

    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("Timeout (10s)")); });
    req.on("error", e => reject(new Error(e.message)));
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ── Platform connectivity tests ───────────────────────────────────────────────
async function testPlatformConnection(platform, cfg) {
  if (!cfg || !cfg.url) return { status: "unconfigured", message: "URL no configurada" };

  try {
    let r;
    switch (platform) {
      case "thehive":
        r = await httpRequest(`${cfg.url}/api/status`, {
          headers: { "Authorization": `Bearer ${cfg.api_key || ""}` },
        });
        if (r.status === 200)  return { status: "connected",    message: "Conectado correctamente" };
        if (r.status === 401)  return { status: "error",        message: "API key inválida (401)" };
        if (r.status === 403)  return { status: "error",        message: "Sin permisos (403)" };
        return { status: "error", message: `HTTP ${r.status}` };

      case "wazuh": {
        const b64 = Buffer.from(`${cfg.username || ""}:${cfg.password || ""}`).toString("base64");
        r = await httpRequest(`${cfg.url}/security/user/authenticate?raw=true`, {
          method:  "POST",
          headers: { "Authorization": `Basic ${b64}` },
        });
        if (r.status === 200) return { status: "connected", message: "Autenticación exitosa" };
        if (r.status === 401) return { status: "error",     message: "Credenciales incorrectas (401)" };
        return { status: "error", message: `HTTP ${r.status}` };
      }

      case "velociraptor": {
        const vrB64 = Buffer.from(`${cfg.username || ""}:${cfg.password || ""}`).toString("base64");
        r = await httpRequest(`${cfg.url}/api/v1/SearchClients?query=all&limit=1`, {
          headers: { "Authorization": `Basic ${vrB64}` },
        });
        if (r.status === 200) {
          try {
            const d = JSON.parse(r.data);
            const total = parseInt(d?.total || "0");
            return { status: "connected", message: `Conectado — ${total} cliente${total !== 1 ? "s" : ""}` };
          } catch { return { status: "connected", message: "Conectado" }; }
        }
        if (r.status === 401 || r.status === 403) return { status: "error", message: "Credenciales inválidas" };
        return { status: "error", message: `HTTP ${r.status}` };
      }

      case "openvas":
        // Proxy HTTP at port 9391 — /api/v1/health returns {"status":"ok"}
        r = await httpRequest(`${cfg.url}/api/v1/health`, {
          headers: { "Authorization": `Bearer ${cfg.api_key || ""}` },
        });
        if (r.status === 200) return { status: "connected", message: "Conectado (GVM proxy)" };
        if (r.status === 401) return { status: "error", message: "API key inválida (401)" };
        return { status: "error", message: `HTTP ${r.status}` };

      case "nessus": {
        const secretKey = cfg.extra_config?.secretKey || "";
        r = await httpRequest(`${cfg.url}/server/status`, {
          headers: { "X-ApiKeys": `accessKey=${cfg.api_key || ""};secretKey=${secretKey}` },
        });
        if (r.status === 200) {
          try {
            const d = JSON.parse(r.data);
            return { status: "connected", message: `Nessus: ${d.status || "running"}` };
          } catch {
            return { status: "connected", message: "Conectado" };
          }
        }
        if (r.status === 401) return { status: "error", message: "API keys inválidas (401)" };
        return { status: "error", message: `HTTP ${r.status}` };
      }

      default:
        return { status: "error", message: "Plataforma desconocida" };
    }
  } catch (e) {
    return { status: "error", message: e.message };
  }
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || false, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Rate limiting (capa HTTP) ───────────────────────────────────────────────
const apiLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,  standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados intentos. Probá de nuevo en 15 minutos." } });
app.use("/api/", apiLimiter);

// ── Auth middleware ───────────────────────────────────────────────────────────
const auth = async (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Token requerido" });
  try {
    const decoded = jwt.verify(h.slice(7), JWT_SECRET);
    const u = await qRow("SELECT token_version, enabled FROM users WHERE id = ?", [decoded.id]);
    if (!u || !u.enabled || (u.token_version || 0) !== (decoded.tv || 0))
      return res.status(401).json({ error: "Token inválido" });
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: "Token inválido o expirado" }); }
};

const adminOnly = (req, res, next) =>
  req.user.role !== "admin" ? res.status(403).json({ error: "Solo administradores" }) : next();

const analystOrAdmin = (req, res, next) =>
  ["admin", "analyst"].includes(req.user.role) ? next() : res.status(403).json({ error: "Sin permisos" });


// ── Account lockout (persistido en DB: users.failed_attempts / locked_until) ──
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ ok: true, version: "1.0.0", platform: "Gjallar" }));

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "—";
  if (!username || !password) return res.status(400).json({ error: "Credenciales requeridas" });

  const user = await qRow("SELECT * FROM users WHERE username = ?", [username]);
  if (!user) {
    await auditLog("LOGIN_FAIL", `Usuario no encontrado: ${username}`, username, "—", ip, "fail");
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    await auditLog("LOGIN_BLOCKED", `Bloqueado: ${username}`, username, user.role, ip, "fail");
    return res.status(429).json({ error: `Cuenta bloqueada. Intentá en ${mins} minuto${mins !== 1 ? "s" : ""}.`, locked: true, minutes: mins });
  }

  if (!user.enabled) {
    await auditLog("LOGIN_DISABLED", `Cuenta deshabilitada: ${username}`, username, user.role, ip, "fail");
    return res.status(403).json({ error: "Tu cuenta está deshabilitada. Contactá al administrador." });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const attempts = (user.failed_attempts || 0) + 1;
    const locked = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60000) : null;
    await qRun("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?", [attempts, locked, user.id]);
    await auditLog("LOGIN_FAIL", `Contraseña incorrecta: ${username} (${attempts}/${MAX_ATTEMPTS})`, username, user.role, ip, "fail");
    if (locked) return res.status(429).json({ error: `Cuenta bloqueada ${LOCK_MINUTES} min.`, locked: true, minutes: LOCK_MINUTES });
    return res.status(401).json({ error: `Usuario o contraseña incorrectos. Intentos restantes: ${MAX_ATTEMPTS - attempts}` });
  }

  await qRun("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?", [user.id]);

  if (user.totp_secret) {
    await auditLog("LOGIN_2FA_REQUIRED", `2FA requerido: ${username}`, username, user.role, ip, "pending");
    return res.json({ needs2fa: true, userId: user.id, nombre: user.nombre, role: user.role });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, nombre: user.nombre, tv: user.token_version || 0 },
    JWT_SECRET, { expiresIn: "12h" }
  );
  await auditLog("LOGIN_OK", "Acceso exitoso", username, user.role, ip, "ok");
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, nombre: user.nombre } });
});

app.post("/api/auth/verify-totp", authLimiter, async (req, res) => {
  const { userId, token: totpToken } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "—";
  if (!userId || !totpToken) return res.status(400).json({ error: "Datos requeridos" });

  let user = await qRow("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) user = await qRow("SELECT * FROM users WHERE username = ?", [userId]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!user.totp_secret) return res.status(400).json({ error: "2FA no configurado para este usuario" });

  if (!verifyTOTP(user.totp_secret, totpToken)) {
    await auditLog("TOTP_FAIL", `Código 2FA incorrecto: ${user.username}`, user.username, user.role, ip, "fail");
    return res.status(401).json({ error: "Código incorrecto o expirado" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, nombre: user.nombre, tv: user.token_version || 0 },
    JWT_SECRET, { expiresIn: "12h" }
  );
  await auditLog("TOTP_OK", "Acceso con 2FA exitoso", user.username, user.role, ip, "ok");
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, nombre: user.nombre } });
});

app.post("/api/auth/logout", auth, async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "—";
  await auditLog("LOGOUT", "Sesión cerrada", req.user.username, req.user.role, ip, "ok");
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, async (req, res) => {
  const user = await qRow("SELECT id, totp_secret FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json({ has2FA: !!(user.totp_secret) });
});

app.post("/api/auth/change-password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres" });
  const user = await qRow("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (currentPassword) {
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Contraseña actual incorrecta" });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await qRun("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", [hash, req.user.id]);
  await auditLog("PASS_CHANGE", "Contraseña cambiada", req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

app.post("/api/auth/setup-totp", auth, async (req, res) => {
  const { totpSecret, totpToken } = req.body;
  if (!totpSecret || !totpToken) return res.status(400).json({ error: "Secret y código requeridos" });
  if (!verifyTOTP(totpSecret, totpToken))
    return res.status(401).json({ error: "Código incorrecto. Verificá el reloj de tu dispositivo." });
  await qRun("UPDATE users SET totp_secret = ? WHERE id = ?", [totpSecret, req.user.id]);
  await auditLog("TOTP_SETUP", "2FA configurado", req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

app.delete("/api/auth/remove-totp", auth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Contraseña requerida para deshabilitar 2FA" });
  const user = await qRow("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Contraseña incorrecta" });
  await qRun("UPDATE users SET totp_secret = NULL WHERE id = ?", [req.user.id]);
  await auditLog("TOTP_REMOVED", "2FA deshabilitado", req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// USERS ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/users", auth, analystOrAdmin, async (req, res) => {
  const users = await qRows("SELECT id, username, role, nombre, enabled, created_at, totp_secret FROM users ORDER BY created_at");
  res.json({ users: users.map(u => ({ ...u, has2FA: !!(u.totp_secret), totp_secret: undefined })) });
});

app.post("/api/users/create", auth, adminOnly, async (req, res) => {
  const { username, password, role, nombre, enabled } = req.body;
  if (!username || !password || !role || !nombre)
    return res.status(400).json({ error: "username, password, role y nombre son requeridos" });
  if (!["admin", "analyst", "viewer"].includes(role))
    return res.status(400).json({ error: "Rol inválido" });
  if (password.length < 8)
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  const exists = await qRow("SELECT id FROM users WHERE username = ?", [username]);
  if (exists) return res.status(409).json({ error: "El usuario ya existe" });
  const hash = await bcrypt.hash(password, 10);
  const id   = uuidv4();
  await qRun(
    "INSERT INTO users (id, username, password_hash, role, nombre, enabled) VALUES (?,?,?,?,?,?)",
    [id, username, hash, role, nombre, enabled !== false ? 1 : 0]
  );
  await auditLog("USER_CREATE", `Usuario creado: ${username} (${role})`, req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true, user: { id, username, role, nombre, enabled: enabled !== false } });
});

app.put("/api/users/:id", auth, adminOnly, async (req, res) => {
  const { username, password, role, nombre, enabled } = req.body;
  if (role && !["admin", "analyst", "viewer"].includes(role))
    return res.status(400).json({ error: "Rol inválido" });
  const user = await qRow("SELECT id FROM users WHERE id = ?", [req.params.id]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
    const hash = await bcrypt.hash(password, 10);
    await qRun("UPDATE users SET username=?, password_hash=?, role=?, nombre=?, enabled=?, totp_secret=NULL WHERE id=?",
      [username, hash, role, nombre, enabled ? 1 : 0, req.params.id]);
  } else {
    await qRun("UPDATE users SET username=?, role=?, nombre=?, enabled=? WHERE id=?",
      [username, role, nombre, enabled ? 1 : 0, req.params.id]);
  }
  await auditLog("USER_UPDATE", `Usuario actualizado: ${username}`, req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

app.delete("/api/users/:id", auth, adminOnly, async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: "No podés eliminarte a vos mismo" });
  const user = await qRow("SELECT * FROM users WHERE id = ?", [req.params.id]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (user.role === "admin") {
    const [cnt] = await db.execute("SELECT COUNT(*) as c FROM users WHERE role = 'admin'");
    if (cnt[0].c <= 1) return res.status(400).json({ error: "No se puede eliminar el último administrador" });
  }
  await qRun("DELETE FROM users WHERE id = ?", [req.params.id]);
  clearRL(user.username);
  await auditLog("USER_DELETE", `Usuario eliminado: ${user.username}`, req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

app.delete("/api/users/:id/totp", auth, adminOnly, async (req, res) => {
  const user = await qRow("SELECT id, username FROM users WHERE id = ?", [req.params.id]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  await qRun("UPDATE users SET totp_secret = NULL WHERE id = ?", [req.params.id]);
  await auditLog("TOTP_ADMIN_RESET", `Admin reseteó 2FA de: ${user.username}`, req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

app.put("/api/users/:id/toggle", auth, adminOnly, async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: "No podés deshabilitarte a vos mismo" });
  const user = await qRow("SELECT id, username, enabled FROM users WHERE id = ?", [req.params.id]);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  const newEnabled = !user.enabled;
  await qRun("UPDATE users SET enabled = ?, token_version = token_version + 1 WHERE id = ?", [newEnabled ? 1 : 0, req.params.id]);
  await auditLog("USER_TOGGLE", `Usuario ${newEnabled ? "habilitado" : "deshabilitado"}: ${user.username}`, req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true, enabled: newEnabled });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM CONFIG ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/platforms", auth, async (req, res) => {
  const rows = await qRows("SELECT * FROM platform_configs ORDER BY platform");
  if (req.user.role === "admin") {
    return res.json({ platforms: rows });
  }
  // Non-admins: status only, no credentials
  res.json({
    platforms: rows.map(r => ({
      platform:     r.platform,
      url:          r.url,
      enabled:      r.enabled,
      last_check:   r.last_check,
      last_status:  r.last_status,
      last_message: r.last_message,
    }))
  });
});

app.get("/api/platforms/:platform", auth, adminOnly, async (req, res) => {
  const { platform } = req.params;
  if (!VALID_PLATFORMS.includes(platform)) return res.status(400).json({ error: "Plataforma inválida" });
  const row = await qRow("SELECT * FROM platform_configs WHERE platform = ?", [platform]);
  if (!row) return res.status(404).json({ error: "No encontrado" });
  res.json(row);
});

app.put("/api/platforms/:platform", auth, adminOnly, async (req, res) => {
  const { platform } = req.params;
  if (!VALID_PLATFORMS.includes(platform)) return res.status(400).json({ error: "Plataforma inválida" });

  const { url, api_key, username, password, extra_config, verify_ssl, enabled } = req.body;

  // Always update non-sensitive fields; only update sensitive if non-empty
  const sets   = ["url = ?", "username = ?", "verify_ssl = ?", "enabled = ?", "updated_by = ?", "updated_at = NOW()"];
  const values = [url || "", username || null, verify_ssl ? 1 : 0, enabled !== false ? 1 : 0, req.user.username];

  if (api_key !== undefined && api_key !== "") { sets.push("api_key = ?"); values.push(api_key); }
  if (password !== undefined && password !== "") { sets.push("password = ?"); values.push(password); }
  if (extra_config !== undefined) { sets.push("extra_config = ?"); values.push(JSON.stringify(extra_config)); }

  values.push(platform);
  await qRun(`UPDATE platform_configs SET ${sets.join(", ")} WHERE platform = ?`, values);
  await auditLog("PLATFORM_CONFIG", `Config actualizada: ${platform}`, req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

app.post("/api/platforms/:platform/toggle", auth, adminOnly, async (req, res) => {
  const { platform } = req.params;
  if (!VALID_PLATFORMS.includes(platform)) return res.status(400).json({ error: "Plataforma inválida" });
  const { enabled } = req.body;
  await qRun("UPDATE platform_configs SET enabled = ? WHERE platform = ?", [enabled ? 1 : 0, platform]);
  await auditLog("PLATFORM_TOGGLE", `${platform} ${enabled ? "habilitada" : "deshabilitada"}`, req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true, enabled });
});

app.post("/api/platforms/:platform/test", auth, async (req, res) => {
  const { platform } = req.params;
  if (!VALID_PLATFORMS.includes(platform)) return res.status(400).json({ error: "Plataforma inválida" });

  const cfg = await qRow("SELECT * FROM platform_configs WHERE platform = ?", [platform]);
  const result = await testPlatformConnection(platform, cfg);

  await qRun(
    "UPDATE platform_configs SET last_check = NOW(), last_status = ?, last_message = ? WHERE platform = ?",
    [result.status, result.message, platform]
  );
  await auditLog(
    "PLATFORM_TEST",
    `Test: ${platform} → ${result.status}: ${result.message}`,
    req.user.username, req.user.role, "internal",
    result.status === "connected" ? "ok" : "fail"
  );
  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGS ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/logs", auth, analystOrAdmin, async (req, res) => {
  const logs = await qRows("SELECT * FROM audit_logs ORDER BY ts DESC LIMIT 2000");
  res.json({ logs });
});

app.post("/api/logs/add", auth, async (req, res) => {
  const e = req.body;
  if (!e?.action) return res.status(400).json({ error: "action requerido" });
  try {
    await db.execute(
      "INSERT INTO audit_logs (id, ts, action, detail, username, nombre, role, result, ip, browser, os) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?)",
      [uuidv4(), e.action, e.detail || "", e.username || "—", e.nombre || "—", e.role || "—", e.result || "ok", e.ip || "—", e.browser || "—", e.os || "—"]
    );
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
});

app.delete("/api/logs/clear", auth, adminOnly, async (req, res) => {
  await qRun("DELETE FROM audit_logs");
  await auditLog("LOGS_CLEARED", "Logs eliminados", req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/settings", auth, async (req, res) => {
  const row = await qRow("SELECT value FROM settings WHERE key_name = 'logoUrl'").catch(() => null);
  res.json({ logoUrl: row?.value || null });
});

app.put("/api/settings/logo", auth, adminOnly, async (req, res) => {
  const { logoUrl } = req.body;
  await qRun("INSERT INTO settings (key_name, value) VALUES ('logoUrl', ?) ON DUPLICATE KEY UPDATE value = ?",
    [logoUrl || "", logoUrl || ""]).catch(() => {});
  res.json({ ok: true });
});

app.get("/api/settings/platform-check-interval", auth, async (req, res) => {
  const row = await qRow("SELECT value FROM settings WHERE key_name = 'platform_check_interval'").catch(() => null);
  res.json({ interval: row?.value || '0' });
});

app.put("/api/settings/platform-check-interval", auth, adminOnly, async (req, res) => {
  const { interval } = req.body;
  const valid = ['0', '1', '10', '60', '300', '900', '1800', '3600'];
  if (!valid.includes(String(interval))) return res.status(400).json({ error: 'Valor no válido' });
  await qRun(
    "INSERT INTO settings (key_name, value) VALUES ('platform_check_interval', ?) ON DUPLICATE KEY UPDATE value = ?",
    [String(interval), String(interval)]
  );
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ALLSAFE LOGO SETTING
// ─────────────────────────────────────────────────────────────────────────────
function logoSettingRow(rowShow, rowData) {
  // Default: show=true when key not yet set in DB
  const show = rowShow ? rowShow.value !== 'false' : true;
  return { show, logoData: rowData?.value || null };
}

// Public endpoint — used by LoginView before auth
app.get("/api/settings/allsafe-logo/public", async (req, res) => {
  const [rowShow, rowData] = await Promise.all([
    qRow("SELECT value FROM settings WHERE key_name = 'show_allsafe_logo'").catch(() => null),
    qRow("SELECT value FROM settings WHERE key_name = 'allsafe_logo_data'").catch(() => null),
  ]);
  res.json(logoSettingRow(rowShow, rowData));
});

app.get("/api/settings/allsafe-logo", auth, async (req, res) => {
  const [rowShow, rowData] = await Promise.all([
    qRow("SELECT value FROM settings WHERE key_name = 'show_allsafe_logo'").catch(() => null),
    qRow("SELECT value FROM settings WHERE key_name = 'allsafe_logo_data'").catch(() => null),
  ]);
  res.json(logoSettingRow(rowShow, rowData));
});

app.put("/api/settings/allsafe-logo", auth, adminOnly, async (req, res) => {
  const { show, logoData, reset } = req.body;

  if (typeof show === 'boolean') {
    const val = show ? 'true' : 'false';
    await qRun(
      "INSERT INTO settings (key_name, value) VALUES ('show_allsafe_logo', ?) ON DUPLICATE KEY UPDATE value = ?",
      [val, val]
    );
  }
  if (reset) {
    await qRun("DELETE FROM settings WHERE key_name = 'allsafe_logo_data'").catch(() => {});
  } else if (logoData) {
    if (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(logoData))
      return res.status(400).json({ error: 'Formato no válido. Usá PNG, JPG, SVG o WebP.' });
    const sizeBytes = Buffer.byteLength(logoData, 'utf8');
    if (sizeBytes > 512 * 1024)
      return res.status(400).json({ error: 'Archivo demasiado grande (máx. 400 KB).' });
    await qRun(
      "INSERT INTO settings (key_name, value) VALUES ('allsafe_logo_data', ?) ON DUPLICATE KEY UPDATE value = ?",
      [logoData, logoData]
    );
  }
  await auditLog(
    "SETTING_ALLSAFE_LOGO",
    `Logo AllSafe: show=${show ?? '—'} reset=${!!reset} custom=${!!logoData}`,
    req.user.username, req.user.role, "internal", "ok"
  );
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// API KEYS (threat intel services — stored in settings table)
// ─────────────────────────────────────────────────────────────────────────────
const API_KEY_SERVICES = [
  "virustotal","abuseipdb","shodan","alienvault","greynoise",
  "urlscan","criminalip","ipqualityscore","threatfox","hybrid",
];

app.get("/api/settings/api-keys", auth, adminOnly, async (req, res) => {
  const keys = {};
  for (const svc of API_KEY_SERVICES) {
    const row = await qRow("SELECT value FROM settings WHERE key_name = ?", [`apikey_${svc}`]);
    keys[svc] = row?.value ? "***configured***" : "";
  }
  res.json({ keys });
});

app.put("/api/settings/api-keys", auth, adminOnly, async (req, res) => {
  const { keys } = req.body;
  if (!keys || typeof keys !== "object") return res.status(400).json({ error: "keys requerido" });

  for (const [svc, val] of Object.entries(keys)) {
    if (!API_KEY_SERVICES.includes(svc)) continue;
    if (val === "" || val === null) {
      await qRun("DELETE FROM settings WHERE key_name = ?", [`apikey_${svc}`]);
    } else if (val && val !== "***configured***") {
      await qRun(
        "INSERT INTO settings (key_name, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?",
        [`apikey_${svc}`, val, val]
      );
    }
  }
  await auditLog("APIKEYS_UPDATE", "API keys actualizadas", req.user.username, req.user.role, "internal", "ok");
  res.json({ ok: true });
});

// Retorna solo qué servicios tienen key configurada (para el dashboard)
app.get("/api/settings/api-keys/status", auth, async (req, res) => {
  const status = {};
  for (const svc of API_KEY_SERVICES) {
    const row = await qRow("SELECT value FROM settings WHERE key_name = ?", [`apikey_${svc}`]);
    status[svc] = !!(row?.value);
  }
  res.json({ status });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOC INTEGRATIONS — helper para obtener config de plataforma
// ─────────────────────────────────────────────────────────────────────────────
async function getPlatformCfg(platform) {
  const row = await qRow("SELECT * FROM platform_configs WHERE platform = ?", [platform]);
  if (!row || !row.url || !row.enabled) return null;
  if (typeof row.extra_config === "string") {
    try { row.extra_config = JSON.parse(row.extra_config); } catch { row.extra_config = {}; }
  }
  return row;
}

// Cache en memoria para datos SOC (TTL 60s)
const socCache = new Map();
function getCache(key) {
  const c = socCache.get(key);
  if (c && Date.now() < c.exp) return c.data;
  socCache.delete(key);
  return null;
}
function setCache(key, data, ttlMs = 60000) {
  socCache.set(key, { data, exp: Date.now() + ttlMs });
}

// ─────────────────────────────────────────────────────────────────────────────
// SOC — WAZUH
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/soc/wazuh/agents", auth, analystOrAdmin, async (req, res) => {
  const cfg = await getPlatformCfg("wazuh");
  if (!cfg) return res.status(503).json({ error: "Wazuh no configurado o deshabilitado" });
  const cacheKey = "wazuh:agents";
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  const result = await wazuhInt.getAgents(cfg, { limit: Number(req.query.limit) || 500 });
  if (result.ok) setCache(cacheKey, result, 30000);
  res.json(result);
});

app.get("/api/soc/wazuh/alerts", auth, analystOrAdmin, async (req, res) => {
  const cfg = await getPlatformCfg("wazuh");
  if (!cfg) return res.status(503).json({ error: "Wazuh no configurado o deshabilitado" });
  const cacheKey = `wazuh:alerts:${req.query.hours || 24}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  const result = await wazuhInt.getAlerts(cfg, {
    limit: Number(req.query.limit) || 50,
    hours: Number(req.query.hours) || 24,
  });
  if (result.ok) setCache(cacheKey, result, 30000);
  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// SOC — VELOCIRAPTOR
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/soc/velociraptor/clients", auth, analystOrAdmin, async (req, res) => {
  const cfg = await getPlatformCfg("velociraptor");
  if (!cfg) return res.status(503).json({ error: "Velociraptor no configurado o deshabilitado" });
  const cacheKey = "velociraptor:clients";
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  const result = await velociraptorInt.getClients(cfg, { limit: Number(req.query.limit) || 100 });
  if (result.ok) setCache(cacheKey, result, 30000);
  res.json(result);
});

app.get("/api/soc/velociraptor/hunts", auth, analystOrAdmin, async (req, res) => {
  const cfg = await getPlatformCfg("velociraptor");
  if (!cfg) return res.status(503).json({ error: "Velociraptor no configurado o deshabilitado" });
  const cacheKey = "velociraptor:hunts";
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  const result = await velociraptorInt.getHunts(cfg, { limit: Number(req.query.limit) || 50 });
  if (result.ok) setCache(cacheKey, result, 30000);
  res.json(result);
});

app.post("/api/soc/velociraptor/hunts", auth, analystOrAdmin, async (req, res) => {
  const cfg = await getPlatformCfg("velociraptor");
  if (!cfg) return res.status(503).json({ error: "Velociraptor no configurado" });
  const result = await velociraptorInt.createHunt(cfg, req.body);
  if (result.ok) {
    socCache.delete("velociraptor:hunts");
    await auditLog("VR_HUNT_CREATE", `Hunt creado: ${req.body.artifact}`, req.user.username, req.user.role, "internal", "ok");
  }
  res.json(result);
});

app.get("/api/soc/velociraptor/flows", auth, analystOrAdmin, async (req, res) => {
  const cfg = await getPlatformCfg("velociraptor");
  if (!cfg) return res.status(503).json({ error: "Velociraptor no configurado o deshabilitado" });
  const clientId = req.query.clientId;
  if (!clientId) return res.status(400).json({ error: "clientId requerido" });
  const cacheKey = `velociraptor:flows:${clientId}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  const result = await velociraptorInt.getFlows(cfg, clientId, { limit: Number(req.query.limit) || 20 });
  if (result.ok) setCache(cacheKey, result, 30000);
  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// SOC — OPENVAS
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/soc/openvas/tasks", auth, analystOrAdmin, async (req, res) => {
  const cfg = await getPlatformCfg("openvas");
  if (!cfg) return res.status(503).json({ error: "OpenVAS no configurado o deshabilitado" });
  const cacheKey = "openvas:tasks";
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  const result = await openvasInt.getTasks(cfg, { limit: Number(req.query.limit) || 50 });
  if (result.ok) setCache(cacheKey, result, 60000);
  res.json(result);
});

app.get("/api/soc/openvas/results", auth, analystOrAdmin, async (req, res) => {
  const cfg = await getPlatformCfg("openvas");
  if (!cfg) return res.status(503).json({ error: "OpenVAS no configurado o deshabilitado" });
  const taskId = req.query.taskId;
  const cacheKey = `openvas:results:${taskId || "all"}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  const result = await openvasInt.getResults(cfg, { taskId, limit: Number(req.query.limit) || 100 });
  if (result.ok) setCache(cacheKey, result, 60000);
  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// SOC — DASHBOARD SUMMARY (métricas unificadas de todas las plataformas)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/soc/dashboard/summary", auth, async (req, res) => {
  const cacheKey = "soc:dashboard:summary";
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  const [wzCfg, vrCfg, ovCfg] = await Promise.all([
    getPlatformCfg("wazuh"),
    getPlatformCfg("velociraptor"),
    getPlatformCfg("openvas"),
  ]);

  const [wzStats, vrStats, ovStats, casesStats] = await Promise.allSettled([
    wzCfg ? wazuhInt.getStats(wzCfg) : Promise.resolve(null),
    vrCfg ? velociraptorInt.getStats(vrCfg) : Promise.resolve(null),
    ovCfg ? openvasInt.getStats(ovCfg) : Promise.resolve(null),
    (async () => {
      const [total, open, inprogress, resolved, critical] = await Promise.all([
        qRow("SELECT COUNT(*) c FROM cases"),
        qRow("SELECT COUNT(*) c FROM cases WHERE status = 'open'"),
        qRow("SELECT COUNT(*) c FROM cases WHERE status = 'in_progress'"),
        qRow("SELECT COUNT(*) c FROM cases WHERE status = 'resolved'"),
        qRow("SELECT COUNT(*) c FROM cases WHERE severity IN ('high','critical') AND status != 'resolved'"),
      ]);
      return { total: total.c, open: open.c, inProgress: inprogress.c, resolved: resolved.c, criticalOpen: critical.c };
    })(),
  ]);

  const summary = {
    wazuh:        { connected: !!wzCfg, ...(wzStats.status === "fulfilled" ? wzStats.value : {}) },
    velociraptor: { connected: !!vrCfg, ...(vrStats.status === "fulfilled" ? vrStats.value : {}) },
    openvas:      { connected: !!ovCfg, ...(ovStats.status === "fulfilled" ? ovStats.value : {}) },
    localCases:   casesStats.status === "fulfilled" ? casesStats.value : {},
    ts: new Date().toISOString(),
  };

  setCache(cacheKey, summary, 60000);
  res.json(summary);
});

// ─────────────────────────────────────────────────────────────────────────────
// FILE ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/files/analyze — upload + analyze
app.post("/api/files/analyze", auth, analystOrAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Archivo requerido (campo 'file')" });

  try {
    const buf      = req.file.buffer;
    const filename = req.file.originalname || "unknown";

    // Run static analysis
    const analysis = await fileAnalyzer.analyzeFile(buf, filename);

    // Threat intel hash lookup (parallel)
    const apiKeys = await getApiKeys();
    const hashesToQuery = analysis.hashes;

    const [vtRes, mbRes, tfRes] = await Promise.allSettled([
      threatIntel.queryAll(hashesToQuery.sha256, "sha256", apiKeys),
      Promise.resolve(null), // MalwareBazaar included in queryAll via hash
      Promise.resolve(null), // ThreatFox included in queryAll
    ]);

    // Extract threat intel results from the VirusTotal/MalwareBazaar/ThreatFox findings
    let vtScore = 0, mbFound = false, tfFound = false;
    const tiFindings = vtRes.status === "fulfilled" ? (vtRes.value || []) : [];
    for (const f of tiFindings) {
      if (f.source === "VirusTotal" && f.score_contribution) vtScore = f.score_contribution;
      if (f.source === "MalwareBazaar" && f.found) mbFound = true;
      if (f.source === "ThreatFox" && f.found)     tfFound = true;
    }

    // Recalculate score with threat intel boost
    analysis.vtScore = vtScore;
    analysis.mbFound = mbFound;
    analysis.tfFound = tfFound;

    // Recompute final score/verdict with TI data
    let finalScore = analysis.score;
    if (vtScore)  finalScore = Math.min(finalScore + vtScore, 100);
    if (mbFound)  finalScore = Math.min(finalScore + 70, 100);
    if (tfFound)  finalScore = Math.min(finalScore + 55, 100);
    const finalVerdict = finalScore >= 70 ? "MALICIOUS" : finalScore >= 40 ? "SUSPICIOUS" : finalScore > 0 ? "CLEAN" : "UNKNOWN";

    const id = uuidv4();
    const analysisData = { ...analysis, tiFindings };
    await qRun(
      "INSERT INTO file_analyses (id, filename, file_size, file_type, md5, sha1, sha256, threat_score, verdict, analysis_data, analyst) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [id, filename, buf.length, analysis.fileType, analysis.hashes.md5, analysis.hashes.sha1, analysis.hashes.sha256, finalScore, finalVerdict, JSON.stringify(analysisData), req.user.username]
    );

    await auditLog("FILE_ANALYZE", `${filename} → ${finalVerdict} (${finalScore})`, req.user.username, req.user.role, req.ip, "ok");
    addTimelineEvent("file", "FILE_ANALYZED", finalScore >= 70 ? "high" : finalScore >= 40 ? "medium" : "low",
      { filename, score: finalScore, verdict: finalVerdict, analyst: req.user.username, id });

    res.json({ id, filename, fileSize: buf.length, fileType: analysis.fileType, hashes: analysis.hashes, score: finalScore, verdict: finalVerdict, analysis, tiFindings });
  } catch (e) {
    console.error("[FILE]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/files/history
app.get("/api/files/history", auth, analystOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);
    const rows = await qRows(`SELECT id, ts, filename, file_size, file_type, md5, sha256, threat_score, verdict, analyst, thehive_case_id FROM file_analyses ORDER BY ts DESC LIMIT ${limit}`);
    res.json({ analyses: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/files/:id
app.get("/api/files/:id", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT * FROM file_analyses WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/files/:id/create-case — crear caso en TheHive
app.post("/api/files/:id/create-case", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT * FROM file_analyses WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });

    const cfg = await getPlatformCfg("thehive");
    if (!cfg) return res.status(503).json({ error: "TheHive no configurado" });

    const ad = typeof row.analysis_data === "string" ? JSON.parse(row.analysis_data) : (row.analysis_data || {});
    const detections = [
      ...(ad.ransomware?.detected ? ["Ransomware"] : []),
      ...(ad.csBeacon?.detected ? ["Cobalt Strike"] : []),
      ...(ad.c2Frameworks?.length > 0 ? ad.c2Frameworks : []),
      ...(ad.peInfo?.isPacked ? ["Packer"] : []),
    ].join(", ");

    const caseData = {
      title: `Análisis de Archivo: ${row.filename}`,
      description: `**Análisis de malware generado por Gjallar**\n\n- **Archivo:** \`${row.filename}\`\n- **Tipo:** ${row.file_type}\n- **SHA256:** \`${row.sha256}\`\n- **MD5:** \`${row.md5}\`\n- **Tamaño:** ${(row.file_size / 1024).toFixed(1)} KB\n- **Veredicto:** ${row.verdict}\n- **Score:** ${row.threat_score}/100\n${detections ? `- **Detecciones:** ${detections}\n` : ""}- **Analista:** ${row.analyst}\n- **Fecha:** ${new Date(row.ts).toISOString()}`,
      severity: row.threat_score >= 70 ? 3 : row.threat_score >= 40 ? 2 : 1,
      tags: ["gjallar", "malware-analysis", row.file_type?.toLowerCase().replace(/\s+/g, "-") || "binary", row.verdict.toLowerCase()],
    };

    const result = await theHive.createCase(cfg, caseData);
    if (result.ok) {
      const caseId = result.case?.id || result.case?._id;
      await qRun("UPDATE file_analyses SET thehive_case_id = ? WHERE id = ?", [String(caseId), row.id]);
      socCache.delete("thehive:cases");
      await auditLog("FILE_CREATE_CASE", `${row.filename} → TheHive case ${caseId}`, req.user.username, req.user.role, req.ip, "ok");
      res.json({ ok: true, caseId, case: result.case });
    } else {
      res.status(502).json({ error: result.error || "Error creando caso en TheHive" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL FORENSICS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/emails/analyze — upload .eml file
app.post("/api/emails/analyze", auth, analystOrAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Archivo .eml requerido (campo 'file')" });

  const filename = req.file.originalname || "email.eml";
  if (!filename.toLowerCase().endsWith(".eml") && !filename.toLowerCase().endsWith(".msg")) {
    return res.status(400).json({ error: "Solo se aceptan archivos .eml" });
  }

  try {
    const analysis = await emailAnalyzer.analyzeEmail(req.file.buffer);
    const rules    = analysis.rules;

    const id = uuidv4();
    await qRun(
      "INSERT INTO email_analyses (id, subject, email_from, email_to, message_id, threat_score, verdict, is_phishing, is_bec, analysis_data, rules_data, analyst) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        analysis.subject || "",
        analysis.from?.address || analysis.from?.name || "",
        Array.isArray(analysis.to) ? analysis.to.map(t => t.address || t.name || "").filter(Boolean).join(", ") : (analysis.to || ""),
        analysis.messageId || "",
        analysis.score,
        analysis.verdict,
        analysis.isPhishing ? 1 : 0,
        analysis.isBEC ? 1 : 0,
        JSON.stringify(analysis),
        JSON.stringify(rules),
        req.user.username,
      ]
    );

    await auditLog("EMAIL_ANALYZE", `${filename} → ${analysis.verdict} (${analysis.score})`, req.user.username, req.user.role, req.ip, "ok");
    addTimelineEvent("email", "EMAIL_ANALYZED", analysis.score >= 70 ? "high" : analysis.score >= 40 ? "medium" : "low",
      { subject: analysis.subject, from: analysis.from, score: analysis.score, verdict: analysis.verdict, phishing: !!analysis.isPhishing, bec: !!analysis.isBEC, analyst: req.user.username, id });

    res.json({ id, ...analysis });
  } catch (e) {
    console.error("[EMAIL]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/emails/history
app.get("/api/emails/history", auth, analystOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);
    const rows = await qRows(`SELECT id, ts, subject, email_from, email_to, threat_score, verdict, is_phishing, is_bec, analyst, thehive_case_id FROM email_analyses ORDER BY ts DESC LIMIT ${limit}`);
    res.json({ analyses: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/emails/:id
app.get("/api/emails/:id", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT * FROM email_analyses WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/emails/:id/rules
app.get("/api/emails/:id/rules", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT rules_data, subject, email_from, verdict FROM email_analyses WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    const rules = typeof row.rules_data === "string" ? JSON.parse(row.rules_data) : (row.rules_data || {});
    res.json({ rules, subject: row.subject, from: row.email_from, verdict: row.verdict });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/emails/:id/create-case — crear caso en TheHive
app.post("/api/emails/:id/create-case", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT * FROM email_analyses WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });

    const cfg = await getPlatformCfg("thehive");
    if (!cfg) return res.status(503).json({ error: "TheHive no configurado" });

    const ad = typeof row.analysis_data === "string" ? JSON.parse(row.analysis_data) : (row.analysis_data || {});
    const detectionTypes = [
      ...(row.is_phishing ? ["Phishing"] : []),
      ...(row.is_bec      ? ["BEC (Business Email Compromise)"] : []),
    ].join(", ") || "Email sospechoso";

    const phishingChecks = (ad.phishing?.checks || []).filter(c => c.detected).map(c => `- ${c.name}: ${c.detail}`).join("\n");
    const becChecks      = (ad.bec?.checks || []).filter(c => c.detected).map(c => `- ${c.name}: ${c.detail}`).join("\n");

    const caseData = {
      title: `Análisis de Email: ${row.subject || "(sin asunto)"}`,
      description: [
        "**Análisis forense de email generado por Gjallar**\n",
        `- **De:** \`${row.email_from || "—"}\``,
        `- **Para:** ${row.email_to || "—"}`,
        `- **Asunto:** ${row.subject || "(sin asunto)"}`,
        `- **Message-ID:** \`${row.message_id || "—"}\``,
        `- **Tipo de amenaza:** ${detectionTypes}`,
        `- **Veredicto:** ${row.verdict}`,
        `- **Score:** ${row.threat_score}/100`,
        `- **Analista:** ${row.analyst}`,
        `- **Fecha análisis:** ${new Date(row.ts).toISOString()}`,
        phishingChecks ? `\n**Indicadores de Phishing:**\n${phishingChecks}` : "",
        becChecks      ? `\n**Indicadores de BEC:**\n${becChecks}` : "",
      ].filter(Boolean).join("\n"),
      severity: row.threat_score >= 70 ? 3 : row.threat_score >= 40 ? 2 : 1,
      tags: ["gjallar", "email-forensics", ...(row.is_phishing ? ["phishing"] : []), ...(row.is_bec ? ["bec"] : []), row.verdict.toLowerCase()],
    };

    const result = await theHive.createCase(cfg, caseData);
    if (result.ok) {
      const caseId = result.case?.id || result.case?._id;
      await qRun("UPDATE email_analyses SET thehive_case_id = ? WHERE id = ?", [String(caseId), row.id]);
      socCache.delete("thehive:cases");
      await auditLog("EMAIL_CREATE_CASE", `${row.subject} → TheHive case ${caseId}`, req.user.username, req.user.role, req.ip, "ok");
      res.json({ ok: true, caseId, case: result.case });
    } else {
      res.status(502).json({ error: result.error || "Error creando caso en TheHive" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IOC INVESTIGATION
// ─────────────────────────────────────────────────────────────────────────────

// Helper: read all API keys from settings table
async function getApiKeys() {
  const rows = await qRows("SELECT key_name, value FROM settings WHERE key_name LIKE 'apikey_%'");
  const keys = {};
  for (const r of rows) keys[r.key_name.replace("apikey_", "")] = r.value || "";
  return keys;
}

// POST /api/ioc/investigate — main investigation
app.post("/api/ioc/investigate", auth, analystOrAdmin, async (req, res) => {
  const { ioc } = req.body;
  if (!ioc || !String(ioc).trim()) return res.status(400).json({ error: "IOC requerido" });

  const iocValue = String(ioc).trim();
  const iocType  = iocAnalyzer.detectType(iocValue);

  if (iocType === "unknown") return res.status(400).json({ error: "Tipo de IOC no reconocido" });
  if (iocType === "cve" || iocType === "email") return res.status(400).json({ error: `Tipo ${iocType} no soportado aún` });

  try {
    const apiKeys = await getApiKeys();
    const findings = await threatIntel.queryAll(iocValue, iocType, apiKeys);

    // Domain enrichment
    let domainInfo = null, dgaInfo = null;
    if (iocType === "domain") {
      [domainInfo, dgaInfo] = await Promise.all([
        threatIntel.getDomainAge(iocValue),
        Promise.resolve(iocAnalyzer.detectDGA(iocValue)),
      ]);
    }

    const extras = {
      dgaScore: dgaInfo?.score,
      domainAgeDays: domainInfo?.ageDays,
    };

    const { score, verdict, breakdown } = iocAnalyzer.calculateScore(findings, extras);
    const rules  = iocAnalyzer.generateRules(iocValue, iocType, verdict);
    const stix   = iocAnalyzer.generateSTIX(iocValue, iocType, score, verdict, findings);

    const id = uuidv4();
    const sourcesData = { findings, breakdown, domainInfo, dgaInfo };
    await qRun(
      "INSERT INTO ioc_investigations (id, ioc_value, ioc_type, threat_score, verdict, sources_data, rules_data, analyst) VALUES (?,?,?,?,?,?,?,?)",
      [id, iocValue, iocType, score, verdict, JSON.stringify(sourcesData), JSON.stringify(rules), req.user.username]
    );

    await auditLog("IOC_INVESTIGATE", `${iocType}:${iocValue} → ${verdict} (${score})`, req.user.username, req.user.role, req.ip, "ok");
    addTimelineEvent("ioc", "IOC_INVESTIGATED", score >= 70 ? "high" : score >= 40 ? "medium" : "low",
      { ioc: iocValue, type: iocType, score, verdict, analyst: req.user.username, id });

    res.json({ id, iocValue, iocType, score, verdict, breakdown, findings, domainInfo, dgaInfo, rules, stix });
  } catch (e) {
    console.error("[IOC]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/intelligence/stats
app.get("/api/intelligence/stats", auth, analystOrAdmin, async (req, res) => {
  try {
    const [totals, byType, byVerdict, trend, apiKeys] = await Promise.all([
      qRow(`SELECT COUNT(*) total,
              SUM(verdict='malicious') malicious,
              SUM(verdict='suspicious') suspicious,
              SUM(verdict='clean') clean,
              SUM(verdict='unknown') unknown FROM ioc_investigations`),
      qRows(`SELECT ioc_type, COUNT(*) c FROM ioc_investigations GROUP BY ioc_type ORDER BY c DESC`),
      qRows(`SELECT verdict, COUNT(*) c FROM ioc_investigations GROUP BY verdict ORDER BY c DESC`),
      qRows(`SELECT DATE(ts) d, COUNT(*) c FROM ioc_investigations WHERE ts >= DATE_SUB(NOW(), INTERVAL 14 DAY) GROUP BY DATE(ts) ORDER BY d ASC`),
      getApiKeys(),
    ]);

    // Per-source hit counts from recent sources_data (last 500)
    const recentRows = await qRows(`SELECT sources_data FROM ioc_investigations WHERE sources_data IS NOT NULL ORDER BY ts DESC LIMIT 500`);
    const sourceHits  = {};
    const sourceDetections = {};
    for (const row of recentRows) {
      try {
        const sd = typeof row.sources_data === 'string' ? JSON.parse(row.sources_data) : row.sources_data;
        const findings = sd?.findings || [];
        for (const f of findings) {
          if (!f.source || f.skipped) continue;
          sourceHits[f.source] = (sourceHits[f.source] || 0) + 1;
          if (f.found) sourceDetections[f.source] = (sourceDetections[f.source] || 0) + 1;
        }
      } catch {}
    }

    const sourceStats = Object.entries(sourceHits).map(([source, queries]) => ({
      source, queries, detections: sourceDetections[source] || 0,
    })).sort((a, b) => b.queries - a.queries);

    res.json({ totals, byType, byVerdict, trend, sourceStats, apiKeyCount: Object.keys(apiKeys).filter(k => apiKeys[k] && apiKeys[k] !== '').length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ioc/history
app.get("/api/ioc/history", auth, analystOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);
    const rows = await qRows(`SELECT id, ts, ioc_value, ioc_type, threat_score, verdict, analyst, thehive_case_id FROM ioc_investigations ORDER BY ts DESC LIMIT ${limit}`);
    res.json({ investigations: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ioc/:id
app.get("/api/ioc/:id", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT * FROM ioc_investigations WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Investigación no encontrada" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ioc/:id/rules
app.get("/api/ioc/:id/rules", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT rules_data, ioc_value, ioc_type, verdict FROM ioc_investigations WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Investigación no encontrada" });
    const rules = typeof row.rules_data === "string" ? JSON.parse(row.rules_data) : (row.rules_data || {});
    res.json({ rules, iocValue: row.ioc_value, iocType: row.ioc_type, verdict: row.verdict });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ioc/:id/stix
app.get("/api/ioc/:id/stix", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT * FROM ioc_investigations WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Investigación no encontrada" });
    const sources = typeof row.sources_data === "string" ? JSON.parse(row.sources_data) : (row.sources_data || {});
    const stix = iocAnalyzer.generateSTIX(row.ioc_value, row.ioc_type, row.threat_score, row.verdict, sources.findings || []);
    res.setHeader("Content-Disposition", `attachment; filename="ioc-${row.id.slice(0,8)}-stix21.json"`);
    res.json(stix);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ioc/:id/create-case — crear caso en TheHive
app.post("/api/ioc/:id/create-case", auth, analystOrAdmin, async (req, res) => {
  try {
    const row = await qRow("SELECT * FROM ioc_investigations WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Investigación no encontrada" });

    const cfg = await getPlatformCfg("thehive");
    if (!cfg) return res.status(503).json({ error: "TheHive no configurado" });

    const caseData = {
      title: `IOC Threat Intel: ${row.ioc_value}`,
      description: `**Investigación IOC generada por Gjallar**\n\n- **IOC:** \`${row.ioc_value}\`\n- **Tipo:** ${row.ioc_type}\n- **Veredicto:** ${row.verdict}\n- **Score:** ${row.threat_score}/100\n- **Analista:** ${row.analyst}\n- **Fecha:** ${new Date(row.ts).toISOString()}`,
      severity: row.threat_score >= 70 ? 3 : row.threat_score >= 40 ? 2 : 1,
      tags: ["gjallar", "threat-intel", row.ioc_type, row.verdict.toLowerCase()],
    };

    const result = await theHive.createCase(cfg, caseData);
    if (result.ok) {
      const caseId = result.case?.id || result.case?._id;
      await qRun("UPDATE ioc_investigations SET thehive_case_id = ? WHERE id = ?", [String(caseId), row.id]);
      socCache.delete("thehive:cases");
      await auditLog("IOC_CREATE_CASE", `${row.ioc_value} → TheHive case ${caseId}`, req.user.username, req.user.role, req.ip, "ok");
      res.json({ ok: true, caseId, case: result.case });
    } else {
      res.status(502).json({ error: result.error || "Error creando caso en TheHive" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CASES
// ─────────────────────────────────────────────────────────────────────────────

// Usuarios activos para dropdown de asignación
app.get("/api/users/assignable", auth, analystOrAdmin, async (req, res) => {
  const rows = await qRows("SELECT username, nombre, role FROM users WHERE enabled = 1 ORDER BY nombre");
  res.json({ users: rows });
});

async function logCaseActivity(caseId, action, detail, username) {
  try { await qRun("INSERT INTO case_activity (id,case_id,action,detail,username) VALUES (?,?,?,?,?)", [uuidv4(), caseId, action, detail, username]); } catch {}
}

app.post("/api/cases", auth, analystOrAdmin, async (req, res) => {
  try {
    const { title, description = "", severity = "medium", analysisType, analysisId, assigned_to = null, tags = null, tlp = 2 } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "title es requerido" });

    if (analysisType && analysisId) {
      const existing = await qRow(
        "SELECT c.id, c.title, c.status FROM cases c JOIN case_analyses ca ON ca.case_id = c.id WHERE ca.analysis_id = ? AND ca.analysis_type = ?",
        [analysisId, analysisType]
      );
      if (existing) {
        return res.status(409).json({ error: `Caso ya existente: "${existing.title}" (${existing.status})`, existing_case_id: existing.id, existing_case_title: existing.title, existing_case_status: existing.status });
      }
      if (analysisType === "file") {
        const hashMatch = await qRow(
          `SELECT c.id, c.title, c.status FROM cases c
           JOIN case_analyses ca ON ca.case_id = c.id AND ca.analysis_type = 'file'
           JOIN file_analyses fa ON fa.id = ca.analysis_id
           WHERE fa.sha256 = (SELECT sha256 FROM file_analyses WHERE id = ?)
           LIMIT 1`,
          [analysisId]
        );
        if (hashMatch) {
          return res.status(409).json({ error: `Caso ya existente para este archivo: "${hashMatch.title}" (${hashMatch.status})`, existing_case_id: hashMatch.id, existing_case_title: hashMatch.title, existing_case_status: hashMatch.status });
        }
      }
    }

    const id = uuidv4();
    const tagsJson = tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : null;
    await qRun(
      "INSERT INTO cases (id, title, description, severity, status, created_by, assigned_to, tags, tlp) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)",
      [id, title.trim(), description, severity, req.user.username, assigned_to, tagsJson, tlp]
    );
    if (analysisType && analysisId) {
      await qRun("INSERT IGNORE INTO case_analyses (case_id, analysis_id, analysis_type) VALUES (?, ?, ?)", [id, analysisId, analysisType]);
    }
    await logCaseActivity(id, "CASE_CREATED", `Caso creado por ${req.user.username}. Severidad: ${severity}`, req.user.username);
    if (assigned_to) await logCaseActivity(id, "ASSIGNED", `Asignado a ${assigned_to}`, req.user.username);
    await auditLog("CASE_CREATE", `Caso creado: ${title}`, req.user.username, req.user.role, req.ip, "ok");
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/cases", auth, analystOrAdmin, async (req, res) => {
  try {
    const { status, severity, limit = 100 } = req.query;
    let sql = "SELECT * FROM cases WHERE 1=1";
    const params = [];
    if (status)   { sql += " AND status = ?";   params.push(status); }
    if (severity) { sql += " AND severity = ?";  params.push(severity); }
    sql += ` ORDER BY ts DESC LIMIT ${parseInt(limit, 10)}`;
    const [rows] = await db.execute(sql, params);
    res.json({ cases: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/cases/:id", auth, analystOrAdmin, async (req, res) => {
  try {
    const c = await qRow("SELECT * FROM cases WHERE id = ?", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Caso no encontrado" });
    if (c.tags && typeof c.tags === "string") { try { c.tags = JSON.parse(c.tags); } catch { c.tags = []; } }
    const [notes]       = await db.execute("SELECT * FROM case_notes WHERE case_id = ? ORDER BY ts DESC", [req.params.id]);
    const [analyses]    = await db.execute("SELECT * FROM case_analyses WHERE case_id = ?", [req.params.id]);
    const [attachments] = await db.execute("SELECT id, original_name, mime_type, file_size, uploaded_by, ts FROM case_attachments WHERE case_id = ? ORDER BY ts DESC", [req.params.id]);
    const [observables] = await db.execute("SELECT * FROM case_observables WHERE case_id = ? ORDER BY ts DESC", [req.params.id]);
    const [activity]    = await db.execute("SELECT * FROM case_activity WHERE case_id = ? ORDER BY ts DESC LIMIT 100", [req.params.id]);
    const enriched = await Promise.all(analyses.map(async a => {
      let detail = null;
      try {
        if (a.analysis_type === "ioc")   detail = await qRow("SELECT ioc_value, ioc_type, threat_score, verdict, ts FROM ioc_investigations WHERE id = ?", [a.analysis_id]);
        if (a.analysis_type === "file")  detail = await qRow("SELECT filename, file_type, threat_score, verdict, ts FROM file_analyses WHERE id = ?", [a.analysis_id]);
        if (a.analysis_type === "email") detail = await qRow("SELECT subject, email_from, threat_score, verdict, ts FROM email_analyses WHERE id = ?", [a.analysis_id]);
      } catch {}
      return { ...a, detail };
    }));
    res.json({ ...c, notes, analyses: enriched, attachments, observables, activity });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/cases/:id", auth, analystOrAdmin, async (req, res) => {
  try {
    const c = await qRow("SELECT * FROM cases WHERE id = ?", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Caso no encontrado" });
    const { title, description, severity, status, assigned_to, tags, tlp } = req.body;
    const fields = [], params = [];
    if (title       !== undefined) { fields.push("title = ?");       params.push(title); }
    if (description !== undefined) { fields.push("description = ?"); params.push(description); }
    if (severity    !== undefined) { fields.push("severity = ?");    params.push(severity); }
    if (assigned_to !== undefined) { fields.push("assigned_to = ?"); params.push(assigned_to || null); }
    if (tlp         !== undefined) { fields.push("tlp = ?");         params.push(tlp); }
    if (tags        !== undefined) { fields.push("tags = ?");        params.push(tags ? JSON.stringify(Array.isArray(tags) ? tags : [tags]) : null); }
    if (status !== undefined && status !== c.status) {
      fields.push("status = ?"); params.push(status);
      const closing = ["resolved","closed"].includes(status) && !["resolved","closed"].includes(c.status);
      const reopening = !["resolved","closed"].includes(status) && ["resolved","closed"].includes(c.status);
      if (closing)   { fields.push("closed_by = ?"); params.push(req.user.username); fields.push("closed_at = NOW()"); }
      if (reopening) { fields.push("closed_by = NULL"); fields.push("closed_at = NULL"); }
      await logCaseActivity(req.params.id, "STATUS_CHANGE", `Estado: ${c.status} → ${status}`, req.user.username);
    }
    if (assigned_to !== undefined && assigned_to !== c.assigned_to) {
      await logCaseActivity(req.params.id, "ASSIGNED", assigned_to ? `Asignado a ${assigned_to}` : "Asignación removida", req.user.username);
    }
    if (fields.length) { params.push(req.params.id); await qRun(`UPDATE cases SET ${fields.join(", ")} WHERE id = ?`, params); }
    await auditLog("CASE_UPDATE", `Caso ${req.params.id} actualizado`, req.user.username, req.user.role, req.ip, "ok");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id", auth, adminOnly, async (req, res) => {
  try {
    const c = await qRow("SELECT id FROM cases WHERE id = ?", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Caso no encontrado" });
    // Borrar adjuntos del disco
    const [attachRows] = await db.execute("SELECT filename FROM case_attachments WHERE case_id = ?", [req.params.id]);
    for (const a of attachRows) { try { fs.unlinkSync(path.join(ATTACH_DIR, a.filename)); } catch {} }
    await qRun("DELETE FROM case_notes        WHERE case_id = ?", [req.params.id]);
    await qRun("DELETE FROM case_analyses     WHERE case_id = ?", [req.params.id]);
    await qRun("DELETE FROM case_attachments  WHERE case_id = ?", [req.params.id]);
    await qRun("DELETE FROM case_observables  WHERE case_id = ?", [req.params.id]);
    await qRun("DELETE FROM case_activity     WHERE case_id = ?", [req.params.id]);
    await qRun("DELETE FROM cases             WHERE id = ?",      [req.params.id]);
    await auditLog("CASE_DELETE", `Caso ${req.params.id} eliminado`, req.user.username, req.user.role, req.ip, "ok");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/cases/:id/notes", auth, analystOrAdmin, async (req, res) => {
  try {
    const c = await qRow("SELECT id FROM cases WHERE id = ?", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Caso no encontrado" });
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "content es requerido" });
    const noteId = uuidv4();
    await qRun("INSERT INTO case_notes (id, case_id, content, author) VALUES (?, ?, ?, ?)",
      [noteId, req.params.id, content.trim(), req.user.username]);
    await logCaseActivity(req.params.id, "NOTE_ADDED", content.trim().slice(0, 100), req.user.username);
    res.json({ ok: true, id: noteId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id/notes/:noteId", auth, analystOrAdmin, async (req, res) => {
  try {
    await qRun("DELETE FROM case_notes WHERE id = ? AND case_id = ?", [req.params.noteId, req.params.id]);
    await logCaseActivity(req.params.id, "NOTE_DELETED", "Nota eliminada", req.user.username);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/cases/:id/analyses", auth, analystOrAdmin, async (req, res) => {
  try {
    const c = await qRow("SELECT id FROM cases WHERE id = ?", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Caso no encontrado" });
    const { analysisType, analysisId } = req.body;
    if (!analysisType || !analysisId) return res.status(400).json({ error: "analysisType y analysisId requeridos" });
    await qRun("INSERT IGNORE INTO case_analyses (case_id, analysis_id, analysis_type) VALUES (?, ?, ?)",
      [req.params.id, analysisId, analysisType]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id/analyses/:type/:analysisId", auth, analystOrAdmin, async (req, res) => {
  try {
    await qRun("DELETE FROM case_analyses WHERE case_id = ? AND analysis_id = ? AND analysis_type = ?",
      [req.params.id, req.params.analysisId, req.params.type]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Adjuntos ──────────────────────────────────────────────────────────────────
app.post("/api/cases/:id/attachments", auth, analystOrAdmin, attachUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Archivo requerido" });
    const c = await qRow("SELECT id FROM cases WHERE id = ?", [req.params.id]);
    if (!c) { fs.unlinkSync(req.file.path); return res.status(404).json({ error: "Caso no encontrado" }); }
    const id = uuidv4();
    await qRun("INSERT INTO case_attachments (id,case_id,filename,original_name,mime_type,file_size,uploaded_by) VALUES (?,?,?,?,?,?,?)",
      [id, req.params.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.username]);
    await logCaseActivity(req.params.id, "ATTACHMENT_ADDED", `Archivo adjuntado: ${req.file.originalname}`, req.user.username);
    res.json({ ok: true, id, original_name: req.file.originalname, mime_type: req.file.mimetype, file_size: req.file.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/cases/:id/attachments/:attachId", auth, analystOrAdmin, async (req, res) => {
  try {
    const a = await qRow("SELECT * FROM case_attachments WHERE id = ? AND case_id = ?", [req.params.attachId, req.params.id]);
    if (!a) return res.status(404).json({ error: "Adjunto no encontrado" });
    const filePath = path.join(ATTACH_DIR, a.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Archivo no encontrado en disco" });
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(a.original_name)}"`);
    res.setHeader("Content-Type", a.mime_type || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id/attachments/:attachId", auth, analystOrAdmin, async (req, res) => {
  try {
    const a = await qRow("SELECT * FROM case_attachments WHERE id = ? AND case_id = ?", [req.params.attachId, req.params.id]);
    if (!a) return res.status(404).json({ error: "Adjunto no encontrado" });
    try { fs.unlinkSync(path.join(ATTACH_DIR, a.filename)); } catch {}
    await qRun("DELETE FROM case_attachments WHERE id = ?", [req.params.attachId]);
    await logCaseActivity(req.params.id, "ATTACHMENT_DELETED", `Archivo eliminado: ${a.original_name}`, req.user.username);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Observables ───────────────────────────────────────────────────────────────
app.post("/api/cases/:id/observables", auth, analystOrAdmin, async (req, res) => {
  try {
    const c = await qRow("SELECT id FROM cases WHERE id = ?", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Caso no encontrado" });
    const { obs_type, value, is_ioc = false, description = "" } = req.body;
    if (!obs_type || !value?.trim()) return res.status(400).json({ error: "obs_type y value son requeridos" });
    const id = uuidv4();
    await qRun("INSERT INTO case_observables (id,case_id,obs_type,value,is_ioc,description,created_by) VALUES (?,?,?,?,?,?,?)",
      [id, req.params.id, obs_type, value.trim(), is_ioc ? 1 : 0, description, req.user.username]);
    await logCaseActivity(req.params.id, "OBSERVABLE_ADDED", `${obs_type}: ${value.trim()}${is_ioc ? " [IOC]" : ""}`, req.user.username);
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id/observables/:obsId", auth, analystOrAdmin, async (req, res) => {
  try {
    const o = await qRow("SELECT value FROM case_observables WHERE id = ? AND case_id = ?", [req.params.obsId, req.params.id]);
    if (!o) return res.status(404).json({ error: "Observable no encontrado" });
    await qRun("DELETE FROM case_observables WHERE id = ?", [req.params.obsId]);
    await logCaseActivity(req.params.id, "OBSERVABLE_DELETED", `Observable eliminado: ${o.value}`, req.user.username);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────────────────────────────────────

async function getAnalysisRow(type, id) {
  if (type === "ioc")   return qRow("SELECT * FROM ioc_investigations WHERE id = ?",  [id]);
  if (type === "file")  return qRow("SELECT * FROM file_analyses      WHERE id = ?",  [id]);
  if (type === "email") return qRow("SELECT * FROM email_analyses      WHERE id = ?",  [id]);
  if (type === "case") {
    const c = await qRow("SELECT * FROM cases WHERE id = ?", [id]);
    if (!c) return null;
    const [analyses, notes, observables, attachments, activity] = await Promise.all([
      qRows("SELECT ca.analysis_type, ca.analysis_id FROM case_analyses ca WHERE ca.case_id = ?", [id]),
      qRows("SELECT * FROM case_notes WHERE case_id = ? ORDER BY ts", [id]),
      qRows("SELECT * FROM case_observables WHERE case_id = ? ORDER BY ts", [id]).catch(() => []),
      qRows("SELECT id, original_name, mime_type, file_size, uploaded_by, ts FROM case_attachments WHERE case_id = ? ORDER BY ts", [id]).catch(() => []),
      qRows("SELECT * FROM case_activity WHERE case_id = ? ORDER BY ts", [id]).catch(() => []),
    ]);
    c.analyses    = analyses;
    c.notes       = notes;
    c.observables = observables;
    c.attachments = attachments;
    c.activity    = activity;
    try { if (typeof c.tags === "string") c.tags = JSON.parse(c.tags); } catch { c.tags = []; }
    return c;
  }
  return null;
}

app.get("/api/reports/:type/:id/json", auth, analystOrAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!["ioc","file","email","case"].includes(type)) return res.status(400).json({ error: "Tipo inválido" });
    const row = await getAnalysisRow(type, id);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="gjallarhorn-${type}-${id.slice(0,8)}.json"`);
    res.json({ platform: "Gjallarhorn Blue Team Platform", report_type: type, generated_at: new Date().toISOString(), ...row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildHtmlReport(type, row) {
  if (type === "case") {
    const SEV  = { low: "#3fb950", medium: "#d29922", high: "#f97316", critical: "#f85149" };
    const STAT = { open: "#388bfd", investigating: "#d29922", resolved: "#3fb950", closed: "#6e7681" };
    const TLP  = { 0: { label: "WHITE", color: "#e6edf3" }, 1: { label: "GREEN", color: "#3fb950" }, 2: { label: "AMBER", color: "#d29922" }, 3: { label: "RED", color: "#f85149" } };
    const ACT  = { CASE_CREATED: "Caso creado", STATUS_CHANGE: "Estado cambiado", ASSIGNED: "Asignación", NOTE_ADDED: "Nota agregada", NOTE_DELETED: "Nota eliminada", ATTACHMENT_ADDED: "Archivo adjuntado", ATTACHMENT_DELETED: "Archivo eliminado", OBSERVABLE_ADDED: "Observable agregado", OBSERVABLE_DELETED: "Observable eliminado", PUSHED_THEHIVE: "Enviado a TheHive" };

    const tlpMeta   = TLP[row.tlp ?? 2] || TLP[2];
    const tags      = Array.isArray(row.tags) ? row.tags : [];
    const tagsHtml  = tags.length ? tags.map(t => `<span class="badge" style="background:#388bfd22;color:#58a6ff;font-size:11px">${t}</span>`).join(" ") : "<span style='color:#6e7681'>Sin tags</span>";

    const notesHtml = (row.notes || []).map(n =>
      `<div class="note"><div class="note-meta">${n.author} · ${new Date(n.ts).toLocaleString("es-AR")}</div><p>${n.content.replace(/\n/g,"<br>")}</p></div>`
    ).join("") || "<p style='color:#6e7681'>Sin notas.</p>";

    const analysesHtml = (row.analyses || []).map(a =>
      `<tr><td>${a.analysis_type.toUpperCase()}</td><td class="mono">${a.analysis_id}</td></tr>`
    ).join("") || "<tr><td colspan='2' style='color:#6e7681'>Sin análisis vinculados.</td></tr>";

    const obsHtml = (row.observables || []).length === 0
      ? "<tr><td colspan='4' style='color:#6e7681'>Sin observables.</td></tr>"
      : (row.observables || []).map(o =>
          `<tr><td><span class="badge" style="background:#388bfd22;color:#58a6ff;font-size:10px">${o.obs_type}</span></td><td class="mono">${o.value}</td><td style="color:${o.is_ioc?"#f85149":"#6e7681"}">${o.is_ioc?"IOC":"—"}</td><td>${o.created_by||"—"}</td></tr>`
        ).join("");

    const attHtml = (row.attachments || []).length === 0
      ? "<tr><td colspan='4' style='color:#6e7681'>Sin adjuntos.</td></tr>"
      : (row.attachments || []).map(a =>
          `<tr><td>${a.original_name}</td><td>${a.mime_type||"—"}</td><td>${a.file_size ? (a.file_size/1024).toFixed(1)+" KB" : "—"}</td><td>${a.uploaded_by||"—"} · ${new Date(a.ts).toLocaleString("es-AR")}</td></tr>`
        ).join("");

    const actHtml = (row.activity || []).length === 0
      ? "<tr><td colspan='3' style='color:#6e7681'>Sin actividad registrada.</td></tr>"
      : (row.activity || []).map(a =>
          `<tr><td>${ACT[a.action]||a.action}</td><td>${a.detail||"—"}</td><td>${a.username||"—"} · ${new Date(a.ts).toLocaleString("es-AR")}</td></tr>`
        ).join("");

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Caso: ${row.title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;max-width:960px;margin:0 auto;padding:32px}
h1{font-size:24px;margin-bottom:4px}h2{font-size:13px;font-weight:700;color:#58a6ff;text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid #21262d;padding-bottom:8px;margin:28px 0 12px}
.badge{display:inline-block;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;margin:0 3px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #21262d}
th{color:#8b949e;font-weight:600;font-size:11px;text-transform:uppercase}.mono{font-family:monospace;font-size:11px;word-break:break-all}
.note{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:12px 16px;margin-bottom:10px}
.note-meta{font-size:11px;color:#8b949e;margin-bottom:6px}.footer{margin-top:48px;font-size:11px;color:#484f58;text-align:center}
.meta-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}</style>
</head><body>
<div style="margin-bottom:24px;font-size:14px;color:#388bfd;font-weight:800;letter-spacing:.04em">GJALLARHORN</div>
<h1>${row.title}</h1>
<div class="meta-row">
  <span class="badge" style="background:${SEV[row.severity]||"#6e7681"}33;color:${SEV[row.severity]||"#6e7681"}">${row.severity?.toUpperCase()}</span>
  <span class="badge" style="background:${STAT[row.status]||"#6e7681"}33;color:${STAT[row.status]||"#6e7681"}">${row.status?.toUpperCase()}</span>
  <span class="badge" style="background:${tlpMeta.color}22;color:${tlpMeta.color};border:1px solid ${tlpMeta.color}44">TLP:${tlpMeta.label}</span>
  ${row.thehive_case_id ? `<span class="badge" style="background:#388bfd33;color:#388bfd">TheHive #${row.thehive_case_id}</span>` : ""}
</div>
<table style="margin-bottom:4px"><tbody>
  <tr><th style="width:160px">Creado por</th><td>${row.created_by||"—"} · ${new Date(row.ts).toLocaleString("es-AR")}</td></tr>
  ${row.assigned_to ? `<tr><th>Asignado a</th><td>${row.assigned_to}</td></tr>` : ""}
  ${row.closed_by   ? `<tr><th>Cerrado por</th><td>${row.closed_by} · ${row.closed_at ? new Date(row.closed_at).toLocaleString("es-AR") : "—"}</td></tr>` : ""}
</tbody></table>
<h2>Tags</h2><div style="margin-bottom:8px">${tagsHtml}</div>
<h2>Descripción</h2><p style="font-size:13px;line-height:1.7">${(row.description||"Sin descripción.").replace(/\n/g,"<br>")}</p>
<h2>Observables</h2><table><thead><tr><th>Tipo</th><th>Valor</th><th>IOC</th><th>Registrado por</th></tr></thead><tbody>${obsHtml}</tbody></table>
<h2>Análisis vinculados</h2><table><thead><tr><th>Tipo</th><th>ID</th></tr></thead><tbody>${analysesHtml}</tbody></table>
<h2>Notas</h2>${notesHtml}
<h2>Adjuntos</h2><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Tamaño</th><th>Subido por</th></tr></thead><tbody>${attHtml}</tbody></table>
<h2>Actividad</h2><table><thead><tr><th>Acción</th><th>Detalle</th><th>Usuario · Fecha</th></tr></thead><tbody>${actHtml}</tbody></table>
<div class="footer">Generado por Gjallarhorn Blue Team Platform · ${new Date().toLocaleString("es-AR")}</div>
</body></html>`;
  }

  const VC = { MALICIOUS: "#f85149", SUSPICIOUS: "#d29922", CLEAN: "#3fb950", UNKNOWN: "#6e7681" };
  const col = VC[row.verdict] || "#6e7681";
  const score = row.threat_score || 0;
  const ts = new Date(row.ts).toLocaleString("es-AR");
  const typeLabel = type === "ioc" ? "Investigación IOC" : type === "file" ? "Análisis de Archivo" : "Forense de Email";

  let body = "";
  if (type === "ioc") {
    const sd = row.sources_data || {};
    const sourceRows = Object.entries(sd).map(([k,v]) =>
      `<tr><td>${k}</td><td style="color:${v.detected?"#f85149":"#3fb950"}">${v.detected?"Detectado":"Limpio"}</td><td>${v.message||"—"}</td></tr>`
    ).join("");
    body = `
      <div class="section"><h3>IOC</h3><table>
        <tr><th>Campo</th><th>Valor</th></tr>
        <tr><td>IOC</td><td class="mono">${row.ioc_value}</td></tr>
        <tr><td>Tipo</td><td>${row.ioc_type}</td></tr>
        <tr><td>Analista</td><td>${row.analyst||"—"}</td></tr>
        <tr><td>Fecha</td><td>${ts}</td></tr>
      </table></div>
      ${sourceRows ? `<div class="section"><h3>Fuentes</h3><table><tr><th>Fuente</th><th>Resultado</th><th>Detalle</th></tr>${sourceRows}</table></div>` : ""}`;
  } else if (type === "file") {
    const a = row.analysis_data || {};
    const detRows = (a.detections||[]).map(d=>`<li>${d}</li>`).join("");
    body = `
      <div class="section"><h3>Archivo</h3><table>
        <tr><th>Campo</th><th>Valor</th></tr>
        <tr><td>Nombre</td><td>${row.filename}</td></tr>
        <tr><td>Tipo</td><td>${row.file_type}</td></tr>
        <tr><td>Tamaño</td><td>${row.file_size ? (row.file_size/1024).toFixed(1)+" KB" : "—"}</td></tr>
        <tr><td>MD5</td><td class="mono">${row.md5||"—"}</td></tr>
        <tr><td>SHA1</td><td class="mono">${row.sha1||"—"}</td></tr>
        <tr><td>SHA256</td><td class="mono">${row.sha256||"—"}</td></tr>
        <tr><td>Analista</td><td>${row.analyst||"—"}</td></tr>
        <tr><td>Fecha</td><td>${ts}</td></tr>
      </table></div>
      ${detRows ? `<div class="section"><h3>Detecciones</h3><ul>${detRows}</ul></div>` : ""}`;
  } else {
    body = `
      <div class="section"><h3>Email</h3><table>
        <tr><th>Campo</th><th>Valor</th></tr>
        <tr><td>Asunto</td><td>${row.subject||"—"}</td></tr>
        <tr><td>Remitente</td><td>${row.email_from||"—"}</td></tr>
        <tr><td>Destinatario</td><td>${row.email_to||"—"}</td></tr>
        <tr><td>Phishing</td><td style="color:${row.is_phishing?"#f85149":"#3fb950"}">${row.is_phishing?"SÍ":"NO"}</td></tr>
        <tr><td>BEC</td><td style="color:${row.is_bec?"#f85149":"#3fb950"}">${row.is_bec?"SÍ":"NO"}</td></tr>
        <tr><td>Analista</td><td>${row.analyst||"—"}</td></tr>
        <tr><td>Fecha</td><td>${ts}</td></tr>
      </table></div>`;
  }

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Gjallarhorn — ${typeLabel}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:32px;font-size:14px}
.logo{font-size:22px;font-weight:800;color:#58a6ff;letter-spacing:.04em}
.sub{color:#8b949e;font-size:13px;margin-top:4px;margin-bottom:24px;padding-bottom:20px;border-bottom:2px solid #30363d}
.verdict{display:inline-block;padding:5px 16px;border-radius:6px;font-weight:700;font-size:17px;background:${col}22;color:${col};border:1px solid ${col}55;margin-bottom:6px}
.bar{height:8px;background:#21262d;border-radius:4px;overflow:hidden;margin-bottom:20px;max-width:300px}
.fill{height:100%;background:${score>=70?"#f85149":score>=40?"#d29922":"#3fb950"};width:${score}%}
.section{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:18px;margin-bottom:18px}
.section h3{font-size:12px;font-weight:700;color:#58a6ff;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em}
table{width:100%;border-collapse:collapse}
th{text-align:left;color:#8b949e;font-size:11px;font-weight:600;padding:5px 10px;border-bottom:1px solid #30363d;text-transform:uppercase}
td{padding:7px 10px;border-bottom:1px solid #21262d;vertical-align:top;font-size:13px}
tr:last-child td{border-bottom:none}
.mono{font-family:monospace;font-size:11px;word-break:break-all}
ul{margin:0;padding-left:18px;line-height:1.8;font-size:13px}
.footer{margin-top:28px;padding-top:14px;border-top:1px solid #30363d;font-size:11px;color:#6e7681;text-align:center}
</style></head><body>
<div class="logo">Gjallarhorn</div>
<div class="sub">Blue Team Platform — ${typeLabel}<br>Generado: ${new Date().toLocaleString("es-AR")}</div>
<div class="verdict">${row.verdict}</div>
<div class="bar"><div class="fill"></div></div>
<div style="color:#8b949e;font-size:12px;margin-bottom:20px">Score: ${score}/100 · ${ts}</div>
${body}
<div class="footer">Gjallarhorn Blue Team Platform · ${new Date().getFullYear()}</div>
</body></html>`;
}

app.get("/api/reports/:type/:id/html", auth, analystOrAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!["ioc","file","email","case"].includes(type)) return res.status(400).json({ error: "Tipo inválido" });
    const row = await getAnalysisRow(type, id);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gjallarhorn-${type}-${id.slice(0,8)}.html"`);
    res.send(buildHtmlReport(type, row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildMitreLayer(type, row) {
  const score = row.threat_score || 0;
  const techniques = [];
  if (type === "ioc" && score >= 40) {
    techniques.push({ techniqueID: "T1071", score, comment: `IOC: ${row.ioc_value} — ${row.verdict}` });
    if (row.ioc_type === "ipv4")   techniques.push({ techniqueID: "T1071.001", score, comment: "C2 via HTTP/S" });
    if (row.ioc_type === "url")    techniques.push({ techniqueID: "T1566.002", score, comment: "URL maliciosa" });
    if (row.ioc_type === "domain") techniques.push({ techniqueID: "T1568",     score, comment: "Dominio sospechoso" });
    if (["md5","sha1","sha256"].includes(row.ioc_type)) techniques.push({ techniqueID: "T1204.002", score, comment: "Hash malicioso" });
  }
  if (type === "email") {
    if (row.is_phishing) {
      techniques.push({ techniqueID: "T1566",     score, comment: "Phishing detectado" });
      techniques.push({ techniqueID: "T1566.001", score, comment: "Spearphishing attachment" });
      techniques.push({ techniqueID: "T1566.002", score, comment: "Spearphishing link" });
    }
    if (row.is_bec) {
      techniques.push({ techniqueID: "T1534", score, comment: "BEC — Internal Spearphishing" });
      techniques.push({ techniqueID: "T1078", score, comment: "BEC — Valid Account impersonation" });
    }
  }
  if (type === "file" && score >= 40) {
    techniques.push({ techniqueID: "T1204.002", score, comment: `Archivo: ${row.filename}` });
    const a = row.analysis_data || {};
    const dets = (a.detections || []).join(" ").toLowerCase();
    if (/beacon|cobalt|c2/.test(dets))   { techniques.push({ techniqueID: "T1071", score, comment: "C2 framework" }); techniques.push({ techniqueID: "T1055", score, comment: "Process injection" }); }
    if (/ransomware/.test(dets))          { techniques.push({ techniqueID: "T1486", score, comment: "Ransomware" }); techniques.push({ techniqueID: "T1490", score, comment: "Shadow copy deletion" }); }
    if (/macro/.test(dets))               { techniques.push({ techniqueID: "T1566.001", score, comment: "Macro maliciosa" }); techniques.push({ techniqueID: "T1059.005", score, comment: "VBScript execution" }); }
    if (/powershell/.test(dets) || row.file_type === "powershell") techniques.push({ techniqueID: "T1059.001", score, comment: "PowerShell malicioso" });
  }
  if (type === "case") {
    const SEV_SCORE = { low: 25, medium: 50, high: 75, critical: 95 };
    const s = SEV_SCORE[row.severity] || 50;
    techniques.push({ techniqueID: "T1078", score: s, comment: `Caso: ${row.title}` });
    if (row.status === "investigating") techniques.push({ techniqueID: "T1071", score: s, comment: "Bajo investigación" });
  }

  return {
    name: `Gjallarhorn — ${type.toUpperCase()} Analysis`,
    versions: { attack: "14", navigator: "4.9", layer: "4.5" },
    domain: "enterprise-attack",
    description: `Técnicas detectadas — ${new Date().toISOString()}`,
    filters: { platforms: ["Windows","Linux","macOS"] },
    sorting: 3,
    layout: { layout: "side", aggregateFunction: "max", showID: false, showName: true },
    hideDisabled: false,
    techniques,
    gradient: { colors: ["#ff6666","#ffe766","#8ec843"], minValue: 0, maxValue: 100 },
    legendItems: [], metadata: [], links: [],
    showTacticRowBackground: false, tacticRowBackground: "#dddddd",
    selectTechniquesAcrossTactics: true, selectSubtechniquesWithParent: false, selectVisibleTechniques: false,
  };
}

app.get("/api/reports/:type/:id/mitre", auth, analystOrAdmin, async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!["ioc","file","email","case"].includes(type)) return res.status(400).json({ error: "Tipo inválido" });
    const row = await getAnalysisRow(type, id);
    if (!row) return res.status(404).json({ error: "Análisis no encontrado" });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="gjallarhorn-mitre-${type}-${id.slice(0,8)}.json"`);
    res.json(buildMitreLayer(type, row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CORRELATION ENGINE & PLAYBOOKS
// ─────────────────────────────────────────────────────────────────────────────

function isPrivateIP(ip) {
  const p = ip.split(".").map(Number);
  return p[0] === 10 || p[0] === 127 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168);
}

async function addTimelineEvent(source, eventType, severity, data = {}) {
  try {
    await qRun(
      "INSERT INTO events_timeline (id, source, event_type, severity, data) VALUES (?,?,?,?,?)",
      [uuidv4(), source, eventType, severity, JSON.stringify(data)]
    );
  } catch (e) { console.error("[Timeline]", e.message); }
}

// Timeline endpoints
app.get("/api/timeline", auth, analystOrAdmin, async (req, res) => {
  try {
    const limit  = parseInt(Math.min(Number(req.query.limit) || 50, 500), 10);
    const source = req.query.source;
    let sql = "SELECT * FROM events_timeline WHERE 1=1";
    const params = [];
    if (source) { sql += " AND source = ?"; params.push(source); }
    sql += ` ORDER BY ts DESC LIMIT ${limit}`;
    const [rows] = await db.execute(sql, params);
    res.json({ events: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Activity data para el chart del dashboard
app.get("/api/dashboard/activity", auth, async (req, res) => {
  try {
    const activity = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const [[ioc], [file], [email], [cases]] = await Promise.all([
        db.execute("SELECT COUNT(*) c FROM ioc_investigations WHERE DATE(ts)=?",  [date]),
        db.execute("SELECT COUNT(*) c FROM file_analyses      WHERE DATE(ts)=?",  [date]),
        db.execute("SELECT COUNT(*) c FROM email_analyses     WHERE DATE(ts)=?",  [date]),
        db.execute("SELECT COUNT(*) c FROM cases              WHERE DATE(ts)=?",  [date]),
      ]);
      activity.push({ date, ioc: ioc[0].c, file: file[0].c, email: email[0].c, cases: cases[0].c });
    }
    res.json({ activity });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// DB INIT & START
// ─────────────────────────────────────────────────────────────────────────────
async function initDB() {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id           VARCHAR(36)  PRIMARY KEY,
    username     VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role         ENUM('admin','analyst','viewer') NOT NULL DEFAULT 'analyst',
    nombre       VARCHAR(255) NOT NULL,
    enabled      TINYINT(1)   NOT NULL DEFAULT 1,
    totp_secret  VARCHAR(255),
    token_version INT NOT NULL DEFAULT 0,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until  DATETIME NULL,
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.execute(
    "ALTER TABLE users MODIFY COLUMN role ENUM('admin','analyst','viewer') NOT NULL DEFAULT 'analyst'"
  ).catch(() => {});
  for (const col of [
    "ADD COLUMN token_version INT NOT NULL DEFAULT 0",
    "ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0",
    "ADD COLUMN locked_until DATETIME NULL",
  ]) { await db.execute(`ALTER TABLE users ${col}`).catch(() => {}); }

  await db.execute(`CREATE TABLE IF NOT EXISTS audit_logs (
    id       VARCHAR(36)  PRIMARY KEY,
    ts       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    action   VARCHAR(100) NOT NULL,
    detail   TEXT,
    username VARCHAR(100),
    nombre   VARCHAR(255),
    role     VARCHAR(50),
    result   VARCHAR(20),
    ip       VARCHAR(100),
    browser  VARCHAR(255),
    os       VARCHAR(100)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS platform_configs (
    platform     VARCHAR(50) PRIMARY KEY,
    url          TEXT,
    api_key      TEXT,
    username     VARCHAR(255),
    password     TEXT,
    extra_config JSON,
    verify_ssl   TINYINT(1)  DEFAULT 0,
    enabled      TINYINT(1)  DEFAULT 1,
    last_check   DATETIME,
    last_status  VARCHAR(20) DEFAULT 'unknown',
    last_message TEXT,
    updated_at   DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by   VARCHAR(100)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS settings (
    key_name VARCHAR(100) PRIMARY KEY,
    value    MEDIUMTEXT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Migrate existing installs from TEXT → MEDIUMTEXT (idempotent)
  await db.execute(`ALTER TABLE settings MODIFY COLUMN value MEDIUMTEXT`).catch(() => {});

  await db.execute(`CREATE TABLE IF NOT EXISTS soc_cache (
    key_name   VARCHAR(200) PRIMARY KEY,
    data       JSON,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS file_analyses (
    id           VARCHAR(36)  PRIMARY KEY,
    ts           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    filename     VARCHAR(500) NOT NULL,
    file_size    INT          NOT NULL DEFAULT 0,
    file_type    VARCHAR(100),
    md5          VARCHAR(32),
    sha1         VARCHAR(40),
    sha256       VARCHAR(64),
    threat_score INT          NOT NULL DEFAULT 0,
    verdict      VARCHAR(20)  NOT NULL DEFAULT 'UNKNOWN',
    analysis_data JSON,
    analyst      VARCHAR(100),
    thehive_case_id VARCHAR(100)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS ioc_investigations (
    id           VARCHAR(36)  PRIMARY KEY,
    ts           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    ioc_value    VARCHAR(500) NOT NULL,
    ioc_type     VARCHAR(20)  NOT NULL,
    threat_score INT          NOT NULL DEFAULT 0,
    verdict      VARCHAR(20)  NOT NULL DEFAULT 'UNKNOWN',
    sources_data JSON,
    rules_data   JSON,
    analyst      VARCHAR(100),
    thehive_case_id VARCHAR(100)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS email_analyses (
    id              VARCHAR(36)  PRIMARY KEY,
    ts              DATETIME     DEFAULT CURRENT_TIMESTAMP,
    subject         VARCHAR(1000),
    email_from      VARCHAR(500),
    email_to        TEXT,
    message_id      VARCHAR(500),
    threat_score    INT          NOT NULL DEFAULT 0,
    verdict         VARCHAR(20)  NOT NULL DEFAULT 'UNKNOWN',
    is_phishing     TINYINT(1)   NOT NULL DEFAULT 0,
    is_bec          TINYINT(1)   NOT NULL DEFAULT 0,
    analysis_data   JSON,
    rules_data      JSON,
    analyst         VARCHAR(100),
    thehive_case_id VARCHAR(100)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS cases (
    id              VARCHAR(36)  PRIMARY KEY,
    ts              DATETIME     DEFAULT CURRENT_TIMESTAMP,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    severity        ENUM('low','medium','high','critical') DEFAULT 'medium',
    status          ENUM('open','investigating','resolved','closed') DEFAULT 'open',
    created_by      VARCHAR(100),
    thehive_case_id VARCHAR(100),
    assigned_to     VARCHAR(100)  DEFAULT NULL,
    closed_by       VARCHAR(100)  DEFAULT NULL,
    closed_at       DATETIME      DEFAULT NULL,
    tags            TEXT          DEFAULT NULL,
    tlp             TINYINT       DEFAULT 2
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Migración: agregar columnas si la tabla ya existe
  for (const col of [
    "ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(100) DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS closed_by   VARCHAR(100) DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS closed_at   DATETIME     DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS tags        TEXT         DEFAULT NULL",
    "ADD COLUMN IF NOT EXISTS tlp         TINYINT      DEFAULT 2",
  ]) { await db.execute(`ALTER TABLE cases ${col}`).catch(() => {}); }

  await db.execute(`CREATE TABLE IF NOT EXISTS case_attachments (
    id            VARCHAR(36)  PRIMARY KEY,
    case_id       VARCHAR(36)  NOT NULL,
    filename      VARCHAR(255) NOT NULL,
    original_name VARCHAR(500) NOT NULL,
    mime_type     VARCHAR(100),
    file_size     INT          DEFAULT 0,
    uploaded_by   VARCHAR(100) NOT NULL,
    ts            DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX (case_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS case_observables (
    id          VARCHAR(36)  PRIMARY KEY,
    case_id     VARCHAR(36)  NOT NULL,
    obs_type    VARCHAR(50)  NOT NULL,
    value       TEXT         NOT NULL,
    is_ioc      TINYINT(1)   DEFAULT 0,
    description TEXT,
    created_by  VARCHAR(100) NOT NULL,
    ts          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX (case_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS case_activity (
    id        VARCHAR(36)  PRIMARY KEY,
    case_id   VARCHAR(36)  NOT NULL,
    action    VARCHAR(100) NOT NULL,
    detail    TEXT,
    username  VARCHAR(100) NOT NULL,
    ts        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX (case_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS case_analyses (
    case_id       VARCHAR(36) NOT NULL,
    analysis_id   VARCHAR(36) NOT NULL,
    analysis_type ENUM('ioc','file','email') NOT NULL,
    linked_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (case_id, analysis_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS case_notes (
    id      VARCHAR(36)  PRIMARY KEY,
    case_id VARCHAR(36)  NOT NULL,
    ts      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    content TEXT         NOT NULL,
    author  VARCHAR(100)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.execute(`CREATE TABLE IF NOT EXISTS events_timeline (
    id           VARCHAR(36)  PRIMARY KEY,
    ts           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    source       VARCHAR(50)  NOT NULL,
    event_type   VARCHAR(100) NOT NULL,
    severity     ENUM('low','medium','high','critical') DEFAULT 'medium',
    data         JSON
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Add ai_analysis columns if they don't exist yet
  for (const tbl of ['ioc_investigations', 'file_analyses', 'email_analyses']) {
    await db.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='ai_analysis'`, [tbl]
    ).then(([rows]) => rows.length === 0
      ? db.execute(`ALTER TABLE ${tbl} ADD COLUMN ai_analysis JSON`)
      : null
    ).catch(() => {});
  }


  // Seed admin user if no users exist
  const [cnt] = await db.execute("SELECT COUNT(*) as c FROM users");
  if (cnt[0].c === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await db.execute(
      "INSERT INTO users (id, username, password_hash, role, nombre) VALUES (?, 'admin', ?, 'admin', 'Administrador')",
      [uuidv4(), hash]
    );
    console.log("[Gjallar] Usuario admin creado: admin / admin123");
    console.log("[Gjallar] IMPORTANTE: Cambia la contraseña inmediatamente en Perfil.");
  }
}

// ── Bug Report ──────────────────────────────────────────────────────────────
// Community edition: redirect to GitHub Issues
app.post("/api/bug-report", auth, async (req, res) => {
  res.json({ ok: true, github: "https://github.com/allsafe-ar/Gjallarhorn-community/issues" });
});

// Serve frontend SPA in production (Docker / standalone)
const DIST = path.join(__dirname, "public");
if (require("fs").existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get("*", (_, res) => res.sendFile(path.join(DIST, "index.html")));
}

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`[Gjallar] API escuchando en puerto ${PORT}`);
    });
  } catch (e) {
    console.error("[Gjallar] Error al iniciar:", e.message);
    process.exit(1);
  }
}

start();
