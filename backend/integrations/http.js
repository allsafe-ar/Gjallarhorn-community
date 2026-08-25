"use strict";
const https = require("https");
const http  = require("http");

function httpRequest(urlStr, { method = "GET", headers = {}, body = null, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try { urlObj = new URL(urlStr); }
    catch { return reject(new Error("URL inválida")); }

    const isHttps = urlObj.protocol === "https:";
    const mod  = isHttps ? https : http;
    const opts = {
      hostname: urlObj.hostname,
      port:     urlObj.port || (isHttps ? 443 : 80),
      path:     urlObj.pathname + urlObj.search,
      method,
      headers:  { "Content-Type": "application/json", ...headers },
      rejectUnauthorized: false,
    };

    const req = mod.request(opts, (res) => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });

    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", e => reject(new Error(e.message)));
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function parseJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}


function httpUpload(urlStr, { fileBuffer, fileName = "sample.bin", fieldName = "file", fields = {}, headers = {}, timeout = 60000 } = {}) {
  const limite = "----GjallarhornBoundary" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const partes = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    partes.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  partes.push(Buffer.from(
    `--${limite}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${String(fileName).replace(/"/g, "")}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  ));
  partes.push(fileBuffer);
  partes.push(Buffer.from(`\r\n--${limite}--\r\n`));
  const cuerpo = Buffer.concat(partes);
  return new Promise((resolve, reject) => {
    let urlObj;
    try { urlObj = new URL(urlStr); } catch { return reject(new Error("URL inválida")); }
    const esHttps = urlObj.protocol === "https:";
    const mod = esHttps ? https : http;
    const req = mod.request({
      hostname: urlObj.hostname,
      port:     urlObj.port || (esHttps ? 443 : 80),
      path:     urlObj.pathname + urlObj.search,
      method:   "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${limite}`, "Content-Length": cuerpo.length, ...headers },
      rejectUnauthorized: false,
    }, (res) => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", e => reject(new Error(e.message)));
    req.write(cuerpo);
    req.end();
  });
}

module.exports = { httpRequest, httpUpload, parseJSON };
