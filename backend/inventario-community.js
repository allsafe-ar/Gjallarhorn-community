"use strict";
/**
 * Adaptador de Gjallarhorn Community para el módulo único de activos (`inventario/`, copia del
 * canónico de `utiles/activos`, el mismo que usan Skuld y Gjallarhorn Pro).
 *
 * Community es on-premise y de una sola organización: no hay inquilinos, todo vive con
 * `tenant_id` nulo. Recibe el inventario completo y los vencimientos con su semáforo. Los avisos por
 * correo, la lectura automática de certificados, la sincronización con Skuld y los permisos por
 * módulo son de Pro.
 */
const inventario = require("./inventario/inventario");
const esquema = require("./inventario/esquema");
const ingreso = require("./inventario/ingreso");
const { tipoPorTexto } = require("./inventario/inventario");

const CLAVE_MIGRACION = "inventario_migrado_v1";
const COLUMNAS_EXTRA = { monitoreado: "TINYINT(1) NOT NULL DEFAULT 1", zabbix_hostid: "VARCHAR(32) NULL" };
const alCrear = (fuente) => ({ monitoreado: ["propio", "sondeo", "manual"].includes(fuente) ? 1 : 0 });

function montar(app, { auth, adminOnly, auditLog, qRow, qRows, qRun, uuidv4 }) {
  inventario.montar(app, {
    qRow, qRows, qRun, uuidv4, sistema: "Gjallarhorn",
    mw: { leer: [auth], editar: [auth, adminOnly], borrar: [auth, adminOnly], administrar: [auth, adminOnly] },
    alcance: () => ({ tenant: null, clause: "", params: [] }),
    permite: () => true,
    usuario: (req) => req.user?.username,
    auditar: (req, accion, detalle) => auditLog(accion, detalle, req.user?.username, req.user?.role, req.ip, "ok"),
    alCrear,
    alFusionar: async (principalId, absorbidoId) => ({
      chequeos: ingreso.afectadas(await qRun("UPDATE monitor_chequeos SET activo_id = ? WHERE activo_id = ?", [principalId, absorbidoId])),
      eventos: ingreso.afectadas(await qRun("UPDATE monitor_eventos SET activo_id = ? WHERE activo_id = ?", [principalId, absorbidoId])),
    }),
  });
}

/** Crea las tablas, migra `monitor_activos` una vez y repunta la clave de los chequeos. Va ANTES de monitoreo.crearTablas. */
async function prepararEsquema({ qRow, qRows, qRun }) {
  await esquema.crearTablas({ qRun, qRows }, { columnasExtra: COLUMNAS_EXTRA });
  const hecha = await qRow("SELECT value FROM settings WHERE key_name = ?", [CLAVE_MIGRACION]).catch(() => null);
  if (!hecha && await existe(qRows, "monitor_activos")) {
    const r = await migrar({ qRow, qRows, qRun });
    await qRun("INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [CLAVE_MIGRACION, JSON.stringify({ ...r, fecha: new Date().toISOString() })]);
    console.log("[inventario] migración de monitor_activos completa:", JSON.stringify(r));
  } else if (!hecha) {
    await qRun("INSERT INTO settings (key_name, value) VALUES (?, ?)", [CLAVE_MIGRACION, JSON.stringify({ instalacion_nueva: true })]).catch(() => {});
  }
  await repuntarClaves({ qRows, qRun });
}

async function existe(qRows, tabla) {
  return (await qRows("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [tabla])).length > 0;
}

/**
 * Crea las tablas del inventario, migra `monitor_activos` una sola vez y repunta las claves foráneas
 * del monitoreo. ⚠️ Va ANTES de `monitoreo.crearTablas`: en una instalación nueva, `monitor_chequeos`
 * se crea apuntando a `activos`, que tiene que existir.
 *
 * Las tablas viejas no se borran: quedan como respaldo de la migración.
 */
async function prepararEsquema({ qRow, qRows, qRun }) {
  await esquema.crearTablas({ qRun, qRows }, { columnasExtra: COLUMNAS_EXTRA });
  const hecha = await qRow("SELECT value FROM settings WHERE key_name = ?", [CLAVE_MIGRACION]).catch(() => null);
  let resultado = { migrada: false };
  if (!hecha && await existe(qRows, "monitor_activos")) {
    resultado = await migrar({ qRow, qRows, qRun });
    await qRun("INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [CLAVE_MIGRACION, JSON.stringify({ ...resultado, fecha: new Date().toISOString() })]);
    console.log("[inventario] migración de monitor_activos completa:", JSON.stringify(resultado));
  } else if (!hecha) {
    await qRun("INSERT INTO settings (key_name, value) VALUES (?, ?)", [CLAVE_MIGRACION, JSON.stringify({ instalacion_nueva: true })]).catch(() => {});
  }
  await repuntarClaves({ qRows, qRun });
  return resultado;
}

const COLS_COPIADAS = ["id", "tenant_id", "nombre", "alias", "ip", "hostname", "grupo", "origen", "criticidad", "monitoreado", "notas",
  "so", "so_pista", "puertos", "sondeado_at", "visto_ultima", "created_by", "created_at", "mac", "serie", "modelo", "fabricante",
  "ubicacion", "responsable", "zabbix_hostid"];

async function migrar({ qRow, qRows, qRun }) {
  const cols = await esquema.columnasDe(qRows, "monitor_activos");
  const usar = COLS_COPIADAS.filter(c => cols.has(c));
  const filas = await qRows(`SELECT ${usar.join(", ")} FROM monitor_activos`);
  let copiadas = 0;
  for (const f of filas) {
    // Lo que se monitorea casi siempre es infraestructura: servidor salvo que el nombre o el grupo
    // digan otra cosa. Se corrige desde la ficha.
    const tipo = tipoPorTexto(`${f.grupo || ""} ${f.nombre || ""}`) || "servidor";
    const categoria = require("./inventario/taxonomia").CATEGORIA_DE[tipo] || "hardware";
    const fila = { ...f, categoria, tipo, puertos: f.puertos == null ? null : (typeof f.puertos === "string" ? f.puertos : JSON.stringify(f.puertos)) };
    const ks = Object.keys(fila);
    const r = await qRun(`INSERT IGNORE INTO activos (${ks.join(", ")}) VALUES (${ks.map(() => "?").join(",")})`, ks.map(k => fila[k]));
    if (ingreso.afectadas(r)) {
      copiadas++;
      await qRun("INSERT INTO activo_historial (id, tenant_id, activo_id, accion, despues, usuario) VALUES (UUID(),?,?,?,?,?)",
        [f.tenant_id ?? null, f.id, "alta", "migrado desde el inventario del monitoreo", "sistema"]);
    }
  }
  let fuentes = 0, uniones = 0;
  if (await existe(qRows, "monitor_activo_fuentes")) {
    fuentes = ingreso.afectadas(await qRun(
      `INSERT IGNORE INTO activo_fuentes (id, activo_id, fuente, externo_id, datos, visto_at)
       SELECT f.id, f.activo_id, f.fuente, f.externo_id, f.datos, f.visto_at FROM monitor_activo_fuentes f JOIN activos a ON a.id = f.activo_id`));
  }
  if (await existe(qRows, "monitor_activos_union")) {
    uniones = ingreso.afectadas(await qRun(
      `INSERT IGNORE INTO activo_uniones (id, tenant_id, activo_id, candidato_id, criterio, fuente, estado, resuelto_por, resuelto_at, created_at)
       SELECT u.id, u.tenant_id, u.activo_id, u.candidato_id, u.criterio, u.fuente, u.estado, u.resuelto_por, u.resuelto_at, u.created_at
         FROM monitor_activos_union u JOIN activos a ON a.id = u.activo_id JOIN activos b ON b.id = u.candidato_id`));
  }
  return { migrada: true, origen: filas.length, copiadas, fuentes, uniones };
}

/**
 * Las claves foráneas del monitoreo apuntaban a `monitor_activos`. Se repuntan a `activos` para que
 * borrar (de verdad) un activo siga arrastrando sus chequeos. Idempotente: solo actúa si encuentra una
 * clave que todavía apunta a la tabla vieja.
 */
async function repuntarClaves({ qRows, qRun }) {
  const viejas = await qRows(
    `SELECT TABLE_NAME AS t, CONSTRAINT_NAME AS c FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'monitor_activos' AND TABLE_NAME = 'monitor_chequeos'`);
  for (const v of viejas) {
    await qRun(`ALTER TABLE monitor_chequeos DROP FOREIGN KEY ${v.c}`);
    // Un chequeo de un activo que no llegó a migrarse quedaría huérfano y la clave no se podría crear.
    await qRun("DELETE c FROM monitor_chequeos c LEFT JOIN activos a ON a.id = c.activo_id WHERE a.id IS NULL");
    await qRun("ALTER TABLE monitor_chequeos ADD CONSTRAINT fk_chq_activo_inv FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE CASCADE");
  }
}

module.exports = { montar, prepararEsquema, migrar, CLAVE_MIGRACION };
