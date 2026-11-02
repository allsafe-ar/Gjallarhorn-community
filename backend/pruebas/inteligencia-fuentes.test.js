/**
 * Noviembre 2026: fuentes de inteligencia al día (lo mismo que Gjallarhorn 1.16.0).
 * - La regla YARA de un hash usaba md5/sha1/sha256 sin `import "hash"` y no compilaba.
 * - C2-Tracker quedó archivado y da 404: C2IntelFeeds lo reemplaza; para una URL se busca el host
 *   y si no se puede leer ninguna lista es un error, no un "no encontrado".
 * - OpenPhish cambió de dirección; Feodo trae C2 fuera de línea con fechas viejas; GreyNoise
 *   benigno no es un hallazgo; ThreatFox guarda las IPs como ip:puerto.
 * Las fuentes externas se simulan: ninguna prueba sale a internet.
 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("../integrations/http");
const { generateRules } = require("../integrations/ioc-analyzer");

const EICAR_MD5 = "44d88612fea8a8f36de82e1278abb02f";
const C2_IP = "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/IPC2s-30day.csv";
const C2_DOM = "https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/feeds/domainC2s-30day-filter-abused.csv";
const OPENPHISH = "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt";
const FEODO = "https://feodotracker.abuse.ch/downloads/ipblocklist.json";

// Carga threat-intel de cero (sus listas quedan en caché del módulo) con httpRequest simulado.
function threatIntelCon(respuestas) {
  const pedidas = [];
  http.httpRequest = async (url, opts = {}) => {
    pedidas.push(url);
    const r = typeof respuestas === "function" ? respuestas(url, opts) : respuestas[url];
    if (r instanceof Error) throw r;
    return r || { status: 404, data: "" };
  };
  delete require.cache[require.resolve("../integrations/threat-intel")];
  return { ti: require("../integrations/threat-intel"), pedidas };
}
const fuente = (res, nombre) => res.find(r => r.source === nombre);
const haceDias = (n) => new Date(Date.now() - n * 86400000).toISOString().replace("T", " ").slice(0, 19);

test("la regla YARA de un hash importa el módulo hash y compara con hash.md5", () => {
  const { yara } = generateRules(EICAR_MD5, "md5", 90, "MALICIOUS", []);
  assert.match(yara, /^import "hash"/);
  assert.match(yara, new RegExp(`hash\\.md5\\(0, filesize\\) == "${EICAR_MD5}"`));
});

test("la regla YARA de sha256 usa hash.sha256", () => {
  const h = "a".repeat(64);
  const { yara } = generateRules(h, "sha256", 90, "MALICIOUS", []);
  assert.match(yara, new RegExp(`hash\\.sha256\\(0, filesize\\) == "${h}"`));
});

test("C2IntelFeeds: encuentra una IP y, para una URL, busca su host", async () => {
  const { ti, pedidas } = threatIntelCon({
    [C2_IP]: { status: 200, data: "#ip,ioc\n203.0.113.7,Possible Cobalt Strike C2 IP\n" },
    [C2_DOM]: { status: 200, data: "#domain,ioc\nmalo.example.com,Possible Sliver C2 Domain\n" },
  });
  const ip = fuente(await ti.queryAll("203.0.113.7", "ipv4", {}), "C2 Trackers");
  assert.equal(ip.found, true);
  assert.equal(ip.score_contribution, 65);
  assert.match(ip.description, /Cobalt Strike/);
  const url = fuente(await ti.queryAll("https://Malo.example.com/login?x=1", "url", {}), "C2 Trackers");
  assert.equal(url.found, true);
  assert.match(url.description, /Sliver/);
  assert.ok(!pedidas.some(u => u.includes("montysecurity")), "no consulta el C2-Tracker archivado");
});

test("C2IntelFeeds: sin ninguna lista leída da error, no 'no encontrado'", async () => {
  const { ti } = threatIntelCon({});
  const r = fuente(await ti.queryAll("203.0.113.7", "ipv4", {}), "C2 Trackers");
  assert.ok(r.error);
  assert.notEqual(r.found, false);
});

test("OpenPhish se lee de la dirección nueva", async () => {
  const { ti, pedidas } = threatIntelCon({ [OPENPHISH]: { status: 200, data: "https://phish.example.net/a\n" } });
  const r = fuente(await ti.queryAll("https://phish.example.net/a", "url", {}), "OpenPhish");
  assert.equal(r.found, true);
  assert.ok(pedidas.includes(OPENPHISH));
  assert.ok(!pedidas.includes("https://openphish.com/feed.txt"));
});

test("Feodo: online suma 70, offline reciente 25, offline viejo no suma pero queda listado", async () => {
  const lista = [
    { ip_address: "198.51.100.1", status: "online", malware: "QakBot", last_online: haceDias(0) },
    { ip_address: "198.51.100.2", status: "offline", malware: "Emotet", last_online: haceDias(10) },
    { ip_address: "198.51.100.3", status: "offline", malware: "Dridex", last_online: haceDias(200) },
  ];
  const { ti } = threatIntelCon({ [FEODO]: { status: 200, data: JSON.stringify(lista) } });
  const de = async (ip) => fuente(await ti.queryAll(ip, "ipv4", {}), "FeodoTracker");
  const online = await de("198.51.100.1");
  assert.deepEqual([online.found, online.listed, online.score_contribution], [true, true, 70]);
  const reciente = await de("198.51.100.2");
  assert.deepEqual([reciente.found, reciente.listed, reciente.score_contribution], [true, true, 25]);
  const viejo = await de("198.51.100.3");
  assert.deepEqual([viejo.found, viejo.listed, viejo.score_contribution], [false, true, 0]);
  assert.ok(viejo.last_online);
  const ausente = await de("198.51.100.9");
  assert.deepEqual([ausente.found, ausente.listed, ausente.score_contribution], [false, false, 0]);
});

test("GreyNoise benigno no cuenta como hallazgo", async () => {
  const { ti } = threatIntelCon((url) => url.includes("greynoise")
    ? { status: 200, data: JSON.stringify({ noise: true, riot: false, classification: "benign" }) } : null);
  const r = fuente(await ti.queryAll("192.0.2.10", "ipv4", { greynoise: "k" }), "GreyNoise");
  assert.equal(r.found, false);
  assert.equal(r.score_contribution, 0);
  assert.equal(r.classification, "benign");
});

test("ThreatFox encuentra una IP guardada como ip:puerto, sin aceptar otra IP que la contenga", async () => {
  const datos = { query_status: "ok", data: [
    { ioc: "192.0.2.55:8443", ioc_type: "ip:port", malware_printable: "AsyncRAT", threat_type: "botnet_cc", confidence_level: 100 },
  ] };
  const { ti } = threatIntelCon((url) => url.includes("threatfox") ? { status: 200, data: JSON.stringify(datos) } : null);
  const r = fuente(await ti.queryAll("192.0.2.55", "ipv4", { threatfox: "k" }), "ThreatFox");
  assert.equal(r.found, true);
  assert.equal(r.score_contribution, 55);
  const otra = fuente(await ti.queryAll("192.0.2.5", "ipv4", { threatfox: "k" }), "ThreatFox");
  assert.equal(otra.found, false);
});
