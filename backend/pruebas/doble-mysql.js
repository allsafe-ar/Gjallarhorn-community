// Doble de mysql2 para las pruebas: se precarga con `node -r` y reemplaza el pool por uno
// en memoria, así el server.js real arranca sin base. Lo que responde sale de DOBLE_DATOS
// (JSON): `usuarios` (por id) y `reglas` [{ re, filas }] que se prueban en orden contra la
// consulta. Cada consulta queda anotada, una por línea, en DOBLE_SQL_LOG.
"use strict";
const fs = require("fs");
const Module = require("module");

const datos = JSON.parse(process.env.DOBLE_DATOS || "{}");
const usuarios = datos.usuarios || [];
const reglas = (datos.reglas || []).map(r => ({ re: new RegExp(r.re, "i"), filas: r.filas }));
const LOG = process.env.DOBLE_SQL_LOG;

function ejecutar(sql, p = []) {
  const s = String(sql).replace(/\s+/g, " ").trim();
  if (LOG) fs.appendFileSync(LOG, JSON.stringify({ sql: s, p }) + "\n");
  for (const r of reglas) if (r.re.test(s)) return [r.filas];
  if (/FROM users WHERE (username|email)\s*=\s*\?/i.test(s))
    return [usuarios.filter(u => u.username === p[0] || u.email === p[0])];
  if (/FROM users WHERE id\s*=\s*\?/i.test(s))
    return [usuarios.filter(u => String(u.id) === String(p[0]))];
  if (/COUNT\(/i.test(s)) return [[{ c: 1, total: 1, n: 1 }]];
  if (/^(SELECT|SHOW)/i.test(s)) return [[]];
  return [{ affectedRows: 1, insertId: 1 }];
}

const conexion = {
  execute: async (s, p) => ejecutar(s, p),
  query: async (s, p) => ejecutar(s, p),
  beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {},
  release() {}, end: async () => {},
};
const pool = { ...conexion, getConnection: async () => conexion, on() {} };

const cargar = Module._load;
Module._load = function (pedido) {
  if (pedido === "mysql2/promise") return { createPool: () => pool, createConnection: async () => conexion };
  return cargar.apply(this, arguments);
};
