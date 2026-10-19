"use strict";
/**
 * Resolución de activos que podrían ser el mismo equipo. Canónico: idéntico en Skuld y Gjallarhorn.
 *
 * 🔑 **Por qué existe.** La ingesta no adivina: cuando una fuente trae algo parecido a otro activo
 * sin un dato fuerte que lo confirme (serie o MAC), lo crea igual y anota la sospecha en
 * `activo_uniones`. Sin esta pantalla esa anotación no la lee nadie, y el sistema sabe que hay un
 * problema y se lo guarda.
 *
 * ⚠️ **La fusión no se puede deshacer.** Lo que colgaba del absorbido pasa al principal y la fila se
 * borra. Por eso la decide una persona, queda en la auditoría y en el historial de los dos.
 *
 * 🔑 **Qué sobrevive.** Lo que cargó una persona gana siempre. Si el principal tiene alias,
 * criticidad o notas, quedan; si están vacíos, se completan con los del absorbido.
 *
 * Lo que cuelga del activo en cada sistema (chequeos y eventos en Gjallarhorn) lo mueve el adaptador
 * con `dep.alFusionar(principalId, absorbidoId)`, que devuelve qué movió.
 */

const { discrepancias } = require("./identidad");
const { anotar, afectadas } = require("./ingreso");

const DESCRIPTIVOS = ["ip", "hostname", "mac", "serie", "modelo", "fabricante", "so", "so_version",
                      "grupo", "ubicacion", "responsable", "area", "numero_inventario"];
const DEL_CLIENTE = ["alias", "criticidad", "notas", "propietario", "propietario_usuario", "propietario_correo",
                     "custodio", "asignado_a", "clasificacion"];

/** Dudas abiertas, con los datos de los dos activos y en qué se contradicen. */
async function pendientes(dep, scope) {
  const filas = await dep.qRows(
    `SELECT u.id, u.criterio, u.fuente, u.created_at,
            a.id  AS a_id, a.nombre AS a_nombre, a.ip AS a_ip, a.hostname AS a_hostname,
            a.mac AS a_mac, a.serie AS a_serie, a.so AS a_so, a.origen AS a_origen, a.created_at AS a_creado,
            b.id  AS b_id, b.nombre AS b_nombre, b.ip AS b_ip, b.hostname AS b_hostname,
            b.mac AS b_mac, b.serie AS b_serie, b.so AS b_so, b.origen AS b_origen, b.created_at AS b_creado
       FROM activo_uniones u
       JOIN activos a ON a.id = u.activo_id
       JOIN activos b ON b.id = u.candidato_id
      WHERE u.estado = 'pendiente'${scope.clause}
      ORDER BY u.created_at DESC`, scope.params);

  return Promise.all(filas.map(async f => {
    const lado = (p) => Object.fromEntries(
      Object.entries(f).filter(([k]) => k.startsWith(p + "_")).map(([k, v]) => [k.slice(2), v]));
    const a = lado("a"), b = lado("b");
    return {
      id: f.id, criterio: f.criterio, fuente: f.fuente, created_at: f.created_at,
      a: { ...a, fuentes: await fuentesDe(dep, a.id) },
      b: { ...b, fuentes: await fuentesDe(dep, b.id) },
      // ⚠️ Claves fijas y no el origen de cada uno: los dos suelen venir de la misma fuente y con
      // el origen como clave el objeto colapsa en una entrada y no encuentra nunca diferencias.
      discrepancias: discrepancias({ recien_llegado: a, ya_estaba: b }),
    };
  }));
}

async function fuentesDe(dep, activoId) {
  return (await dep.qRows("SELECT fuente, externo_id, visto_at FROM activo_fuentes WHERE activo_id = ?", [activoId])) || [];
}

/** Une dos activos en uno. `principalId` es el que queda. */
async function fusionar(dep, { tenant, principalId, absorbidoId, usuario }) {
  const { qRow, qRun } = dep;
  if (!principalId || !absorbidoId) return { ok: false, error: "Faltan los dos activos." };
  if (principalId === absorbidoId) return { ok: false, error: "Es el mismo activo." };

  const p = await qRow("SELECT * FROM activos WHERE id = ? AND tenant_id <=> ? AND eliminado_at IS NULL", [principalId, tenant]);
  const b = await qRow("SELECT * FROM activos WHERE id = ? AND tenant_id <=> ? AND eliminado_at IS NULL", [absorbidoId, tenant]);
  if (!p || !b) return { ok: false, error: "Alguno de los dos activos ya no existe." };

  const movidos = { fuentes: 0, vencimientos: 0, asignaciones: 0, hijos: 0, campos: [], sistema: {} };

  // 1. Procedencias. Único por (activo, fuente): si el principal ya la tiene, gana la suya.
  for (const f of await fuentesDe(dep, absorbidoId)) {
    const choca = await qRow("SELECT id FROM activo_fuentes WHERE activo_id = ? AND fuente = ?", [principalId, f.fuente]);
    if (choca) {
      await qRun("DELETE FROM activo_fuentes WHERE activo_id = ? AND fuente = ?", [absorbidoId, f.fuente]);
    } else {
      await qRun("UPDATE activo_fuentes SET activo_id = ? WHERE activo_id = ? AND fuente = ?", [principalId, absorbidoId, f.fuente]);
      movidos.fuentes++;
    }
  }

  // 2. Lo que es historia o compromiso del equipo pasa entero: el equipo es uno solo.
  movidos.vencimientos = afectadas(await qRun("UPDATE activo_vencimientos SET activo_id = ? WHERE activo_id = ?", [principalId, absorbidoId]));
  movidos.asignaciones = afectadas(await qRun("UPDATE activo_asignaciones SET activo_id = ? WHERE activo_id = ?", [principalId, absorbidoId]));
  movidos.hijos        = afectadas(await qRun("UPDATE activos SET padre_id = ? WHERE padre_id = ?", [principalId, absorbidoId]));
  await qRun("UPDATE activo_historial SET activo_id = ? WHERE activo_id = ?", [principalId, absorbidoId]);
  if (dep.alFusionar) movidos.sistema = (await dep.alFusionar(principalId, absorbidoId)) || {};

  // 3. Se completan los huecos del que queda. Nunca se pisa un valor que ya tenía.
  const vacio = (v) => v == null || String(v).trim() === "";
  const set = {};
  for (const c of [...DESCRIPTIVOS, ...DEL_CLIENTE]) {
    if (c in p && vacio(p[c]) && !vacio(b[c])) { set[c] = b[c]; movidos.campos.push(c); }
  }
  if (Object.keys(set).length) {
    await qRun(`UPDATE activos SET ${Object.keys(set).map(k => `${k} = ?`).join(", ")} WHERE id = ?`, [...Object.values(set), principalId]);
  }

  // 4. Se va la fila absorbida y las dudas que involucraban a cualquiera de los dos.
  await qRun("DELETE FROM activo_uniones WHERE activo_id IN (?,?) OR candidato_id IN (?,?)", [principalId, absorbidoId, principalId, absorbidoId]);
  await qRun("DELETE FROM activos WHERE id = ?", [absorbidoId]);
  await anotar(dep, { tenant, activoId: principalId, accion: "fusion", antes: b.nombre, despues: p.nombre, usuario });

  return { ok: true, movidos, principal: p.nombre, absorbido: b.nombre };
}

/**
 * Se decide que NO son el mismo equipo. ⚠️ Se marca, no se borra: si se borrara, la próxima
 * importación volvería a proponer la misma unión para siempre.
 */
async function descartar(dep, { tenant, unionId, usuario }) {
  const r = await dep.qRun(
    `UPDATE activo_uniones SET estado = 'descartado', resuelto_por = ?, resuelto_at = NOW()
      WHERE id = ? AND tenant_id <=> ?`, [usuario || null, unionId, tenant]);
  return { ok: afectadas(r) > 0 };
}

module.exports = { pendientes, fusionar, descartar, fuentesDe, DESCRIPTIVOS, DEL_CLIENTE };
