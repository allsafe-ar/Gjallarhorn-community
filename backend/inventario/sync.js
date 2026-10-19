"use strict";
/**
 * Sincronización del inventario entre sistemas AllSafe (Gjallarhorn -> Skuld y al revés). Canónico.
 *
 * 🔑 **Opcional y por organización.** Cada sistema funciona solo; la sincronización se activa a
 * pedido y, si falla o se apaga, nada se rompe: queda lo último que se trajo.
 *
 * Cómo funciona:
 *   1. El sistema que EXPORTA emite un token de solo lectura del inventario de una organización
 *      (`activo_conectores`, se guarda solo su hash).
 *   2. El que IMPORTA guarda la dirección y el token (`activo_sincronizaciones`) y cada tanto pide
 *      `GET /api/inventario/export` con `Authorization: InventarioToken <token>`.
 *   3. Cada activo entra por la ingesta común con fuente = el sistema de origen (`gjallarhorn` o
 *      `skuld`) y su id remoto como identificador externo: no duplica, completa lo que falta y no pisa
 *      lo que escribió una persona. Lo que trae Gjallarhorn queda como verificado en la red.
 *   4. Los vencimientos viajan también (por ejemplo, el del certificado TLS que lee Gjallarhorn).
 */

const crypto = require("crypto");
const { ingresar, afectadas } = require("./ingreso");
const V = require("./vencimientos");

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const MAX_EXPORT = 20000;

/** Campos que viajan. Nunca notas, propietario, correos ni datos de compra: solo lo que describe al equipo. */
const CAMPOS_EXPORT = ["id", "categoria", "tipo", "nombre", "ip", "hostname", "mac", "serie", "fabricante", "modelo", "so",
  "so_version", "version", "url", "ubicacion", "grupo", "criticidad", "cantidad", "visto_ultima", "origen"];

async function emitirToken(dep, { tenant, nombre, usuario }) {
  const token = crypto.randomBytes(32).toString("hex");
  const id = dep.uuidv4();
  await dep.qRun("INSERT INTO activo_conectores (id, tenant_id, nombre, token_hash, creado_por) VALUES (?,?,?,?,?)",
    [id, tenant, String(nombre || "Conector").slice(0, 120), hash(token), usuario || null]);
  return { id, token };
}

/** Resuelve el token del pedido a su organización, o null. */
async function tenantDelToken(dep, req) {
  const h = String(req.headers?.authorization || "");
  if (!h.startsWith("InventarioToken ")) return null;
  const fila = await dep.qRow("SELECT id, tenant_id FROM activo_conectores WHERE token_hash = ? AND activo = 1", [hash(h.slice(16).trim())]);
  if (!fila) return null;
  await dep.qRun("UPDATE activo_conectores SET ultimo_uso = NOW() WHERE id = ?", [fila.id]).catch(() => {});
  return { conector: fila.id, tenant: fila.tenant_id };
}

async function exportar(dep, tenant) {
  const activos = await dep.qRows(
    `SELECT ${CAMPOS_EXPORT.join(", ")} FROM activos WHERE tenant_id <=> ? AND eliminado_at IS NULL AND estado <> 'baja' LIMIT ${MAX_EXPORT}`, [tenant]);
  const venc = await dep.qRows(
    `SELECT v.activo_id, v.tipo, v.fecha, v.descripcion FROM activo_vencimientos v JOIN activos a ON a.id = v.activo_id
      WHERE a.tenant_id <=> ? AND a.eliminado_at IS NULL AND v.estado = 'vigente'`, [tenant]);
  const porActivo = {};
  for (const v of venc) (porActivo[v.activo_id] ||= []).push({ tipo: v.tipo, fecha: V.aISO(v.fecha), descripcion: v.descripcion });
  return activos.map(a => ({ ...a, vencimientos: porActivo[a.id] || [] }));
}

/**
 * Trae el inventario remoto y lo ingresa. `dep.pedir(url, opciones)` hace el HTTP (cada sistema pasa el
 * suyo, con su control de destinos) y devuelve `{ status, json }`.
 */
async function sincronizar(dep, { tenant, usuario = "sincronizacion" }) {
  const cfg = await dep.qRow("SELECT * FROM activo_sincronizaciones WHERE tenant_id <=> ?", [tenant]);
  if (!cfg || !cfg.habilitada) return { ok: false, error: "La sincronización no está configurada." };
  await dep.qRun("UPDATE activo_sincronizaciones SET ultimo_intento = NOW() WHERE id = ?", [cfg.id]);
  let r;
  try {
    r = await dep.pedir(cfg.url.replace(/\/+$/, "") + "/api/inventario/export", { headers: { Authorization: `InventarioToken ${cfg.token}` } });
  } catch (e) {
    const resultado = { ok: false, error: `No se pudo conectar: ${e.message}` };
    await dep.qRun("UPDATE activo_sincronizaciones SET resultado = ? WHERE id = ?", [JSON.stringify(resultado), cfg.id]);
    return resultado;
  }
  if (r.status !== 200 || !r.json || !Array.isArray(r.json.activos)) {
    const resultado = { ok: false, error: r.status === 401 ? "El token fue rechazado (revocado o mal copiado)." : `Respuesta inesperada (${r.status}).` };
    await dep.qRun("UPDATE activo_sincronizaciones SET resultado = ? WHERE id = ?", [JSON.stringify(resultado), cfg.id]);
    return resultado;
  }
  const fuente = String(r.json.sistema || "").toLowerCase() === "skuld" ? "skuld" : "gjallarhorn";
  const resumen = { nuevo: 0, vinculado: 0, actualizado: 0, nuevo_con_duda: 0, descartado: 0, vencimientos: 0, recibidos: r.json.activos.length };
  for (const remoto of r.json.activos.slice(0, MAX_EXPORT)) {
    const { id: remotoId, vencimientos = [], origen: _o, visto_ultima: _v, ...entrante } = remoto || {};
    if (!remotoId) continue;
    const res = await ingresar(dep, { tenant, fuente, externoId: remotoId, entrante, usuario, agrupado: (entrante.cantidad || 1) > 1 });
    resumen[res.accion] = (resumen[res.accion] || 0) + 1;
    if (!res.id) continue;
    for (const v of Array.isArray(vencimientos) ? vencimientos : []) {
      const fecha = V.aISO(v.fecha);
      if (!fecha || !v.tipo) continue;
      // Un vencimiento traído se lleva en su propia fila (origen = sistema remoto): nunca pisa uno cargado a mano.
      const ya = await dep.qRow("SELECT id, fecha FROM activo_vencimientos WHERE activo_id = ? AND tipo = ? AND origen = ? AND estado = 'vigente'", [res.id, v.tipo, fuente]);
      if (ya) {
        if (V.aISO(ya.fecha) !== fecha) {
          await dep.qRun("UPDATE activo_vencimientos SET fecha = ?, descripcion = ? WHERE id = ?", [fecha, v.descripcion || null, ya.id]);
          await dep.qRun("DELETE FROM activo_avisos WHERE vencimiento_id = ?", [ya.id]);
        }
      } else {
        await dep.qRun("INSERT INTO activo_vencimientos (id, tenant_id, activo_id, tipo, descripcion, fecha, origen) VALUES (?,?,?,?,?,?,?)",
          [dep.uuidv4(), tenant, res.id, v.tipo, v.descripcion || null, fecha, fuente]);
        resumen.vencimientos++;
      }
    }
  }
  const resultado = { ok: true, resumen, sistema: fuente, fecha: new Date().toISOString() };
  await dep.qRun("UPDATE activo_sincronizaciones SET ultimo_ok = NOW(), resultado = ? WHERE id = ?", [JSON.stringify(resultado), cfg.id]);
  return resultado;
}

/** IP de la red interna, loopback, link-local o reservada (IPv4 e IPv6). */
function esInterna(ip) {
  const net = require("net");
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return esInterna(x.slice(7));
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
}

/**
 * GET de un JSON con control de destino. 🔴 SSRF: se resuelve el nombre UNA vez, se rechaza una IP
 * interna (salvo `permitirInternas`, para on-premise, donde los dos sistemas viven en la misma red) y
 * la conexión va a esa IP con el nombre como SNI. Así un DNS con rebinding no puede apuntar la segunda
 * resolución a la red del servidor.
 */
async function pedirJSON(url, { headers = {}, permitirInternas = false, timeoutMs = 30000, maxBytes = 50 * 1024 * 1024, resolver } = {}) {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("solo http o https");
  const net = require("net");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  let ip = host;
  if (!net.isIP(host)) {
    const lista = await (resolver || require("dns").promises.lookup)(host, { all: true, verbatim: true });
    if (!lista.length) throw new Error(`no se pudo resolver ${host}`);
    if (!permitirInternas && lista.some(d => esInterna(d.address))) throw new Error(`${host} resuelve a una dirección interna`);
    ip = lista[0].address;
  } else if (!permitirInternas && esInterna(host)) throw new Error("dirección interna no permitida");
  const mod = u.protocol === "https:" ? require("https") : require("http");
  return new Promise((ok, mal) => {
    const req = mod.request({
      host: ip, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname + u.search, method: "GET",
      headers: { ...headers, Host: u.host, Accept: "application/json" }, servername: net.isIP(host) ? undefined : host, timeout: timeoutMs,
    }, (res) => {
      let total = 0; const partes = [];
      res.on("data", (c) => { total += c.length; if (total > maxBytes) { req.destroy(new Error("respuesta demasiado grande")); return; } partes.push(c); });
      res.on("end", () => { let json = null; try { json = JSON.parse(Buffer.concat(partes).toString("utf8")); } catch { /* no era JSON */ } ok({ status: res.statusCode, json }); });
    });
    req.on("timeout", () => req.destroy(new Error("tiempo de espera agotado")));
    req.on("error", mal);
    req.end();
  });
}

/** Corre todas las sincronizaciones habilitadas. Para el temporizador de cada sistema. */
async function sincronizarTodas(dep) {
  const filas = await dep.qRows("SELECT tenant_id FROM activo_sincronizaciones WHERE habilitada = 1").catch(() => []);
  const salida = [];
  for (const f of filas) salida.push(await sincronizar(dep, { tenant: f.tenant_id }).catch(e => ({ ok: false, error: e.message })));
  return salida;
}

module.exports = { emitirToken, tenantDelToken, exportar, sincronizar, sincronizarTodas, pedirJSON, esInterna, hash, CAMPOS_EXPORT, afectadas };
