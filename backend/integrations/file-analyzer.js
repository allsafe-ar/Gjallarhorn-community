"use strict";
const crypto = require("crypto");

// ── File Type Detection (magic bytes) ─────────────────────────────────────────
const MAGIC = [
  { type: "pe",      magic: [0x4D,0x5A],                         offset: 0, ext: [".exe",".dll",".sys",".ocx",".drv"] },
  { type: "elf",     magic: [0x7F,0x45,0x4C,0x46],               offset: 0, ext: [".elf",""] },
  { type: "pdf",     magic: [0x25,0x50,0x44,0x46],               offset: 0, ext: [".pdf"] },
  { type: "ole",     magic: [0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1], offset: 0, ext: [".doc",".xls",".ppt",".msg"] },
  { type: "zip",     magic: [0x50,0x4B,0x03,0x04],               offset: 0, ext: [".zip",".apk",".docx",".xlsx",".pptx",".jar"] },
  { type: "zip_empty",magic:[0x50,0x4B,0x05,0x06],               offset: 0, ext: [".zip"] },
  { type: "rar",     magic: [0x52,0x61,0x72,0x21,0x1A,0x07],     offset: 0, ext: [".rar"] },
  { type: "7z",      magic: [0x37,0x7A,0xBC,0xAF,0x27,0x1C],     offset: 0, ext: [".7z"] },
  { type: "gz",      magic: [0x1F,0x8B],                         offset: 0, ext: [".gz",".tgz"] },
];

const SCRIPT_EXTS = { ".ps1": "powershell", ".psm1": "powershell", ".psd1": "powershell", ".bat": "batch", ".cmd": "batch", ".js": "javascript", ".vbs": "vbscript", ".vbe": "vbscript", ".hta": "hta", ".sh": "shell", ".py": "python" };

function detectFileType(buf, filename) {
  const ext = (filename.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  for (const m of MAGIC) {
    let match = true;
    for (let i = 0; i < m.magic.length; i++) {
      if ((buf[m.offset + i] ?? -1) !== m.magic[i]) { match = false; break; }
    }
    if (match) {
      // Distinguish Office OOXML from plain ZIP using extension
      if (m.type === "zip" && [".docx",".xlsx",".pptx"].includes(ext)) return "office_ooxml";
      if (m.type === "zip" && ext === ".apk") return "apk";
      if (m.type === "zip" && ext === ".jar") return "jar";
      return m.type;
    }
  }
  if (SCRIPT_EXTS[ext]) return `script_${SCRIPT_EXTS[ext]}`;
  // Fallback: text detection
  const sample = buf.slice(0, Math.min(512, buf.length));
  const printable = [...sample].filter(b => (b >= 0x20 && b <= 0x7E) || b === 0x09 || b === 0x0A || b === 0x0D).length;
  if (printable / sample.length > 0.85) return "text";
  return "binary";
}

function fileTypeLabel(type) {
  const labels = { pe: "PE Executable", elf: "ELF Binary", pdf: "PDF Document", ole: "Office OLE (Legacy)", zip: "ZIP Archive", rar: "RAR Archive", "7z": "7-Zip Archive", gz: "GZip Archive", office_ooxml: "Office OOXML", apk: "Android APK", jar: "Java Archive", text: "Text File", binary: "Binary File" };
  if (type?.startsWith("script_")) return `Script (${type.replace("script_","")})`;
  return labels[type] || type || "Unknown";
}

// ── Hashing ───────────────────────────────────────────────────────────────────
function hashBuffer(buf) {
  return {
    md5:    crypto.createHash("md5").update(buf).digest("hex"),
    sha1:   crypto.createHash("sha1").update(buf).digest("hex"),
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
  };
}

// ── Shannon Entropy ───────────────────────────────────────────────────────────
function entropy(buf, start = 0, end = buf.length) {
  if (end <= start) return 0;
  const freq = new Array(256).fill(0);
  for (let i = start; i < end; i++) freq[buf[i]]++;
  const n = end - start;
  let h = 0;
  for (const f of freq) { if (f > 0) { const p = f / n; h -= p * Math.log2(p); } }
  return Math.round(h * 100) / 100;
}

// ── String Extraction ─────────────────────────────────────────────────────────
function extractStrings(buf, minLen = 5, maxCount = 2000) {
  const limit = Math.min(buf.length, 5 * 1024 * 1024); // analyze first 5MB
  const strings = [];
  let cur = "";
  for (let i = 0; i < limit && strings.length < maxCount; i++) {
    const b = buf[i];
    if (b >= 0x20 && b <= 0x7E) { cur += String.fromCharCode(b); }
    else {
      if (cur.length >= minLen) strings.push(cur);
      cur = "";
    }
  }
  if (cur.length >= minLen) strings.push(cur);
  return strings;
}

// ── IOC Extraction from strings ───────────────────────────────────────────────
function extractIOCs(strings) {
  const text = strings.join("\n");
  const ips     = [...new Set((text.match(/\b(\d{1,3}\.){3}\d{1,3}\b/g) || []).filter(ip => !isPrivateIP(ip)))];
  const urls    = [...new Set((text.match(/https?:\/\/[^\s"'><]{6,200}/gi) || []).map(u => u.replace(/[.,;!?]+$/, "")))];
  const domains = [...new Set((text.match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|info|biz|ru|cn|top|xyz|io|co|me|tk|ml|ga|cf|gq)\b/gi) || []).filter(d => d.split(".").length >= 2 && d.length <= 100))];
  const emails  = [...new Set((text.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi) || []))];
  const btc     = [...new Set((text.match(/\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g) || []))];
  const onion   = [...new Set((text.match(/\b[a-z2-7]{16,56}\.onion\b/gi) || []))];
  const creds   = [...new Set((text.match(/(?:password|passwd|pwd|secret|token|apikey|api_key)\s*[:=]\s*\S{4,}/gi) || []).slice(0, 10))];
  return { ips: ips.slice(0, 50), urls: urls.slice(0, 50), domains: domains.slice(0, 50), emails: emails.slice(0, 20), btc: btc.slice(0, 10), onion: onion.slice(0, 10), creds: creds.slice(0, 10) };
}

function isPrivateIP(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.some(p => p > 255)) return true;
  return (parts[0] === 10) || (parts[0] === 127) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254) || ip === "0.0.0.0" || ip === "255.255.255.255";
}

// ── PE Analysis ───────────────────────────────────────────────────────────────
const SUSPICIOUS_IMPORTS = [
  "VirtualAlloc","VirtualAllocEx","WriteProcessMemory","CreateRemoteThread","NtCreateThreadEx",
  "RtlCreateUserThread","CreateThread","OpenProcess","OpenThread","SuspendThread","ResumeThread",
  "SetWindowsHookEx","QueueUserAPC","NtMapViewOfSection","MapViewOfFile","CreateFileMapping",
  "LoadLibrary","GetProcAddress","ShellExecute","WinExec","CreateProcess","RegOpenKey",
  "RegSetValue","RegCreateKey","InternetOpen","InternetConnect","HttpSendRequest","URLDownloadToFile",
  "WSAStartup","socket","connect","send","recv","CryptEncrypt","CryptDecrypt","CryptGenKey",
  "BCryptEncrypt","BCryptGenerateSymmetricKey","IsDebuggerPresent","CheckRemoteDebuggerPresent",
  "CreateMutex","GetTickCount","timeGetTime","NtQueryInformationProcess",
];

const MACHINE_TYPES = { 0x014C: "x86 (i386)", 0x8664: "x64 (AMD64)", 0x01C0: "ARM", 0xAA64: "ARM64", 0x0200: "IA64" };

function analyzePE(buf) {
  if (buf.length < 64) return null;
  if (buf[0] !== 0x4D || buf[1] !== 0x5A) return null;

  const peOffset = buf.readUInt32LE(60);
  if (peOffset + 24 > buf.length) return null;
  if (buf.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") return null;

  const machine     = buf.readUInt16LE(peOffset + 4);
  const numSections = buf.readUInt16LE(peOffset + 6);
  const timestamp   = buf.readUInt32LE(peOffset + 8);
  const optHeaderSz = buf.readUInt16LE(peOffset + 20);
  const characteristics = buf.readUInt16LE(peOffset + 22);

  const isDLL    = !!(characteristics & 0x2000);
  const isDriver = !!(characteristics & 0x1000);

  // Optional header
  let subsystem = null, imageBase = null;
  const optMagic = optHeaderSz > 0 ? buf.readUInt16LE(peOffset + 24) : 0;
  if (optMagic === 0x10B || optMagic === 0x20B) {
    subsystem = buf.readUInt16LE(peOffset + 24 + (optMagic === 0x20B ? 68 : 68));
    imageBase = optMagic === 0x20B ? Number(buf.readBigUInt64LE(peOffset + 24 + 24)) : buf.readUInt32LE(peOffset + 24 + 28);
  }

  // Sections
  const sectionBase = peOffset + 24 + optHeaderSz;
  const sections = [];
  let maxEntropy = 0;
  let packerSuspicion = false;

  for (let i = 0; i < numSections && i < 20; i++) {
    const off  = sectionBase + i * 40;
    if (off + 40 > buf.length) break;
    const name       = buf.toString("ascii", off, off + 8).replace(/\0/g, "");
    const virtSize   = buf.readUInt32LE(off + 8);
    const virtAddr   = buf.readUInt32LE(off + 12);
    const rawSize    = buf.readUInt32LE(off + 16);
    const rawPtr     = buf.readUInt32LE(off + 20);
    const sectionEnd = rawPtr + rawSize;
    const sectionEntropy = (rawPtr > 0 && rawSize > 0 && sectionEnd <= buf.length)
      ? entropy(buf, rawPtr, Math.min(sectionEnd, rawPtr + 65536))
      : 0;
    if (sectionEntropy > maxEntropy) maxEntropy = sectionEntropy;
    if (sectionEntropy > 7.2 && rawSize > 0x200) packerSuspicion = true;
    sections.push({ name: name || `SEC${i}`, virtSize, rawSize, entropy: sectionEntropy });
  }

  // Import hints via string scanning (fast heuristic)
  const peStrings = extractStrings(buf, 4, 5000).map(s => s.toUpperCase());
  const foundImports = SUSPICIOUS_IMPORTS.filter(imp => peStrings.some(s => s.includes(imp.toUpperCase())));

  const anomalies = [];
  if (packerSuspicion)  anomalies.push("Secciones con alta entropía → posible packer/cifrado");
  if (timestamp === 0)  anomalies.push("Timestamp nulo (posible limpieza de metadatos)");
  if (foundImports.includes("IsDebuggerPresent") || foundImports.includes("CheckRemoteDebuggerPresent")) anomalies.push("Anti-debugging detectado");
  if (foundImports.some(i => ["OpenProcess","WriteProcessMemory","CreateRemoteThread","NtCreateThreadEx"].includes(i))) anomalies.push("Técnicas de process injection");
  if (foundImports.some(i => ["URLDownloadToFile","InternetOpen","HttpSendRequest"].includes(i))) anomalies.push("Funciones de descarga desde internet");
  if (foundImports.some(i => ["CryptEncrypt","BCryptEncrypt","BCryptGenerateSymmetricKey"].includes(i))) anomalies.push("APIs de cifrado (posible ransomware)");

  return {
    arch: MACHINE_TYPES[machine] || `0x${machine.toString(16)}`,
    isDLL, isDriver,
    timestamp: timestamp ? new Date(timestamp * 1000).toISOString() : null,
    sections,
    maxSectionEntropy: maxEntropy,
    isPacked: packerSuspicion,
    suspiciousImports: foundImports,
    anomalies,
  };
}

// ── Script Analysis ───────────────────────────────────────────────────────────
const SUSPICIOUS_PATTERNS = {
  powershell: [
    { name: "Base64 encoded payload",     re: /[A-Za-z0-9+/]{100,}={0,2}/g },
    { name: "IEX (Invoke-Expression)",    re: /\bIEX\b|\bInvoke-Expression\b/i },
    { name: "Download cradle",            re: /DownloadString|DownloadFile|WebClient|Invoke-WebRequest|iwr\b/i },
    { name: "Encoded command (-enc)",     re: /-[Ee]n[Cc]od|(-[eE]c\s)/g },
    { name: "Bypass execution policy",   re: /bypass|unrestricted|RemoteSigned.*-ExecutionPolicy/i },
    { name: "Hidden window style",        re: /-WindowStyle\s+Hidden/i },
    { name: "AMSI bypass",               re: /AmsiScanBuffer|amsiInitFailed|amsi\.dll/i },
    { name: "Reflective DLL load",        re: /\[Reflection\.Assembly\]|Load\(\[byte/i },
    { name: "WMI lateral movement",       re: /WMICLASS|Win32_Process.*Create|wmic.*process/i },
    { name: "Obfuscated char array",      re: /\[char\]\s*\d+(\+\[char\]\s*\d+){3,}/i },
  ],
  javascript: [
    { name: "eval() execution",           re: /\beval\s*\(/g },
    { name: "Obfuscated string (fromCharCode)", re: /String\.fromCharCode\s*\(/g },
    { name: "ActiveX shell",              re: /ActiveXObject|WScript\.Shell|new\s+Shell/i },
    { name: "document.write injection",   re: /document\.write\s*\(/g },
    { name: "Hex encoded string",         re: /0x[0-9a-fA-F]{4,}(\s*,\s*0x[0-9a-fA-F]{2,}){5,}/g },
    { name: "Unescape encoding",          re: /\bunescape\s*\(/g },
    { name: "Base64 decode",              re: /atob\s*\(|base64_decode/i },
  ],
  vbscript: [
    { name: "WScript Shell",              re: /WScript\.Shell|CreateObject.*WScript/i },
    { name: "Shell execute",              re: /\.Run\s*\(|ShellExecute/i },
    { name: "Chr() obfuscation",          re: /Chr\(\d+\)\s*&\s*Chr\(\d+\)/g },
    { name: "ADODB Stream (download)",    re: /ADODB\.Stream|Scripting\.FileSystemObject/i },
    { name: "Reg operations",             re: /RegWrite|RegRead|RegDelete/i },
  ],
  batch: [
    { name: "PowerShell invocation",      re: /powershell\.exe.*-[eEcC]/i },
    { name: "Certutil decode (LOLBin)",   re: /certutil\s+-decode/i },
    { name: "BITSAdmin download",         re: /bitsadmin.*\/transfer/i },
    { name: "Variable substitution obf.", re: /%(.*?:.*?)%.*%(.*?:.*?)%/g },
    { name: "caret obfuscation",          re: /[a-zA-Z]\^[a-zA-Z]/g },
    { name: "Mshta execution",            re: /mshta\s+(http|javascript)/i },
  ],
};

function deobfuscateBase64(text) {
  const results = [];
  const b64re = /([A-Za-z0-9+/]{40,}={0,2})/g;
  let m;
  while ((m = b64re.exec(text)) !== null) {
    try {
      const decoded = Buffer.from(m[1], "base64").toString("utf16le").replace(/\0/g, "").trim();
      if (decoded.length > 10 && /[\x20-\x7E]{8,}/.test(decoded)) {
        results.push({ encoded: m[1].slice(0, 80) + (m[1].length > 80 ? "..." : ""), decoded: decoded.slice(0, 300) });
      }
    } catch {}
  }
  return results.slice(0, 10);
}

function analyzeScript(content, scriptType) {
  const detections = [];
  const patterns = SUSPICIOUS_PATTERNS[scriptType] || [];
  for (const p of patterns) {
    const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g");
    if (re.test(content)) detections.push(p.name);
  }

  const deobfuscated = scriptType === "powershell" ? deobfuscateBase64(content) : [];
  const strings = content.split("\n").filter(l => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("//")).slice(0, 100);

  return { scriptType, detections, deobfuscated, lineCount: content.split("\n").length };
}

// ── Ransomware Detection ──────────────────────────────────────────────────────
const RANSOM_PATTERNS = [
  { name: "VSS deletion (vssadmin)",      re: /vssadmin.*delete\s+shadows|vssadmin\s+delete/i },
  { name: "VSS deletion (wmic)",          re: /wmic\s+shadowcopy\s+delete|wmic\.exe.*shadowcopy/i },
  { name: "Cipher.exe (disk wipe)",       re: /cipher\s+\/W/i },
  { name: "Ransom note filename",         re: /readme|decrypt|recover|restore|help_decrypt|how_to_decrypt/i },
  { name: "Bitcoin payment reference",    re: /bitcoin|btc.*payment|send.*btc|wallet.*address/i },
  { name: ".onion payment site",          re: /\.onion/i },
  { name: "AES crypto constant",          re: /\x63\x7c\x77\x7b\xf2\x6b\x6f|aes.*(?:256|128|192)/i },
  { name: "ChaCha20 constant",            re: /expand 32-byte k|expand 16-byte k/i },
  { name: "File extension renaming",      re: /\.(locked|encrypted|enc|crypt|crypted|cryp1|wncry|locky|cerber)/i },
  { name: "Scheduled task persistence",   re: /schtasks.*\/create.*\/ru\s+system/i },
  { name: "Disable Windows Defender",     re: /Set-MpPreference.*DisableRealtimeMonitoring|WindowsDefender.*disable/i },
];

// Crypto API strings associated with encryption
const CRYPTO_STRINGS = ["CryptEncrypt","CryptDecrypt","CryptGenKey","BCryptEncrypt","BCryptGenerateSymmetricKey","AES_encrypt","AES_decrypt","EVP_EncryptInit","EVP_DecryptInit"];

function detectRansomware(strings, buf) {
  const text = strings.join("\n");
  const detections = [];

  for (const p of RANSOM_PATTERNS) {
    if (p.re.test(text)) detections.push(p.name);
  }

  const cryptoHits = CRYPTO_STRINGS.filter(s => text.includes(s));
  if (cryptoHits.length >= 2) detections.push(`Múltiples APIs de cifrado: ${cryptoHits.join(", ")}`);

  const btcAddresses = (text.match(/\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g) || []);
  if (btcAddresses.length > 0) detections.push(`Direcciones Bitcoin encontradas: ${btcAddresses.slice(0, 3).join(", ")}`);

  const onionAddresses = (text.match(/\b[a-z2-7]{16,56}\.onion\b/gi) || []);
  if (onionAddresses.length > 0) detections.push(`Direcciones .onion: ${onionAddresses.slice(0, 3).join(", ")}`);

  return { detected: detections.length >= 2, indicators: detections };
}

// ── Cobalt Strike Beacon Detection ────────────────────────────────────────────
const CS_XOR_KEYS = [0x69, 0x2E, 0x35, 0x4A, 0x72, 0x56, 0xAB, 0xCD, 0xDE, 0xAD];

const CS_WATERMARK_STRINGS = [
  "Content-Type: application/x-www-form-urlencoded",
  "If-None-Match",
  "checksum8",
  "beacon.dll",
  "beacon.x64.dll",
  "ReflectiveDLL",
  "CobaltStrike",
  "cobaltstrike",
  "Cobalt Strike",
  "sleep_mask",
  "beacon_sleep",
];

function detectCSBeacon(buf, strings) {
  const text = strings.join("\n");
  const indicators = [];

  // Check for known CS strings
  const csStrings = CS_WATERMARK_STRINGS.filter(s => text.includes(s));
  if (csStrings.length > 0) indicators.push(`CS strings: ${csStrings.slice(0, 3).join(", ")}`);

  // XOR brute force on sections looking for MZ header
  const sampleSize = Math.min(buf.length, 65536);
  let xorC2 = null;
  for (const key of CS_XOR_KEYS) {
    let hasMZ = false;
    // Check multiple offsets for XOR-decoded MZ
    for (let off = 0; off < sampleSize - 100; off += 16) {
      if (((buf[off] ^ key) === 0x4D) && ((buf[off + 1] ^ key) === 0x5A)) { hasMZ = true; break; }
    }
    if (hasMZ) {
      indicators.push(`XOR key 0x${key.toString(16).padStart(2,"0")} decodes to MZ header (embedded PE)`);
      xorC2 = key;
      break;
    }
  }

  // Check for HTTP staging patterns (default CS malleable C2 profiles)
  const httpPatterns = [/\/jquery-\d+\.\d+\.\d+\.min\.js/i, /\/activity/i, /\/submit\.php/i, /\/admin\/get\.php/i];
  for (const p of httpPatterns) {
    if (p.test(text)) indicators.push(`CS malleable C2 URI: ${p.toString()}`);
  }

  // Require ≥2 independent indicators to avoid false positives on ZIP/binary files
  return { detected: indicators.length >= 2, indicators, xorKey: xorC2 };
}

// ── C2 Framework Signatures ───────────────────────────────────────────────────
const C2_FRAMEWORK_SIGS = [
  { name: "Metasploit Meterpreter", patterns: ["meterpreter","metasploit","MsfStaged","ReflectiveDll"] },
  { name: "Empire",                 patterns: ["powershell-empire","EmPyre","PowerSploit","empire.agent"] },
  { name: "Sliver",                 patterns: ["sliver-implant","sliver.dll","gRPC","implant.dll","dns_listener"] },
  { name: "Havoc",                  patterns: ["HavocC2","daemon.dll","demon.x64.dll","Demon.dll"] },
  { name: "Brute Ratel",            patterns: ["badger.dll","BruteRatel","BRC4","bruteratel"] },
  { name: "Covenant",               patterns: ["Covenant","GruntHTTP","GruntSMB","grunt.exe"] },
  { name: "PoshC2",                 patterns: ["PoshC2","Py2ExeServicer","ImplantHandler"] },
];

function detectC2Frameworks(strings) {
  const text = strings.join("\n");
  const detected = [];
  for (const fw of C2_FRAMEWORK_SIGS) {
    if (fw.patterns.some(p => text.includes(p))) detected.push(fw.name);
  }
  return detected;
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function calculateFileScore(analysis) {
  let score = 0;
  const reasons = [];

  if (analysis.csBeacon?.detected) {
    score += 85; reasons.push(`Cobalt Strike beacon detectado (+85)`);
  }
  if (analysis.ransomware?.detected) {
    score += 80; reasons.push(`Indicadores de ransomware (+80)`);
  }
  if (analysis.c2Frameworks?.length > 0) {
    score += 75; reasons.push(`Framework C2 detectado: ${analysis.c2Frameworks.join(", ")} (+75)`);
  }
  if (analysis.peInfo?.isPacked) {
    score += 25; reasons.push("PE empaquetado/ofuscado (+25)");
  }
  if ((analysis.peInfo?.suspiciousImports?.length || 0) >= 3) {
    const c = Math.min((analysis.peInfo.suspiciousImports.length - 2) * 5, 25);
    score += c; reasons.push(`${analysis.peInfo.suspiciousImports.length} imports sospechosos (+${c})`);
  }
  if (analysis.scriptInfo?.detections?.length > 0) {
    const c = Math.min(analysis.scriptInfo.detections.length * 10, 40);
    score += c; reasons.push(`${analysis.scriptInfo.detections.length} patrones maliciosos en script (+${c})`);
  }
  if (analysis.iocs?.onion?.length > 0) { score += 30; reasons.push(".onion IOCs (+30)"); }
  if (analysis.iocs?.btc?.length > 0)   { score += 20; reasons.push("Direcciones Bitcoin (+20)"); }

  // Boost from threat intel (set externally)
  if (analysis.vtScore > 0) { score += analysis.vtScore; reasons.push(`VirusTotal (+${analysis.vtScore})`); }
  if (analysis.mbFound)     { score += 70; reasons.push("Malware Bazaar: encontrado (+70)"); }
  if (analysis.tfFound)     { score += 55; reasons.push("ThreatFox: encontrado (+55)"); }

  score = Math.min(score, 100);
  const verdict = score >= 70 ? "MALICIOUS" : score >= 40 ? "SUSPICIOUS" : score > 0 ? "CLEAN" : "UNKNOWN";
  return { score, verdict, reasons };
}

// ── Main Analysis ─────────────────────────────────────────────────────────────
async function analyzeFile(buf, filename) {
  const fileType = detectFileType(buf, filename);
  const hashes   = hashBuffer(buf);
  const fileSize = buf.length;
  const fileEntropy = entropy(buf, 0, Math.min(buf.length, 1024 * 1024));
  const strings  = extractStrings(buf);
  const iocs     = extractIOCs(strings);

  const analysis = {
    filename,
    fileType: fileTypeLabel(fileType),
    fileTypeRaw: fileType,
    fileSize,
    entropy: fileEntropy,
    hashes,
    strings: strings.slice(0, 500),
    iocs,
    peInfo:      null,
    scriptInfo:  null,
    ransomware:  null,
    csBeacon:    null,
    c2Frameworks:[],
    vtScore:     0,
    mbFound:     false,
    tfFound:     false,
  };

  if (fileType === "pe") {
    analysis.peInfo = analyzePE(buf);
    analysis.ransomware = detectRansomware(strings, buf);
    analysis.csBeacon   = detectCSBeacon(buf, strings);
    analysis.c2Frameworks = detectC2Frameworks(strings);
  } else if (fileType?.startsWith("script_")) {
    const scriptType = fileType.replace("script_", "");
    const content = buf.toString("utf8");
    analysis.scriptInfo = analyzeScript(content, scriptType);
    analysis.ransomware = detectRansomware(strings, buf);
    analysis.c2Frameworks = detectC2Frameworks(strings);
  } else {
    // Generic analysis for any file type
    analysis.ransomware   = detectRansomware(strings, buf);
    // CS beacon XOR scan only makes sense on opaque binaries — not on document/archive types
    // whose internal ZIP/XML content produces accidental false XOR-MZ matches
    const EXECUTABLE_TYPES = ["binary", "elf"];
    if (EXECUTABLE_TYPES.includes(fileType)) {
      analysis.csBeacon = detectCSBeacon(buf, strings);
    }
    analysis.c2Frameworks = detectC2Frameworks(strings);
  }

  const { score, verdict, reasons } = calculateFileScore(analysis);
  return { ...analysis, score, verdict, scoreReasons: reasons };
}

module.exports = { analyzeFile, hashBuffer, extractStrings, detectFileType };
