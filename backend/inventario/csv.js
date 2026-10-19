"use strict";
/**
 * CSV del inventario: lectura con detección de columnas en español e inglés, y escritura segura.
 * Canónico.
 *
 * 🔑 **El CSV es como llega el inventario real.** Casi ningún cliente arranca de cero: tiene una
 * planilla. Si la importación exige un formato exacto, nadie la usa. Por eso se reconocen los nombres
 * de columna más comunes en los dos idiomas, las fechas en día/mes/año o año-mes-día y los importes
 * con coma decimal. Idea tomada de AssetScope.
 *
 * ⚠️ **Inyección de fórmulas.** Una celda que empieza con `=`, `+`, `-`, `@` se ejecuta al abrir el
 * archivo en una planilla. Al exportar se le antepone un apóstrofo.
 */

/** Nombre de columna normalizado -> campo. Sin tildes, minúsculas, sin separadores. */
const ALIAS = {
  nombre: ["nombre", "name", "equipo", "activo", "asset", "descripcion", "description"],
  hostname: ["hostname", "host", "nombrehost", "nombredehost"],
  tipo: ["tipo", "type", "clase", "class"],
  categoria: ["categoria", "category"],
  estado: ["estado", "status", "state"],
  cantidad: ["cantidad", "count", "qty", "quantity", "unidades"],
  numero_inventario: ["inventario", "ninventario", "numeroinventario", "nroinventario", "ndeinventario", "nrodeinventario", "numerodeinventario", "assettag", "tag", "etiqueta"],
  serie: ["serie", "numerodeserie", "nserie", "nroserie", "ndeserie", "nrodeserie", "nodeserie", "numserie", "serial", "serialnumber", "sn"],
  fabricante: ["fabricante", "marca", "manufacturer", "brand", "vendor"],
  modelo: ["modelo", "model"],
  ip: ["ip", "direccionip", "ipaddress", "address"],
  mac: ["mac", "macaddress", "direccionmac"],
  so: ["so", "sistemaoperativo", "os", "operatingsystem"],
  so_version: ["versionso", "osversion"],
  version: ["version"],
  ubicacion: ["ubicacion", "location", "sala", "sede", "site"],
  area: ["area", "departamento", "department", "sector"],
  propietario: ["propietario", "owner", "dueno", "responsablesgsi"],
  propietario_correo: ["correopropietario", "owneremail", "mailpropietario"],
  custodio: ["custodio", "custodian"],
  asignado_a: ["asignado", "asignadoa", "usuario", "assignedto", "user"],
  criticidad: ["criticidad", "criticality", "importancia"],
  clasificacion: ["clasificacion", "classification"],
  proveedor: ["proveedor", "supplier", "seller", "vendedor"],
  fecha_compra: ["fechacompra", "fechadecompra", "compra", "purchasedate", "purchased"],
  factura: ["factura", "invoice"],
  costo: ["costo", "precio", "price", "cost", "valor", "importe"],
  moneda: ["moneda", "currency"],
  centro_costo: ["centrodecosto", "centrocosto", "costcenter"],
  notas: ["notas", "observaciones", "notes", "comentarios", "comments"],
  // Vencimientos: una columna por tipo, la fecha va directo a activo_vencimientos.
  venc_garantia: ["garantia", "garantiahasta", "vencimientogarantia", "warranty", "warrantyend", "warrantyexpiration"],
  venc_soporte: ["soporte", "soportehasta", "finsoporte", "eos", "endofsupport", "support"],
  venc_fin_vida: ["finvida", "findevida", "eol", "endoflife"],
  venc_licencia: ["licenciahasta", "vencimientolicencia", "licenseexpiration", "subscriptionend", "vencesuscripcion"],
  venc_contrato: ["contrato", "contratohasta", "mantenimiento", "maintenance", "contractend"],
  venc_certificado: ["certificadohasta", "certexpiration", "sslexpiration"],
  venc_dominio: ["dominiohasta", "domainexpiration"],
  costo_renovacion: ["costorenovacion", "renovacion", "renewalcost", "renewal"],
};

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const INDICE = {};
for (const [campo, lista] of Object.entries(ALIAS)) for (const a of lista) if (!INDICE[a]) INDICE[a] = campo;

/** Separa en filas y celdas respetando comillas (RFC 4180). Detecta `,` `;` o tabulador. */
function parsear(texto) {
  const t = String(texto || "").replace(/^﻿/, "");
  const primera = t.split(/\r?\n/, 1)[0] || "";
  const sep = [";", "\t", ","].map(s => [s, primera.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = [];
  let fila = [], celda = "", comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda); celda = "";
      if (fila.some(x => x.trim() !== "")) filas.push(fila);
      fila = [];
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some(x => x.trim() !== "")) filas.push(fila);
  return { separador: sep, filas };
}

/** Fecha en cualquiera de los formatos de una planilla argentina -> "YYYY-MM-DD" o null. */
function fecha(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);   // día/mes/año, el orden local
  if (m) return valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if (/^\d{5}$/.test(s)) {                                     // número de serie de fecha de Excel
    const d = new Date(Date.UTC(1899, 11, 30) + +s * 86400000);
    return valida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}
function valida(y, m, d) {
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "1.234,56" / "1,234.56" / "$ 1234" -> 1234.56 o null. */
function importe(v) {
  let s = String(v || "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
  if (coma > punto) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convierte el CSV en filas con los campos del inventario.
 * Devuelve `{ columnas: [{origen, campo}], filas: [{...}], ignoradas: [nombres] }`.
 */
function leer(texto) {
  const { filas } = parsear(texto);
  if (!filas.length) return { columnas: [], filas: [], ignoradas: [] };
  const cab = filas[0].map(h => h.trim());
  const columnas = cab.map(h => ({ origen: h, campo: INDICE[norm(h)] || null }));
  const usadas = new Set();
  for (const c of columnas) { if (c.campo && usadas.has(c.campo)) c.campo = null; else if (c.campo) usadas.add(c.campo); }
  const salida = filas.slice(1).map(f => {
    const o = {};
    columnas.forEach((c, i) => {
      if (!c.campo) return;
      const v = (f[i] ?? "").trim();
      if (v === "") return;
      if (c.campo.startsWith("venc_") || c.campo === "fecha_compra") { const d = fecha(v); if (d) o[c.campo] = d; }
      else if (c.campo === "costo" || c.campo === "costo_renovacion") { const n = importe(v); if (n != null) o[c.campo] = n; }
      else if (c.campo === "cantidad") { const n = parseInt(v, 10); if (n > 0) o.cantidad = n; }
      else o[c.campo] = v;
    });
    return o;
  }).filter(o => Object.keys(o).length);
  return { columnas, filas: salida, ignoradas: columnas.filter(c => !c.campo).map(c => c.origen) };
}

function celda(v) {
  if (v == null) return "";
  // Fecha local, no toISOString(): en un servidor con zona UTC corre el día (gotcha del cerebro).
  const p2 = (n) => String(n).padStart(2, "0");
  let s = v instanceof Date ? `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}` : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Filas -> CSV con BOM (para que Excel respete las tildes) y `;` (el separador de Excel en es-AR). */
function escribir(columnas, filas) {
  const lineas = [columnas.map(c => celda(c.titulo)).join(";")];
  for (const f of filas) lineas.push(columnas.map(c => celda(typeof c.valor === "function" ? c.valor(f) : f[c.campo])).join(";"));
  return "﻿" + lineas.join("\r\n") + "\r\n";
}

module.exports = { parsear, leer, escribir, fecha, importe, ALIAS };
