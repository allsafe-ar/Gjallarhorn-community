"use strict";
/**
 * Ingreso de activos desde cualquier fuente, sin duplicar. Canónico: idéntico en Skuld y Gjallarhorn.
 *
 * Es el único camino por el que un activo entra o se actualiza desde afuera: Zabbix, GLPI, Huginn,
 * un CSV y el sondeo pasan todos por acá, así que la regla de no duplicar se aplica una sola vez.
 * Nació en Gjallarhorn (`activos-ingreso.js`); al volverse canónico, Skuld gana la deduplicación y
 * Gjallarhorn gana Huginn.
 *
 * 🔑 **Lo que edita una persona no se pisa nunca.** El alias, la criticidad, el propietario, la
 * clasificación y las notas son información de la organización que ninguna fuente conoce. Una
 * reimportación que las borrara haría que nadie volviera a usar la función.
 */

const { emparejar } = require("./identidad");
const { CATEGORIA_DE } = require("./taxonomia");

/** Campos que llegan de una fuente y describen al equipo. */
const CAMPOS = ["nombre", "ip", "hostname", "mac", "serie", "modelo", "fabricante", "so", "so_version",
                "version", "url", "grupo", "ubicacion", "responsable", "area"];

/** Campos de la organización: ninguna importación los toca sobre un activo que ya existe. */
const NUESTROS = ["alias", "criticidad", "notas", "monitoreado", "propietario", "propietario_usuario",
                  "propietario_correo", "custodio", "asignado_a", "clasificacion", "estado",
                  "val_confidencialidad", "val_integridad", "val_disponibilidad", "datos_personales"];

/** Al crear sí se aceptan, si la fuente los trae (un CSV o el huginn.json declarativo). */
const AL_CREAR = ["categoria", "tipo", "cantidad", "criticidad", "clasificacion", "propietario", "notas",
                  "expuesto_internet", "estado", "numero_inventario", "proveedor", "fecha_compra", "factura",
                  "costo", "moneda", "centro_costo", "custodio", "asignado_a", "datos_personales", "alias"];

function limpiar(e, lista) {
  const o = {};
  for (const k of lista) if (e[k] != null && String(e[k]).trim() !== "") o[k] = typeof e[k] === "number" ? e[k] : String(e[k]).trim();
  return o;
}

/**
 * Ingresa o actualiza un activo.
 *
 * @param dep      { qRow, qRows, qRun, uuidv4, historial? }
 * @param opciones { tenant, fuente, externoId, entrante, usuario, agrupado? }
 *   · `agrupado` · el activo es una fila agrupada (cantidad > 1) o no tiene identidad de red:
 *     un "40 puestos Windows 11" o una base de datos no se empareja contra nada, se crea.
 *
 * Devuelve `{ accion, id, criterio? }` donde `accion` es:
 *   · `nuevo` · `vinculado` (ya existía por otra fuente) · `actualizado` (ya lo traía esta fuente)
 *   · `nuevo_con_duda` (se creó, pero se parece a otro: lo decide una persona) · `descartado`
 */
async function ingresar(dep, { tenant, fuente, externoId, entrante, usuario, agrupado = false }) {
  const { qRow, qRows, qRun, uuidv4 } = dep;
  const e = limpiar(entrante, CAMPOS);
  if (!e.nombre && !e.hostname && !e.ip) return { accion: "descartado", motivo: "sin datos para identificarlo" };
  if (!e.nombre) e.nombre = e.hostname || e.ip;

  // 1. ¿Esta misma fuente ya lo había traído? Es el camino más frecuente y el más barato.
  if (externoId) {
    const ya = await qRow(
      `SELECT a.id FROM activo_fuentes f JOIN activos a ON a.id = f.activo_id
        WHERE f.fuente = ? AND f.externo_id = ? AND a.tenant_id <=> ? AND a.eliminado_at IS NULL`,
      [fuente, String(externoId), tenant]);
    if (ya) {
      await actualizar(dep, ya.id, e, fuente, externoId, entrante, tenant, usuario);
      return { accion: "actualizado", id: ya.id };
    }
  }

  // 2. ¿Lo trajo otra fuente? Se busca por los datos de identidad, del más fuerte al más débil.
  let m = null;
  if (!agrupado) {
    const existentes = await qRows(
      `SELECT id, nombre, ip, hostname, mac, serie FROM activos
        WHERE tenant_id <=> ? AND eliminado_at IS NULL AND cantidad = 1`, [tenant]);
    m = emparejar(e, existentes);
    if (m && m.id && m.seguro) {
      await actualizar(dep, m.id, e, fuente, externoId, entrante, tenant, usuario);
      return { accion: "vinculado", id: m.id, criterio: m.criterio };
    }
  }

  // 3. Se crea con todos sus datos. Si había una coincidencia débil o ambigua, queda anotada.
  //
  // ⚠️ Nunca devolver sin crear: se perderían la serie y la MAC que trae esta fuente, la siguiente
  // fuente no encontraría con qué emparejar y crearía el duplicado que se quería evitar.
  const id = uuidv4();
  const fila = { ...limpiar(entrante, AL_CREAR), ...e };
  if (fila.tipo && !fila.categoria) fila.categoria = CATEGORIA_DE[fila.tipo] || "hardware";
  if (fila.categoria && fila.tipo && CATEGORIA_DE[fila.tipo] !== fila.categoria) fila.tipo = defectoDe(fila.categoria);
  if (entrante.atributos && typeof entrante.atributos === "object") fila.atributos = JSON.stringify(entrante.atributos);
  if (entrante.padre_id) fila.padre_id = entrante.padre_id;
  if (dep.alCrear) Object.assign(fila, dep.alCrear(fuente) || {});

  const cols = Object.keys(fila);
  await qRun(
    `INSERT INTO activos (id, tenant_id, origen, visto_ultima, created_by${cols.length ? ", " + cols.join(", ") : ""})
     VALUES (?,?,?,${esVerificada(fuente) ? "NOW()" : "NULL"},?${cols.map(() => ",?").join("")})`,
    [id, tenant, fuente, usuario || null, ...cols.map(k => fila[k])]);
  await registrarFuente(dep, id, fuente, externoId, entrante);
  await anotar(dep, { tenant, activoId: id, accion: "alta", despues: `desde ${fuente}`, usuario });

  if (m && (m.id || m.ambiguo)) {
    await anotarUnion(dep, tenant, id, m, fuente);
    return { accion: "nuevo_con_duda", id, criterio: m.criterio,
             motivo: m.ambiguo ? `coincide con ${m.ambiguo} activos por ${m.criterio}`
                               : `podría ser el mismo que otro, por ${m.criterio}` };
  }
  return { accion: "nuevo", id };
}

function esVerificada(fuente) {
  return ["huginn", "zabbix", "glpi", "sondeo", "propio", "gjallarhorn"].includes(fuente);
}

function defectoDe(categoria) {
  return { hardware: "otro_hw", software: "aplicacion", servicio: "interno", informacion: "archivos",
           intangible: "proceso", instalacion: "sede" }[categoria] || "otro_hw";
}

/** Deja anotado que dos activos podrían ser el mismo, para que alguien lo resuelva. */
async function anotarUnion(dep, tenant, activoId, m, fuente) {
  if (!m.id) return;      // ambiguo entre varios: no hay un candidato único que proponer
  await dep.qRun(
    `INSERT INTO activo_uniones (id, tenant_id, activo_id, candidato_id, criterio, fuente)
     VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE criterio = VALUES(criterio)`,
    [dep.uuidv4(), tenant, activoId, m.id, m.criterio, fuente]).catch(() => {});
}

/** Actualiza lo que describe al equipo, sin tocar lo que es de la organización. */
async function actualizar(dep, id, e, fuente, externoId, crudo, tenant, usuario) {
  const cols = Object.keys(e).filter(k => !NUESTROS.includes(k));
  if (cols.length) {
    const antes = await dep.qRow(`SELECT ${cols.join(", ")} FROM activos WHERE id = ?`, [id]);
    await dep.qRun(
      `UPDATE activos SET ${cols.map(k => `${k} = ?`).join(", ")}${esVerificada(fuente) ? ", visto_ultima = NOW()" : ""} WHERE id = ?`,
      [...cols.map(k => e[k]), id]);
    // Solo los campos que cambiaron de verdad: un historial que anota cada reimportación igual
    // no lo lee nadie.
    for (const k of cols) {
      const a = antes?.[k] == null ? "" : String(antes[k]);
      if (a !== String(e[k])) await anotar(dep, { tenant, activoId: id, accion: "importacion", campo: k, antes: a, despues: e[k], usuario: usuario || fuente });
    }
  }
  await registrarFuente(dep, id, fuente, externoId, crudo);
}

async function registrarFuente(dep, activoId, fuente, externoId, datos) {
  await dep.qRun(
    `INSERT INTO activo_fuentes (id, activo_id, fuente, externo_id, datos, visto_at)
     VALUES (?,?,?,?,?,NOW())
     ON DUPLICATE KEY UPDATE externo_id = VALUES(externo_id), datos = VALUES(datos), visto_at = NOW()`,
    [dep.uuidv4(), activoId, fuente, externoId ? String(externoId) : null, JSON.stringify(datos || {})]);
}

/** Una línea en el historial del activo. Nunca hace fallar la operación que la origina. */
async function anotar(dep, { tenant, activoId, accion, campo = null, antes = null, despues = null, usuario = null }) {
  await dep.qRun(
    `INSERT INTO activo_historial (id, tenant_id, activo_id, accion, campo, antes, despues, usuario)
     VALUES (?,?,?,?,?,?,?,?)`,
    [dep.uuidv4(), tenant, activoId, accion, campo,
     antes == null ? null : String(antes).slice(0, 2000), despues == null ? null : String(despues).slice(0, 2000),
     usuario]).catch(() => {});
}

/**
 * Filas afectadas de un `qRun`. ⚠️ En Skuld y en Gjallarhorn `qRun` es `db.execute` y devuelve el par
 * `[resultado, campos]` de mysql2, no el resultado: leer `.affectedRows` directo da undefined y todo
 * lo que dependa de eso se saltea en silencio (le pasó a la primera versión de la migración).
 */
function afectadas(r) {
  const x = Array.isArray(r) ? r[0] : r;
  return Number(x?.affectedRows || 0);
}

module.exports = { ingresar, anotar, registrarFuente, afectadas, CAMPOS, NUESTROS, AL_CREAR };
