"use strict";
/**
 * Importación de un huginn.json al inventario. Canónico: Skuld y Gjallarhorn la usan igual.
 *
 * Huginn es el script de relevamiento que corre DENTRO de la red del cliente y empuja lo que ve.
 * Nació en Skuld con su formato de siete listas (endpoints, servers, exposed_services, services,
 * licenses, information, intangibles); acá se traduce a la taxonomía única y entra por la ingesta
 * común, así que un servidor que ya trajo Zabbix no se duplica.
 *
 * ⚠️ El formato del archivo NO cambia: hay scripts ya generados corriendo en clientes que mandan
 * exactamente esto. La traducción va de este lado.
 */

const { ingresar } = require("./ingreso");
const { aISO } = require("./vencimientos");

const CRIT = { low: "baja", medium: "media", high: "alta", critical: "critica" };
const TIPO_EP = { desktop: "pc", laptop: "notebook", mobile: "movil", thin_client: "thin_client", workstation: "workstation" };
const TIPO_SV = { internal: "interno", saas: "saas", cloud: "nube", on_premise: "interno" };
const SUB_INFO = { database: "base_datos", documents: "documentos", files: "archivos", emails: "correos", backups: "respaldos", code: "codigo", credentials: "credenciales" };
const CLASIF = { public: "publica", internal: "interna", confidential: "confidencial", restricted: "restringida" };
const CAT_INT = { reputation: "reputacion", intellectual_property: "propiedad_intelectual", process: "proceso", brand: "marca", know_how: "know_how", certification: "certificacion" };

const crit = (v) => CRIT[v] || (["baja", "media", "alta", "critica"].includes(v) ? v : undefined);

/** Riesgo de un puerto expuesto cuando Huginn no lo trae (la misma tabla que usaba Skuld). */
function riesgoPorPuerto(port) {
  const p = Number(port);
  if ([23, 445, 135, 3306, 5432, 1433, 27017, 6379, 9200, 2181, 11211, 5900].includes(p)) return "critica";
  if ([21, 3389, 8080, 8443, 2049, 111, 512, 513, 514].includes(p)) return "alta";
  if ([22, 25, 110, 143, 587, 993, 995].includes(p)) return "media";
  return "baja";
}

/** Lo que Huginn trae, ya en la forma del inventario. Función pura: se prueba sin base. */
function traducir(data) {
  const salida = { servidores: [], resto: [], expuestos: [], licencias: [] };
  for (const ep of data.endpoints || []) {
    const tipo = TIPO_EP[ep.type] || "pc";
    salida.resto.push({ agrupado: (ep.count || 1) > 1 || !ep.hostname, entrante: {
      nombre: ep.hostname || `${ep.os || "Puestos"}${ep.os_version ? " " + ep.os_version : ""}${ep.area ? " (" + ep.area + ")" : ""}`,
      tipo, cantidad: ep.count || 1, so: ep.os, so_version: ep.os_version, area: ep.area, hostname: ep.hostname,
      ip: ep.ip_address, mac: ep.mac, serie: ep.serial, criticidad: crit(ep.criticality), notas: ep.notes,
    } });
  }
  for (const sv of data.servers || []) {
    salida.servidores.push({ ip: sv.ip_address, entrante: {
      nombre: sv.name || sv.ip_address, tipo: "servidor", ip: sv.ip_address, hostname: sv.hostname, mac: sv.mac, serie: sv.serial,
      so: sv.os, so_version: sv.os_version, criticidad: crit(sv.criticality), expuesto_internet: sv.is_internet_facing ? 1 : 0,
      propietario: sv.data_owner, notas: sv.notes,
      atributos: { ubicacion_tipo: sv.location_type, proveedor_nube: sv.provider, servicios: sv.services || [], tecnologias: sv.technologies || [] },
    } });
  }
  for (const ex of data.exposed_services || []) {
    salida.expuestos.push({ servidorIp: ex.server_ip, entrante: {
      nombre: `${ex.service_name || "Servicio"} ${ex.public_ip || ex.server_ip || ""}:${ex.port}/${ex.protocol || "TCP"}`.replace(/\s+:/, ":"),
      tipo: "expuesto", ip: ex.public_ip, version: ex.version, expuesto_internet: 1,
      criticidad: crit(ex.risk_level) || riesgoPorPuerto(ex.port), notas: ex.notes,
      atributos: { puerto: ex.port, protocolo: ex.protocol || "TCP", servicio: ex.service_name, autorizado: !!ex.is_authorized },
    } });
  }
  for (const s of data.services || []) {
    if (!s.name) continue;
    salida.resto.push({ agrupado: true, entrante: {
      nombre: s.name, tipo: TIPO_SV[s.service_type] || "interno", proveedor: s.provider, url: s.url,
      criticidad: crit(s.criticality), expuesto_internet: s.is_internet_facing ? 1 : 0, notas: s.notes,
      atributos: { dependencias: s.dependencies || [] },
    } });
  }
  for (const l of data.licenses || []) {
    if (!l.software_name) continue;
    salida.licencias.push({ vence: l.expiry_date || null, entrante: {
      nombre: l.software_name, tipo: "licencia", version: l.version, fabricante: l.vendor, notas: l.notes,
      atributos: { tipo_licencia: l.license_type || "perpetual", puestos: l.seat_count || null,
                   version_vigente: !(l.is_current_version === false || l.is_current_version === 0) },
    } });
  }
  for (const i of data.information || []) {
    if (!i.name) continue;
    salida.resto.push({ agrupado: true, entrante: {
      nombre: i.name, tipo: SUB_INFO[i.subtype] || "archivos", clasificacion: CLASIF[i.classification] || "interna",
      propietario: i.owner, ubicacion: i.storage_location, notas: i.notes,
    } });
  }
  for (const it of data.intangibles || []) {
    if (!it.name) continue;
    salida.resto.push({ agrupado: true, entrante: {
      nombre: it.name, tipo: CAT_INT[it.category] || "proceso", propietario: it.owner, criticidad: crit(it.criticality),
      notas: [it.description, it.notes].filter(Boolean).join("\n\n") || undefined,
    } });
  }
  return salida;
}

/**
 * Importa un huginn.json entero. Devuelve el resumen por acción, como lo ve la persona.
 * `dep` es el de la ingesta (qRow, qRows, qRun, uuidv4, alCrear?).
 */
async function importar(dep, { tenant, data, usuario, fuente = "huginn" }) {
  const t = traducir(data || {});
  const resumen = { nuevo: 0, vinculado: 0, actualizado: 0, nuevo_con_duda: 0, descartado: 0, vencimientos: 0 };
  const cuenta = (r) => { resumen[r.accion] = (resumen[r.accion] || 0) + 1; return r; };
  const idPorIp = {};
  for (const s of t.servidores) {
    const r = cuenta(await ingresar(dep, { tenant, fuente, externoId: s.entrante.serie || null, entrante: s.entrante, usuario }));
    if (r.id && s.ip) idPorIp[s.ip] = r.id;
  }
  for (const e of t.expuestos) {
    const padre = e.servidorIp ? idPorIp[e.servidorIp] : null;
    // El servicio expuesto se identifica por servidor + puerto: reimportar no lo duplica.
    const externo = `${e.servidorIp || e.entrante.ip || ""}:${e.entrante.atributos.puerto}/${e.entrante.atributos.protocolo}`;
    cuenta(await ingresar(dep, { tenant, fuente, externoId: externo, entrante: { ...e.entrante, ...(padre ? { padre_id: padre } : {}) }, usuario, agrupado: true }));
  }
  for (const x of t.resto) {
    const externo = x.agrupado ? `${x.entrante.tipo}:${x.entrante.nombre}` : null;
    cuenta(await ingresar(dep, { tenant, fuente, externoId: externo, entrante: x.entrante, usuario, agrupado: x.agrupado }));
  }
  for (const l of t.licencias) {
    const r = cuenta(await ingresar(dep, { tenant, fuente, externoId: `licencia:${l.entrante.nombre}:${l.entrante.version || ""}`, entrante: l.entrante, usuario, agrupado: true }));
    if (r.id && l.vence) {
      const ya = await dep.qRow("SELECT id FROM activo_vencimientos WHERE activo_id = ? AND tipo = 'licencia' AND estado = 'vigente'", [r.id]);
      if (ya) {
        const previo = await dep.qRow("SELECT fecha FROM activo_vencimientos WHERE id = ?", [ya.id]);
        if (aISO(previo?.fecha) !== aISO(l.vence)) {
          await dep.qRun("UPDATE activo_vencimientos SET fecha = ? WHERE id = ?", [l.vence, ya.id]);
          await dep.qRun("DELETE FROM activo_avisos WHERE vencimiento_id = ?", [ya.id]);
        }
      }
      else {
        await dep.qRun("INSERT INTO activo_vencimientos (id, tenant_id, activo_id, tipo, fecha, origen) VALUES (?,?,?,?,?,?)",
          [dep.uuidv4(), tenant, r.id, "licencia", l.vence, fuente]);
        resumen.vencimientos++;
      }
    }
  }
  return resumen;
}

module.exports = { traducir, importar, riesgoPorPuerto, CRIT, TIPO_EP, TIPO_SV, SUB_INFO, CLASIF, CAT_INT };
