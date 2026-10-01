"use strict";
const crypto = require("crypto");
const { simpleParser } = require("mailparser");

// Tope de lo que se analiza de cada cuerpo del correo. Un correo legítimo no se acerca; uno
// armado para colgar el análisis no pasa de acá.
const MAX_CUERPO_ANALIZADO = 1024 * 1024;
const acotar = (s) => (typeof s === "string" && s.length > MAX_CUERPO_ANALIZADO ? s.slice(0, MAX_CUERPO_ANALIZADO) : s);

// 🔴 G-01: `new.*account.*details` es cúbica (24 KB de "new account" congelaban el proceso 13 s).
// Esto da lo mismo que `a.*b.*c` (partes en orden dentro de una misma línea) en tiempo lineal.
function enOrdenEnUnaLinea(texto, ...partes) {
  for (const linea of texto.split(/[\n\r\u2028\u2029]/)) {
    let i = 0;
    for (const p of partes) { i = linea.indexOf(p, i); if (i < 0) break; i += p.length; }
    if (i >= 0) return true;
  }
  return false;
}
// El asunto no pasaba por acotar: un encabezado plegado puede ser tan largo como el cuerpo.
const MAX_ASUNTO = 4096;

// ── Brand → Legitimate domains ────────────────────────────────────────────────
const KNOWN_BRANDS = {
  microsoft: ["microsoft.com","office.com","outlook.com","live.com","hotmail.com","microsoftonline.com","office365.com"],
  apple:     ["apple.com","icloud.com"],
  google:    ["google.com","gmail.com","googlemail.com"],
  amazon:    ["amazon.com","aws.amazon.com","amazon.es","amazon.com.ar"],
  paypal:    ["paypal.com","paypal.es"],
  netflix:   ["netflix.com"],
  facebook:  ["facebook.com","fb.com","meta.com"],
  instagram: ["instagram.com"],
  linkedin:  ["linkedin.com"],
  twitter:   ["twitter.com","x.com"],
  dropbox:   ["dropbox.com"],
  adobe:     ["adobe.com","adobesign.com","acrobat.com"],
  docusign:  ["docusign.com","docusign.net"],
  fedex:     ["fedex.com"],
  dhl:       ["dhl.com"],
  ups:       ["ups.com"],
  chase:     ["chase.com"],
  wellsfargo:["wellsfargo.com"],
  hsbc:      ["hsbc.com"],
  zoom:      ["zoom.us"],
  whatsapp:  ["whatsapp.com"],
  salesforce:["salesforce.com"],
  sharepoint:["sharepoint.com","microsoft.com"],
};

const URL_SHORTENERS = new Set(["bit.ly","tinyurl.com","t.co","goo.gl","ow.ly","buff.ly","adf.ly","short.io","rb.gy","is.gd","tiny.cc","cutt.ly","clck.ru","shorturl.at","qr.ae","rebrand.ly","smarturl.it","soo.gd"]);

const SUSPICIOUS_TLDS = new Set([".top",".xyz",".click",".ml",".ga",".cf",".gq",".tk",".pw",".work",".date",".download",".stream",".accountant",".loan",".racing",".trade",".webcam",".science",".party",".review",".win",".bid",".men",".faith",".zip",".mov"]);

const FREE_EMAIL_PROVIDERS = new Set(["gmail.com","yahoo.com","yahoo.es","hotmail.com","hotmail.es","outlook.com","aol.com","protonmail.com","proton.me","mail.com","yandex.com","yandex.ru","icloud.com","live.com","msn.com","me.com","zoho.com","tutanota.com","guerrillamail.com","mailinator.com","tempmail.com","throwaway.email","dispostable.com","sharklasers.com"]);

const EXECUTIVE_TITLES = ["ceo","cfo","coo","cto","president","chairman","director","vp ","vice president","managing director","owner","founder","partner","controller"];

const URGENCY_KEYWORDS = ["urgent","immediately","asap","right away","as soon as possible","today only","deadline","expires","suspended","verify now","confirm now","update required","action required","important notice","critical","alert","warning","limited time","act now","respond immediately","time sensitive","immediate attention","overdue"];

const FINANCIAL_KEYWORDS = ["wire transfer","bank transfer","routing number","account number","gift card","itunes card","google play card","amazon card","steam card","cryptocurrency","bitcoin","ethereum","usdc","swift code","iban","bic code","western union","moneygram","purchase order","invoice payment","remittance","fund transfer","ach transfer","zelle","venmo","cashapp","urgent payment","pending payment"];

const SECRECY_KEYWORDS = ["confidential","do not share","between us","keep this private","don't tell","discreet","keep quiet","secret","don't forward","delete after reading","eyes only"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDomain(email) {
  return String(email || "").split("@")[1]?.toLowerCase().trim() || "";
}

function isPrivateIP(ip) {
  const p = ip.split(".").map(Number);
  if (p.some(n => isNaN(n) || n > 255)) return true;
  return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254) || ip === "0.0.0.0" || ip === "255.255.255.255";
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

// ── Authentication Header Parsing ─────────────────────────────────────────────
function parseAuth(authResultsRaw, receivedSpfRaw) {
  const text = `${Array.isArray(authResultsRaw) ? authResultsRaw.join(" ") : (authResultsRaw || "")} ${receivedSpfRaw || ""}`.toLowerCase();

  const get = (key) => {
    const m = text.match(new RegExp(`${key}=(pass|fail|softfail|neutral|none|temperror|permerror|policy|bestguesspass)`));
    return m?.[1] || "none";
  };

  const spf   = get("spf");
  const dkim  = get("dkim");
  const dmarc = get("dmarc");
  const arc   = text.match(/arc=(pass|fail|none)/)?.[1] || "none";

  const spfDomain = text.match(/smtp\.mailfrom=([^\s;]+)/)?.[1] || null;
  const dkimDomain = text.match(/header\.d=([^\s;]+)/)?.[1] || null;

  return { spf, dkim, dmarc, arc, spfDomain, dkimDomain };
}

// ── Received Chain Parsing ────────────────────────────────────────────────────
function parseReceivedChain(headersValue) {
  const entries = Array.isArray(headersValue) ? headersValue : (headersValue ? [headersValue] : []);
  return entries.map(raw => {
    const r = typeof raw === "object" ? (raw.text || raw.value || String(raw)) : String(raw);
    const ipMatch  = r.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);
    const tsMatch  = r.match(/;\s*(.+)$/s);
    const fromSrv  = r.match(/from\s+(\S+)/i)?.[1] || null;
    const bySrv    = r.match(/\bby\s+(\S+)/i)?.[1] || null;
    const ip       = ipMatch?.[1] || null;
    return { raw: r.replace(/\s+/g, " ").trim(), ip, external: ip ? !isPrivateIP(ip) : false, fromServer: fromSrv, byServer: bySrv, timestamp: tsMatch?.[1]?.replace(/\s+/g, " ").trim() || null };
  });
}

// ── Link Extraction ───────────────────────────────────────────────────────────
// ⛔ Nada de expresiones regulares que recorran el HTML entero desde cada `<a`: un correo
// armado (miles de `<area href=...>` sin `</a>`) las volvía cuadráticas y un solo análisis
// congelaba el servidor para todos. Las etiquetas se ubican con indexOf, cada una se mira con
// un tope de largo, y el cuerpo que se analiza también tiene tope (MAX_CUERPO_ANALIZADO).
const MAX_ETIQUETA = 4096;   // una etiqueta más larga que esto no es HTML legítimo
const MAX_TEXTO_ENLACE = 2048;

// Recorre las etiquetas `<nombre ...>` en tiempo lineal. Devuelve [inicio, fin] de cada una.
function* etiquetas(html, lower, nombre) {
  const abre = "<" + nombre;
  let pos = 0;
  while (pos < html.length) {
    const ini = lower.indexOf(abre, pos);
    if (ini < 0) return;
    const fin = lower.indexOf(">", ini);
    if (fin < 0) return;
    pos = fin + 1;
    const sig = lower.charCodeAt(ini + abre.length);
    // solo la etiqueta exacta (`<a ` y no `<area`), seguida de espacio, tab o salto
    if (sig !== 32 && sig !== 9 && sig !== 10 && sig !== 13) continue;
    if (fin - ini > MAX_ETIQUETA) continue;
    yield [ini, fin];
  }
}

function extractLinks(html) {
  if (!html) return [];
  html = acotar(html);
  const lower = html.toLowerCase();
  const links = [];
  const vistos = new Set();
  const agregar = (l) => { if (!vistos.has(l.href)) { vistos.add(l.href); links.push(l); } };

  let cierre = 0; // posición del próximo `</a>`; -1 cuando ya no hay más
  for (const [ini, fin] of etiquetas(html, lower, "a")) {
    if (links.length >= 100) break;
    if (cierre !== -1 && cierre <= fin) cierre = lower.indexOf("</a>", fin + 1);
    if (cierre === -1) break; // sin `</a>` no hay enlace completo (igual que antes)
    const hm = /\bhref\s*=\s*["']([^"']+)["']/i.exec(html.slice(ini, fin + 1));
    if (!hm) continue;
    const href = hm[1].trim();
    const visibleText = html.slice(fin + 1, Math.min(cierre, fin + 1 + MAX_TEXTO_ENLACE)).replace(/<[^<>]{0,500}>/g, "").trim();
    if (!href.startsWith("http") && !href.startsWith("//")) continue;
    try {
      const url = href.startsWith("//") ? "https:" + href : href;
      const parsed = new URL(url);
      const isShortener = URL_SHORTENERS.has(parsed.hostname);
      // Text vs href mismatch
      let textDomain = null;
      if (visibleText.includes(".") && !visibleText.includes(" ") && visibleText.length < 80) {
        try { textDomain = new URL(visibleText.startsWith("http") ? visibleText : "https://" + visibleText).hostname; } catch {}
      }
      const mismatch = textDomain && textDomain !== parsed.hostname && !parsed.hostname.includes(textDomain) && !textDomain.includes(parsed.hostname);
      agregar({ href: url, domain: parsed.hostname, visibleText: visibleText.slice(0, 100), isShortener, mismatch });
    } catch {}
  }
  // Also plain URLs not in anchors
  const plainRe = /https?:\/\/[^\s"'<>]{6,200}/gi;
  let m;
  while (links.length < 100 && (m = plainRe.exec(html)) !== null) {
    const url = m[0].replace(/[.,;!?)]+$/, "");
    if (!vistos.has(url)) {
      try { agregar({ href: url, domain: new URL(url).hostname, visibleText: null, isShortener: URL_SHORTENERS.has(new URL(url).hostname), mismatch: false }); } catch {}
    }
  }
  return links.slice(0, 100);
}

// Imagen de 1×1 con src remoto (tracking pixel), etiqueta por etiqueta.
function tieneTrackingPixel(html) {
  const lower = html.toLowerCase();
  for (const [ini, fin] of etiquetas(html, lower, "img")) {
    const tag = lower.slice(ini, fin + 1);
    if (/\b(?:width|height)\s*=\s*["']?1(?![0-9])/.test(tag) && /\bsrc\s*=\s*["']https?:\/\//.test(tag)) return true;
  }
  return false;
}

// ── Phishing Detection ────────────────────────────────────────────────────────
function detectPhishing(subject, textBody, htmlBody, from, replyTo, links, auth) {
  const indicators = [];
  let score = 0;
  const fromDomain = getDomain(from?.address);
  const fromName   = (from?.name || "").toLowerCase();
  const subjectLc  = (subject || "").toLowerCase();
  const allText    = `${subject} ${textBody}`.toLowerCase();

  // 1. Brand impersonation (name/subject contains brand but domain is wrong)
  for (const [brand, legitDomains] of Object.entries(KNOWN_BRANDS)) {
    if (fromName.includes(brand) || subjectLc.includes(brand)) {
      const isLegit = legitDomains.some(d => fromDomain === d || fromDomain.endsWith("." + d));
      if (!isLegit && fromDomain) {
        indicators.push({ check: "Suplantación de marca", detail: `"${brand}" en nombre/asunto, dominio real: "${fromDomain}"`, severity: "critical" });
        score += 40;
        break;
      }
    }
  }

  // 2. Lookalike domain (edit distance ≤ 2 to known brand)
  for (const [brand, legitDomains] of Object.entries(KNOWN_BRANDS)) {
    const mainBase = legitDomains[0].split(".")[0];
    const fromBase = fromDomain.split(".")[0];
    if (fromBase && fromBase !== mainBase && levenshtein(fromBase, mainBase) <= 2) {
      indicators.push({ check: "Dominio lookalike", detail: `"${fromDomain}" similar a "${legitDomains[0]}"`, severity: "critical" });
      score += 40;
      break;
    }
  }

  // 3. Reply-To mismatch
  if (replyTo?.address) {
    const replyDomain = getDomain(replyTo.address);
    if (replyDomain && fromDomain && replyDomain !== fromDomain) {
      indicators.push({ check: "Reply-To mismatch", detail: `From: ${fromDomain} → Reply-To: ${replyDomain}`, severity: "high" });
      score += 30;
    }
  }

  // 4. Free email provider as sender
  if (FREE_EMAIL_PROVIDERS.has(fromDomain)) {
    indicators.push({ check: "Proveedor de email gratuito", detail: `${from?.address} (${fromDomain})`, severity: "medium" });
    score += 15;
  }

  // 5. Suspicious sender TLD
  if ([...SUSPICIOUS_TLDS].some(tld => fromDomain.endsWith(tld))) {
    indicators.push({ check: "TLD del remitente sospechoso", detail: fromDomain, severity: "high" });
    score += 20;
  }

  // 6. URL shorteners in links
  const shortLinks = links.filter(l => l.isShortener);
  if (shortLinks.length > 0) {
    indicators.push({ check: "URL shorteners detectados", detail: [...new Set(shortLinks.map(l => l.domain))].join(", "), severity: "high" });
    score += 25;
  }

  // 7. Href vs visible text mismatch
  const mismatched = links.filter(l => l.mismatch);
  if (mismatched.length > 0) {
    indicators.push({ check: "Texto de enlace engañoso", detail: `${mismatched.length} enlace(s): texto ≠ destino real`, severity: "critical" });
    score += 35;
  }

  // 8. HTML form (credential harvesting)
  if (htmlBody && /<form\b/i.test(htmlBody)) {
    indicators.push({ check: "Formulario HTML detectado", detail: "Posible recolección de credenciales", severity: "high" });
    score += 30;
  }

  // 9. Auth failures
  if (auth) {
    if (auth.spf === "fail" || auth.spf === "softfail") {
      indicators.push({ check: "SPF falla", detail: `SPF: ${auth.spf}${auth.spfDomain ? ` (${auth.spfDomain})` : ""}`, severity: "medium" }); score += 15;
    }
    if (auth.dkim === "fail") {
      indicators.push({ check: "DKIM inválido", detail: `Firma DKIM ${auth.dkimDomain ? `de ${auth.dkimDomain}` : ""} no verificada`, severity: "medium" }); score += 15;
    }
    if (auth.dmarc === "fail") {
      indicators.push({ check: "DMARC falla", detail: "Política DMARC no cumplida", severity: "high" }); score += 20;
    }
  }

  // 10. Urgency in subject
  const urgencyHits = URGENCY_KEYWORDS.filter(k => subjectLc.includes(k));
  if (urgencyHits.length > 0) {
    indicators.push({ check: "Urgencia en asunto", detail: urgencyHits.slice(0, 3).join(", "), severity: "low" }); score += 10;
  }

  // 11. Tracking pixel (1px image)
  if (htmlBody && tieneTrackingPixel(htmlBody)) {
    indicators.push({ check: "Tracking pixel detectado", detail: "Imagen 1×1 para tracking de apertura", severity: "low" }); score += 5;
  }

  // 12. Suspicious link TLDs in body
  const suspLinks = links.filter(l => [...SUSPICIOUS_TLDS].some(t => l.domain.endsWith(t)));
  if (suspLinks.length > 0) {
    indicators.push({ check: "Links con TLD sospechoso", detail: [...new Set(suspLinks.map(l => l.domain))].slice(0, 3).join(", "), severity: "high" }); score += 20;
  }

  return { score: Math.min(score, 100), indicators, linkCount: links.length, shortLinks: shortLinks.length, mismatchedLinks: mismatched.length };
}

// ── BEC Detection ─────────────────────────────────────────────────────────────
function detectBEC(subject, textBody, from, replyTo) {
  const indicators = [];
  let score = 0;
  const fromDomain = getDomain(from?.address);
  const fromName   = (from?.name || "").toLowerCase();
  const allText    = `${subject} ${textBody}`.toLowerCase();

  // 1. Executive title + free email provider
  const execTitle = EXECUTIVE_TITLES.find(t => fromName.includes(t));
  if (execTitle) {
    if (FREE_EMAIL_PROVIDERS.has(fromDomain)) {
      indicators.push({ check: "Ejecutivo desde proveedor gratuito", detail: `Título "${execTitle}" con dominio ${fromDomain}`, severity: "critical" }); score += 55;
    } else {
      indicators.push({ check: "Título ejecutivo detectado", detail: `"${execTitle}" en nombre del remitente`, severity: "medium" }); score += 15;
    }
  }

  // 2. Financial keywords
  const finHits = FINANCIAL_KEYWORDS.filter(k => allText.includes(k));
  if (finHits.length > 0) {
    indicators.push({ check: "Palabras clave financieras", detail: finHits.slice(0, 5).join(", "), severity: "high" });
    score += Math.min(finHits.length * 10, 40);
  }

  // 3. Urgency + financial combo (strong BEC signal)
  const urgHits = URGENCY_KEYWORDS.filter(k => allText.includes(k));
  if (urgHits.length >= 2) {
    indicators.push({ check: "Múltiples términos de urgencia", detail: urgHits.slice(0, 3).join(", "), severity: "high" });
    score += Math.min(urgHits.length * 6, 25);
  }

  // 4. Secrecy request
  const secHits = SECRECY_KEYWORDS.filter(k => allText.includes(k));
  if (secHits.length > 0) {
    indicators.push({ check: "Solicitud de confidencialidad", detail: secHits.slice(0, 3).join(", "), severity: "high" }); score += 25;
  }

  // 5. Reply-To redirect to different domain
  if (replyTo?.address) {
    const replyDomain = getDomain(replyTo.address);
    if (replyDomain !== fromDomain) {
      indicators.push({ check: "Reply-To redirige a dominio diferente", detail: `${from?.address} → ${replyTo.address}`, severity: "high" }); score += 30;
    }
  }

  // 6. Dollar amounts
  const amounts = allText.match(/\$[\d,]+(?:\.\d{2})?/g);
  if (amounts?.length > 0) {
    indicators.push({ check: "Montos en dólares", detail: amounts.slice(0, 3).join(", "), severity: "medium" }); score += 15;
  }

  // 7. Payroll / HR fraud patterns
  if (/payroll|direct deposit|bank account change/.test(allText) || enOrdenEnUnaLinea(allText, "update", "banking") || enOrdenEnUnaLinea(allText, "new", "account", "details")) {
    indicators.push({ check: "Fraude de nómina / HR", detail: "Patrones de cambio de cuenta bancaria detectados", severity: "critical" }); score += 45;
  }

  score = Math.min(score, 100);
  const verdict = score >= 60 ? "BEC" : score >= 30 ? "SUSPICIOUS" : "CLEAN";
  return { score, verdict, indicators };
}

// ── IOC Extraction ────────────────────────────────────────────────────────────
function extractEmailIOCs(textBody, htmlBody, receivedChain, links) {
  const allText = `${textBody} ${htmlBody}`;

  const receivedIPs = receivedChain.map(r => r.ip).filter(ip => ip && !isPrivateIP(ip));
  const bodyIPs  = [...new Set((allText.match(/\b(\d{1,3}\.){3}\d{1,3}\b/g) || []).filter(ip => !isPrivateIP(ip)))];
  const urls     = [...new Set((allText.match(/https?:\/\/[^\s"'<>]{6,200}/gi) || []).map(u => u.replace(/[.,;!?)]+$/, "")))];
  const domains  = [...new Set(links.map(l => l.domain).filter(Boolean))];
  // Cuantificadores con tope (RFC 5321: 64 la parte local, 255 el dominio): sin tope, una
  // línea larga de letras sin arroba tardaba minutos en recorrerse.
  const emails   = [...new Set((allText.match(/[a-z0-9._%+\-]{1,64}@[a-z0-9.\-]{1,255}\.[a-z]{2,24}/gi) || []))];

  return {
    receivedIPs: [...new Set(receivedIPs)],
    bodyIPs: bodyIPs.slice(0, 20),
    urls: urls.slice(0, 30),
    domains: domains.slice(0, 30),
    emails: emails.slice(0, 20),
  };
}

// ── Detection Rules Generation ────────────────────────────────────────────────
function generateRules(analysis) {
  const fromDomain = getDomain(analysis.from?.address);
  const fromEmail  = analysis.from?.address || "?";
  const subj = (analysis.subject || "").replace(/"/g, "'");
  const safeKey = fromDomain.replace(/[^a-zA-Z0-9]/g, "_");

  const m365 = `# Microsoft 365 / Exchange Online — Transport Rule
# Generado por Gjallar Email Forensics

# PowerShell — Exchange Online Management
New-TransportRule -Name "Gjallar_Block_${safeKey}" \`
  -FromAddressContainsWords "${fromDomain}" \`
  -SetSCL 9 \`
  -PrependSubject "[PHISHING] " \`
  -SetHeaderName "X-Gjallar-Verdict" \`
  -SetHeaderValue "BLOCKED" \`
  -Comments "Bloqueado por Gjallar Email Forensics"

# Bloquear dominio en tenant blocklist
New-TenantAllowBlockListItems -ListType Sender -Block -Entries "${fromDomain}" -Notes "Gjallar block"

# Si el email fue recibido (para quarantine policy)
New-QuarantinePolicy -Name "Gjallar_Phishing_Quarantine" -EndUserQuarantinePermissionsValue 0`;

  const fortimail = `# FortiMail — Política de Contenido
# Generado por Gjallar Email Forensics

config antispam black-white-list
  edit "Gjallar-Blocklist"
    config entries
      edit 0
        set addr-type domain
        set domain "${fromDomain}"
        set action reject
        set comment "Gjallar: phishing detectado"
      next
    end
  next
end

config antispam profile
  edit "Gjallar-Phishing-Profile"
    set comment "Bloqueado por Gjallar"
    config heuristic
      set status enable
      set action quarantine
    end
  next
end`;

  const proofpoint = `# Proofpoint — Política de filtrado
# Generado por Gjallar Email Forensics

{
  "policy_name": "Gjallar_Block_${safeKey}",
  "description": "Bloqueado por Gjallar Email Forensics",
  "conditions": [
    { "field": "sender_domain", "operator": "equals", "value": "${fromDomain}" }${analysis.phishing?.mismatchedLinks > 0 ? ',\n    { "field": "url_mismatch", "operator": "is_true", "value": true }' : ''}
  ],
  "actions": [
    { "type": "quarantine", "folder": "Phishing" },
    { "type": "add_header", "name": "X-Gjallar-Verdict", "value": "PHISHING" },
    { "type": "notify_admin", "message": "Phishing detectado desde ${fromDomain}" }
  ]
}`;

  const mimecast = `# Mimecast — Política de Examen de Contenido
# Generado por Gjallar Email Forensics

Ruta: Administración → Políticas de Gateway → Políticas de Examen de Contenido → Nueva Política

Nombre:       Gjallar Block ${fromDomain}
Dirección:    Entrante (Inbound)
Remitente:    Dominio = ${fromDomain}
Acción:       Rechazar
Notificación: Administrador notificado por cada coincidencia
Descripción:  Detectado por Gjallar — Phishing / BEC

# Bloqueo de URL en Managed URL:
Agregar URL: *://${fromDomain}/* → Acción: Block → Notificar al usuario`;

  return { m365, fortimail, proofpoint, mimecast };
}

// ── Main Analysis ─────────────────────────────────────────────────────────────
async function analyzeEmail(buffer) {
  const parsed = await simpleParser(buffer);

  const from    = parsed.from?.value?.[0] || {};
  const to      = parsed.to?.value || [];
  const cc      = parsed.cc?.value || [];
  const replyTo = parsed.replyTo?.value?.[0] || null;
  const subject = String(parsed.subject || "").slice(0, MAX_ASUNTO);
  const date    = parsed.date;
  const messageId = parsed.messageId;
  // El análisis mira como mucho MAX_CUERPO_ANALIZADO de cada cuerpo (ver acotar).
  const textBody  = acotar(parsed.text || "");
  const htmlBody  = acotar(parsed.html || "");

  // Authentication
  const authRaw    = parsed.headers.get("authentication-results");
  const spfRaw     = parsed.headers.get("received-spf");
  const dkimSigRaw = parsed.headers.get("dkim-signature");
  const auth = parseAuth(authRaw, spfRaw);

  // Received chain
  const receivedRaw   = parsed.headers.get("received");
  const receivedChain = parseReceivedChain(receivedRaw);

  // Links
  const links = extractLinks(htmlBody || textBody);

  // Analysis
  const phishing = detectPhishing(subject, textBody, htmlBody, from, replyTo, links, auth);
  const bec      = detectBEC(subject, textBody, from, replyTo);
  const iocs     = extractEmailIOCs(textBody, htmlBody, receivedChain, links);

  // Attachments
  const attachments = (parsed.attachments || []).map(att => {
    const content = att.content;
    return {
      filename:    att.filename || "unnamed",
      contentType: att.contentType || "application/octet-stream",
      size:        att.size || content?.length || 0,
      md5:    content ? crypto.createHash("md5").update(content).digest("hex") : null,
      sha256: content ? crypto.createHash("sha256").update(content).digest("hex") : null,
      suspicious: /\.(exe|dll|bat|ps1|vbs|js|hta|scr|com|cmd|lnk|jar|msi|reg|wsf|jse|vbe)/i.test(att.filename || ""),
    };
  });

  // Combined score
  const combinedScore = Math.min(Math.round(phishing.score * 0.6 + bec.score * 0.4), 100);
  const verdict = combinedScore >= 70 ? "MALICIOUS" : combinedScore >= 40 ? "SUSPICIOUS" : combinedScore > 0 ? "CLEAN" : "UNKNOWN";
  const isBEC      = bec.score >= 60;
  const isPhishing = phishing.score >= 60;

  const analysis = { subject, from, to, cc, replyTo, date, messageId, auth, receivedChain, phishing, bec, iocs, links: links.slice(0, 50), attachments, textBody: textBody.slice(0, 3000) };
  const rules = generateRules(analysis);

  return { ...analysis, rules, score: combinedScore, verdict, isBEC, isPhishing };
}

module.exports = { analyzeEmail, extractLinks, MAX_CUERPO_ANALIZADO, enOrdenEnUnaLinea };
