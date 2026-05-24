"use strict";
const crypto = require("crypto");

// ── IOC Type Detection ────────────────────────────────────────────────────────
const RE_MD5    = /^[0-9a-fA-F]{32}$/;
const RE_SHA1   = /^[0-9a-fA-F]{40}$/;
const RE_SHA256 = /^[0-9a-fA-F]{64}$/;
const RE_CVE    = /^CVE-\d{4}-\d{4,}/i;
const RE_EMAIL  = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RE_URL    = /^https?:\/\//i;
const RE_IPV4   = /^(\d{1,3}\.){3}\d{1,3}$/;
const RE_IPV6   = /^[0-9a-fA-F:]{3,39}$/;
const RE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function detectType(ioc) {
  const v = String(ioc || "").trim();
  if (RE_MD5.test(v))    return "md5";
  if (RE_SHA1.test(v))   return "sha1";
  if (RE_SHA256.test(v)) return "sha256";
  if (RE_CVE.test(v))    return "cve";
  if (RE_EMAIL.test(v))  return "email";
  if (RE_URL.test(v))    return "url";
  if (RE_IPV4.test(v))   return "ipv4";
  if (RE_IPV6.test(v) && v.includes(":")) return "ipv6";
  if (RE_DOMAIN.test(v)) return "domain";
  return "unknown";
}

// ── DGA Detection (7 heuristics) ─────────────────────────────────────────────
// Patterns must be SPECIFIC — avoid broad ones that match legit domains (e.g. google.com)
const KNOWN_DGA_PATTERNS = [
  // GameOverZeus: 18+ random alphanumeric chars
  { name: "GameOverZeus", re: /^[a-z0-9]{18,}\.(com|net|biz)$/ },
  // Qakbot: lowercase letters + 2-4 trailing digits
  { name: "Qakbot",       re: /^[a-z]{4,8}[0-9]{2,4}\.(com|net|org)$/ },
  // Suppobox/Murofet: very long all-consonant label (14+ chars, no vowels)
  { name: "Suppobox",     re: /^[bcdfghjklmnpqrstvwxyz]{14,}\.(com|net|org|ru)$/ },
];

const RARE_BIGRAMS = new Set("bk bz cq cx dx fv gj gq gx hx jb jc jd jf jg jh jk jl jm jn jp jq jr js jt jv jw jx jy jz kq kx kz mx px qb qc qd qe qf qg qh qi qj qk ql qm qn qo qp qq qr qs qt qv qw qx qy qz sx vb vc vd vf vg vh vj vk vl vm vn vp vq vr vs vt vw vx vy vz wx xb xc xd xf xg xh xj xk xl xm xn xo xp xq xr xs xt xv xw xx xy xz yb yc yd yf yg yh yj yk yl ym yn yp yq yr ys yt yv yw yx yy yz zb zc zd zf zg zh zj zk zl zm zn zo zp zq zr zs zt zv zw zx zy zz".split(" "));

function shannonEntropy(s) {
  const freq = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  return -Object.values(freq).reduce((sum, f) => { const p = f / s.length; return sum + p * Math.log2(p); }, 0);
}

function detectDGA(domain) {
  const label = domain.split(".")[0].toLowerCase();
  const reasons = [];
  let score = 0;

  // 1. Shannon entropy
  const entropy = shannonEntropy(label);
  if (entropy >= 3.5) { score += 25; reasons.push(`Alta entropía (${entropy.toFixed(2)})`); }

  // 2. Consonant/vowel ratio
  const vowels = (label.match(/[aeiou]/g) || []).length;
  const consonants = (label.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
  if (vowels === 0) { score += 20; reasons.push("Sin vocales"); }
  else if (consonants / vowels > 3) { score += 15; reasons.push(`Ratio consonante/vocal alto (${consonants}/${vowels})`); }

  // 3. Digit ratio
  const digits = (label.match(/[0-9]/g) || []).length;
  if (label.length > 0 && digits / label.length >= 0.15) { score += 15; reasons.push(`Alto ratio de dígitos (${Math.round(digits/label.length*100)}%)`); }

  // 4. Label length
  if (label.length >= 20) { score += 20; reasons.push(`Label largo (${label.length} chars)`); }

  // 5. Rare bigrams
  let rareBigramCount = 0;
  for (let i = 0; i < label.length - 1; i++) {
    if (RARE_BIGRAMS.has(label.slice(i, i + 2))) rareBigramCount++;
  }
  if (rareBigramCount >= 2) { score += 15; reasons.push(`Bigramas raros (${rareBigramCount})`); }

  // 6. No TLD-to-label length ratio (very long sub + short tld)
  const parts = domain.split(".");
  if (parts.length === 2 && label.length > 12 && parts[1].length <= 3) { score += 10; reasons.push("Estructura dominio sospechosa"); }

  // 7. Known DGA families (add points — do not force score, require other indicators too)
  let family = null;
  for (const dga of KNOWN_DGA_PATTERNS) {
    if (dga.re.test(domain)) { family = dga.name; score += 30; reasons.push(`Coincide patrón DGA ${dga.name}`); break; }
  }

  return { isDGA: score >= 40, score: Math.min(score, 100), reasons, family };
}

// ── Score Calculation ─────────────────────────────────────────────────────────
function calculateScore(findings, extras = {}) {
  let score = 0;
  const breakdown = [];

  for (const f of findings) {
    const contrib = f.score_contribution || 0;
    if (contrib > 0) { score += contrib; breakdown.push({ source: f.source, contribution: contrib, detail: f.found ? "found" : "flagged" }); }
  }

  if (extras.dgaScore >= 40) { const c = Math.round(extras.dgaScore * 0.3); score += c; breakdown.push({ source: "DGA Detection", contribution: c, detail: `score ${extras.dgaScore}` }); }
  if (extras.domainAgeDays != null) {
    const c = extras.domainAgeDays <= 7 ? 25 : extras.domainAgeDays <= 30 ? 15 : extras.domainAgeDays <= 90 ? 8 : 0;
    if (c) { score += c; breakdown.push({ source: "Domain Age", contribution: c, detail: `${extras.domainAgeDays}d old` }); }
  }

  score = Math.min(score, 100);
  // UNKNOWN only when no API responded successfully (can't assess); score=0 with responses → CLEAN
  const hasResponses = findings.some(f => !f.skipped && !f.error);
  const verdict = score >= 70 ? "MALICIOUS" : score >= 40 ? "SUSPICIOUS" : (score > 0 || hasResponses) ? "CLEAN" : "UNKNOWN";
  return { score, verdict, breakdown };
}

// ── Detection Rules ───────────────────────────────────────────────────────────
function generateRules(ioc, iocType, verdict) {
  return {
    kql:   buildKQL(ioc, iocType),
    spl:   buildSPL(ioc, iocType),
    sigma: buildSIGMA(ioc, iocType, verdict),
    yara:  ["md5","sha1","sha256"].includes(iocType) ? buildYARA(ioc, iocType) : null,
  };
}

function buildKQL(ioc, iocType) {
  if (iocType === "ipv4" || iocType === "ipv6") return `// Microsoft Sentinel / Defender — KQL
union DeviceNetworkEvents, DeviceEvents
| where RemoteIP == "${ioc}" or LocalIP == "${ioc}"
| project TimeGenerated, DeviceName, ActionType, RemoteIP, LocalIP, RemotePort, InitiatingProcessFileName
| order by TimeGenerated desc`;

  if (iocType === "domain") return `// Microsoft Sentinel / Defender — KQL
union DeviceNetworkEvents, DnsEvents
| where RemoteUrl contains "${ioc}" or Name contains "${ioc}" or QueryName contains "${ioc}"
| project TimeGenerated, DeviceName, ActionType, RemoteUrl, Name, QueryName
| order by TimeGenerated desc`;

  if (iocType === "url") return `// Microsoft Sentinel / Defender — KQL
DeviceNetworkEvents
| where RemoteUrl contains "${ioc}"
| project TimeGenerated, DeviceName, ActionType, RemoteUrl, RemoteIP, InitiatingProcessFileName
| order by TimeGenerated desc`;

  if (["md5","sha1","sha256"].includes(iocType)) {
    const field = iocType === "md5" ? "MD5" : iocType === "sha1" ? "SHA1" : "SHA256";
    return `// Microsoft Sentinel / Defender — KQL
union DeviceFileEvents, DeviceProcessEvents, DeviceImageLoadEvents
| where ${field} =~ "${ioc.toUpperCase()}"
| project TimeGenerated, DeviceName, ActionType, FileName, FolderPath, ${field}
| order by TimeGenerated desc`;
  }
  return `// KQL: buscar "${ioc}" en todos los eventos\nSearch "${ioc}"`;
}

function buildSPL(ioc, iocType) {
  if (iocType === "ipv4" || iocType === "ipv6") return `| tstats count where index=* (src_ip="${ioc}" OR dest_ip="${ioc}") by _time, src_ip, dest_ip, host, sourcetype | sort -count`;

  if (iocType === "domain") return `index=* ("${ioc}")
| rex field=_raw "(?P<query_domain>[a-zA-Z0-9.-]+\\.${ioc.replace(/\./g, "\\.")})"
| stats count by src_ip, query_domain, host
| sort -count`;

  if (iocType === "url") return `index=* url="${ioc}"
| stats count by src_ip, dest_ip, url, http_method, status
| sort -count`;

  if (["md5","sha1","sha256"].includes(iocType)) return `index=* "${ioc.toLowerCase()}" OR "${ioc.toUpperCase()}"
| stats count by host, file_name, file_path, user
| sort -count`;

  return `index=* "${ioc}" | stats count by host, sourcetype`;
}

function buildSIGMA(ioc, iocType, verdict) {
  const date = new Date().toISOString().split("T")[0];
  const level = verdict === "MALICIOUS" ? "high" : verdict === "SUSPICIOUS" ? "medium" : "low";

  let logsource = "    category: network_connection";
  let detection = "";

  if (iocType === "ipv4" || iocType === "ipv6") {
    detection = `    selection:\n        DestinationIp: '${ioc}'\n    condition: selection`;
  } else if (iocType === "domain") {
    logsource = "    category: dns";
    detection = `    selection:\n        dns_query|contains: '${ioc}'\n    condition: selection`;
  } else if (iocType === "url") {
    logsource = "    category: proxy";
    detection = `    selection:\n        c-uri|contains: '${ioc}'\n    condition: selection`;
  } else if (["md5","sha1","sha256"].includes(iocType)) {
    logsource = "    category: process_creation";
    detection = `    selection:\n        Hashes|contains: '${ioc.toUpperCase()}'\n    condition: selection`;
  } else {
    detection = `    selection:\n        '*|contains': '${ioc}'\n    condition: selection`;
  }

  return `title: Gjallarhorn Threat Intel — ${iocType.toUpperCase()} IOC
id: ${crypto.randomUUID()}
status: experimental
description: Detección de IOC ${iocType.toUpperCase()} con veredicto ${verdict}. Generado por Gjallar.
date: ${date}
author: Gjallar Platform
tags:
    - attack.threat_intel
    - tlp.green
level: ${level}
logsource:
${logsource}
detection:
${detection}
falsepositives:
    - Tráfico legítimo no clasificado
    - Infraestructura compartida`;
}

function buildYARA(hash, iocType) {
  const hashField = iocType === "md5" ? "md5" : iocType === "sha1" ? "sha1" : "sha256";
  return `rule Gjallar_IOC_${hash.slice(0, 8).toUpperCase()} {
    meta:
        description = "Gjallar: IOC ${iocType.toUpperCase()} match"
        author = "Gjallar Platform"
        date = "${new Date().toISOString().split("T")[0]}"
        ${hashField} = "${hash.toLowerCase()}"
    condition:
        ${hashField} == "${hash.toLowerCase()}"
}`;
}

// ── STIX 2.1 Bundle Generation ────────────────────────────────────────────────
function generateSTIX(ioc, iocType, score, verdict, findings) {
  const now = new Date().toISOString();
  const uid  = () => crypto.randomUUID();

  const identity = { type: "identity", spec_version: "2.1", id: `identity--${uid()}`, created: now, modified: now, name: "Gjallar Platform", identity_class: "system", description: "Gjallar Blue Team Platform — IOC Investigation" };

  const tlpGreen = { type: "marking-definition", spec_version: "2.1", id: "marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da", created: "2017-01-20T00:00:00.000Z", definition_type: "tlp", definition: { tlp: "green" } };

  const patternMap = { ipv4: `[ipv4-addr:value = '${ioc}']`, ipv6: `[ipv6-addr:value = '${ioc}']`, domain: `[domain-name:value = '${ioc}']`, url: `[url:value = '${ioc}']`, md5: `[file:hashes.MD5 = '${ioc.toUpperCase()}']`, sha1: `[file:hashes.'SHA-1' = '${ioc.toUpperCase()}']`, sha256: `[file:hashes.'SHA-256' = '${ioc.toUpperCase()}']`, email: `[email-addr:value = '${ioc}']` };
  const pattern = patternMap[iocType] || `[artifact:payload_bin = '${ioc}']`;

  const indicator = {
    type: "indicator", spec_version: "2.1", id: `indicator--${uid()}`,
    created: now, modified: now, created_by_ref: identity.id,
    object_marking_refs: [tlpGreen.id],
    name: `IOC: ${ioc}`,
    description: `${iocType.toUpperCase()} IOC — Veredicto: ${verdict} (score: ${score}/100). Fuentes confirmadas: ${findings.filter(f => f.found).map(f => f.source).join(", ") || "ninguna"}`,
    indicator_types: verdict === "MALICIOUS" ? ["malicious-activity"] : verdict === "SUSPICIOUS" ? ["anomalous-activity"] : ["benign"],
    pattern, pattern_type: "stix",
    valid_from: now,
    labels: [verdict.toLowerCase(), iocType, "threat-intel"],
    confidence: score,
  };

  return { type: "bundle", id: `bundle--${uid()}`, spec_version: "2.1", objects: [identity, tlpGreen, indicator] };
}

module.exports = { detectType, detectDGA, calculateScore, generateRules, generateSTIX };
