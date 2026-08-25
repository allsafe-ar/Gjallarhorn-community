"use strict";
const { httpRequest, httpUpload, parseJSON } = require("../integrations/http");
const cape = require("./cape");

// Cuckoo — el sandbox del que CAPE es un fork. Se mantiene como adaptador propio
// porque su API vive en otras rutas (sin el /apiv2/ y sin la barra final), aunque
// la forma del reporte es casi la misma, así que se reusa la normalización.
//
// cfg.url = http://<cuckoo>:8090  ·  cfg.api_key = token (opcional)

const meta = {
  id:       "cuckoo",
  nombre:   "Cuckoo",
  tipo:     "autohospedado",
  publica:  false,
  archivos: true,
  urls:     true,
};

function cabeceras(cfg) {
  return cfg?.api_key ? { "Authorization": `Bearer ${cfg.api_key}` } : {};
}

async function submitFile(cfg, { buffer, filename }) {
  try {
    const r = await httpUpload(`${cfg.url}/tasks/create/file`, {
      fileBuffer: buffer, fileName: filename, fieldName: "file",
      headers: cabeceras(cfg), timeout: 120000,
    });
    const d = parseJSON(r.data);
    const id = d?.task_id ?? d?.task_ids?.[0];
    if (r.status >= 200 && r.status < 300 && id) return { ok: true, taskId: String(id) };
    return { ok: false, error: d?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function submitUrl(cfg, { url }) {
  try {
    const r = await httpUpload(`${cfg.url}/tasks/create/url`, {
      fileBuffer: Buffer.alloc(0), fileName: "", fieldName: "unused",
      fields: { url }, headers: cabeceras(cfg), timeout: 60000,
    });
    const d = parseJSON(r.data);
    const id = d?.task_id;
    if (r.status >= 200 && r.status < 300 && id) return { ok: true, taskId: String(id) };
    return { ok: false, error: d?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getResult(cfg, taskId) {
  try {
    const est = await httpRequest(`${cfg.url}/tasks/view/${taskId}`, { headers: cabeceras(cfg) });
    const ed  = parseJSON(est.data);
    const crudo = String(ed?.task?.status || "").toLowerCase();
    if (crudo && crudo !== "reported")
      return { ok: true, estado: crudo === "pending" ? "pendiente" : "corriendo", crudo };

    const rep = await httpRequest(`${cfg.url}/tasks/report/${taskId}`, { headers: cabeceras(cfg), timeout: 60000 });
    if (rep.status !== 200) return { ok: false, error: `No se pudo leer el reporte: HTTP ${rep.status}` };
    const d = parseJSON(rep.data);
    if (!d) return { ok: false, error: "El reporte no vino en JSON" };
    return { ok: true, estado: "listo", ...cape.normalizar(d) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { meta, submitFile, submitUrl, getResult };
