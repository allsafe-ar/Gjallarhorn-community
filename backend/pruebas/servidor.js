// Arranca el server.js real con el doble de mysql2 (doble-mysql.js) en un puerto libre y
// ofrece pedir() contra él. Para las pruebas de regresión: ninguna toca una base real.
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");

const BACKEND = path.join(__dirname, "..");
const SECRETO = "pruebas-" + "0123456789abcdef".repeat(4);

const puertoLibre = () => new Promise((ok, mal) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); });
  s.on("error", mal);
});

// Corre el server.js y espera a que termine solo (para el control de arranque).
function correrHastaSalir(env, msMax = 10000) {
  return new Promise((ok) => {
    const hijo = spawn(process.execPath, ["-r", path.join(__dirname, "doble-mysql.js"), "server.js"], {
      cwd: BACKEND, env: { ...process.env, PORT: "0", NODE_ENV: "test", ...env },
    });
    let salida = "";
    hijo.stdout.on("data", d => { salida += d; });
    hijo.stderr.on("data", d => { salida += d; });
    const t = setTimeout(() => hijo.kill("SIGKILL"), msMax);
    hijo.on("exit", (codigo, senal) => { clearTimeout(t); ok({ codigo, senal, salida }); });
  });
}

async function arrancar({ datos = {}, env = {}, salud }) {
  const port = await puertoLibre();
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "doble-")), "sql.log");
  fs.writeFileSync(log, "");
  const hijo = spawn(process.execPath, ["-r", path.join(__dirname, "doble-mysql.js"), "server.js"], {
    cwd: BACKEND,
    env: { ...process.env, NODE_ENV: "test", JWT_SECRET: SECRETO, ...env, PORT: String(port),
           DOBLE_DATOS: JSON.stringify(datos), DOBLE_SQL_LOG: log },
  });
  let salida = "";
  hijo.stdout.on("data", d => { salida += d; });
  hijo.stderr.on("data", d => { salida += d; });
  const base = `http://127.0.0.1:${port}`;
  const limite = Date.now() + 15000;
  for (;;) {
    if (hijo.exitCode !== null) throw new Error("el servidor terminó al arrancar:\n" + salida);
    try { if ((await fetch(base + salud)).ok) break; } catch {}
    if (Date.now() > limite) { hijo.kill("SIGKILL"); throw new Error("el servidor no arrancó:\n" + salida); }
    await new Promise(r => setTimeout(r, 100));
  }
  return {
    base,
    salida: () => salida,
    async pedir(metodo, ruta, { token, body, headers = {} } = {}) {
      const h = { ...headers };
      if (token) h.Authorization = "Bearer " + token;
      let cuerpo;
      if (body !== undefined) {
        if (typeof body === "string" || body instanceof FormData) cuerpo = body;
        else { cuerpo = JSON.stringify(body); h["Content-Type"] = "application/json"; }
      }
      const r = await fetch(base + ruta, { method: metodo, headers: h, body: cuerpo });
      const texto = await r.text();
      let json = null; try { json = JSON.parse(texto); } catch {}
      return { status: r.status, texto, json, headers: r.headers };
    },
    // Consultas que el servidor mandó al doble desde que arrancó.
    sql: () => fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)),
    cerrar: () => new Promise(ok => { if (hijo.exitCode !== null) return ok(); hijo.on("exit", ok); hijo.kill("SIGKILL"); }),
  };
}

module.exports = { arrancar, correrHastaSalir, SECRETO };
