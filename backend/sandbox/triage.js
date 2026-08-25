"use strict";
const { httpRequest, httpUpload, parseJSON } = require("../integrations/http");

// Triage (tria.ge) — sandbox en la nube, con API pública y detonación de archivos
// y de URLs. Se eligió como motor de nube de referencia porque tiene una API
// comunitaria utilizable para desarrollo y prueba.
//
// ⚠️ ACÁ LA MUESTRA SALE DE LA RED DEL CLIENTE. Y en las cuentas comunitarias de
// este tipo de servicios lo que se sube **suele quedar público**: cualquiera puede
// ver la muestra y su reporte. Por eso `publica: true`, que es lo que dispara el
// aviso en la interfaz antes de enviar. Para un archivo de un cliente hay que usar
// un motor autohospedado, no este.
//
// cfg.url = https://tria.ge  ·  cfg.api_key = token de la cuenta

const meta = {
  id:       "triage",
  nombre:   "Triage (tria.ge)",
  tipo:     "nube",
  publica:  true,
  archivos: true,
  urls:     true,
};

function base(cfg) {
  return (cfg?.url || "https://tria.ge").replace(/\/+$/, "");
}

function cabeceras(cfg) {
  return { "Authorization": `Bearer ${cfg?.api_key || ""}` };
}

async function submitFile(cfg, { buffer, filename }) {
  try {
    const r = await httpUpload(`${base(cfg)}/api/v0/samples`, {
      fileBuffer: buffer, fileName: filename, fieldName: "file",
      fields: { _json: JSON.stringify({ kind: "file", interactive: false }) },
      headers: cabeceras(cfg), timeout: 120000,
    });
    const d = parseJSON(r.data);
    if (r.status >= 200 && r.status < 300 && d?.id) return { ok: true, taskId: String(d.id) };
    return { ok: false, error: d?.error || d?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function submitUrl(cfg, { url }) {
  try {
    const r = await httpRequest(`${base(cfg)}/api/v0/samples`, {
      method: "POST", headers: cabeceras(cfg),
      body: { kind: "url", url, interactive: false }, timeout: 60000,
    });
    const d = parseJSON(r.data);
    if (r.status >= 200 && r.status < 300 && d?.id) return { ok: true, taskId: String(d.id) };
    return { ok: false, error: d?.error || d?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getResult(cfg, taskId) {
  try {
    const est = await httpRequest(`${base(cfg)}/api/v0/samples/${taskId}`, { headers: cabeceras(cfg) });
    if (est.status !== 200) return { ok: false, error: `HTTP ${est.status}` };
    const ed = parseJSON(est.data);
    const crudo = String(ed?.status || "").toLowerCase();
    if (crudo !== "reported")
      return { ok: true, estado: ["pending", "scheduled"].includes(crudo) ? "pendiente" : "corriendo", crudo };

    const rep = await httpRequest(`${base(cfg)}/api/v0/samples/${taskId}/overview.json`, { headers: cabeceras(cfg), timeout: 60000 });
    if (rep.status !== 200) return { ok: false, error: `No se pudo leer el reporte: HTTP ${rep.status}` };
    const d = parseJSON(rep.data);
    if (!d) return { ok: false, error: "El reporte no vino en JSON" };
    return { ok: true, estado: "listo", ...normalizar(d, taskId, base(cfg)) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function normalizar(d, taskId, urlBase) {
  const puntaje10 = Number(d?.analysis?.score ?? 0);         // Triage puntúa 0-10
  const puntaje = Math.max(0, Math.min(100, Math.round(puntaje10 * 10)));

  const red = [];
  for (const ioc of (d?.targets?.[0]?.iocs?.ips || []))    red.push({ tipo: "host", valor: ioc });
  for (const ioc of (d?.targets?.[0]?.iocs?.domains || [])) red.push({ tipo: "dominio", valor: ioc });
  for (const ioc of (d?.targets?.[0]?.iocs?.urls || []))    red.push({ tipo: "http", valor: ioc });

  const comportamientos = (d?.signatures || []).map(s => ({
    nombre: s.name, descripcion: s.desc, severidad: s.score,
  }));
  // Triage no expone la lista de procesos; su evidencia son las firmas y la red.
  // Si no reportó ninguna, no se pudo analizar (no es "limpio"). Ver cape.js.
  const sinEvidencia = comportamientos.length === 0 && red.length === 0;

  return {
    verdicto:   sinEvidencia ? "UNANALYZED"
                : puntaje >= 70 ? "MALICIOUS" : puntaje >= 40 ? "SUSPICIOUS" : "CLEAN",
    puntaje,
    familia:    (d?.analysis?.family || [])[0] || null,
    comportamientos,
    red,
    procesos:   [],
    archivos:   [],
    capturas:   [],
    urlReporte: `${urlBase}/reports/${taskId}`,
  };
}

module.exports = { meta, submitFile, submitUrl, getResult, normalizar };
