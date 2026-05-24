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

module.exports = { httpRequest, parseJSON };
