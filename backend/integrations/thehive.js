"use strict";
const { httpRequest, parseJSON } = require("./http");

function headers(cfg) {
  return { "Authorization": `Bearer ${cfg.api_key || ""}`, "Content-Type": "application/json" };
}

// Extrae array de casos/alertas de cualquier formato que devuelva TheHive
function extractList(data) {
  if (Array.isArray(data))       return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.cases))  return data.cases;
  if (Array.isArray(data?.alerts)) return data.alerts;
  if (Array.isArray(data?.items))  return data.items;
  return null;
}

async function getCases(cfg, { limit = 25 } = {}) {
  const h = headers(cfg);
  let lastError = "No se pudo obtener casos";
  // TheHive 5: /api/v1/case  |  TheHive 4: /api/case (sort por startDate)
  for (const url of [
    `${cfg.url}/api/v1/case?range=0-${limit}&sort=-_updatedAt`,
    `${cfg.url}/api/case?range=0-${limit}&sort=-startDate`,
    `${cfg.url}/api/case?range=0-${limit}`,
  ]) {
    try {
      const r = await httpRequest(url, { headers: h });
      if (r.status === 200) {
        const data = parseJSON(r.data);
        const list = extractList(data);
        if (list) return { ok: true, cases: list };
      }
      const parsed = parseJSON(r.data);
      lastError = parsed?.message || parsed?.error || `HTTP ${r.status}`;
    } catch (e) { lastError = e.message; }
  }
  return { ok: false, cases: [], error: lastError };
}

async function getAlerts(cfg, { limit = 25 } = {}) {
  const h = headers(cfg);
  let lastError = "No se pudo obtener alertas";
  // TheHive 5: /api/v1/alert  |  TheHive 4: /api/alert
  for (const url of [
    `${cfg.url}/api/v1/alert?range=0-${limit}&sort=-_updatedAt`,
    `${cfg.url}/api/alert?range=0-${limit}&sort=-startDate`,
    `${cfg.url}/api/alert?range=0-${limit}`,
  ]) {
    try {
      const r = await httpRequest(url, { headers: h });
      if (r.status === 200) {
        const data = parseJSON(r.data);
        const list = extractList(data);
        if (list) return { ok: true, alerts: list };
      }
      const parsed = parseJSON(r.data);
      lastError = parsed?.message || parsed?.error || `HTTP ${r.status}`;
    } catch (e) { lastError = e.message; }
  }
  return { ok: false, alerts: [], error: lastError };
}

async function createCase(cfg, caseData) {
  const h = headers(cfg);
  const payload = {
    title:       caseData.title       || "Sin título",
    description: caseData.description || "",
    severity:    Number(caseData.severity) || 2,
    startDate:   caseData.startDate   || Date.now(),
    tags:        Array.isArray(caseData.tags) ? caseData.tags : [],
  };
  let lastError = "No se pudo crear el caso";
  for (const url of [`${cfg.url}/api/v1/case`, `${cfg.url}/api/case`]) {
    try {
      const r = await httpRequest(url, { method: "POST", headers: h, body: payload });
      if (r.status === 200 || r.status === 201) {
        return { ok: true, case: parseJSON(r.data) };
      }
      const parsed = parseJSON(r.data);
      lastError = parsed?.message || parsed?.error || parsed?.type || `HTTP ${r.status}: ${r.data?.slice(0, 200)}`;
    } catch (e) { lastError = e.message; }
  }
  return { ok: false, error: lastError };
}

async function getStats(cfg) {
  const [cr, ar] = await Promise.allSettled([
    getCases(cfg, { limit: 200 }),
    getAlerts(cfg, { limit: 200 }),
  ]);
  const cases  = cr.status === "fulfilled" ? cr.value.cases  : [];
  const alerts = ar.status === "fulfilled" ? ar.value.alerts : [];
  return {
    totalCases:      cases.length,
    openCases:       cases.filter(c => c.status === "Open"       || c.caseId).length,
    inProgressCases: cases.filter(c => c.status === "InProgress").length,
    totalAlerts:     alerts.length,
    newAlerts:       alerts.filter(a => a.status === "New").length,
    inProgressAlerts: alerts.filter(a => a.status === "InProgress").length,
  };
}

module.exports = { getCases, getAlerts, createCase, getStats };
