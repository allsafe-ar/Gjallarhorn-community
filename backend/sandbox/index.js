"use strict";

// Registro de motores de sandbox.
//
// Gjallarhorn no analiza nada: manda el trabajo al motor, espera, y traduce el
// resultado a una forma común. Por eso el resto del sistema no sabe ni tiene que
// saber contra qué motor está hablando; solo pide por id.
//
// Para sumar un motor nuevo alcanza con un archivo que exporte `meta`,
// `submitFile`, `submitUrl` y `getResult`, y agregarlo acá.

const cape   = require("./cape");
const cuckoo = require("./cuckoo");
const triage = require("./triage");

const MOTORES = { cape, cuckoo, triage };

/** Ids válidos, para validar lo que llega por la API. */
const IDS = Object.keys(MOTORES);

function motor(id) {
  return MOTORES[String(id || "").toLowerCase()] || null;
}

/**
 * Los motores con su ficha, sin credenciales. Es lo que la interfaz usa para
 * armar el selector y, sobre todo, para avisar a dónde va la muestra.
 */
function catalogo() {
  return IDS.map(id => ({ ...MOTORES[id].meta }));
}

/**
 * Forma común de un resultado, para que la interfaz no tenga ramas por motor:
 *   { estado: "pendiente" | "corriendo" | "listo",
 *     verdicto, puntaje, familia,
 *     comportamientos: [{nombre, descripcion, severidad}],
 *     red: [{tipo, valor}], procesos: [], archivos: [], capturas: [],
 *     urlReporte }
 */
module.exports = { MOTORES, IDS, motor, catalogo };
