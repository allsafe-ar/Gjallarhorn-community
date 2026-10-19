"use strict";
/**
 * Inventario de activos: rutas del módulo único. Canónico (utiles/activos), idéntico en Skuld y
 * Gjallarhorn. Diseño en `utiles/activos/README.md`.
 *
 * 🔑 **Un solo desarrollo, dos instalaciones.** Este archivo no sabe en qué sistema corre. Todo lo
 * que cambia entre Skuld y Gjallarhorn (cómo se resuelve la organización, quién puede qué, cómo se
 * manda un correo) llega por el adaptador:
 *
 *   inventario.montar(app, {
 *     qRow, qRows, qRun, uuidv4,
 *     mw: { leer: [...], editar: [...], borrar: [...], administrar: [...] },   // middlewares
 *     alcance(req, { editar }) -> { tenant, todos?, clause, params } | null,
 *     permite(req, tenantId, { editar }) -> bool,
 *     usuario(req) -> string,
 *     auditar?(req, accion, detalle),
 *     personas?(tenant) -> [{ id, nombre, correo }],
 *     alFusionar?(principalId, absorbidoId) -> {movidos},
 *     alCrear?(fuente) -> {columnas extra},
 *     sistema: "Skuld" | "Gjallarhorn",
 *   })
 *
 * ⚠️ Las rutas fijas (`/resumen`, `/vencimientos`, `/uniones`...) van ANTES de `/:id`, o Express las
 * toma como un id.
 */

const T = require("./taxonomia");
const { CAMPOS } = require("./esquema");
const { ingresar, anotar } = require("./ingreso");
const fusion = require("./fusion");
const { discrepancias } = require("./identidad");
const V = require("./vencimientos");
const csv = require("./csv");

const MAX_LISTA = 500;
const MAX_IMPORTACION = 5000;

/** Campos que una persona puede escribir en el alta o la edición. */
const EDITABLES = CAMPOS.filter(c => ![
  "id", "tenant_id", "origen", "so_pista", "puertos", "sondeado_at", "visto_ultima", "baja_at",
  "eliminado_at", "created_by", "created_at", "updated_at",
].includes(c));

function validar(campos, parcial = false) {
  const o = {};
  for (const k of EDITABLES) {
    if (!(k in campos)) continue;
    let v = campos[k];
    if (typeof v === "string") v = v.trim();
    if (v === "") v = null;
    o[k] = v;
  }
  if (!parcial && !o.nombre) return { error: "El activo necesita un nombre." };
  if ("nombre" in o && !o.nombre) return { error: "El nombre no puede quedar vacío." };
  if (o.tipo && !T.CATEGORIA_DE[o.tipo]) return { error: "Tipo de activo desconocido." };
  if (o.tipo) o.categoria = T.CATEGORIA_DE[o.tipo];
  else if (o.categoria && !T.CATEGORIAS[o.categoria]) return { error: "Categoría desconocida." };
  if (o.estado && !T.ESTADOS[o.estado]) return { error: "Estado desconocido." };
  if (o.estado === "baja") return { error: "La baja se registra con su motivo y su disposición, desde la acción Dar de baja." };
  if (o.criticidad && !T.CRITICIDAD.includes(o.criticidad)) return { error: "Criticidad inválida." };
  if (o.clasificacion && !T.CLASIFICACION.includes(o.clasificacion)) return { error: "Clasificación inválida." };
  for (const k of ["val_confidencialidad", "val_integridad", "val_disponibilidad"]) {
    if (o[k] != null) { const n = Number(o[k]); if (!Number.isInteger(n) || n < 1 || n > 5) return { error: "La valoración va de 1 a 5." }; o[k] = n; }
  }
  if (o.cantidad != null) { const n = Number(o.cantidad); if (!Number.isInteger(n) || n < 1 || n > 1e6) return { error: "Cantidad inválida." }; o.cantidad = n; }
  if (o.costo != null) { const n = Number(o.costo); if (!Number.isFinite(n) || n < 0) return { error: "Costo inválido." }; o.costo = n; }
  if (o.fecha_compra != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(o.fecha_compra))) return { error: "Fecha de compra inválida." };
  if (o.propietario_correo != null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.propietario_correo)) return { error: "El correo del propietario no es válido." };
  for (const k of ["expuesto_internet", "datos_personales"]) if (k in o) o[k] = o[k] ? 1 : 0;
  if ("atributos" in o && o.atributos != null) o.atributos = typeof o.atributos === "string" ? o.atributos : JSON.stringify(o.atributos);
  for (const [k, max] of [["nombre", 200], ["alias", 200], ["notas", 10000], ["url", 500]]) {
    if (o[k] && String(o[k]).length > max) return { error: `El campo ${k} supera los ${max} caracteres.` };
  }
  return { campos: o };
}

function validarVencimiento(b, parcial = false) {
  const o = {};
  if (!parcial || "tipo" in b) { if (!T.TIPOS_VENCIMIENTO[b.tipo]) return { error: "Tipo de vencimiento desconocido." }; o.tipo = b.tipo; }
  if (!parcial || "fecha" in b) { const f = V.aISO(b.fecha); if (!f) return { error: "La fecha es obligatoria (AAAA-MM-DD)." }; o.fecha = f; }
  for (const k of ["descripcion", "responsable", "responsable_correo", "notas", "moneda"]) if (k in b) o[k] = b[k] ? String(b[k]).trim().slice(0, k === "notas" ? 5000 : 300) : null;
  if (o.responsable_correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.responsable_correo)) return { error: "El correo del responsable no es válido." };
  if ("costo_renovacion" in b) { const n = b.costo_renovacion === "" || b.costo_renovacion == null ? null : Number(b.costo_renovacion); if (n != null && (!Number.isFinite(n) || n < 0)) return { error: "Costo inválido." }; o.costo_renovacion = n; }
  if ("renovacion_auto" in b) o.renovacion_auto = b.renovacion_auto ? 1 : 0;
  if ("avisos" in b) {
    if (b.avisos == null || (Array.isArray(b.avisos) && !b.avisos.length)) o.avisos = null;
    else if (!Array.isArray(b.avisos) || b.avisos.some(n => !Number.isInteger(Number(n)) || n < 0 || n > 730)) return { error: "Los avisos son días entre 0 y 730." };
    else o.avisos = JSON.stringify([...new Set(b.avisos.map(Number))].sort((x, y) => y - x));
  }
  if ("estado" in b) { if (!["vigente", "renovado", "no_renovar"].includes(b.estado)) return { error: "Estado inválido." }; o.estado = b.estado; }
  return { campos: o };
}

function montar(app, dep) {
  const faltan = ["qRow", "qRows", "qRun", "uuidv4", "mw", "alcance", "permite", "usuario"].filter(k => !dep[k]);
  if (faltan.length) throw new Error(`inventario.montar: faltan dependencias: ${faltan.join(", ")}`);
  const { qRow, qRows, qRun, uuidv4, mw } = dep;
  const usuario = (req) => dep.usuario(req) || null;
  const auditar = (req, accion, detalle) => { try { dep.auditar?.(req, accion, detalle); } catch { /* la auditoría no tumba la operación */ } };
  const fallo = (res, e, donde) => { console.error(`[inventario] ${donde}:`, e.message); res.status(500).json({ error: "No se pudo completar la operación sobre el inventario." }); };

  /** Alcance o 403. Para escribir se exige una organización concreta, no la vista de todas. */
  function alcanceO403(req, res, { editar = false } = {}) {
    const a = dep.alcance(req, { editar });
    if (!a) { res.status(403).json({ error: "Sin acceso a esta organización." }); return null; }
    if (editar && a.todos) { res.status(400).json({ error: "Elegí una organización para cargar o modificar activos." }); return null; }
    return a;
  }

  /** Trae un activo y verifica que quien pide pueda verlo (o editarlo). */
  async function activoO404(req, res, id, { editar = false } = {}) {
    const a = await qRow("SELECT * FROM activos WHERE id = ? AND eliminado_at IS NULL", [id]);
    if (!a || !dep.permite(req, a.tenant_id, { editar })) { res.status(404).json({ error: "Activo no encontrado." }); return null; }
    return a;
  }

  async function vencimientoO404(req, res, vid, { editar = false } = {}) {
    const v = await qRow(
      `SELECT v.*, a.tenant_id AS a_tenant, a.nombre AS activo_nombre FROM activo_vencimientos v
         JOIN activos a ON a.id = v.activo_id WHERE v.id = ? AND a.eliminado_at IS NULL`, [vid]);
    if (!v || !dep.permite(req, v.a_tenant, { editar })) { res.status(404).json({ error: "Vencimiento no encontrado." }); return null; }
    return v;
  }

  // ── Catálogo ─────────────────────────────────────────────────────────────────────────────────
  app.get("/api/inventario/taxonomia", ...mw.leer, (_req, res) => {
    res.json({
      categorias: T.CATEGORIAS, estados: T.ESTADOS, criticidad: T.CRITICIDAD, clasificacion: T.CLASIFICACION,
      disposicion: T.DISPOSICION, vencimientos: T.TIPOS_VENCIMIENTO, avisos: T.AVISOS_DEFECTO, fuentes: T.FUENTES,
    });
  });

  app.get("/api/inventario/personas", ...mw.leer, async (req, res) => {
    const a = alcanceO403(req, res); if (!a) return;
    try { res.json(dep.personas && !a.todos ? (await dep.personas(a.tenant)) || [] : []); }
    catch (e) { fallo(res, e, "personas"); }
  });

  // ── Resumen: lo que se ve primero al entrar ──────────────────────────────────────────────────
  app.get("/api/inventario/resumen", ...mw.leer, async (req, res) => {
    const a = alcanceO403(req, res); if (!a) return;
    const w = `a.eliminado_at IS NULL${a.clause.replace(/tenant_id/g, "a.tenant_id")}`;
    try {
      const [porCategoria, porEstado, porCriticidad, venc, sinFechas, dudas, porOrigen] = await Promise.all([
        qRows(`SELECT a.categoria, COUNT(*) AS filas, SUM(a.cantidad) AS unidades FROM activos a WHERE ${w} AND a.estado <> 'baja' GROUP BY a.categoria`, a.params),
        qRows(`SELECT a.estado, COUNT(*) AS n FROM activos a WHERE ${w} GROUP BY a.estado`, a.params),
        qRows(`SELECT a.criticidad, COUNT(*) AS n FROM activos a WHERE ${w} AND a.estado <> 'baja' GROUP BY a.criticidad`, a.params),
        qRows(`SELECT v.id, v.tipo, v.fecha, v.costo_renovacion, v.moneda, v.estado, v.avisos, a.id AS activo_id, a.nombre AS activo_nombre
                 FROM activo_vencimientos v JOIN activos a ON a.id = v.activo_id
                WHERE ${w} AND a.estado <> 'baja' AND v.estado = 'vigente' ORDER BY v.fecha`, a.params),
        // 🔑 Lo que no tiene ninguna fecha cargada es un dato faltante, y se muestra como tal: un
        // inventario sin vencimientos no está "al día", está incompleto. Solo para lo que vence.
        qRow(`SELECT COUNT(*) AS n FROM activos a WHERE ${w} AND a.estado <> 'baja'
                AND a.categoria IN ('hardware','software') AND a.tipo NOT IN ('periferico','desarrollo_propio')
                AND NOT EXISTS (SELECT 1 FROM activo_vencimientos v WHERE v.activo_id = a.id AND v.estado = 'vigente')`, a.params),
        qRow(`SELECT COUNT(*) AS n FROM activo_uniones u JOIN activos a ON a.id = u.activo_id WHERE u.estado = 'pendiente' AND ${w}`, a.params),
        qRows(`SELECT CASE WHEN a.origen IN ('manual','csv','skuld') THEN 'declarado' ELSE 'verificado' END AS origen, COUNT(*) AS n
                 FROM activos a WHERE ${w} AND a.estado <> 'baja' GROUP BY 1`, a.params),
      ]);
      const semaforo = { vencido: 0, critico: 0, proximo: 0, al_dia: 0 };
      const proximos = [];
      for (const v of venc) {
        const dias = V.diasRestantes(v.fecha);
        const s = V.semaforo(dias, V.avisosDe(v)[0]);
        semaforo[s] = (semaforo[s] || 0) + 1;
        if (s !== "al_dia" && proximos.length < 15) proximos.push({ ...v, fecha: V.aISO(v.fecha), dias, semaforo: s });
      }
      res.json({
        por_categoria: porCategoria, por_estado: porEstado, por_criticidad: porCriticidad, por_origen: porOrigen,
        vencimientos: { semaforo, proximos, sin_fechas: sinFechas?.n || 0, proyeccion: V.proyeccion(venc, 12) },
        dudas: dudas?.n || 0,
      });
    } catch (e) { fallo(res, e, "resumen"); }
  });

  // ── Listado con filtros ──────────────────────────────────────────────────────────────────────
  function filtrosLista(req, a) {
    const q = req.query || {};
    const where = [`a.eliminado_at IS NULL${a.clause.replace(/tenant_id/g, "a.tenant_id")}`];
    const params = [...a.params];
    if (q.incluirBajas !== "1") where.push("a.estado <> 'baja'");
    for (const k of ["categoria", "tipo", "estado", "criticidad", "clasificacion", "origen"]) {
      if (q[k]) { const vals = String(q[k]).split(",").slice(0, 20); where.push(`a.${k} IN (${vals.map(() => "?").join(",")})`); params.push(...vals); }
    }
    if (q.grupo) { where.push("a.grupo = ?"); params.push(String(q.grupo)); }
    if (q.padre) { where.push("a.padre_id = ?"); params.push(String(q.padre)); }
    if (q.q) {
      const like = `%${String(q.q).slice(0, 100).replace(/[%_\\]/g, "\\$&")}%`;
      where.push(`(a.nombre LIKE ? OR a.alias LIKE ? OR a.ip LIKE ? OR a.hostname LIKE ? OR a.serie LIKE ?
                   OR a.numero_inventario LIKE ? OR a.propietario LIKE ? OR a.asignado_a LIKE ? OR a.ubicacion LIKE ?
                   OR a.proveedor LIKE ? OR a.factura LIKE ? OR a.modelo LIKE ? OR a.fabricante LIKE ?)`);
      params.push(...Array(13).fill(like));
    }
    if (q.venc === "sin_fecha") {
      where.push("NOT EXISTS (SELECT 1 FROM activo_vencimientos v WHERE v.activo_id = a.id AND v.estado = 'vigente')");
    } else if (q.venc === "vencido") {
      where.push("EXISTS (SELECT 1 FROM activo_vencimientos v WHERE v.activo_id = a.id AND v.estado = 'vigente' AND v.fecha < ?)");
      params.push(V.hoyISO());
    } else if (q.venc === "proximo") {
      where.push("EXISTS (SELECT 1 FROM activo_vencimientos v WHERE v.activo_id = a.id AND v.estado = 'vigente' AND v.fecha BETWEEN ? AND DATE_ADD(?, INTERVAL 90 DAY))");
      params.push(V.hoyISO(), V.hoyISO());
    }
    return { where: where.join(" AND "), params };
  }

  const ORDEN = { nombre: "a.nombre", criticidad: "FIELD(a.criticidad,'critica','alta','media','baja')", tipo: "a.categoria, a.tipo",
                  estado: "a.estado", actualizado: "a.updated_at DESC", vencimiento: "prox_venc IS NULL, prox_venc" };

  app.get("/api/inventario", ...mw.leer, async (req, res) => {
    const a = alcanceO403(req, res); if (!a) return;
    try {
      const { where, params } = filtrosLista(req, a);
      const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 100, 1), MAX_LISTA);
      const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
      const orden = ORDEN[req.query.orden] || ORDEN.nombre;
      const total = await qRow(`SELECT COUNT(*) AS n FROM activos a WHERE ${where}`, params);
      const filas = await qRows(
        `SELECT a.id, a.tenant_id, a.categoria, a.tipo, a.nombre, a.alias, a.estado, a.cantidad, a.padre_id, a.ip, a.hostname,
                a.serie, a.numero_inventario, a.fabricante, a.modelo, a.so, a.criticidad, a.clasificacion, a.propietario,
                a.asignado_a, a.ubicacion, a.area, a.grupo, a.origen, a.visto_ultima, a.updated_at, a.expuesto_internet,
                JSON_UNQUOTE(JSON_EXTRACT(a.atributos, '$.etiqueta_skuld')) AS etiqueta,
                a.val_confidencialidad, a.val_integridad, a.val_disponibilidad,
                (SELECT MIN(v.fecha) FROM activo_vencimientos v WHERE v.activo_id = a.id AND v.estado = 'vigente') AS prox_venc,
                (SELECT COUNT(*) FROM activo_fuentes f WHERE f.activo_id = a.id) AS n_fuentes
           FROM activos a WHERE ${where} ORDER BY ${orden}, a.nombre LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, params);
      for (const f of filas) {
        f.prox_venc = V.aISO(f.prox_venc);
        f.dias_venc = V.diasRestantes(f.prox_venc);
        f.semaforo = f.prox_venc ? V.semaforo(f.dias_venc) : null;
      }
      res.json({ filas, total: total?.n || 0, pagina, limite });
    } catch (e) { fallo(res, e, "listado"); }
  });

  // ── Exportación ──────────────────────────────────────────────────────────────────────────────
  app.get("/api/inventario/exportar.csv", ...mw.leer, async (req, res) => {
    const a = alcanceO403(req, res); if (!a) return;
    try {
      const { where, params } = filtrosLista(req, a);
      const filas = await qRows(`SELECT a.* FROM activos a WHERE ${where} ORDER BY a.categoria, a.tipo, a.nombre LIMIT 20000`, params);
      const ids = filas.map(f => f.id);
      const venc = ids.length ? await qRows(
        `SELECT activo_id, tipo, MIN(fecha) AS fecha FROM activo_vencimientos WHERE estado = 'vigente' AND activo_id IN (${ids.map(() => "?").join(",")}) GROUP BY activo_id, tipo`, ids) : [];
      const vmap = {};
      for (const v of venc) (vmap[v.activo_id] ||= {})[v.tipo] = V.aISO(v.fecha);
      const nombreTipo = (f) => T.CATEGORIAS[f.categoria]?.tipos[f.tipo] || f.tipo;
      const cols = [
        { titulo: "Nombre", campo: "nombre" }, { titulo: "Alias", campo: "alias" },
        { titulo: "Categoría", valor: f => T.CATEGORIAS[f.categoria]?.nombre || f.categoria }, { titulo: "Tipo", valor: nombreTipo },
        { titulo: "Estado", valor: f => T.ESTADOS[f.estado] || f.estado }, { titulo: "Cantidad", campo: "cantidad" },
        { titulo: "N° inventario", campo: "numero_inventario" }, { titulo: "Serie", campo: "serie" },
        { titulo: "Fabricante", campo: "fabricante" }, { titulo: "Modelo", campo: "modelo" },
        { titulo: "IP", campo: "ip" }, { titulo: "Hostname", campo: "hostname" }, { titulo: "MAC", campo: "mac" },
        { titulo: "Sistema operativo", campo: "so" }, { titulo: "Versión", campo: "version" },
        { titulo: "Criticidad", campo: "criticidad" }, { titulo: "Clasificación", campo: "clasificacion" },
        { titulo: "Propietario", campo: "propietario" }, { titulo: "Custodio", campo: "custodio" },
        { titulo: "Asignado a", campo: "asignado_a" }, { titulo: "Área", campo: "area" }, { titulo: "Ubicación", campo: "ubicacion" },
        { titulo: "Proveedor", campo: "proveedor" }, { titulo: "Fecha de compra", valor: f => V.aISO(f.fecha_compra) },
        { titulo: "Factura", campo: "factura" }, { titulo: "Costo", campo: "costo" }, { titulo: "Moneda", campo: "moneda" },
        ...Object.entries(T.TIPOS_VENCIMIENTO).filter(([k]) => k !== "otro").map(([k, n]) => ({ titulo: n, valor: f => vmap[f.id]?.[k] || "" })),
        { titulo: "Origen", campo: "origen" }, { titulo: "Visto por última vez", valor: f => horaLocal(f.visto_ultima) },
        { titulo: "Notas", campo: "notas" },
      ];
      auditar(req, "INVENTARIO_EXPORTAR", `${filas.length} activos`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="inventario-${V.hoyISO()}.csv"`);
      res.send(csv.escribir(cols, filas));
    } catch (e) { fallo(res, e, "exportar"); }
  });

  // ── Importación CSV (con simulación previa) ──────────────────────────────────────────────────
  app.post("/api/inventario/importar", ...mw.administrar, async (req, res) => {
    const a = alcanceO403(req, res, { editar: true }); if (!a) return;
    try {
      const texto = String(req.body?.csv || "");
      if (!texto.trim()) return res.status(400).json({ error: "El archivo está vacío." });
      if (texto.length > 5 * 1024 * 1024) return res.status(413).json({ error: "El archivo supera los 5 MB." });
      const { columnas, filas, ignoradas } = csv.leer(texto);
      if (!columnas.some(c => c.campo === "nombre" || c.campo === "hostname" || c.campo === "ip"))
        return res.status(400).json({ error: "No se reconoció ninguna columna de nombre, hostname o IP.", columnas });
      if (filas.length > MAX_IMPORTACION) return res.status(413).json({ error: `La importación supera las ${MAX_IMPORTACION} filas.` });

      // 🔑 Primero se muestra qué se reconoció y qué se va a hacer; recién con la confirmación se escribe.
      if (req.body?.simular) {
        return res.json({ simulacion: true, filas: filas.length, columnas, ignoradas, muestra: filas.slice(0, 5) });
      }
      const resumen = { nuevo: 0, vinculado: 0, actualizado: 0, nuevo_con_duda: 0, descartado: 0, vencimientos: 0 };
      for (const f of filas) {
        const tipo = f.tipo && T.CATEGORIA_DE[f.tipo] ? f.tipo : tipoPorTexto(f.tipo);
        const entrante = { ...f, ...(tipo ? { tipo } : {}) };
        if (entrante.estado && !T.ESTADOS[entrante.estado]) delete entrante.estado;
        if (entrante.criticidad) entrante.criticidad = criticidadPorTexto(entrante.criticidad);
        if (entrante.clasificacion && !T.CLASIFICACION.includes(entrante.clasificacion)) delete entrante.clasificacion;
        const r = await ingresar(dep, {
          tenant: a.tenant, fuente: "csv", externoId: f.serie || f.numero_inventario || null, entrante,
          usuario: usuario(req), agrupado: (f.cantidad || 1) > 1,
        });
        resumen[r.accion] = (resumen[r.accion] || 0) + 1;
        if (!r.id) continue;
        for (const [col, tipoV] of Object.entries({ venc_garantia: "garantia", venc_soporte: "soporte", venc_fin_vida: "fin_vida",
          venc_licencia: "licencia", venc_contrato: "contrato", venc_certificado: "certificado", venc_dominio: "dominio" })) {
          if (!f[col]) continue;
          // Reimportar la misma planilla no duplica el vencimiento: si ya hay uno vigente de ese
          // tipo se actualiza la fecha.
          const ya = await qRow("SELECT id FROM activo_vencimientos WHERE activo_id = ? AND tipo = ? AND estado = 'vigente'", [r.id, tipoV]);
          if (ya) {
            const previo = await qRow("SELECT fecha FROM activo_vencimientos WHERE id = ?", [ya.id]);
            if (V.aISO(previo?.fecha) !== f[col]) {
              await qRun("UPDATE activo_vencimientos SET fecha = ? WHERE id = ?", [f[col], ya.id]);
              // Fecha nueva, avisos nuevos: el de 30 días de la fecha vieja no dice nada de esta.
              await qRun("DELETE FROM activo_avisos WHERE vencimiento_id = ?", [ya.id]);
              await anotar(dep, { tenant: a.tenant, activoId: r.id, accion: "vencimiento", campo: tipoV, antes: V.aISO(previo?.fecha), despues: f[col], usuario: usuario(req) });
            }
          }
          else {
            await qRun(`INSERT INTO activo_vencimientos (id, tenant_id, activo_id, tipo, fecha, costo_renovacion, origen, created_by)
                        VALUES (?,?,?,?,?,?,?,?)`, [uuidv4(), a.tenant, r.id, tipoV, f[col], f.costo_renovacion ?? null, "csv", usuario(req)]);
            resumen.vencimientos++;
          }
        }
      }
      auditar(req, "INVENTARIO_IMPORTAR_CSV", JSON.stringify(resumen));
      res.json({ ok: true, resumen, ignoradas });
    } catch (e) { fallo(res, e, "importar"); }
  });

  // ── Vencimientos (vista global) ──────────────────────────────────────────────────────────────
  app.get("/api/inventario/vencimientos", ...mw.leer, async (req, res) => {
    const a = alcanceO403(req, res); if (!a) return;
    try {
      const w = `a.eliminado_at IS NULL${a.clause.replace(/tenant_id/g, "a.tenant_id")}`;
      const estado = ["vigente", "renovado", "no_renovar"].includes(req.query.estado) ? req.query.estado : "vigente";
      const filas = await qRows(
        `SELECT v.*, a.nombre AS activo_nombre, a.tipo AS activo_tipo, a.categoria AS activo_categoria, a.propietario,
                (SELECT MAX(enviado_at) FROM activo_avisos x WHERE x.vencimiento_id = v.id) AS ultimo_aviso
           FROM activo_vencimientos v JOIN activos a ON a.id = v.activo_id
          WHERE ${w} AND a.estado <> 'baja' AND v.estado = ? ORDER BY v.fecha LIMIT 2000`, [...a.params, estado]);
      for (const v of filas) { v.fecha = V.aISO(v.fecha); v.dias = V.diasRestantes(v.fecha); v.semaforo = V.semaforo(v.dias, V.avisosDe(v)[0]); }
      const sem = req.query.semaforo;
      res.json(sem ? filas.filter(v => v.semaforo === sem) : filas);
    } catch (e) { fallo(res, e, "vencimientos"); }
  });

  app.put("/api/inventario/vencimientos/:vid", ...mw.editar, async (req, res) => {
    try {
      const v = await vencimientoO404(req, res, req.params.vid, { editar: true }); if (!v) return;
      const { campos, error } = validarVencimiento(req.body || {}, true);
      if (error) return res.status(400).json({ error });
      if (!Object.keys(campos).length) return res.json({ ok: true });
      await qRun(`UPDATE activo_vencimientos SET ${Object.keys(campos).map(k => `${k} = ?`).join(", ")} WHERE id = ?`, [...Object.values(campos), v.id]);
      // Si cambió la fecha, los avisos se reprograman desde cero: el de 30 días de la fecha vieja
      // no dice nada de la nueva.
      if (campos.fecha && campos.fecha !== V.aISO(v.fecha)) await qRun("DELETE FROM activo_avisos WHERE vencimiento_id = ?", [v.id]);
      await anotar(dep, { tenant: v.a_tenant, activoId: v.activo_id, accion: "vencimiento", campo: v.tipo, antes: V.aISO(v.fecha), despues: campos.fecha || V.aISO(v.fecha), usuario: usuario(req) });
      res.json({ ok: true });
    } catch (e) { fallo(res, e, "editar vencimiento"); }
  });

  /**
   * Renovar: el vencimiento actual queda como `renovado` (historia y evidencia) y nace uno nuevo con
   * la fecha siguiente. No se pisa la fecha vieja: en una auditoría hay que poder mostrar que la
   * garantía estuvo vigente todo el período.
   */
  app.post("/api/inventario/vencimientos/:vid/renovar", ...mw.editar, async (req, res) => {
    try {
      const v = await vencimientoO404(req, res, req.params.vid, { editar: true }); if (!v) return;
      const fecha = V.aISO(req.body?.fecha);
      if (!fecha) return res.status(400).json({ error: "Indicá la nueva fecha de vencimiento." });
      if (fecha <= V.aISO(v.fecha)) return res.status(400).json({ error: "La nueva fecha tiene que ser posterior a la actual." });
      const costo = req.body?.costo_renovacion === "" || req.body?.costo_renovacion == null ? v.costo_renovacion : Number(req.body.costo_renovacion);
      const id = uuidv4();
      await qRun("UPDATE activo_vencimientos SET estado = 'renovado' WHERE id = ?", [v.id]);
      await qRun(`INSERT INTO activo_vencimientos (id, tenant_id, activo_id, tipo, descripcion, fecha, costo_renovacion, moneda, renovacion_auto,
                    responsable, responsable_correo, avisos, origen, notas, created_by)
                  SELECT ?, tenant_id, activo_id, tipo, descripcion, ?, ?, moneda, renovacion_auto, responsable, responsable_correo, avisos,
                         'manual', ?, ? FROM activo_vencimientos WHERE id = ?`,
        [id, fecha, Number.isFinite(costo) ? costo : null, req.body?.notas || null, usuario(req), v.id]);
      await anotar(dep, { tenant: v.a_tenant, activoId: v.activo_id, accion: "renovacion", campo: v.tipo, antes: V.aISO(v.fecha), despues: fecha, usuario: usuario(req) });
      auditar(req, "INVENTARIO_RENOVAR", `${v.activo_nombre}: ${v.tipo} ${V.aISO(v.fecha)} -> ${fecha}`);
      res.json({ ok: true, id });
    } catch (e) { fallo(res, e, "renovar"); }
  });

  app.delete("/api/inventario/vencimientos/:vid", ...mw.borrar, async (req, res) => {
    try {
      const v = await vencimientoO404(req, res, req.params.vid, { editar: true }); if (!v) return;
      await qRun("DELETE FROM activo_vencimientos WHERE id = ?", [v.id]);
      await anotar(dep, { tenant: v.a_tenant, activoId: v.activo_id, accion: "vencimiento_borrado", campo: v.tipo, antes: V.aISO(v.fecha), usuario: usuario(req) });
      res.json({ ok: true });
    } catch (e) { fallo(res, e, "borrar vencimiento"); }
  });

  // ── Asignaciones: devolución ─────────────────────────────────────────────────────────────────
  app.put("/api/inventario/asignaciones/:aid/devolucion", ...mw.editar, async (req, res) => {
    try {
      const s = await qRow(`SELECT s.*, a.tenant_id AS a_tenant FROM activo_asignaciones s JOIN activos a ON a.id = s.activo_id WHERE s.id = ?`, [req.params.aid]);
      if (!s || !dep.permite(req, s.a_tenant, { editar: true })) return res.status(404).json({ error: "Asignación no encontrada." });
      if (s.devuelto_at) return res.status(409).json({ error: "Esa entrega ya figura como devuelta." });
      const fecha = V.aISO(req.body?.fecha) || V.hoyISO();
      await qRun("UPDATE activo_asignaciones SET devuelto_at = ?, estado_devolucion = ? WHERE id = ?",
        [fecha, req.body?.estado_devolucion ? String(req.body.estado_devolucion).slice(0, 300) : null, s.id]);
      await qRun("UPDATE activos SET asignado_a = NULL WHERE id = ? AND asignado_a = ?", [s.activo_id, s.persona]);
      await anotar(dep, { tenant: s.a_tenant, activoId: s.activo_id, accion: "devolucion", antes: s.persona, despues: fecha, usuario: usuario(req) });
      res.json({ ok: true });
    } catch (e) { fallo(res, e, "devolución"); }
  });

  /** Lo que una persona tiene en su poder: lo que se revisa cuando se va de la organización. */
  app.get("/api/inventario/asignaciones", ...mw.leer, async (req, res) => {
    const a = alcanceO403(req, res); if (!a) return;
    try {
      const persona = String(req.query.persona || "").trim();
      const w = `a.eliminado_at IS NULL${a.clause.replace(/tenant_id/g, "a.tenant_id")}`;
      const filas = await qRows(
        `SELECT s.*, a.nombre AS activo_nombre, a.tipo AS activo_tipo, a.serie FROM activo_asignaciones s JOIN activos a ON a.id = s.activo_id
          WHERE ${w}${persona ? " AND s.persona = ?" : ""}${req.query.pendientes === "1" ? " AND s.devuelto_at IS NULL" : ""}
          ORDER BY s.devuelto_at IS NULL DESC, s.entregado_at DESC LIMIT 1000`, persona ? [...a.params, persona] : a.params);
      res.json(filas);
    } catch (e) { fallo(res, e, "asignaciones"); }
  });

  // ── Duplicados ───────────────────────────────────────────────────────────────────────────────
  app.get("/api/inventario/uniones", ...mw.administrar, async (req, res) => {
    const a = alcanceO403(req, res); if (!a) return;
    try { res.json(await fusion.pendientes(dep, { clause: a.clause.replace(/tenant_id/g, "u.tenant_id"), params: a.params })); }
    catch (e) { fallo(res, e, "uniones"); }
  });

  app.post("/api/inventario/uniones/:uid/fusionar", ...mw.administrar, async (req, res) => {
    try {
      const u = await qRow("SELECT * FROM activo_uniones WHERE id = ? AND estado = 'pendiente'", [req.params.uid]);
      if (!u || !dep.permite(req, u.tenant_id, { editar: true })) return res.status(404).json({ error: "Duda no encontrada." });
      const principal = req.body?.principal === u.candidato_id ? u.candidato_id : u.activo_id;
      const absorbido = principal === u.activo_id ? u.candidato_id : u.activo_id;
      const r = await fusion.fusionar(dep, { tenant: u.tenant_id, principalId: principal, absorbidoId: absorbido, usuario: usuario(req) });
      if (!r.ok) return res.status(409).json({ error: r.error });
      auditar(req, "INVENTARIO_FUSIONAR", `${r.absorbido} -> ${r.principal}`);
      res.json(r);
    } catch (e) { fallo(res, e, "fusionar"); }
  });

  app.post("/api/inventario/uniones/:uid/descartar", ...mw.administrar, async (req, res) => {
    try {
      const u = await qRow("SELECT * FROM activo_uniones WHERE id = ?", [req.params.uid]);
      if (!u || !dep.permite(req, u.tenant_id, { editar: true })) return res.status(404).json({ error: "Duda no encontrada." });
      res.json(await fusion.descartar(dep, { tenant: u.tenant_id, unionId: u.id, usuario: usuario(req) }));
    } catch (e) { fallo(res, e, "descartar"); }
  });

  // ── Alta manual ──────────────────────────────────────────────────────────────────────────────
  app.post("/api/inventario", ...mw.editar, async (req, res) => {
    const a = alcanceO403(req, res, { editar: true }); if (!a) return;
    try {
      const { campos, error } = validar(req.body || {});
      if (error) return res.status(400).json({ error });
      if (campos.padre_id) {
        const p = await qRow("SELECT tenant_id FROM activos WHERE id = ? AND eliminado_at IS NULL", [campos.padre_id]);
        if (!p || p.tenant_id !== a.tenant) return res.status(400).json({ error: "El activo del que depende no existe en esta organización." });
      }
      // Aviso de duplicado: misma serie o número de inventario en la organización. Avisa, no bloquea
      // (dos filas pueden ser legítimas), y quien carga decide con `forzar`.
      if (!req.body?.forzar && (campos.serie || campos.numero_inventario)) {
        const dup = await qRow(
          `SELECT id, nombre FROM activos WHERE tenant_id <=> ? AND eliminado_at IS NULL AND ((serie IS NOT NULL AND serie = ?) OR (numero_inventario IS NOT NULL AND numero_inventario = ?)) LIMIT 1`,
          [a.tenant, campos.serie || null, campos.numero_inventario || null]);
        if (dup) return res.status(409).json({ error: `Ya existe "${dup.nombre}" con la misma serie o número de inventario.`, code: "duplicado", existente: dup });
      }
      const id = uuidv4();
      const fila = { categoria: "hardware", tipo: "otro_hw", ...campos, ...(dep.alCrear?.("manual") || {}) };
      const cols = Object.keys(fila);
      await qRun(`INSERT INTO activos (id, tenant_id, origen, created_by, ${cols.join(", ")}) VALUES (?,?,?,?${cols.map(() => ",?").join("")})`,
        [id, a.tenant, "manual", usuario(req), ...cols.map(k => fila[k])]);
      await qRun(`INSERT INTO activo_fuentes (id, activo_id, fuente, datos) VALUES (?,?,?,?)`, [uuidv4(), id, "manual", "{}"]);
      await anotar(dep, { tenant: a.tenant, activoId: id, accion: "alta", despues: "carga manual", usuario: usuario(req) });
      auditar(req, "INVENTARIO_ALTA", fila.nombre);
      res.status(201).json({ ok: true, id });
    } catch (e) { fallo(res, e, "alta"); }
  });

  // ── Ficha ────────────────────────────────────────────────────────────────────────────────────
  app.get("/api/inventario/:id", ...mw.leer, async (req, res) => {
    try {
      const a = await activoO404(req, res, req.params.id); if (!a) return;
      const [fuentes, venc, asign, hijos, padre] = await Promise.all([
        qRows("SELECT fuente, externo_id, datos, visto_at FROM activo_fuentes WHERE activo_id = ? ORDER BY visto_at DESC", [a.id]),
        qRows(`SELECT v.*, (SELECT MAX(enviado_at) FROM activo_avisos x WHERE x.vencimiento_id = v.id) AS ultimo_aviso
                 FROM activo_vencimientos v WHERE v.activo_id = ? ORDER BY v.estado = 'vigente' DESC, v.fecha`, [a.id]),
        qRows("SELECT * FROM activo_asignaciones WHERE activo_id = ? ORDER BY entregado_at DESC", [a.id]),
        qRows("SELECT id, nombre, tipo, categoria, estado FROM activos WHERE padre_id = ? AND eliminado_at IS NULL ORDER BY nombre", [a.id]),
        a.padre_id ? qRow("SELECT id, nombre, tipo FROM activos WHERE id = ? AND eliminado_at IS NULL", [a.padre_id]) : null,
      ]);
      for (const v of venc) { v.fecha = V.aISO(v.fecha); v.dias = V.diasRestantes(v.fecha); v.semaforo = v.estado === "vigente" ? V.semaforo(v.dias, V.avisosDe(v)[0]) : null; }
      const porFuente = {};
      for (const f of fuentes) { let d = f.datos; if (typeof d === "string") { try { d = JSON.parse(d); } catch { d = {}; } } porFuente[f.fuente] = d; }
      for (const k of ["fecha_compra"]) a[k] = V.aISO(a[k]);
      if (typeof a.atributos === "string") { try { a.atributos = JSON.parse(a.atributos); } catch { /* se deja como texto */ } }
      res.json({
        ...a, fuentes: fuentes.map(({ datos, ...r }) => r), vencimientos: venc, asignaciones: asign, hijos, padre,
        // Dónde lo declarado no coincide con lo observado: es un hallazgo, no un error a esconder.
        discrepancias: Object.keys(porFuente).length > 1 ? discrepancias(porFuente) : [],
      });
    } catch (e) { fallo(res, e, "ficha"); }
  });

  app.get("/api/inventario/:id/historial", ...mw.leer, async (req, res) => {
    try {
      const a = await activoO404(req, res, req.params.id); if (!a) return;
      res.json(await qRows("SELECT accion, campo, antes, despues, usuario, ts FROM activo_historial WHERE activo_id = ? ORDER BY ts DESC LIMIT 500", [a.id]));
    } catch (e) { fallo(res, e, "historial"); }
  });

  // ── Edición ──────────────────────────────────────────────────────────────────────────────────
  app.put("/api/inventario/:id", ...mw.editar, async (req, res) => {
    try {
      const a = await activoO404(req, res, req.params.id, { editar: true }); if (!a) return;
      if (a.estado === "baja") return res.status(409).json({ error: "El activo está dado de baja. Reactivalo antes de editarlo." });
      const { campos, error } = validar(req.body || {}, true);
      if (error) return res.status(400).json({ error });
      if (campos.padre_id) {
        if (campos.padre_id === a.id) return res.status(400).json({ error: "Un activo no puede depender de sí mismo." });
        const p = await qRow("SELECT tenant_id FROM activos WHERE id = ? AND eliminado_at IS NULL", [campos.padre_id]);
        if (!p || p.tenant_id !== a.tenant_id) return res.status(400).json({ error: "El activo del que depende no existe en esta organización." });
      }
      const cambios = Object.keys(campos).filter(k => String(a[k] ?? "") !== String(campos[k] ?? "") && !(k === "fecha_compra" && V.aISO(a[k]) === campos[k]));
      if (!cambios.length) return res.json({ ok: true, cambios: 0 });
      await qRun(`UPDATE activos SET ${cambios.map(k => `${k} = ?`).join(", ")} WHERE id = ?`, [...cambios.map(k => campos[k]), a.id]);
      for (const k of cambios) {
        await anotar(dep, { tenant: a.tenant_id, activoId: a.id, accion: k === "estado" ? "estado" : "edicion", campo: k,
          antes: k === "fecha_compra" ? V.aISO(a[k]) : a[k], despues: campos[k], usuario: usuario(req) });
      }
      auditar(req, "INVENTARIO_EDICION", `${a.nombre}: ${cambios.join(", ")}`);
      res.json({ ok: true, cambios: cambios.length });
    } catch (e) { fallo(res, e, "edición"); }
  });

  /** Baja con motivo y disposición (A.7.14). El activo queda, con su historia, fuera de los avisos. */
  app.post("/api/inventario/:id/baja", ...mw.editar, async (req, res) => {
    try {
      const a = await activoO404(req, res, req.params.id, { editar: true }); if (!a) return;
      if (a.estado === "baja") return res.status(409).json({ error: "El activo ya está dado de baja." });
      const motivo = String(req.body?.motivo || "").trim();
      if (!motivo) return res.status(400).json({ error: "Indicá el motivo de la baja." });
      const disp = req.body?.disposicion || null;
      if (disp && !T.DISPOSICION[disp]) return res.status(400).json({ error: "Forma de disposición desconocida." });
      // Un medio que guardaba información confidencial o datos personales no se da de baja sin
      // decir qué se hizo con él: es justo lo que se pregunta en una auditoría.
      if (!disp && (a.datos_personales || ["confidencial", "restringida"].includes(a.clasificacion)) && a.categoria === "hardware")
        return res.status(400).json({ error: "Este equipo guardaba información sensible: indicá cómo se dispuso de él (borrado seguro, destrucción...)." });
      const pendiente = await qRow("SELECT persona FROM activo_asignaciones WHERE activo_id = ? AND devuelto_at IS NULL LIMIT 1", [a.id]);
      if (pendiente && !req.body?.forzar) return res.status(409).json({ error: `Figura entregado a ${pendiente.persona} y no se registró la devolución.`, code: "asignado" });
      await qRun(`UPDATE activos SET estado = 'baja', baja_at = NOW(), baja_motivo = ?, disposicion = ?, disposicion_evidencia = ? WHERE id = ?`,
        [motivo.slice(0, 500), disp, req.body?.evidencia ? String(req.body.evidencia).slice(0, 500) : null, a.id]);
      await qRun("UPDATE activo_vencimientos SET estado = 'no_renovar' WHERE activo_id = ? AND estado = 'vigente'", [a.id]);
      await anotar(dep, { tenant: a.tenant_id, activoId: a.id, accion: "baja", campo: "estado", antes: a.estado, despues: `baja: ${motivo}${disp ? ` (${T.DISPOSICION[disp]})` : ""}`, usuario: usuario(req) });
      auditar(req, "INVENTARIO_BAJA", `${a.nombre}: ${motivo}`);
      res.json({ ok: true });
    } catch (e) { fallo(res, e, "baja"); }
  });

  app.post("/api/inventario/:id/reactivar", ...mw.editar, async (req, res) => {
    try {
      const a = await activoO404(req, res, req.params.id, { editar: true }); if (!a) return;
      if (a.estado !== "baja") return res.status(409).json({ error: "El activo no está dado de baja." });
      await qRun("UPDATE activos SET estado = 'produccion', baja_at = NULL WHERE id = ?", [a.id]);
      await anotar(dep, { tenant: a.tenant_id, activoId: a.id, accion: "estado", campo: "estado", antes: "baja", despues: "produccion", usuario: usuario(req) });
      res.json({ ok: true });
    } catch (e) { fallo(res, e, "reactivar"); }
  });

  /** Borrado lógico, para errores de carga. Queda en el historial y en la auditoría. */
  app.delete("/api/inventario/:id", ...mw.borrar, async (req, res) => {
    try {
      const a = await activoO404(req, res, req.params.id, { editar: true }); if (!a) return;
      await qRun("UPDATE activos SET eliminado_at = NOW() WHERE id = ?", [a.id]);
      await qRun("UPDATE activos SET padre_id = NULL WHERE padre_id = ?", [a.id]);
      await anotar(dep, { tenant: a.tenant_id, activoId: a.id, accion: "eliminado", antes: a.nombre, usuario: usuario(req) });
      auditar(req, "INVENTARIO_ELIMINAR", a.nombre);
      res.json({ ok: true });
    } catch (e) { fallo(res, e, "eliminar"); }
  });

  // ── Vencimientos de un activo ────────────────────────────────────────────────────────────────
  app.post("/api/inventario/:id/vencimientos", ...mw.editar, async (req, res) => {
    try {
      const a = await activoO404(req, res, req.params.id, { editar: true }); if (!a) return;
      const { campos, error } = validarVencimiento(req.body || {});
      if (error) return res.status(400).json({ error });
      const id = uuidv4();
      const cols = Object.keys(campos);
      await qRun(`INSERT INTO activo_vencimientos (id, tenant_id, activo_id, created_by, ${cols.join(", ")}) VALUES (?,?,?,?${cols.map(() => ",?").join("")})`,
        [id, a.tenant_id, a.id, usuario(req), ...cols.map(k => campos[k])]);
      await anotar(dep, { tenant: a.tenant_id, activoId: a.id, accion: "vencimiento", campo: campos.tipo, despues: campos.fecha, usuario: usuario(req) });
      res.status(201).json({ ok: true, id });
    } catch (e) { fallo(res, e, "alta vencimiento"); }
  });

  // ── Entrega de un activo ─────────────────────────────────────────────────────────────────────
  app.post("/api/inventario/:id/asignaciones", ...mw.editar, async (req, res) => {
    try {
      const a = await activoO404(req, res, req.params.id, { editar: true }); if (!a) return;
      const persona = String(req.body?.persona || "").trim().slice(0, 200);
      if (!persona) return res.status(400).json({ error: "Indicá a quién se entrega." });
      const correo = req.body?.persona_correo ? String(req.body.persona_correo).trim() : null;
      if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return res.status(400).json({ error: "El correo no es válido." });
      const abierta = await qRow("SELECT persona FROM activo_asignaciones WHERE activo_id = ? AND devuelto_at IS NULL LIMIT 1", [a.id]);
      if (abierta && a.cantidad === 1) return res.status(409).json({ error: `Figura entregado a ${abierta.persona}: registrá primero la devolución.` });
      const id = uuidv4();
      await qRun(`INSERT INTO activo_asignaciones (id, tenant_id, activo_id, persona, persona_correo, entregado_at, acepto_uso, notas, created_by)
                  VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, a.tenant_id, a.id, persona, correo, V.aISO(req.body?.fecha) || V.hoyISO(), req.body?.acepto_uso ? 1 : 0,
         req.body?.notas ? String(req.body.notas).slice(0, 2000) : null, usuario(req)]);
      if (a.cantidad === 1) await qRun("UPDATE activos SET asignado_a = ? WHERE id = ?", [persona, a.id]);
      await anotar(dep, { tenant: a.tenant_id, activoId: a.id, accion: "entrega", despues: persona, usuario: usuario(req) });
      res.status(201).json({ ok: true, id });
    } catch (e) { fallo(res, e, "entrega"); }
  });

  return { ingresar: (opciones) => ingresar(dep, opciones) };
}

/** "AAAA-MM-DD HH:MM" en la zona del proceso (mysql2 devuelve DATETIME como Date local). */
function horaLocal(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${V.hoyISO(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "Servidor", "server", "Notebook"... -> tipo de la taxonomía, o null. */
function tipoPorTexto(texto) {
  if (!texto) return null;
  const n = String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // ⚠️ Palabras enteras: "recepción" contiene "pc" y "credenciales" contiene "red". Las reglas
  // específicas van primero (una "impresora de red" es impresora).
  const reglas = [
    [/impresora|printer/, "impresora"], [/servidor|server|\bsrv/, "servidor"], [/notebook|laptop|portatil/, "notebook"],
    [/\bpc\b|desktop|escritorio|puesto/, "pc"], [/movil|celular|telefono|phone|tablet/, "movil"],
    [/firewall|\butm\b|fortigate/, "seguridad"], [/\bnas\b|\bsan\b|cabina|storage|almacenamiento/, "almacenamiento"],
    [/switch|router|access ?point|\bap\b|\bred\b|wifi/, "red"], [/\bups\b|\bsai\b/, "energia"],
    [/licencia|license/, "licencia"], [/\bsaas\b/, "saas"], [/dominio|domain/, "dominio"],
    [/certificado|certificate|\bssl\b|\btls\b/, "certificado"], [/base de datos|database/, "base_datos"],
    [/camara|\bdvr\b|\bnvr\b|sensor|\bplc\b|scada/, "iot"], [/aplicacion|software|\bapp\b/, "aplicacion"],
  ];
  for (const [re, t] of reglas) if (re.test(n)) return t;
  return null;
}

function criticidadPorTexto(t) {
  const n = String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/crit/.test(n)) return "critica";
  if (/alt|high/.test(n)) return "alta";
  if (/baj|low/.test(n)) return "baja";
  return "media";
}

module.exports = { montar, validar, validarVencimiento, tipoPorTexto, EDITABLES };
