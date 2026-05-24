"use strict";
const { httpRequest, parseJSON } = require("./http");

function authHdr(cfg) {
  const secret = cfg.extra_config?.secretKey || "";
  return { "X-ApiKeys": `accessKey=${cfg.api_key || ""};secretKey=${secret}` };
}

async function getScans(cfg) {
  try {
    const r = await httpRequest(`${cfg.url}/scans`, { headers: authHdr(cfg) });
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return { ok: true, scans: data?.scans || [] };
    }
    return { ok: false, scans: [], error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, scans: [], error: e.message };
  }
}

async function getScanDetail(cfg, scanId) {
  try {
    const r = await httpRequest(`${cfg.url}/scans/${scanId}`, { headers: authHdr(cfg) });
    if (r.status === 200) return { ok: true, scan: parseJSON(r.data) };
    return { ok: false, scan: null, error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, scan: null, error: e.message };
  }
}

async function getVulns(cfg, scanId) {
  try {
    // Nessus returns vulnerabilities inside the scan detail, not a separate endpoint
    const r = await httpRequest(`${cfg.url}/scans/${scanId}`, { headers: authHdr(cfg) });
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return {
        ok: true,
        vulns: data?.vulnerabilities || [],
        hosts: data?.hosts || [],
        info:  data?.info  || {},
      };
    }
    return { ok: false, vulns: [], error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, vulns: [], error: e.message };
  }
}

async function getStats(cfg) {
  const sr = await getScans(cfg);
  if (!sr.ok) return { totalScans: 0, completedScans: 0, criticalVulns: 0, highVulns: 0 };

  const scans = sr.scans;

  // Count severity from scan-level counts (Nessus API: counts.vulnerabilities.severities)
  // level 4 = critical, level 3 = high
  let criticalVulns = 0;
  let highVulns = 0;
  for (const s of scans) {
    const severities = s.counts?.vulnerabilities?.severities || [];
    for (const sv of severities) {
      if (sv.level === 4) criticalVulns += sv.count || 0;
      if (sv.level === 3) highVulns     += sv.count || 0;
    }
  }

  return {
    totalScans:     scans.length,
    completedScans: scans.filter(s => s.status === "completed").length,
    runningScans:   scans.filter(s => s.status === "running").length,
    criticalVulns,
    highVulns,
  };
}

module.exports = { getScans, getScanDetail, getVulns, getStats };
