"use strict";
const { httpRequest, parseJSON } = require("./http");

// Velociraptor 0.76+ with Basic authenticator
// cfg.url      → https://<ip>:8889
// cfg.username → GUI username
// cfg.password → GUI password

function authHdr(cfg) {
  const b64 = Buffer.from(`${cfg.username || ""}:${cfg.password || ""}`).toString("base64");
  return { "Authorization": `Basic ${b64}` };
}

// last_seen_at from Velociraptor is in microseconds
function isOnline(last_seen_at) {
  if (!last_seen_at) return false;
  const secsAgo = (Date.now() * 1000 - Number(last_seen_at)) / 1e6;
  return secsAgo < 600; // seen in last 10 min
}

async function getClients(cfg, { limit = 200 } = {}) {
  try {
    const r = await httpRequest(
      `${cfg.url}/api/v1/SearchClients?query=all&limit=${limit}`,
      { headers: authHdr(cfg) }
    );
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return { ok: true, clients: data?.items || [], total: parseInt(data?.total || "0") };
    }
    return { ok: false, clients: [], error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, clients: [], error: e.message };
  }
}

async function getHunts(cfg, { limit = 50 } = {}) {
  try {
    const r = await httpRequest(
      `${cfg.url}/api/v1/ListHunts?count=${limit}`,
      { headers: authHdr(cfg) }
    );
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return { ok: true, hunts: data?.items || [] };
    }
    return { ok: false, hunts: [], error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, hunts: [], error: e.message };
  }
}

// GetClientFlows returns a table: { columns, rows: [{json: "[...]"}] }
async function getFlows(cfg, clientId, { limit = 20 } = {}) {
  try {
    const r = await httpRequest(
      `${cfg.url}/api/v1/GetClientFlows?client_id=${clientId}&count=${limit}`,
      { headers: authHdr(cfg) }
    );
    if (r.status === 200) {
      const data = parseJSON(r.data);
      const cols = data?.columns || [];
      const flows = (data?.rows || []).map(row => {
        try {
          const vals = JSON.parse(row.json);
          const obj = {};
          cols.forEach((c, i) => { obj[c] = vals[i]; });
          // Flatten the embedded _Flow object if present
          if (obj._Flow && typeof obj._Flow === "object") {
            obj.flow = obj._Flow;
            delete obj._Flow;
          }
          return obj;
        } catch { return {}; }
      });
      return { ok: true, flows, total: parseInt(data?.total_rows || "0") };
    }
    return { ok: false, flows: [], error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, flows: [], error: e.message };
  }
}

async function getStats(cfg) {
  const [cr, hr] = await Promise.allSettled([
    getClients(cfg, { limit: 500 }),
    getHunts(cfg,   { limit: 200 }),
  ]);
  const clients = cr.status === "fulfilled" ? cr.value.clients : [];
  const hunts   = hr.status === "fulfilled" ? hr.value.hunts   : [];

  return {
    totalClients:  clients.length,
    onlineClients: clients.filter(c => isOnline(c.last_seen_at)).length,
    totalHunts:    hunts.length,
    runningHunts:  hunts.filter(h => h.state === "RUNNING").length,
  };
}

async function createHunt(cfg, { artifact, description = "" }) {
  try {
    const body = {
      start_request: {
        hunt_description: description || artifact,
        artifacts: [artifact],
      },
    };
    const b64 = Buffer.from(`${cfg.username || ""}:${cfg.password || ""}`).toString("base64");
    const r = await httpRequest(`${cfg.url}/api/v1/CreateHunt`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${b64}`,
        "Referer": cfg.url + "/",
      },
      body,
    });
    if (r.status === 200) return { ok: true, hunt: parseJSON(r.data) };
    return { ok: false, error: `HTTP ${r.status}: ${r.data?.slice?.(0, 100)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { getClients, getHunts, getFlows, createHunt, getStats };
