"use strict";
const { httpRequest, parseJSON } = require("./http");

// cfg.url  → http://<openvas-vm>:9391  (gvm_proxy HTTP endpoint)
// cfg.api_key → GMP password (used as Bearer token for the proxy)

function authHdr(cfg) {
  return { "Authorization": `Bearer ${cfg.api_key || ""}` };
}

async function getTasks(cfg, { limit = 100 } = {}) {
  try {
    const r = await httpRequest(`${cfg.url}/api/v1/tasks`, {
      headers: authHdr(cfg),
    });
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return { ok: true, tasks: data?.tasks || [], total: data?.total || 0 };
    }
    return { ok: false, tasks: [], error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, tasks: [], error: e.message };
  }
}

async function getResults(cfg, { taskId, limit = 200 } = {}) {
  try {
    const url = taskId
      ? `${cfg.url}/api/v1/tasks/${taskId}/results`
      : `${cfg.url}/api/v1/results`;
    const r = await httpRequest(url, { headers: authHdr(cfg) });
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return { ok: true, results: data?.results || [], total: data?.total || 0 };
    }
    return { ok: false, results: [], error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, results: [], error: e.message };
  }
}

async function getReports(cfg) {
  try {
    const r = await httpRequest(`${cfg.url}/api/v1/reports`, {
      headers: authHdr(cfg),
    });
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return { ok: true, reports: data?.reports || [], total: data?.total || 0 };
    }
    return { ok: false, reports: [], error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, reports: [], error: e.message };
  }
}

async function getStats(cfg) {
  const [tr, rr] = await Promise.allSettled([
    getTasks(cfg),
    getResults(cfg, { limit: 500 }),
  ]);
  const tasks   = tr.status === "fulfilled" ? tr.value.tasks   : [];
  const results = rr.status === "fulfilled" ? rr.value.results : [];

  const critical = results.filter(r => parseFloat(r.severity || 0) >= 9).length;
  const high     = results.filter(r => { const s = parseFloat(r.severity || 0); return s >= 7 && s < 9; }).length;

  return {
    totalScans:    tasks.length,
    runningScans:  tasks.filter(t => t.status === "Running").length,
    donScans:      tasks.filter(t => t.status === "Done").length,
    totalVulns:    results.length,
    criticalVulns: critical,
    highVulns:     high,
  };
}

module.exports = { getTasks, getResults, getReports, getStats };
