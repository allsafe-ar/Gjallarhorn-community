/**
 * Identidad de un activo entre varias fuentes. Canónico (utiles/activos): idéntico en Skuld y Gjallarhorn.
 *
 * 🔑 **El problema.** El mismo servidor puede llegar por Zabbix, por GLPI, por el agente
 * Huginn y estar cargado a mano. Si cada fuente crea su fila, el inventario miente: cuatro
 * filas para un equipo, cuatro estados, y un tablero que dice que hay cuatro veces más
 * infraestructura de la que hay.
 *
 * 🔑 **La solución.** Un activo es UNA fila. Cada fuente que lo reporta queda registrada
 * aparte, con el identificador que esa fuente usa. Reimportar actualiza, no duplica. Y como
 * queda lo que dijo cada una, se puede mostrar en qué coinciden y en qué no.
 *
 * ⚠️ **Cuando dos fuentes se contradicen, eso es un hallazgo, no un error a esconder.** Que
 * GLPI diga que un equipo tiene Windows 10 y el sondeo diga Windows 11 significa que el
 * inventario del cliente está desactualizado, y eso es exactamente lo que un análisis de
 * riesgo necesita saber.
 */

const { FUENTES } = require("./taxonomia");

/**
 * Cómo se decide que dos registros son el mismo equipo, de más confiable a menos.
 *
 * El orden importa: la IP es el criterio más débil porque se reasigna, y dos equipos
 * distintos pueden haber tenido la misma con meses de diferencia. Se usa solo cuando no hay
 * nada mejor, y **nunca** para unir registros de fuentes distintas sin confirmación.
 */
const CRITERIOS = [
  { campo: "serie",    peso: 100, seguro: true,  nota: "número de serie" },
  { campo: "mac",      peso:  90, seguro: true,  nota: "dirección MAC" },
  { campo: "hostname", peso:  60, seguro: false, nota: "nombre de host" },
  { campo: "ip",       peso:  30, seguro: false, nota: "dirección IP" },
];

/** Normaliza para comparar: sin mayúsculas, sin separadores, sin dominio. */
function norm(campo, v) {
  if (v == null) return null;
  let s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (campo === "mac")      return s.replace(/[^0-9a-f]/g, "") || null;
  if (campo === "serie")    return s.replace(/[\s-]/g, "") || null;
  if (campo === "hostname") return s.split(".")[0] || null;   // srv01.dominio.local -> srv01
  return s;
}

/**
 * Busca a qué activo existente corresponde lo que reporta una fuente.
 *
 * Devuelve `{ id, criterio, seguro }` o `null`. `seguro` en false significa que la
 * coincidencia es por un dato débil y **la decide una persona**, no el sistema.
 */
function emparejar(entrante, existentes) {
  const aciertos = [];      // { id, criterio, seguro }
  for (const c of CRITERIOS) {
    const valor = norm(c.campo, entrante[c.campo]);
    if (!valor) continue;
    const candidatos = existentes.filter(a => norm(c.campo, a[c.campo]) === valor);
    // Dos activos con el mismo dato es un problema de datos, no una coincidencia: no se
    // elige uno al azar.
    if (candidatos.length > 1) {
      return { id: null, criterio: c.nota, seguro: false, ambiguo: candidatos.length };
    }
    if (candidatos.length === 1)
      aciertos.push({ id: candidatos[0].id, campo: c.campo, criterio: c.nota, seguro: c.seguro });
  }
  if (!aciertos.length) return null;

  const fuerte = aciertos.find(a => a.seguro);
  if (fuerte) return fuerte;

  // 🔑 **Dos señales débiles que coinciden valen como una fuerte.** Que coincidan el nombre
  // Y la IP sobre el mismo activo no es casualidad.
  const debiles = aciertos.filter(a => !a.seguro);
  const mismos = new Set(debiles.map(a => a.id));
  if (debiles.length >= 2 && mismos.size === 1) {
    return { id: debiles[0].id, criterio: debiles.map(a => a.criterio).join(" + "), seguro: true };
  }

  // 🔑 **El nombre de host solo, cuando nada lo contradice, alcanza.**
  //
  // ⚠️ Esta es la regla que hace que la integración con dos herramientas sirva. Zabbix
  // aporta nombre e IP; GLPI aporta nombre, serie y MAC. **Lo único que comparten es el
  // nombre**, así que con la regla de dos señales el mismo servidor entraba dos veces, una
  // por cada herramienta. Verificado contra un Zabbix 7.0.30 y un GLPI 10.0.18 reales:
  // SRV-ARCHIVOS y SW-CORE se duplicaban, y ningún activo llegaba a tener dos procedencias,
  // que era justamente el objetivo de cruzar las dos fuentes.
  //
  // No se acepta a ciegas: si el candidato ya tiene una serie o una MAC y la entrante dice
  // otra, son equipos distintos con el mismo nombre y eso se respeta. Que el candidato no
  // tenga el dato NO es una contradicción, es que esa fuente no lo conoce.
  const porNombre = debiles.find(a => a.campo === "hostname");
  if (porNombre) {
    const cand = existentes.find(x => x.id === porNombre.id);
    const choque = contradice(entrante, cand);
    if (!choque) {
      return { id: porNombre.id, criterio: porNombre.criterio, seguro: true };
    }
    return { ...porNombre, seguro: false, criterio: `${porNombre.criterio} (pero difiere ${choque})` };
  }

  // La IP sola nunca alcanza: se reasigna, y dos equipos distintos pueden haberla tenido
  // con meses de diferencia. Queda como duda para que la resuelva una persona.
  return debiles[0];
}

/**
 * ¿Hay un identificador fuerte que diga que NO son el mismo equipo?
 *
 * Devuelve el nombre del campo que se contradice, o `null` si nada se contradice. Un valor
 * ausente en cualquiera de los dos lados no contradice nada: significa que esa fuente no
 * conoce el dato, no que el dato sea distinto.
 */
function contradice(entrante, candidato) {
  if (!candidato) return null;
  for (const c of CRITERIOS.filter(x => x.seguro)) {
    const a = norm(c.campo, entrante[c.campo]);
    const b = norm(c.campo, candidato[c.campo]);
    if (a && b && a !== b) return c.nota;
  }
  return null;
}

/**
 * Compara lo que dicen dos fuentes sobre el mismo activo y devuelve las discrepancias.
 * Se usa para mostrar dónde el inventario declarado no coincide con lo observado.
 */
function discrepancias(porFuente) {
  const campos = ["so", "hostname", "ip", "mac", "serie", "modelo", "fabricante"];
  const salida = [];
  for (const campo of campos) {
    const vistos = new Map();
    for (const [fuente, datos] of Object.entries(porFuente)) {
      const v = norm(campo, datos?.[campo]);
      if (v) vistos.set(fuente, { crudo: datos[campo], norm: v });
    }
    const distintos = new Set([...vistos.values()].map(x => x.norm));
    if (distintos.size > 1) {
      salida.push({
        campo,
        valores: Object.fromEntries([...vistos].map(([f, x]) => [f, x.crudo])),
      });
    }
  }
  return salida;
}

module.exports = { FUENTES, CRITERIOS, norm, emparejar, contradice, discrepancias };
