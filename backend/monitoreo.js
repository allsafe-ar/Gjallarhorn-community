/**
 * Monitoreo de infraestructura y inventario de activos.
 *
 * 🔑 **Gjallarhorn mide por su cuenta.** Se le indica qué equipos vigilar y con qué chequeo
 * (ping, puerto o respuesta web), y él mantiene el estado de cada uno, el historial de caídas
 * y recuperaciones, y la latencia. No hace falta tener otra herramienta instalada.
 *
 * ⚠️ **El monitoreo solo sirve on-premise.** El servidor tiene que estar dentro de la red que
 * mide: un ping desde un servidor de internet a una IP privada no llega a ningún lado.
 *
 * 🔑 **El esquema es un subconjunto del de la edición Pro.** Pro suma la importación desde
 * herramientas del cliente (Zabbix, GLPI) y el cruce del mismo equipo entre varias fuentes sin
 * duplicarlo. Un cliente puede empezar acá y migrar sin perder nada de lo cargado.
 */

const ORIGENES = ["propio"];
const TIPOS_CHEQUEO = ["icmp", "tcp", "http"];
const ESTADOS = ["ok", "degradado", "caido", "desconocido"];
const CRITICIDADES = ["baja", "media", "alta", "critica"];

async function crearTablas(qRun) {
  // Lo que se monitorea.
  await qRun(`CREATE TABLE IF NOT EXISTS monitor_activos (
    id            VARCHAR(36) PRIMARY KEY,
    nombre        VARCHAR(200) NOT NULL,
    -- 🔑 El nombre con el que el cliente lo llama, que casi nunca es el del sistema. Un host
    -- puede llamarse srv-db01 y ser "el servidor de facturacion" para quien lo usa.
    alias         VARCHAR(200) NULL,
    ip            VARCHAR(45)  NULL,
    hostname      VARCHAR(255) NULL,
    grupo         VARCHAR(200) NULL,
    origen        ENUM('propio') NOT NULL DEFAULT 'propio',
    criticidad    ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
    monitoreado   TINYINT(1) NOT NULL DEFAULT 1,
    notas         TEXT NULL,
    -- Lo que se averigua sondeando, no lo que alguien declaró. Por eso va junto a la fecha
    -- en que se averiguó: un sistema operativo de hace seis meses no dice nada de hoy.
    so            VARCHAR(120) NULL,
    so_pista      VARCHAR(80)  NULL,
    puertos       JSON NULL,
    sondeado_at   DATETIME NULL,
    visto_ultima  DATETIME NULL,
    created_by    VARCHAR(120) NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_origen (origen)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Qué se le mide a cada activo.
  await qRun(`CREATE TABLE IF NOT EXISTS monitor_chequeos (
    id           VARCHAR(36) PRIMARY KEY,
    activo_id    VARCHAR(36) NOT NULL,
    tipo         ENUM('icmp','tcp','http') NOT NULL,
    -- Puerto para tcp, URL para http, vacío para icmp.
    destino      VARCHAR(500) NULL,
    intervalo_seg INT NOT NULL DEFAULT 60,
    timeout_ms   INT NOT NULL DEFAULT 5000,
    -- ⚠️ Cuántos fallos seguidos hacen falta para declararlo caído. Con 1 solo, cualquier
    -- microcorte manda un correo a las 3 de la mañana y la gente deja de leer las alertas.
    umbral_fallos INT NOT NULL DEFAULT 3,
    -- Para http: el código que se espera. 0 = cualquiera de la familia 2xx/3xx.
    esperado     INT NOT NULL DEFAULT 0,
    habilitado   TINYINT(1) NOT NULL DEFAULT 1,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activo (activo_id),
    CONSTRAINT fk_chq_activo FOREIGN KEY (activo_id) REFERENCES monitor_activos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Estado actual de cada chequeo. Una fila por chequeo, se pisa: el histórico son los eventos.
  await qRun(`CREATE TABLE IF NOT EXISTS monitor_estado (
    chequeo_id     VARCHAR(36) PRIMARY KEY,
    estado         ENUM('ok','degradado','caido','desconocido') NOT NULL DEFAULT 'desconocido',
    fallos_seguidos INT NOT NULL DEFAULT 0,
    latencia_ms    INT NULL,
    ultimo_ok      DATETIME NULL,
    ultimo_error   TEXT NULL,
    medido_at      DATETIME NULL,
    CONSTRAINT fk_est_chequeo FOREIGN KEY (chequeo_id) REFERENCES monitor_chequeos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // La línea de tiempo. Solo cambios de estado, no cada medición: si se guardara cada ping
  // la tabla crece sin decir nada nuevo y la pantalla se vuelve ilegible.
  await qRun(`CREATE TABLE IF NOT EXISTS monitor_eventos (
    id             VARCHAR(36) PRIMARY KEY,
    activo_id      VARCHAR(36) NULL,
    chequeo_id     VARCHAR(36) NULL,
    origen         ENUM('propio') NOT NULL DEFAULT 'propio',
    severidad      ENUM('info','advertencia','media','alta','critica') NOT NULL DEFAULT 'media',
    estado_nuevo   VARCHAR(20) NULL,
    mensaje        TEXT NOT NULL,
    resuelto_at    DATETIME NULL,
    notificado     TINYINT(1) NOT NULL DEFAULT 0,
    ts             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activo (activo_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  /**
   * Qué fuente reportó cada activo, y qué dijo.
   *
   * 🔑 Un activo es UNA fila en monitor_activos. Acá va una fila por cada fuente que lo vio,
   * con el identificador que esa fuente usa. Es lo que permite reimportar sin duplicar y, de
   * paso, mostrar en qué se contradicen: si GLPI dice Windows 10 y el sondeo dice Windows 11,
   * el inventario del cliente está desactualizado, y eso es un hallazgo.
   */
  // ⚠️ La edición Pro agrega acá dos tablas más, para cruzar el mismo equipo entre varias
  // herramientas (Zabbix, GLPI) sin duplicarlo. Community mide por su cuenta y tiene una sola
  // procedencia, así que no las necesita. El esquema queda como subconjunto del de Pro: un
  // cliente puede empezar acá y migrar sin perder nada.

  // Instalaciones que ya tenían la tabla creada: se agregan las columnas nuevas de a una.
  // ⚠️ ADD COLUMN IF NOT EXISTS es sintaxis de MariaDB y en MySQL falla, así que se intenta
  // y se ignora el error de columna duplicada. Es idempotente igual.
  for (const col of [
    "alias VARCHAR(200) NULL",
    "so VARCHAR(120) NULL",
    "so_pista VARCHAR(80) NULL",
    "puertos JSON NULL",
    "sondeado_at DATETIME NULL",
    // Datos de identidad: son los que permiten reconocer el mismo equipo entre fuentes.
    "mac VARCHAR(32) NULL",
    "serie VARCHAR(80) NULL",
    "modelo VARCHAR(120) NULL",
    "fabricante VARCHAR(120) NULL",
    "ubicacion VARCHAR(200) NULL",
    "responsable VARCHAR(200) NULL",
  ]) {
    try { await qRun("ALTER TABLE monitor_activos ADD COLUMN " + col); } catch (_) {}
  }
}

/**
 * Familia del sistema operativo, a partir del texto libre que devuelve cada fuente.
 *
 * 🔑 Ninguna fuente entrega una categoría: GLPI devuelve lo que el cliente escribió
 * ("Microsoft Windows 11 Pro", "Debian GNU/Linux") y el sondeo propio deduce por TTL
 * ("Linux o Unix"). Para poder contar cuántos equipos Windows hay, alguien tiene que agrupar,
 * y ese alguien no puede ser la pantalla.
 *
 * ⚠️ "sin_dato" NO se disimula. Que la mayoría del parque no tenga sistema operativo
 * declarado es un hallazgo del inventario del cliente, y esconderlo en "otro" convierte un
 * dato accionable en ruido.
 */
function familiaSO(texto) {
  const t = String(texto || "").toLowerCase();
  if (!t.trim()) return "sin_dato";
  if (/windows|microsoft/.test(t))                    return "windows";
  if (/mac ?os|darwin|osx/.test(t))                   return "macos";
  if (/linux|debian|ubuntu|centos|red ?hat|rhel|suse|fedora|alpine|unix|bsd/.test(t)) return "linux";
  if (/ios|android/.test(t))                          return "movil";
  if (/switch|router|firewall|fortios|cisco|mikrotik|routeros/.test(t)) return "red";
  return "otro";
}

module.exports = { familiaSO, crearTablas, ORIGENES, TIPOS_CHEQUEO, ESTADOS, CRITICIDADES };

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE CHEQUEOS
// ─────────────────────────────────────────────────────────────────────────────

const { execFile } = require("child_process");
const net = require("net");
const http = require("http");
const https = require("https");

/**
 * ICMP. Se usa el `ping` del sistema y no un socket propio a propósito: mandar ICMP desde
 * Node necesita sockets crudos, que requieren privilegios de root o una capability. Correr
 * el servidor como root para hacer ping es un precio absurdo, y `ping` ya viene con el
 * bit setuid puesto en cualquier Linux.
 */
function chequearIcmp(destino, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const segundos = Math.max(1, Math.ceil(timeoutMs / 1000));
    execFile("ping", ["-n", "-c", "1", "-W", String(segundos), destino],
      { timeout: timeoutMs + 2000 }, (err, stdout) => {
        if (err) return resolve({ ok: false, error: "No responde al ping" });
        // La latencia que informa el propio ping es más fiel que medir el proceso.
        const m = /time[=<]\s*([\d.]+)\s*ms/i.exec(stdout || "");
        resolve({ ok: true, latencia: m ? Math.round(Number(m[1])) : Date.now() - t0 });
      });
  });
}

/** TCP: alcanza con que el puerto acepte la conexión. No se manda ni se lee nada. */
function chequearTcp(host, puerto, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = new net.Socket();
    let cerrado = false;
    const fin = (r) => { if (cerrado) return; cerrado = true; s.destroy(); resolve(r); };
    s.setTimeout(timeoutMs);
    s.once("connect", () => fin({ ok: true, latencia: Date.now() - t0 }));
    s.once("timeout", () => fin({ ok: false, error: `Sin respuesta en ${timeoutMs} ms` }));
    s.once("error", (e) => fin({ ok: false, error: e.code === "ECONNREFUSED" ? "Conexión rechazada" : e.message }));
    s.connect(Number(puerto), host);
  });
}

/**
 * HTTP. `esperado = 0` acepta cualquier respuesta 2xx o 3xx.
 *
 * ⚠️ Acá **no se aplica el filtro de destinos internos** que sí usan las integraciones. Es
 * deliberado: el objeto de esta función es justamente alcanzar equipos de la red interna.
 * Lo que protege es que el destino sale de un chequeo cargado por un administrador, no de
 * una URL que mandó alguien de afuera.
 */
function chequearHttp(url, timeoutMs, esperado) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let u;
    try { u = new URL(url); } catch { return resolve({ ok: false, error: "URL inválida" }); }
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request({
      hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search, method: "GET",
      rejectUnauthorized: false,   // equipamiento interno con certificado propio
    }, (res) => {
      res.resume();               // se descarta el cuerpo: solo interesa el código
      const lat = Date.now() - t0;
      const bien = esperado ? res.statusCode === esperado
                            : (res.statusCode >= 200 && res.statusCode < 400);
      resolve(bien ? { ok: true, latencia: lat }
                   : { ok: false, error: `HTTP ${res.statusCode}`, latencia: lat });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: `Sin respuesta en ${timeoutMs} ms` }); });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

/** Ejecuta un chequeo según su tipo. Devuelve `{ ok, latencia, error }`. */
async function ejecutar(chequeo, activo) {
  const destinoBase = activo.ip || activo.hostname;
  if (!destinoBase && chequeo.tipo !== "http") return { ok: false, error: "El activo no tiene dirección" };
  switch (chequeo.tipo) {
    case "icmp": return chequearIcmp(destinoBase, chequeo.timeout_ms);
    case "tcp":  return chequearTcp(destinoBase, chequeo.destino || 443, chequeo.timeout_ms);
    case "http": {
      // Si el destino es solo una ruta, se arma la URL con la dirección del activo.
      const d = chequeo.destino || "/";
      const url = /^https?:\/\//i.test(d) ? d : `http://${destinoBase}${d.startsWith("/") ? d : "/" + d}`;
      return chequearHttp(url, chequeo.timeout_ms, Number(chequeo.esperado) || 0);
    }
    default: return { ok: false, error: `Tipo de chequeo desconocido: ${chequeo.tipo}` };
  }
}

/**
 * Aplica el resultado de un chequeo y decide si hubo **cambio de estado**.
 *
 * 🔑 **El umbral es lo que hace usable al sistema.** Un chequeo que falla una vez no declara
 * nada: recién al acumular `umbral_fallos` seguidos pasa a "caído". Sin eso, cualquier
 * microcorte manda un correo a las tres de la mañana, y a la semana nadie lee las alertas.
 * Mientras acumula fallos sin llegar al umbral queda en "degradado", que se ve en pantalla
 * pero **no notifica**.
 *
 * Devuelve `{ estado, cambio, evento }`. `cambio` es true solo cuando el estado es distinto
 * del anterior, que es lo único que se guarda en la línea de tiempo y lo único que se avisa.
 */
function aplicarResultado(previo, resultado, umbral) {
  const antes = previo?.estado || "desconocido";
  let fallos = Number(previo?.fallos_seguidos) || 0;
  let estado;

  if (resultado.ok) {
    fallos = 0;
    estado = "ok";
  } else {
    fallos += 1;
    estado = fallos >= umbral ? "caido" : "degradado";
  }

  const cambio = estado !== antes;
  // Solo se avisa al caer y al recuperarse. Pasar a "degradado" no despierta a nadie.
  const notificable = cambio && (estado === "caido" || (estado === "ok" && antes === "caido"));

  return { estado, fallos, cambio, notificable, antes };
}

/**
 * Texto del evento, pensado para que se entienda sin abrir el sistema.
 *
 * ⚠️ La **primera** medición buena no es una recuperación: nunca se había caído. Decir
 * "volvió a responder" ahí es mentir en la línea de tiempo, y esa línea es la que después
 * se mira para reconstruir qué pasó.
 */
function textoEvento(activo, chequeo, estado, resultado, umbral, antes = null) {
  const donde = `${activo.nombre}${chequeo.tipo === "tcp" && chequeo.destino ? `:${chequeo.destino}` : ""}`;
  const via = { icmp: "ping", tcp: "TCP", http: "HTTP" }[chequeo.tipo] || chequeo.tipo;
  const lat = resultado.latencia != null ? `, ${resultado.latencia} ms` : "";
  if (estado === "ok") {
    return antes === "desconocido" || antes == null
      ? `${donde} responde (${via}${lat}) — primera medición`
      : `${donde} volvió a responder (${via}${lat})`;
  }
  if (estado === "caido") return `${donde} no responde por ${via} tras ${umbral} intentos: ${resultado.error || "sin detalle"}`;
  return `${donde} respondió mal por ${via}: ${resultado.error || "sin detalle"}`;
}

module.exports.ejecutar = ejecutar;
module.exports.aplicarResultado = aplicarResultado;
module.exports.textoEvento = textoEvento;
module.exports.chequearIcmp = chequearIcmp;
module.exports.chequearTcp = chequearTcp;
module.exports.chequearHttp = chequearHttp;

// ─────────────────────────────────────────────────────────────────────────────
// SONDEO: qué es y qué tiene abierto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Puertos que se sondean. Es una lista corta y elegida, no un barrido completo.
 *
 * 🔑 Un escaneo de los 65535 puertos tarda minutos por equipo, satura la tabla de estados
 * de un firewall y se parece bastante a un ataque. Con estos treinta se identifica qué es
 * el equipo y qué expone, que es lo que hace falta para monitorearlo.
 */
const PUERTOS_CONOCIDOS = [
  [21, "FTP"], [22, "SSH"], [23, "Telnet"], [25, "SMTP"], [53, "DNS"], [80, "HTTP"],
  [110, "POP3"], [123, "NTP"], [135, "RPC"], [139, "NetBIOS"], [143, "IMAP"],
  [161, "SNMP"], [389, "LDAP"], [443, "HTTPS"], [445, "SMB"], [465, "SMTPS"],
  [587, "SMTP"], [993, "IMAPS"], [995, "POP3S"], [1433, "SQL Server"], [1521, "Oracle"],
  [3000, "HTTP alt"], [3306, "MySQL"], [3389, "Escritorio remoto"], [5432, "PostgreSQL"],
  [5900, "VNC"], [6379, "Redis"], [8006, "Proxmox"], [8080, "HTTP alt"], [8443, "HTTPS alt"],
  [9090, "Cockpit"], [9200, "Elasticsearch"], [10050, "Agente Zabbix"], [27017, "MongoDB"],
];

/**
 * Familia de sistema operativo a partir del TTL de la respuesta al ping.
 *
 * ⚠️ **Es una pista, no un dato.** Cada salto de red resta uno al TTL, así que se compara
 * contra el valor inicial más cercano por arriba. Un equipo detrás de varios saltos o con
 * el TTL modificado a mano puede dar cualquier cosa. Por eso se guarda aparte de un
 * sistema operativo declarado y la interfaz lo muestra como estimación.
 */
function soPorTtl(ttl) {
  if (!ttl || ttl <= 0) return null;
  if (ttl <= 64)  return { so: "Linux o Unix", pista: `TTL ${ttl}` };
  if (ttl <= 128) return { so: "Windows",      pista: `TTL ${ttl}` };
  return { so: "Equipo de red", pista: `TTL ${ttl}` };
}

/** Ping que además devuelve el TTL, para estimar el sistema operativo. */
function pingConTtl(destino, timeoutMs = 3000) {
  return new Promise((resolve) => {
    execFile("ping", ["-n", "-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), destino],
      { timeout: timeoutMs + 2000 }, (err, stdout) => {
        if (err) return resolve(null);
        const m = /ttl[=:]\s*(\d+)/i.exec(stdout || "");
        resolve(m ? Number(m[1]) : null);
      });
  });
}

/**
 * Sondea un equipo: estima el sistema operativo y busca puertos conocidos abiertos.
 *
 * Corre bajo pedido y no en cada ciclo: es información que cambia de vez en cuando, y
 * repetirla cada minuto contra toda la red sería ruido en el firewall del cliente sin
 * ningún dato nuevo a cambio.
 */
async function sondear(destino, { timeoutMs = 1200, paralelo = 12 } = {}) {
  const ttl = await pingConTtl(destino);
  const so = soPorTtl(ttl);

  const abiertos = [];
  for (let i = 0; i < PUERTOS_CONOCIDOS.length; i += paralelo) {
    const tanda = PUERTOS_CONOCIDOS.slice(i, i + paralelo);
    const r = await Promise.all(tanda.map(async ([puerto, nombre]) => {
      const x = await chequearTcp(destino, puerto, timeoutMs);
      return x.ok ? { puerto, servicio: nombre } : null;
    }));
    abiertos.push(...r.filter(Boolean));
  }
  return { so: so?.so ?? null, so_pista: so?.pista ?? null, puertos: abiertos, responde: ttl != null };
}

module.exports.sondear = sondear;
module.exports.soPorTtl = soPorTtl;
module.exports.PUERTOS_CONOCIDOS = PUERTOS_CONOCIDOS;
