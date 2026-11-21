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
      // La pantalla muestra a cuántos equipos llegó: el dato viene dentro de stats.
      return { ok: true, hunts: (data?.items || []).map((h) => ({ ...h, total_clients_scheduled: h.stats?.total_clients_scheduled ?? h.total_clients_scheduled ?? 0 })) };
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

// ⚠️ Velociraptor exige un token CSRF en todo pedido que escribe (gorilla/csrf): sin él responde 403
// "Forbidden - CSRF token not found". El token y su cookie vienen en la respuesta de cualquier GET autenticado.
// Antes el adaptador no lo mandaba y el "Nuevo hunt" fallaba. Verificado contra 0.76.1 (21/11/2026).
const opciones = (cfg, extra = {}) => ({ ...extra, verifySsl: cfg.verify_ssl === 1 || cfg.verify_ssl === true, headers: { ...authHdr(cfg), ...(extra.headers || {}) } });

async function escribir(cfg, ruta, body) {
  const g = await httpRequest(`${cfg.url}/api/v1/GetUserUITraits`, opciones(cfg));
  if (g.status !== 200) return { status: g.status, data: g.data };
  const token = g.headers?.["x-csrf-token"];
  const cookie = [].concat(g.headers?.["set-cookie"] || []).map((c) => String(c).split(";")[0]).join("; ");
  if (!token) return { status: 0, data: "Velociraptor no entregó el token CSRF" };
  return httpRequest(`${cfg.url}/api/v1/${ruta}`, opciones(cfg, {
    method: "POST",
    headers: { "X-CSRF-Token": token, Cookie: cookie, Referer: cfg.url + "/app/index.html" },
    body,
  }));
}

const ARTEFACTO = /^[A-Za-z0-9_.]{3,120}$/;
const SISTEMAS = ["WINDOWS", "LINUX", "OSX"];
const ESTADOS = ["RUNNING", "PAUSED", "STOPPED"];

/**
 * Crea un hunt. Antes solo se mandaban el artefacto y la descripción (y la descripción iba dentro de start_request,
 * donde Velociraptor no la lee), así que quedaba con sus valores por defecto: en pausa, sobre todos los equipos y
 * con vencimiento a la semana. Ahora quien lo crea decide si arranca, a qué equipos apunta y cuánto dura.
 *   iniciar   true = arranca ya (RUNNING); false = queda como borrador (PAUSED) para revisarlo antes
 *   sistema   WINDOWS | LINUX | OSX (opcional)              } uno u otro, o ninguno = todos los equipos
 *   etiquetas solo los equipos con alguna de estas etiquetas } (Velociraptor no admite los dos juntos)
 *   dias      1 a 30 (por defecto 7)
 */
async function createHunt(cfg, { artifact, description = "", iniciar = false, sistema = "", etiquetas = [], dias = 7 } = {}) {
  if (!ARTEFACTO.test(String(artifact || ""))) return { ok: false, error: "Artefacto inválido (ej.: Windows.EventLogs.Hayabusa)" };
  if (sistema && !SISTEMAS.includes(sistema)) return { ok: false, error: "Sistema inválido" };
  const labels = [].concat(etiquetas || []).map((e) => String(e).trim()).filter((e) => /^[\w .:-]{1,64}$/.test(e)).slice(0, 10);
  const d = Math.min(30, Math.max(1, Number(dias) || 7));
  const body = {
    hunt_description: String(description || artifact).slice(0, 300),
    start_request: { artifacts: [artifact] },
    state: iniciar ? "RUNNING" : "PAUSED",
    expires: String((Date.now() + d * 86400000) * 1000),
  };
  // El destino es UNO: Velociraptor guarda la condición como oneof (etiquetas o sistema operativo, no los dos).
  if (labels.length && sistema) return { ok: false, error: "Elegí sistema operativo o etiquetas, no los dos" };
  if (labels.length) body.condition = { labels: { label: labels } };
  else if (sistema) body.condition = { os: { os: sistema } };
  try {
    const r = await escribir(cfg, "CreateHunt", body);
    if (r.status === 200) { const x = parseJSON(r.data); return { ok: true, huntId: x?.flow_id || x?.hunt_id || null, estado: body.state }; }
    return { ok: false, error: `HTTP ${r.status}: ${String(r.data || "").slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Arranca, pausa o detiene un hunt existente. */
async function setHuntState(cfg, huntId, estado) {
  if (!/^H\.[A-Z0-9]{6,30}$/.test(String(huntId || ""))) return { ok: false, error: "Hunt inválido" };
  if (!ESTADOS.includes(estado)) return { ok: false, error: "Estado inválido" };
  try {
    const r = await escribir(cfg, "ModifyHunt", { hunt_id: huntId, state: estado });
    return r.status === 200 ? { ok: true } : { ok: false, error: `HTTP ${r.status}: ${String(r.data || "").slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Recolecta un artefacto en UN equipo (no un hunt). Es lo que se usa para correr, por ejemplo, Hayabusa en un host. */
async function collectOnClient(cfg, clientId, artifact) {
  if (!/^C\.[0-9a-f]{8,32}$/.test(String(clientId || ""))) return { ok: false, error: "Equipo inválido" };
  if (!ARTEFACTO.test(String(artifact || ""))) return { ok: false, error: "Artefacto inválido" };
  try {
    const r = await escribir(cfg, "CollectArtifact", { client_id: clientId, artifacts: [artifact] });
    if (r.status === 200) { const x = parseJSON(r.data); return { ok: true, flowId: x?.flow_id || null }; }
    return { ok: false, error: `HTTP ${r.status}: ${String(r.data || "").slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Resultado de una recolección: la tabla de un artefacto en un flow de un equipo.
 * Velociraptor la entrega como { columns, rows: [{ cell: [...] }] }. Se pide de a tandas hasta `max` filas.
 */
async function getFlowTable(cfg, clientId, flowId, artifact, { max = 20000 } = {}) {
  if (!/^C\.[0-9a-f]{8,32}$/.test(String(clientId || "")) || !/^F\.[A-Z0-9]{6,30}(\.H)?$/.test(String(flowId || ""))) return { ok: false, error: "Equipo o recolección inválidos" };
  const columnas = []; const filas = [];
  try {
    for (let desde = 0; desde < max; desde += 1000) {
      const q = new URLSearchParams({ client_id: clientId, flow_id: flowId, artifact, type: "CLIENT", start_row: String(desde), rows: "1000" });
      const r = await httpRequest(`${cfg.url}/api/v1/GetTable?${q}`, { ...opciones(cfg), timeout: 30000 });
      if (r.status !== 200) return { ok: false, error: `HTTP ${r.status}: ${String(r.data || "").slice(0, 120)}` };
      const d = parseJSON(r.data) || {};
      if (!columnas.length && Array.isArray(d.columns)) columnas.push(...d.columns);
      const tanda = d.rows || [];
      filas.push(...tanda);
      if (tanda.length < 1000) break;
    }
    return { ok: true, tabla: { columns: columnas, rows: filas.slice(0, max) } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { getClients, getHunts, getFlows, getFlowTable, createHunt, setHuntState, collectOnClient, getStats };
