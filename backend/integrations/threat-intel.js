"use strict";
const { httpRequest, parseJSON } = require("./http");

// ── C2 Framework banner signatures ────────────────────────────────────────────
const C2_SIGNATURES = [
  { name: "Cobalt Strike",  patterns: ["X-Malware-Family", "CobaltStrike", "CS Beacon", "beacon.dll"] },
  { name: "Metasploit",     patterns: ["Metasploit", "meterpreter", "x64/windows/meterpreter"] },
  { name: "Empire",         patterns: ["EmPyre", "PowerShell Empire", "PowerSploit"] },
  { name: "Covenant",       patterns: ["Covenant", "GruntHTTP", "GruntSMB"] },
  { name: "PoshC2",         patterns: ["PoshC2", "Py2ExeServicer"] },
  { name: "Sliver",         patterns: ["sliver-implant", "Sliver C2"] },
  { name: "Havoc",          patterns: ["Havoc/Implant", "Demon Implant"] },
  { name: "Brute Ratel",    patterns: ["Brute Ratel", "Badger/"] },
  { name: "Mythic",         patterns: ["mythic_", "poseidon_"] },
  { name: "Nighthawk",      patterns: ["Nighthawk"] },
];

function detectC2InBanners(banners = []) {
  for (const banner of banners) {
    for (const sig of C2_SIGNATURES) {
      for (const pat of sig.patterns) {
        if (banner.includes(pat)) return { detected: true, framework: sig.name };
      }
    }
  }
  return { detected: false };
}

// ── VirusTotal ────────────────────────────────────────────────────────────────
async function queryVirusTotal(ioc, iocType, apiKey) {
  if (!apiKey) return { source: "VirusTotal", skipped: true };
  try {
    const paths = { ipv4: `/api/v3/ip_addresses/${ioc}`, ipv6: `/api/v3/ip_addresses/${ioc}`, domain: `/api/v3/domains/${ioc}`, md5: `/api/v3/files/${ioc}`, sha1: `/api/v3/files/${ioc}`, sha256: `/api/v3/files/${ioc}` };
    let path = paths[iocType];
    if (!path && iocType === "url") {
      const b64 = Buffer.from(ioc).toString("base64url").replace(/=+$/, "");
      path = `/api/v3/urls/${b64}`;
    }
    if (!path) return { source: "VirusTotal", skipped: true };

    const r = await httpRequest(`https://www.virustotal.com${path}`, { headers: { "x-apikey": apiKey }, timeout: 15000 });
    if (r.status === 404) return { source: "VirusTotal", found: false, not_found: true, score_contribution: 0 };
    if (r.status !== 200) return { source: "VirusTotal", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    const stats = d?.data?.attributes?.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    const scoreContrib = total > 0 ? Math.round(((malicious + suspicious * 0.5) / total) * 50) : 0;
    return { source: "VirusTotal", found: malicious > 0, malicious, suspicious, total, score_contribution: scoreContrib };
  } catch (e) {
    return { source: "VirusTotal", skipped: false, error: e.message };
  }
}

// ── AbuseIPDB ─────────────────────────────────────────────────────────────────
async function queryAbuseIPDB(ip, apiKey) {
  if (!apiKey) return { source: "AbuseIPDB", skipped: true };
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return { source: "AbuseIPDB", skipped: true };
  try {
    const r = await httpRequest(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, {
      headers: { "Key": apiKey, "Accept": "application/json" }, timeout: 12000,
    });
    if (r.status !== 200) return { source: "AbuseIPDB", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data)?.data || {};
    const confidence = d.abuseConfidenceScore || 0;
    return { source: "AbuseIPDB", found: confidence >= 25, confidence_score: confidence, total_reports: d.totalReports || 0, country: d.countryCode, isp: d.isp, score_contribution: Math.round(confidence / 2) };
  } catch (e) {
    return { source: "AbuseIPDB", skipped: false, error: e.message };
  }
}

// ── Shodan ────────────────────────────────────────────────────────────────────
async function queryShodan(ip, apiKey) {
  if (!apiKey) return { source: "Shodan", skipped: true };
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return { source: "Shodan", skipped: true };
  try {
    const r = await httpRequest(`https://api.shodan.io/shodan/host/${ip}?key=${apiKey}`, { timeout: 15000 });
    if (r.status === 403 || r.status === 404) return { source: "Shodan", found: false, score_contribution: 0 };
    if (r.status !== 200) return { source: "Shodan", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    const banners = (d?.data || []).map(s => `${s.banner || ""} ${s.http?.title || ""} ${JSON.stringify(s.http?.components || {})} ${JSON.stringify(s.opts || {})}`);
    const c2 = detectC2InBanners(banners);
    const ports = (d?.ports || []).slice(0, 20);
    const vulns = Object.keys(d?.vulns || {}).slice(0, 10);
    return { source: "Shodan", found: c2.detected || vulns.length > 0, ports, vulns, c2_detected: c2.detected, c2_framework: c2.framework, org: d?.org, country: d?.country_code, score_contribution: c2.detected ? 70 : vulns.length >= 3 ? 20 : 0 };
  } catch (e) {
    return { source: "Shodan", skipped: false, error: e.message };
  }
}

// ── AlienVault OTX ────────────────────────────────────────────────────────────
async function queryOTX(ioc, iocType, apiKey) {
  if (!apiKey) return { source: "AlienVault OTX", skipped: true };
  const typeMap = { ipv4: "IPv4", ipv6: "IPv6", domain: "domain", md5: "file", sha1: "file", sha256: "file", url: "url" };
  const otxType = typeMap[iocType];
  if (!otxType) return { source: "AlienVault OTX", skipped: true };
  try {
    const r = await httpRequest(`https://otx.alienvault.com/api/v1/indicators/${otxType}/${encodeURIComponent(ioc)}/general`, {
      headers: { "X-OTX-API-KEY": apiKey }, timeout: 15000,
    });
    if (r.status !== 200) return { source: "AlienVault OTX", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    const pulses = d?.pulse_info?.count || 0;
    return { source: "AlienVault OTX", found: pulses > 0, pulse_count: pulses, threat_score: d?.threat_score, score_contribution: pulses >= 10 ? 40 : pulses >= 5 ? 30 : pulses >= 1 ? 15 : 0 };
  } catch (e) {
    return { source: "AlienVault OTX", skipped: false, error: e.message };
  }
}

// ── GreyNoise ─────────────────────────────────────────────────────────────────
async function queryGreyNoise(ip, apiKey) {
  if (!apiKey) return { source: "GreyNoise", skipped: true };
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return { source: "GreyNoise", skipped: true };
  try {
    const r = await httpRequest(`https://api.greynoise.io/v3/community/${ip}`, { headers: { "key": apiKey }, timeout: 12000 });
    if (r.status === 404) return { source: "GreyNoise", found: false, classification: "not_seen", score_contribution: 0 };
    if (r.status !== 200) return { source: "GreyNoise", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    return { source: "GreyNoise", found: d?.noise === true, classification: d?.classification || "unknown", noise: d?.noise, riot: d?.riot, score_contribution: d?.classification === "malicious" ? 40 : 0 };
  } catch (e) {
    return { source: "GreyNoise", skipped: false, error: e.message };
  }
}

// ── URLScan.io ────────────────────────────────────────────────────────────────
async function queryURLScan(ioc, iocType, apiKey) {
  if (!apiKey) return { source: "URLScan.io", skipped: true };
  if (iocType !== "url" && iocType !== "domain") return { source: "URLScan.io", skipped: true };
  try {
    const scanUrl = iocType === "domain" ? `https://${ioc}` : ioc;
    const r = await httpRequest("https://urlscan.io/api/v1/scan/", {
      method: "POST", headers: { "API-Key": apiKey }, body: { url: scanUrl, visibility: "private" }, timeout: 15000,
    });
    if (r.status !== 200) return { source: "URLScan.io", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    return { source: "URLScan.io", found: false, scan_uuid: d?.uuid, result_url: d?.result, status: "submitted", score_contribution: 0 };
  } catch (e) {
    return { source: "URLScan.io", skipped: false, error: e.message };
  }
}

// ── Criminal IP ───────────────────────────────────────────────────────────────
async function queryCriminalIP(ip, apiKey) {
  if (!apiKey) return { source: "Criminal IP", skipped: true };
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return { source: "Criminal IP", skipped: true };
  try {
    const r = await httpRequest(`https://api.criminalip.io/v1/feature/ip/summary?ip=${ip}`, { headers: { "x-api-key": apiKey }, timeout: 12000 });
    if (r.status !== 200) return { source: "Criminal IP", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    const score = d?.score?.inbound || d?.crime_score || 0;
    return { source: "Criminal IP", found: score >= 40, score, categories: (d?.tags || []).slice(0, 5).map(t => t?.name || t).join(", "), score_contribution: score >= 80 ? 40 : score >= 50 ? 25 : 0 };
  } catch (e) {
    return { source: "Criminal IP", skipped: false, error: e.message };
  }
}

// ── IPQualityScore ────────────────────────────────────────────────────────────
async function queryIPQualityScore(ip, apiKey) {
  if (!apiKey) return { source: "IPQualityScore", skipped: true };
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return { source: "IPQualityScore", skipped: true };
  try {
    const r = await httpRequest(`https://www.ipqualityscore.com/api/json/ip/${apiKey}/${ip}`, { timeout: 12000 });
    if (r.status !== 200) return { source: "IPQualityScore", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    const fraudScore = d?.fraud_score || 0;
    return { source: "IPQualityScore", found: fraudScore >= 75, fraud_score: fraudScore, proxy: d?.proxy, vpn: d?.vpn, tor: d?.tor, score_contribution: fraudScore >= 90 ? 40 : fraudScore >= 75 ? 25 : 0 };
  } catch (e) {
    return { source: "IPQualityScore", skipped: false, error: e.message };
  }
}

// ── Abuse.ch URLhaus ──────────────────────────────────────────────────────────
// Auth-Key header required since 2025 — same key used for all abuse.ch APIs
async function queryURLhaus(ioc, iocType, authKey = "") {
  if (!["url", "md5", "sha256"].includes(iocType)) return { source: "URLhaus", skipped: true };
  if (!authKey) return { source: "URLhaus", skipped: true };
  try {
    let endpoint, bodyStr;
    if (iocType === "url") { endpoint = "https://urlhaus-api.abuse.ch/v1/url/"; bodyStr = `url=${encodeURIComponent(ioc)}`; }
    else { endpoint = "https://urlhaus-api.abuse.ch/v1/payload_hash/"; bodyStr = iocType === "md5" ? `md5_hash=${ioc}` : `sha256_hash=${ioc}`; }

    const r = await httpRequest(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Auth-Key": authKey },
      body: bodyStr,
      timeout: 15000,
    });
    if (r.status === 404) return { source: "URLhaus", found: false, score_contribution: 0 };
    if (r.status !== 200) return { source: "URLhaus", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    const found = d?.query_status === "is_listed" || d?.query_status === "ok";
    return { source: "URLhaus", found, status: d?.query_status, threat: d?.threat, tags: d?.tags?.slice(0, 5), score_contribution: found ? 60 : 0 };
  } catch (e) {
    return { source: "URLhaus", skipped: false, error: e.message };
  }
}

// ── Abuse.ch MalwareBazaar ────────────────────────────────────────────────────
async function queryMalwareBazaar(hash, authKey = "") {
  if (!authKey) return { source: "MalwareBazaar", skipped: true };
  try {
    const r = await httpRequest("https://mb-api.abuse.ch/api/v1/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Auth-Key": authKey },
      body: `query=get_info&hash=${hash}`,
      timeout: 15000,
    });
    if (r.status !== 200) return { source: "MalwareBazaar", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    const found = d?.query_status === "ok";
    const info = found ? (d?.data?.[0] || {}) : {};
    return { source: "MalwareBazaar", found, malware_name: info.signature, tags: (info.tags || []).slice(0, 5), file_type: info.file_type, first_seen: info.first_seen, score_contribution: found ? 70 : 0 };
  } catch (e) {
    return { source: "MalwareBazaar", skipped: false, error: e.message };
  }
}

// ── Abuse.ch ThreatFox ────────────────────────────────────────────────────────
async function queryThreatFox(ioc, authKey = "") {
  if (!authKey) return { source: "ThreatFox", skipped: true };
  try {
    const r = await httpRequest("https://threatfox-api.abuse.ch/api/v1/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Auth-Key": authKey },
      body: { query: "search_ioc", search_term: ioc },
      timeout: 15000,
    });
    if (r.status !== 200) return { source: "ThreatFox", skipped: false, error: `HTTP ${r.status}` };
    const d = parseJSON(r.data);
    // Filter to exact matches only — ThreatFox does substring search internally
    const exactMatches = Array.isArray(d?.data)
      ? d.data.filter(item => item?.ioc?.toLowerCase() === ioc.toLowerCase())
      : [];
    const found = d?.query_status === "ok" && exactMatches.length > 0;
    const first = found ? exactMatches[0] : {};
    return { source: "ThreatFox", found, ioc_type: first?.ioc_type, malware_printable: first?.malware_printable, threat_type: first?.threat_type, confidence: first?.confidence_level, score_contribution: found ? 55 : 0 };
  } catch (e) {
    return { source: "ThreatFox", skipped: false, error: e.message };
  }
}

// ── Abuse.ch FeodoTracker (C2 botnet IPs — cached 1h) ────────────────────────
let feodoCache = null, feodoCacheTs = 0;
async function queryFeodoTracker(ip) {
  try {
    if (!feodoCache || Date.now() - feodoCacheTs > 3600000) {
      const r = await httpRequest("https://feodotracker.abuse.ch/downloads/ipblocklist.json", { timeout: 20000 });
      if (r.status === 200) { feodoCache = parseJSON(r.data) || []; feodoCacheTs = Date.now(); }
    }
    if (!feodoCache) return { source: "FeodoTracker", skipped: false, error: "No data" };
    const entry = feodoCache.find(e => e.ip_address === ip);
    return { source: "FeodoTracker", found: !!entry, malware: entry?.malware, status: entry?.status, score_contribution: entry ? 70 : 0 };
  } catch (e) {
    return { source: "FeodoTracker", skipped: false, error: e.message };
  }
}

// ── Tor Exit Nodes (cached 1h) ────────────────────────────────────────────────
let torCache = null, torCacheTs = 0;
async function queryTorExitNodes(ip) {
  try {
    if (!torCache || Date.now() - torCacheTs > 3600000) {
      const r = await httpRequest("https://check.torproject.org/exit-addresses", { timeout: 20000 });
      if (r.status === 200) {
        const matches = r.data.match(/ExitAddress (\d+\.\d+\.\d+\.\d+)/g) || [];
        torCache = new Set(matches.map(m => m.split(" ")[1]));
        torCacheTs = Date.now();
      }
    }
    if (!torCache) return { source: "Tor Exit Nodes", skipped: false, error: "No data" };
    const found = torCache.has(ip);
    return { source: "Tor Exit Nodes", found, score_contribution: found ? 20 : 0 };
  } catch (e) {
    return { source: "Tor Exit Nodes", skipped: false, error: e.message };
  }
}

// ── OpenPhish (phishing URLs — cached 1h) ────────────────────────────────────
let openPhishCache = null, openPhishCacheTs = 0;
async function queryOpenPhish(url) {
  try {
    if (!openPhishCache || Date.now() - openPhishCacheTs > 3600000) {
      const r = await httpRequest("https://openphish.com/feed.txt", { timeout: 15000 });
      if (r.status === 200) { openPhishCache = new Set(r.data.split("\n").map(l => l.trim()).filter(Boolean)); openPhishCacheTs = Date.now(); }
    }
    if (!openPhishCache) return { source: "OpenPhish", skipped: false, error: "No data" };
    const found = openPhishCache.has(url);
    return { source: "OpenPhish", found, score_contribution: found ? 60 : 0 };
  } catch (e) {
    return { source: "OpenPhish", skipped: false, error: e.message };
  }
}

// ── C2 Tracker feeds (GitHub, IPs — cached 1h) ───────────────────────────────
const C2_FEED_URLS = [
  "https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Cobalt%20Strike%20C2%20IPs.txt",
  "https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Metasploit%20Framework%20C2%20IPs.txt",
  "https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Sliver%20C2%20IPs.txt",
  "https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Havoc%20C2%20IPs.txt",
  "https://raw.githubusercontent.com/montysecurity/C2-Tracker/main/data/Brute%20Ratel%20C2%20IPs.txt",
];
let c2Cache = null, c2CacheTs = 0;
async function queryC2Trackers(ioc) {
  try {
    if (!c2Cache || Date.now() - c2CacheTs > 3600000) {
      const results = await Promise.allSettled(C2_FEED_URLS.map(u => httpRequest(u, { timeout: 15000 })));
      const all = new Set();
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.status === 200) {
          r.value.data.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#")).forEach(i => all.add(i));
        }
      }
      c2Cache = all; c2CacheTs = Date.now();
    }
    if (!c2Cache) return { source: "C2 Trackers", skipped: false, error: "No data" };
    const found = c2Cache.has(ioc);
    return { source: "C2 Trackers", found, score_contribution: found ? 65 : 0 };
  } catch (e) {
    return { source: "C2 Trackers", skipped: false, error: e.message };
  }
}

// ── Domain Age via RDAP ───────────────────────────────────────────────────────
async function getDomainAge(domain) {
  try {
    const r = await httpRequest(`https://rdap.org/domain/${domain}`, { timeout: 10000 });
    if (r.status !== 200) return null;
    const d = parseJSON(r.data);
    const registered = d?.events?.find(e => e.eventAction === "registration")?.eventDate;
    if (!registered) return null;
    const ageDays = Math.floor((Date.now() - new Date(registered).getTime()) / 86400000);
    return { registered, ageDays };
  } catch {
    return null;
  }
}

// ── Main query dispatcher ─────────────────────────────────────────────────────
async function queryAll(ioc, iocType, apiKeys = {}) {
  const tasks = [];

  // All types
  if (["ipv4", "ipv6", "domain", "md5", "sha1", "sha256", "url"].includes(iocType)) {
    tasks.push(queryVirusTotal(ioc, iocType, apiKeys.virustotal));
    tasks.push(queryOTX(ioc, iocType, apiKeys.alienvault));
    tasks.push(queryThreatFox(ioc, apiKeys.threatfox));
  }

  // IP-specific
  if (iocType === "ipv4") {
    tasks.push(queryAbuseIPDB(ioc, apiKeys.abuseipdb));
    tasks.push(queryShodan(ioc, apiKeys.shodan));
    tasks.push(queryGreyNoise(ioc, apiKeys.greynoise));
    tasks.push(queryCriminalIP(ioc, apiKeys.criminalip));
    tasks.push(queryIPQualityScore(ioc, apiKeys.ipqualityscore));
    tasks.push(queryFeodoTracker(ioc));
    tasks.push(queryTorExitNodes(ioc));
    tasks.push(queryC2Trackers(ioc));
  }

  // URL-specific
  if (iocType === "url") {
    tasks.push(queryURLhaus(ioc, iocType, apiKeys.threatfox));
    tasks.push(queryURLScan(ioc, iocType, apiKeys.urlscan));
    tasks.push(queryOpenPhish(ioc));
    tasks.push(queryC2Trackers(ioc));
  }

  // Domain-specific
  if (iocType === "domain") {
    tasks.push(queryC2Trackers(ioc));
  }

  // Hash-specific
  if (["md5", "sha1", "sha256"].includes(iocType)) {
    tasks.push(queryMalwareBazaar(ioc, apiKeys.threatfox));
    tasks.push(queryURLhaus(ioc, iocType, apiKeys.threatfox));
  }

  const settled = await Promise.allSettled(tasks);
  return settled.map(r => r.status === "fulfilled" ? r.value : { source: "unknown", error: r.reason?.message || "Error" });
}

module.exports = { queryAll, getDomainAge, detectC2InBanners };
