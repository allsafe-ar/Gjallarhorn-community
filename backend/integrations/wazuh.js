"use strict";
const { httpRequest, parseJSON } = require("./http");

// Per-URL JWT cache (Wazuh tokens expire in 900s by default)
const tokenCache = new Map();

async function authenticate(cfg) {
  const key = cfg.url;
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expires) return cached.token;

  const b64 = Buffer.from(`${cfg.username || ""}:${cfg.password || ""}`).toString("base64");
  const r = await httpRequest(`${cfg.url}/security/user/authenticate?raw=true`, {
    method: "POST",
    headers: { "Authorization": `Basic ${b64}` },
  });
  if (r.status !== 200) throw new Error(`Auth Wazuh: HTTP ${r.status}`);

  const token = r.data.trim();
  tokenCache.set(key, { token, expires: Date.now() + 13 * 60 * 1000 }); // 13 min
  return token;
}

function authHdr(token) { return { "Authorization": `Bearer ${token}` }; }

async function getAgents(cfg, { limit = 500 } = {}) {
  try {
    const token = await authenticate(cfg);
    const r = await httpRequest(`${cfg.url}/agents?limit=${limit}&sort=-dateAdd`, {
      headers: authHdr(token),
    });
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return { ok: true, agents: data?.data?.affected_items || [], total: data?.data?.total_affected_items || 0 };
    }
    return { ok: false, agents: [], error: `HTTP ${r.status}` };
  } catch (e) {
    tokenCache.delete(cfg.url); // invalidate on error
    return { ok: false, agents: [], error: e.message };
  }
}

async function getOverview(cfg) {
  try {
    const token = await authenticate(cfg);
    const r = await httpRequest(`${cfg.url}/overview/agents`, { headers: authHdr(token) });
    if (r.status === 200) {
      const data = parseJSON(r.data);
      return { ok: true, summary: data?.data || {} };
    }
    return { ok: false, summary: {}, error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, summary: {}, error: e.message };
  }
}

// Attempts to query alerts via Wazuh Indexer (OpenSearch) on port 9200
async function getAlerts(cfg, { limit = 50, hours = 24 } = {}) {
  try {
    const managerUrl = new URL(cfg.url);
    const indexerUrl = `${managerUrl.protocol}//${managerUrl.hostname}:9200`;
    // Use dedicated indexer credentials if provided, fall back to manager credentials
    const extra = typeof cfg.extra_config === "string" ? JSON.parse(cfg.extra_config) : (cfg.extra_config || {});
    const idxUser = extra.indexer_username || cfg.username || "";
    const idxPass = extra.indexer_password || cfg.password || "";
    const b64 = Buffer.from(`${idxUser}:${idxPass}`).toString("base64");

    const body = {
      size: limit,
      sort: [{ "@timestamp": { order: "desc" } }],
      query: { range: { "@timestamp": { gte: `now-${hours}h` } } },
      _source: ["@timestamp", "rule.level", "rule.description", "agent.name", "agent.ip", "data.srcip"],
    };

    // Try wazuh-alerts-4.x-* first, then wazuh-alerts-*
    for (const index of ["wazuh-alerts-4.x-*", "wazuh-alerts-*"]) {
      try {
        const r = await httpRequest(`${indexerUrl}/${index}/_search`, {
          method: "POST",
          headers: { "Authorization": `Basic ${b64}` },
          body,
          timeout: 8000,
        });
        if (r.status === 200) {
          const data = parseJSON(r.data);
          const hits = data?.hits?.hits || [];
          return {
            ok: true,
            alerts: hits.map(h => h._source),
            total: data?.hits?.total?.value || hits.length,
            source: "indexer",
          };
        }
      } catch {}
    }
    return { ok: false, alerts: [], error: "Indexer no accesible" };
  } catch (e) {
    return { ok: false, alerts: [], error: e.message };
  }
}

async function getStats(cfg) {
  const [ov, alerts] = await Promise.allSettled([
    getOverview(cfg),
    getAlerts(cfg, { limit: 1, hours: 24 }),
  ]);

  const summary = ov.status === "fulfilled" ? ov.value.summary : {};
  // /overview/agents puts data inside agent_status.connection; /agents/summary/status puts it at root
  const connection = summary?.agent_status?.connection || summary?.connection || {};

  return {
    active:       connection.active            || 0,
    disconnected: connection.disconnected      || 0,
    pending:      connection.pending           || 0,
    never:        connection.never_connected   || 0,
    total:        connection.total             || (connection.active || 0) + (connection.disconnected || 0) + (connection.pending || 0),
    alertsLast24h: alerts.status === "fulfilled" ? (alerts.value.total || 0) : null,
  };
}

module.exports = { authenticate, getAgents, getOverview, getAlerts, getStats };
