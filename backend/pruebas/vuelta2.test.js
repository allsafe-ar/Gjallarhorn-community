// Pruebas de regresión de la segunda vuelta de la auditoría de octubre de 2026 (Gjallarhorn
// Community): lo que la reauditoría encontró abierto o a medias. Cada una falla con el código
// anterior a la corrección. `npm test` desde backend/.
"use strict";
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { arrancar, SECRETO } = require("./servidor");
const totp = require("../totp");

const SALUD = "/api/health";
const CLAVE = "ClaveDePrueba-123";
const HASH = bcrypt.hashSync(CLAVE, 4);
const ADMIN = { id: "u-admin", username: "admin", role: "admin", nombre: "Admin", enabled: 1, token_version: 0, password_hash: HASH };
const CON2FA = { id: "u-2fa", username: "con2fa", role: "analyst", nombre: "Con 2FA", enabled: 1, token_version: 0, password_hash: HASH, totp_secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" };
const NUEVO = { id: "u-nuevo", username: "nuevo", role: "admin", nombre: "Nuevo", enabled: 1, token_version: 0, password_hash: HASH, must_change_password: 1 };
const tokenDe = (u) => jwt.sign({ id: u.id, username: u.username, role: u.role, nombre: u.nombre, tv: 0 }, SECRETO);
const codigoActual = (s) => totp.codigoDe(s, Math.floor(Date.now() / 30000));

// El análisis corre en otro proceso para que una regex cuadrática falle por tiempo y no cuelgue.
function analizarTexto(cuerpo, ms, asunto = "t") {
  const eml = `From: a@b.c\r\nTo: d@e.f\r\nSubject: ${asunto}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${cuerpo}`;
  const guion = `const { analyzeEmail } = require(${JSON.stringify(path.join(__dirname, "..", "integrations", "email-analyzer.js"))});
    let b = ""; process.stdin.on("data", d => b += d).on("end", () => analyzeEmail(Buffer.from(b)).then(r => console.log(JSON.stringify(r.bec.indicators.map(i => i.check)))));`;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["-e", guion], { input: eml, timeout: ms, killSignal: "SIGKILL", maxBuffer: 1 << 20 });
  let checks = null; try { checks = JSON.parse(String(r.stdout)); } catch {}
  return { ms: Date.now() - t0, terminado: r.status === 0, checks, salida: String(r.stdout) + String(r.stderr) };
}

describe("G-01: la detección de BEC no es cúbica", () => {
  test("48 KB de 'new account' sin 'details' (antes ~2 minutos)", () => {
    const r = analizarTexto("new account ".repeat(4000), 15000);
    assert.ok(r.terminado, `no terminó en 15 s: ${r.salida.slice(0, 300)}`);
    assert.ok(r.ms < 5000, `tardó ${r.ms} ms`);
  });
  test("un asunto enorme tampoco congela el análisis", () => {
    const r = analizarTexto("hola", 15000, "new account ".repeat(4000));
    assert.ok(r.terminado, `no terminó en 15 s: ${r.salida.slice(0, 300)}`);
    assert.ok(r.ms < 5000, `tardó ${r.ms} ms`);
  });
  test("sigue detectando el cambio de cuenta bancaria, en la misma línea", () => {
    const si = analizarTexto("Please use our NEW bank account details for the next transfer.", 15000);
    assert.ok(si.checks.includes("Fraude de nómina / HR"), JSON.stringify(si.checks));
    const tambien = analizarTexto("We need to update our banking info.", 15000);
    assert.ok(tambien.checks.includes("Fraude de nómina / HR"));
    const no = analizarTexto("new\naccount\ndetails", 15000); // `.` no cruza saltos de línea
    assert.ok(!no.checks.includes("Fraude de nómina / HR"));
  });
});

describe("rutas", () => {
  let srv;
  before(async () => {
    srv = await arrancar({
      salud: SALUD,
      env: { TRUST_PROXY: "false" },
      datos: {
        usuarios: [ADMIN, CON2FA, NUEVO],
        reglas: [
          { re: "FROM platform_configs WHERE platform = \\?", filas: [{ platform: "wazuh", url: "https://w", username: "wazuh-wui", password: "CLAVE-WAZUH-SECRETA", api_key: "APIKEY-SECRETA", enabled: 1, extra_config: { secretKey: "EXTRA-SECRETA", region: "ar" } }] },
        ],
      },
    });
  });
  after(() => srv.cerrar());

  test("G-06: GET /api/platforms/:platform no devuelve credenciales", async () => {
    const r = await srv.pedir("GET", "/api/platforms/wazuh", { token: tokenDe(ADMIN) });
    assert.equal(r.status, 200);
    for (const s of ["CLAVE-WAZUH-SECRETA", "APIKEY-SECRETA", "EXTRA-SECRETA"]) assert.ok(!r.texto.includes(s), s);
    assert.equal(r.json.password_set, true);
    assert.equal(r.json.api_key_set, true);
    assert.equal(r.json.extra_config.region, "ar");
  });

  test("G-06: guardar el formulario sin el secreto de extra_config no lo borra", async () => {
    const r = await srv.pedir("PUT", "/api/platforms/wazuh", { token: tokenDe(ADMIN), body: { url: "https://w", extra_config: { region: "uy" } } });
    assert.equal(r.status, 200);
    const upd = srv.sql().filter(q => q.sql.startsWith("UPDATE platform_configs SET url")).pop();
    const extra = JSON.parse(upd.p.find(v => typeof v === "string" && v.includes("region")));
    assert.deepEqual(extra, { region: "uy", secretKey: "EXTRA-SECRETA" });
  });

  test("G-09: activar el 2FA sin la contraseña no se acepta", async () => {
    const secreto = totp.generarSecreto();
    const r = await srv.pedir("POST", "/api/auth/setup-totp", { token: tokenDe(ADMIN), body: { totpSecret: secreto, totpToken: codigoActual(secreto) } });
    assert.equal(r.status, 400);
    const mal = await srv.pedir("POST", "/api/auth/setup-totp", { token: tokenDe(ADMIN), body: { totpSecret: secreto, totpToken: codigoActual(secreto), password: "otra" } });
    assert.equal(mal.status, 401);
    assert.ok(!srv.sql().some(q => /SET totp_secret = \?/.test(q.sql)), "no se tiene que guardar el secreto");
  });

  test("G-09: no pisa un 2FA activo y con la contraseña sí lo activa", async () => {
    const secreto = totp.generarSecreto();
    const pisar = await srv.pedir("POST", "/api/auth/setup-totp", { token: tokenDe(CON2FA), body: { totpSecret: secreto, totpToken: codigoActual(secreto), password: CLAVE } });
    assert.equal(pisar.status, 409);
    const ok = await srv.pedir("POST", "/api/auth/setup-totp", { token: tokenDe(ADMIN), body: { totpSecret: secreto, totpToken: codigoActual(secreto), password: CLAVE } });
    assert.equal(ok.status, 200, ok.texto);
  });

  test("G-12: con la contraseña inicial solo se puede cambiarla", async () => {
    const bloqueado = await srv.pedir("GET", "/api/users", { token: tokenDe(NUEVO) });
    assert.equal(bloqueado.status, 403);
    assert.equal(bloqueado.json.mustChangePassword, true);
    const me = await srv.pedir("GET", "/api/auth/me", { token: tokenDe(NUEVO) });
    assert.equal(me.status, 200);
    const cambio = await srv.pedir("POST", "/api/auth/change-password", { token: tokenDe(NUEVO), body: { currentPassword: CLAVE, newPassword: "OtraClave-456" } });
    assert.equal(cambio.status, 200, cambio.texto);
    const upd = srv.sql().filter(q => /SET password_hash = \?/.test(q.sql)).pop();
    assert.match(upd.sql, /must_change_password = 0/);
  });

  test("G-11: la CSP está activa y sin upgrade-insecure-requests", async () => {
    const r = await srv.pedir("GET", SALUD);
    const csp = r.headers.get("content-security-policy") || "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.ok(!/upgrade-insecure-requests/.test(csp));
  });
});

describe("G-12: el primer arranque no crea admin/admin123", () => {
  const COUNT_CERO = { re: "SELECT COUNT\\(\\*\\) as c FROM users", filas: [{ c: 0 }] };
  const insertDelAdmin = (srv) => srv.sql().find(q => /^INSERT INTO users/.test(q.sql));

  test("sin variable: contraseña aleatoria, una vez en el log, y cambio obligatorio", async () => {
    const srv = await arrancar({ salud: SALUD, env: { TRUST_PROXY: "false", ADMIN_PASSWORD_INICIAL: "" }, datos: { reglas: [COUNT_CERO] } });
    try {
      const ins = insertDelAdmin(srv);
      assert.ok(ins, "no se creó el admin");
      assert.match(ins.sql, /must_change_password/);
      const hash = ins.p.find(v => typeof v === "string" && v.startsWith("$2"));
      assert.equal(bcrypt.compareSync("admin123", hash), false);
      const m = srv.salida().match(/se muestra una sola vez\): (\S+)/);
      assert.ok(m, srv.salida());
      assert.equal(bcrypt.compareSync(m[1], hash), true);
      assert.equal(srv.salida().split(m[1]).length - 1, 1);
    } finally { await srv.cerrar(); }
  });

  test("con ADMIN_PASSWORD_INICIAL: usa esa y no la imprime", async () => {
    const srv = await arrancar({ salud: SALUD, env: { TRUST_PROXY: "false", ADMIN_PASSWORD_INICIAL: "Inicial-Elegida-789" }, datos: { reglas: [COUNT_CERO] } });
    try {
      const hash = insertDelAdmin(srv).p.find(v => typeof v === "string" && v.startsWith("$2"));
      assert.equal(bcrypt.compareSync("Inicial-Elegida-789", hash), true);
      assert.ok(!srv.salida().includes("Inicial-Elegida-789"));
    } finally { await srv.cerrar(); }
  });
});
