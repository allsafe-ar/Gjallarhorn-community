"use strict";
/**
 * Vencimientos de activos: semáforo, proyección de costos y avisos escalonados. Canónico.
 *
 * 🔑 **Por qué importa.** Una garantía vencida se descubre el día que el equipo se rompe; un
 * certificado vencido, el día que el sitio deja de abrir; una licencia, en la auditoría. En los tres
 * casos la fecha se conocía desde la compra. Este módulo existe para que nadie se entere tarde.
 *
 * Las fechas se tratan como fechas de calendario (DATE), sin hora ni zona: un vencimiento "el 31/10"
 * vence el 31/10 en Buenos Aires y en la nube. ⚠️ `toISOString()` corre la fecha tres horas en un
 * servidor con zona UTC (gotcha del cerebro), por eso acá se arma la fecha local a mano.
 */

const { AVISOS_DEFECTO, TIPOS_VENCIMIENTO } = require("./taxonomia");

/** "YYYY-MM-DD" de hoy en la zona del proceso, sin pasar por UTC. */
function hoyISO(ahora = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`;
}

/** Normaliza lo que devuelve mysql2 (Date o string) a "YYYY-MM-DD". */
function aISO(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) return hoyISO(fecha);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Días de calendario entre hoy y la fecha. Negativo = ya venció. */
function diasRestantes(fecha, hoy = hoyISO()) {
  const f = aISO(fecha);
  if (!f) return null;
  const a = Date.UTC(...f.split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
  const b = Date.UTC(...hoy.split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
  return Math.round((a - b) / 86400000);
}

/**
 * Semáforo. `ventana` es el aviso más temprano de la organización (90 días por defecto):
 *   vencido (< 0) · critico (0 a 30) · proximo (hasta la ventana) · al_dia
 */
function semaforo(dias, ventana = AVISOS_DEFECTO[0]) {
  if (dias == null) return "sin_fecha";
  if (dias < 0) return "vencido";
  if (dias <= 30) return "critico";
  if (dias <= ventana) return "proximo";
  return "al_dia";
}

function avisosDe(v, defecto = AVISOS_DEFECTO) {
  let lista = v?.avisos;
  if (typeof lista === "string") { try { lista = JSON.parse(lista); } catch { lista = null; } }
  if (!Array.isArray(lista) || !lista.length) lista = defecto;
  return [...new Set(lista.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 730))].sort((a, b) => b - a);
}

/**
 * Qué aviso corresponde mandar hoy, o null.
 *
 * 🔑 **Se manda el umbral más cercano ya cruzado, una sola vez.** Si un vencimiento se carga cuando
 * faltan 45 días, ya cruzó el de 90 y el de 60: se manda el de 60 y el de 90 no se manda nunca. Mandar
 * los dos juntos es ruido, y el ruido es lo que hace que la gente deje de leer los avisos.
 */
function avisoQueToca(dias, avisos, enviados = []) {
  if (dias == null) return null;
  const cruzados = avisos.filter(t => dias <= t);
  if (!cruzados.length) return null;
  const umbral = Math.min(...cruzados);
  return enviados.includes(umbral) ? null : umbral;
}

/**
 * Proyección: qué vence en los próximos N meses y cuánto cuesta renovarlo, mes por mes.
 * Idea tomada de AssetScope. Sin costo cargado, cuenta el vencimiento pero no suma plata, y lo dice.
 */
function proyeccion(vencimientos, meses = 12, hoy = hoyISO()) {
  const [y, m] = hoy.split("-").map(Number);
  const cubos = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    cubos.push({ mes: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, cantidad: 0, costos: {}, sin_costo: 0 });
  }
  for (const v of vencimientos) {
    const f = aISO(v.fecha);
    if (!f || v.estado && v.estado !== "vigente") continue;
    const cubo = cubos.find(c => f.startsWith(c.mes));
    if (!cubo) continue;
    cubo.cantidad++;
    if (v.costo_renovacion != null && v.costo_renovacion !== "") {
      const mon = v.moneda || "ARS";
      cubo.costos[mon] = Math.round(((cubo.costos[mon] || 0) + Number(v.costo_renovacion)) * 100) / 100;
    } else cubo.sin_costo++;
  }
  return cubos;
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fechaLegible(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Texto del aviso. Para el cliente: qué vence, cuándo y qué hacer, sin mecánica interna.
 * Devuelve los párrafos en el formato de `correo.enviar` (canónico de alta-usuarios) y el HTML junto.
 */
function redactarAviso(v, dias, sistema) {
  const tipo = TIPOS_VENCIMIENTO[v.tipo] || "Vencimiento";
  const cuando = dias < 0 ? `venció hace ${-dias} día${dias === -1 ? "" : "s"}`
    : dias === 0 ? "vence hoy" : `vence en ${dias} día${dias === 1 ? "" : "s"}`;
  const asunto = `${tipo}: ${v.activo_nombre} ${cuando}`;
  const parrafos = [
    `${escapar(tipo)} de <strong>${escapar(v.activo_nombre)}</strong> ${escapar(cuando)} (${fechaLegible(aISO(v.fecha))}).`,
    v.descripcion ? escapar(v.descripcion) : null,
    v.costo_renovacion != null ? `Costo estimado de renovación: ${escapar(v.moneda || "ARS")} ${Number(v.costo_renovacion).toLocaleString("es-AR")}.` : null,
    v.renovacion_auto ? "Está marcado con renovación automática: conviene confirmar que el medio de pago siga vigente." : null,
    `Cuando se renueve, cargá la nueva fecha en el inventario de ${escapar(sistema)} para que los avisos se reprogramen.`,
  ].filter(Boolean);
  return { asunto, titulo: `${tipo}: ${cuando}`, parrafos, html: parrafos.map(p => `<p>${p}</p>`).join("\n") };
}

/**
 * Recorre los vencimientos vigentes y manda los avisos que tocan hoy. Pensado para correr una vez
 * por día; correrlo más seguido no duplica nada porque `activo_avisos` es único por umbral.
 *
 * @param dep {qRows, qRun, uuidv4, enviar({para, asunto, html, tenant}), destinatariosPorDefecto(tenant), sistema}
 */
async function correrAvisos(dep, { hoy = hoyISO(), defecto = AVISOS_DEFECTO } = {}) {
  const ventana = Math.max(...defecto, 730);
  const filas = await dep.qRows(
    `SELECT v.*, a.nombre AS activo_nombre, a.propietario_correo, a.tenant_id AS a_tenant
       FROM activo_vencimientos v JOIN activos a ON a.id = v.activo_id
      WHERE v.estado = 'vigente' AND a.eliminado_at IS NULL AND a.estado <> 'baja'
        AND v.fecha <= DATE_ADD(?, INTERVAL ? DAY)`, [hoy, ventana]);
  const resultado = { revisados: filas.length, enviados: 0, sin_destinatario: 0, errores: 0 };
  for (const v of filas) {
    const dias = diasRestantes(v.fecha, hoy);
    const enviados = (await dep.qRows("SELECT umbral FROM activo_avisos WHERE vencimiento_id = ?", [v.id])).map(r => r.umbral);
    const umbral = avisoQueToca(dias, avisosDe(v, defecto), enviados);
    if (umbral == null) continue;

    const para = [...new Set([v.responsable_correo, v.propietario_correo].filter(Boolean))];
    if (!para.length && dep.destinatariosPorDefecto) para.push(...(await dep.destinatariosPorDefecto(v.a_tenant) || []));
    // Se reserva el umbral ANTES de mandar: si dos procesos corren a la vez, el segundo choca con
    // el único y no manda el duplicado.
    const id = dep.uuidv4();
    try {
      await dep.qRun("INSERT INTO activo_avisos (id, vencimiento_id, umbral, destinatarios, resultado) VALUES (?,?,?,?,?)",
        [id, v.id, umbral, para.join(", ").slice(0, 1000), para.length ? "enviado" : "sin_destinatario"]);
    } catch { continue; }
    if (!para.length) { resultado.sin_destinatario++; continue; }
    const texto = redactarAviso(v, dias, dep.sistema || "AllSafe");
    try {
      await dep.enviar({ para, ...texto, tenant: v.a_tenant });
      resultado.enviados++;
    } catch (e) {
      // Si el correo falla se libera el umbral para reintentar mañana, en vez de dar por avisado
      // a alguien que nunca recibió nada.
      await dep.qRun("DELETE FROM activo_avisos WHERE id = ?", [id]).catch(() => {});
      resultado.errores++;
    }
  }
  return resultado;
}

module.exports = { hoyISO, aISO, diasRestantes, semaforo, avisosDe, avisoQueToca, proyeccion, redactarAviso, correrAvisos };
