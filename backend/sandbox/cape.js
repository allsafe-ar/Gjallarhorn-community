"use strict";
const { httpRequest, httpUpload, parseJSON } = require("../integrations/http");

// CAPEv2 — sandbox de detonación autohospedado, heredero de Cuckoo.
// cfg.url = http://<cape>:8000  ·  cfg.api_key = token (opcional según instalación)
//
// La muestra NUNCA sale de la red del cliente: por eso es el motor que corresponde
// en sector regulado. Gjallarhorn solo manda el trabajo y lee el resultado.

const meta = {
  id:       "cape",
  nombre:   "CAPEv2",
  tipo:     "autohospedado",
  publica:  false,          // la muestra no se publica en ningún lado
  archivos: true,
  urls:     true,
};

function cabeceras(cfg) {
  return cfg?.api_key ? { "Authorization": `Token ${cfg.api_key}` } : {};
}

// 🔑 Dos cosas que solo aparecen probando contra un CAPE real, y que un shim no
// enseña:
//
// 1. CAPE responde **HTTP 200 igual cuando falla**. El error viene en el cuerpo,
//    como { error: true, error_value: "..." }. Mirar solo el código de estado da
//    un falso éxito.
// 2. Cada endpoint de su API se habilita por separado en `conf/api.conf`, y
//    varios vienen apagados de fábrica. Si el analista ve "no se pudo enviar" sin
//    más, no tiene forma de saber que le falta habilitar una línea en un archivo.
function errorDeCape(d, status) {
  if (d && d.error === true) {
    const v = String(d.error_value || "Error de CAPE");
    return /is disabled/i.test(v)
      ? `${v}. Se habilita en conf/api.conf del servidor de CAPE.`
      : v;
  }
  if (status < 200 || status >= 300) return `HTTP ${status}`;
  return null;
}

async function submitFile(cfg, { buffer, filename }) {
  try {
    const r = await httpUpload(`${cfg.url}/apiv2/tasks/create/file/`, {
      fileBuffer: buffer, fileName: filename, fieldName: "file",
      headers: cabeceras(cfg), timeout: 120000,
    });
    const d = parseJSON(r.data);
    // CAPE devuelve { error: false, data: { task_ids: [N] } }
    const id = d?.data?.task_ids?.[0] ?? d?.data?.task_id ?? d?.task_id;
    if (r.status >= 200 && r.status < 300 && id) return { ok: true, taskId: String(id) };
    return { ok: false, error: errorDeCape(d, r.status) || (d?.errors ? JSON.stringify(d.errors) : `HTTP ${r.status}`) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function submitUrl(cfg, { url }) {
  try {
    const r = await httpUpload(`${cfg.url}/apiv2/tasks/create/url/`, {
      fileBuffer: Buffer.alloc(0), fileName: "", fieldName: "unused",
      fields: { url }, headers: cabeceras(cfg), timeout: 60000,
    });
    const d = parseJSON(r.data);
    const id = d?.data?.task_ids?.[0] ?? d?.data?.task_id;
    if (r.status >= 200 && r.status < 300 && id) return { ok: true, taskId: String(id) };
    return { ok: false, error: errorDeCape(d, r.status) || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getResult(cfg, taskId) {
  try {
    const est = await httpRequest(`${cfg.url}/apiv2/tasks/status/${taskId}/`, { headers: cabeceras(cfg) });
    const ed  = parseJSON(est.data);
    const problema = errorDeCape(ed, est.status);
    if (problema) return { ok: false, error: problema };
    const crudo = String(ed?.data || ed?.status || "").toLowerCase();

    // CAPE: pending → running → completed → reported.
    // ⚠️ Solo "reported" trae el reporte con el comportamiento ya procesado.
    // En "completed" el análisis terminó pero el behavior todavía no está en el
    // JSON, así que tratarlo como listo cachea un reporte vacío (0 procesos).
    if (crudo !== "reported")
      return { ok: true, estado: crudo === "pending" ? "pendiente" : "corriendo", crudo };

    const rep = await httpRequest(`${cfg.url}/apiv2/tasks/get/report/${taskId}/json/`, { headers: cabeceras(cfg), timeout: 60000 });
    if (rep.status !== 200) return { ok: false, error: `No se pudo leer el reporte: HTTP ${rep.status}` };
    const d = parseJSON(rep.data);
    if (!d) return { ok: false, error: "El reporte no vino en JSON" };
    return { ok: true, estado: "listo", ...normalizar(d) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Traduce el reporte de CAPE a la forma común. Todo lo que no venga queda vacío,
// nunca inventado: un panel que muestra datos que el motor no dio es peor que uno
// que muestra menos.
function normalizar(d) {
  const info  = d.info || {};
  const malscore = Number(info.score ?? d.malscore ?? 0);
  const puntaje = Math.max(0, Math.min(100, Math.round(malscore * 10)));   // CAPE puntúa 0-10

  const red = [];
  for (const h of (d.network?.hosts || [])) red.push({ tipo: "host", valor: h.ip || h });
  for (const dom of (d.network?.domains || [])) red.push({ tipo: "dominio", valor: dom.domain || dom });
  for (const req of (d.network?.http || [])) red.push({ tipo: "http", valor: req.uri || req.host });

  const comportamientos = (d.signatures || []).map(s => ({
    nombre:      s.name || s.description,
    descripcion: s.description,
    severidad:   s.severity,
  }));

  const procesos = (d.behavior?.processes || []).map(p => ({ pid: p.pid ?? p.process_id, nombre: p.process_name || p.name, comando: p.command_line || p.commandline }));

  // 🔑 Un análisis dinámico real SIEMPRE ejecuta la muestra, así que genera al
  // menos un proceso. Si el análisis completó pero no observó NADA (ni un proceso,
  // ni comportamiento, ni red), la muestra no se ejecutó: faltó la aplicación que
  // la abre (p. ej. un documento sin Office), el tipo de archivo no es detonable,
  // o falló el arranque. Eso NO es "limpio": es "no se pudo analizar". Marcarlo
  // CLEAN daría una falsa tranquilidad, que es lo peor que puede hacer un sandbox.
  const sinEvidencia = procesos.length === 0 && comportamientos.length === 0 && red.length === 0;

  return {
    verdicto:   sinEvidencia ? "UNANALYZED"
                : puntaje >= 70 ? "MALICIOUS" : puntaje >= 40 ? "SUSPICIOUS" : "CLEAN",
    puntaje,
    familia:    (d.detections?.[0]?.family) || info.custom || null,
    comportamientos,
    red,
    procesos,
    archivos:   (d.dropped || []).map(f => ({ nombre: f.name, sha256: f.sha256, tipo: f.type })),
    capturas:   (d.screenshots || []).map(s => (typeof s === "string" ? s : s.path)).filter(Boolean),
    urlReporte: info.id ? `/analysis/${info.id}/` : null,
  };
}

module.exports = { meta, submitFile, submitUrl, getResult, normalizar };
