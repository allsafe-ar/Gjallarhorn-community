// Pruebas de regresión de la auditoría de seguridad de octubre de 2026 (Gjallarhorn Community).
// Cada una falla con el código anterior a la corrección. Corren contra el server.js real, con
// el doble de mysql2 (ver servidor.js): `npm test` desde backend/.
"use strict";
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { arrancar, correrHastaSalir, SECRETO } = require("./servidor");

const SALUD = "/api/health";
const ADMIN  = { id: "u-admin",  username: "admin",  role: "admin",  nombre: "Admin",  enabled: 1, token_version: 0, password_hash: "x" };
const VIEWER = { id: "u-viewer", username: "viewer", role: "viewer", nombre: "Viewer", enabled: 1, token_version: 0, password_hash: "x" };
const tokenDe = (u) => jwt.sign({ id: u.id, username: u.username, role: u.role, nombre: u.nombre, tv: 0 }, SECRETO);
const XSS = "<img src=x onerror=alert(document.domain)>";

describe("JWT_SECRET: el arranque rechaza valores de ejemplo o cortos", () => {
  test("no arranca con el valor del .env.example de antes", async () => {
    const r = await correrHastaSalir({ JWT_SECRET: "gjallar_jwt_secret_CHANGE_THIS_IN_PRODUCTION" });
    assert.equal(r.codigo, 1, r.salida);
    assert.match(r.salida, /FATAL: JWT_SECRET/);
  });
  test("no arranca con menos de 32 caracteres", async () => {
    const r = await correrHastaSalir({ JWT_SECRET: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d" }); // 31
    assert.equal(r.codigo, 1, r.salida);
  });
  test("el .env.example no trae un secreto que arranque", async () => {
    const ej = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
    const r = await correrHastaSalir({ JWT_SECRET: (ej.match(/^JWT_SECRET=(.*)$/m) || [])[1] || "" });
    assert.equal(r.codigo, 1, r.salida);
  });
});

// El análisis corre en otro proceso: una expresión regular cuadrática no se puede cortar desde
// el mismo hilo, y la prueba tiene que fallar por tiempo, no quedarse colgada.
function analizarConTope(cuerpoHtml, ms) {
  const eml = `From: a@b.c\r\nTo: d@e.f\r\nSubject: t\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${cuerpoHtml}`;
  const guion = `const { analyzeEmail } = require(${JSON.stringify(path.join(__dirname, "..", "integrations", "email-analyzer.js"))});
    let b = ""; process.stdin.on("data", d => b += d).on("end", () => analyzeEmail(Buffer.from(b)).then(r => console.log(JSON.stringify({ links: r.links.length }))));`;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["-e", guion], { input: eml, timeout: ms, killSignal: "SIGKILL", maxBuffer: 1 << 20 });
  return { ms: Date.now() - t0, terminado: r.status === 0, salida: String(r.stdout) + String(r.stderr) };
}

describe("G-01: un correo armado no congela el análisis", () => {
  test("4,5 MB de <area href> sin </a> (el caso del informe: 62 s)", () => {
    const r = analizarConTope("<html><body>" + '<area href="http://x.co">'.repeat(180000) + "</body></html>", 15000);
    assert.ok(r.terminado, `no terminó en 15 s: ${r.salida.slice(0, 300)}`);
    assert.ok(r.ms < 8000, `tardó ${r.ms} ms`);
  });
  test("una línea larga sin arroba (extracción de correos)", () => {
    const r = analizarConTope("<p>" + "a".repeat(1024 * 1024) + "</p>", 15000);
    assert.ok(r.terminado, `no terminó en 15 s: ${r.salida.slice(0, 300)}`);
    assert.ok(r.ms < 8000, `tardó ${r.ms} ms`);
  });
  test("un <img> enorme sin cerrar (detección de tracking pixel)", () => {
    const r = analizarConTope("<img " + "width=1 ".repeat(250000), 15000);
    assert.ok(r.terminado, `no terminó en 15 s: ${r.salida.slice(0, 300)}`);
    assert.ok(r.ms < 8000, `tardó ${r.ms} ms`);
  });
  test("sigue extrayendo los enlaces de un correo normal", () => {
    const { extractLinks } = require("../integrations/email-analyzer");
    const l = extractLinks(`<a href="https://evil.tk/login">paypal.com</a> <A HREF='http://bit.ly/x'>click <b>aca</b></A> https://plain.example.org/p`);
    assert.deepEqual(l.map(x => x.href), ["https://evil.tk/login", "http://bit.ly/x", "https://plain.example.org/p"]);
    assert.equal(l[0].mismatch, true);
    assert.equal(l[1].visibleText, "click aca");
  });
});

describe("rutas", () => {
  let srv;
  before(async () => {
    srv = await arrancar({
      salud: SALUD,
      env: { TRUST_PROXY: "false" },
      datos: {
        usuarios: [ADMIN, VIEWER],
        reglas: [
          { re: "FROM email_analyses WHERE id = \\?", filas: [{ id: "e1", ts: new Date().toISOString(), subject: XSS, email_from: '"<b>x</b>" <a@b.c>', email_to: "d@e.f", verdict: "SUSPICIOUS", threat_score: 50, analyst: "admin" }] },
          { re: "FROM file_analyses WHERE id = \\?", filas: [{ id: "f1", ts: new Date().toISOString(), filename: "x.exe", file_type: "PE", sha256: "aa", md5: "bb", file_size: 10, verdict: "MALICIOUS", threat_score: 80, analyst: "admin", analysis_data: "{}" }] },
          { re: "FROM platform_configs WHERE platform = \\?", filas: [{ platform: "thehive", url: "http://127.0.0.1:9", enabled: 1, api_key: "k" }] },
          { re: "FROM platform_configs ORDER BY", filas: [{ platform: "wazuh", url: "https://w", username: "wazuh-wui", password: "CLAVE-WAZUH-SECRETA", api_key: "APIKEY-SECRETA", enabled: 1, extra_config: { secretKey: "EXTRA-SECRETA", region: "ar" } }] },
        ],
      },
    });
  });
  after(() => srv.cerrar());

  test("G-02: el informe HTML escapa los datos del correo", async () => {
    const r = await srv.pedir("GET", "/api/reports/email/e1/html", { token: tokenDe(ADMIN) });
    assert.equal(r.status, 200);
    assert.ok(!r.texto.includes(XSS), "el asunto salió literal");
    assert.ok(!r.texto.includes("<b>x</b>"));
    assert.ok(r.texto.includes("&lt;img src=x onerror=alert(document.domain)&gt;"));
  });

  test("G-03: un usuario no puede escribir registros de auditoría", async () => {
    const r = await srv.pedir("POST", "/api/logs/add", { token: tokenDe(VIEWER), body: { action: "LOGIN_OK", username: "admin", role: "admin", ip: "10.0.0.1" } });
    assert.notEqual(r.status, 200);
    const falsos = srv.sql().filter(q => q.sql.startsWith("INSERT INTO audit_logs") && q.p.includes("10.0.0.1"));
    assert.equal(falsos.length, 0);
  });

  test("G-04: cambiar la contraseña exige la actual", async () => {
    const r = await srv.pedir("POST", "/api/auth/change-password", { token: tokenDe(VIEWER), body: { newPassword: "OtraClave123!" } });
    assert.equal(r.status, 400);
    assert.ok(!srv.sql().some(q => /SET password_hash/.test(q.sql)), "no se tiene que tocar la contraseña");
  });

  test("G-05: X-Forwarded-For no elige la IP de la auditoría", async () => {
    await srv.pedir("POST", "/api/auth/login", { body: { username: "nadie", password: "x" }, headers: { "X-Forwarded-For": "1.3.3.7" } });
    const fila = srv.sql().filter(q => q.sql.startsWith("INSERT INTO audit_logs")).pop();
    assert.ok(fila);
    assert.ok(!fila.p.includes("1.3.3.7"), JSON.stringify(fila.p));
  });

  test("G-06: las credenciales de las plataformas no vuelven al navegador, tampoco al admin", async () => {
    const r = await srv.pedir("GET", "/api/platforms", { token: tokenDe(ADMIN) });
    assert.equal(r.status, 200);
    for (const s of ["CLAVE-WAZUH-SECRETA", "APIKEY-SECRETA", "EXTRA-SECRETA"]) assert.ok(!r.texto.includes(s), s);
    assert.equal(r.json.platforms[0].password_set, true);
    assert.equal(r.json.platforms[0].extra_config.region, "ar");
  });

  test("G-07: crear el caso en TheHive no tira 500 (theHive estaba sin importar)", async () => {
    const r = await srv.pedir("POST", "/api/files/f1/create-case", { token: tokenDe(ADMIN), body: {} });
    assert.equal(r.status, 502, r.texto); // TheHive inalcanzable: error de pasarela, no ReferenceError
  });

  test("G-08: el rol viewer no dispara la prueba de conexión de una plataforma", async () => {
    const r = await srv.pedir("POST", "/api/platforms/wazuh/test", { token: tokenDe(VIEWER), body: {} });
    assert.equal(r.status, 403);
  });

  test("G-10: cambiar el rol revoca las sesiones abiertas", async () => {
    const r = await srv.pedir("PUT", "/api/users/u-viewer", { token: tokenDe(ADMIN), body: { username: "viewer", role: "analyst", nombre: "Viewer", enabled: true } });
    assert.equal(r.status, 200);
    const upd = srv.sql().filter(q => q.sql.startsWith("UPDATE users SET username=?")).pop();
    assert.match(upd.sql, /token_version = token_version \+/);
    assert.equal(upd.p[4], 1);
  });
});
