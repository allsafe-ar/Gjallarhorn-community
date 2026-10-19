"use strict";
/**
 * Esquema del inventario de activos. Canónico: idéntico en Skuld y Gjallarhorn.
 *
 * 🔑 **Las mismas tablas en los dos sistemas**, con `tenant_id` como columna de organización en
 * ambos. En Skuld vale lo mismo que `client_id`; en Gjallarhorn es la de siempre. Así el módulo no
 * necesita traducir nombres de columnas y la sincronización entre los dos es copiar filas.
 *
 * ⚠️ **SQL portable.** La VM corre MariaDB 10.11 y producción MySQL 8: nada de `ADD COLUMN IF NOT
 * EXISTS` (es de MariaDB, en MySQL falla) ni `ANY_VALUE()` (al revés). Las columnas nuevas se agregan
 * mirando `information_schema`. Ver los gotchas del cerebro.
 *
 * Lo propio de cada sistema entra por el adaptador:
 *   · `fkTenant`       · tabla(columna) a la que apunta tenant_id con borrado en cascada (Skuld: clients(id)).
 *   · `columnasExtra`  · columnas que solo usa ese sistema (Gjallarhorn: monitoreado, zabbix_hostid).
 */

const COLUMNAS_NUCLEO = `
    id                  VARCHAR(36)  PRIMARY KEY,
    tenant_id           VARCHAR(36)  NULL,
    categoria           VARCHAR(20)  NOT NULL DEFAULT 'hardware',
    tipo                VARCHAR(30)  NOT NULL DEFAULT 'otro_hw',
    nombre              VARCHAR(200) NOT NULL,
    -- 🔑 El nombre con el que lo llama quien lo usa. Ninguna importación lo pisa.
    alias               VARCHAR(200) NULL,
    estado              VARCHAR(20)  NOT NULL DEFAULT 'produccion',
    -- Hardware agrupado: "40 puestos con Windows 11" es una fila con cantidad 40. El relevamiento
    -- declarativo de Skuld trabaja así; lo descubierto en la red siempre es de a uno.
    cantidad            INT          NOT NULL DEFAULT 1,
    -- Jerarquía física o lógica: el servicio expuesto cuelga del servidor que lo publica.
    padre_id            VARCHAR(36)  NULL,
    numero_inventario   VARCHAR(80)  NULL,
    -- Identidad técnica: con esto se reconoce el mismo equipo entre fuentes.
    ip                  VARCHAR(45)  NULL,
    hostname            VARCHAR(255) NULL,
    mac                 VARCHAR(40)  NULL,
    serie               VARCHAR(120) NULL,
    fabricante          VARCHAR(120) NULL,
    modelo              VARCHAR(120) NULL,
    so                  VARCHAR(120) NULL,
    so_version          VARCHAR(80)  NULL,
    version             VARCHAR(80)  NULL,
    url                 VARCHAR(500) NULL,
    expuesto_internet   TINYINT(1)   NOT NULL DEFAULT 0,
    grupo               VARCHAR(200) NULL,
    area                VARCHAR(200) NULL,
    ubicacion           VARCHAR(200) NULL,
    -- 🔑 Tres personas distintas (ISO 27001 A.5.9): quien responde por el activo, quien lo opera y
    -- quien lo usa. En Skuld eran un solo texto libre, y así no se le puede avisar a nadie.
    propietario         VARCHAR(200) NULL,
    propietario_usuario VARCHAR(64)  NULL,
    propietario_correo  VARCHAR(200) NULL,
    custodio            VARCHAR(200) NULL,
    asignado_a          VARCHAR(200) NULL,
    responsable         VARCHAR(200) NULL,
    criticidad          ENUM('baja','media','alta','critica') NOT NULL DEFAULT 'media',
    clasificacion       ENUM('publica','interna','confidencial','restringida') NULL,
    datos_personales    TINYINT(1)   NOT NULL DEFAULT 0,
    -- Valoración de confidencialidad, integridad y disponibilidad (1 a 5). La usa el análisis de
    -- riesgo de Skuld como punto de partida; en Gjallarhorn da contexto a una alerta.
    val_confidencialidad TINYINT     NULL,
    val_integridad       TINYINT     NULL,
    val_disponibilidad   TINYINT     NULL,
    -- Compra
    proveedor           VARCHAR(200) NULL,
    fecha_compra        DATE         NULL,
    factura             VARCHAR(120) NULL,
    costo               DECIMAL(14,2) NULL,
    moneda              VARCHAR(3)   NULL,
    centro_costo        VARCHAR(120) NULL,
    -- Lo que se averigua mirando, no lo que alguien declaró. Va con su fecha: un sistema
    -- operativo de hace seis meses no dice nada de hoy.
    origen              VARCHAR(20)  NOT NULL DEFAULT 'manual',
    so_pista            VARCHAR(80)  NULL,
    puertos             JSON         NULL,
    sondeado_at         DATETIME     NULL,
    visto_ultima        DATETIME     NULL,
    -- Lo propio de cada tipo (servicios de un servidor, puestos de una licencia, subtipo de una
    -- información): va en JSON para no sumar una columna por cada tipo nuevo.
    atributos           JSON         NULL,
    notas               TEXT         NULL,
    -- Baja (ciclo de vida) y disposición (A.7.14).
    baja_at             DATETIME     NULL,
    baja_motivo         VARCHAR(500) NULL,
    disposicion         VARCHAR(30)  NULL,
    disposicion_evidencia VARCHAR(500) NULL,
    -- Borrado lógico: para un error de carga. La baja es otra cosa.
    eliminado_at        DATETIME     NULL,
    created_by          VARCHAR(120) NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`;

/** Columnas del núcleo, en el orden de la tabla. Sirve para el alta, la edición y el CSV. */
const CAMPOS = COLUMNAS_NUCLEO.split("\n")
  .map(l => l.trim())
  .filter(l => l && !l.startsWith("--"))
  .map(l => l.split(/\s+/)[0]);

async function columnasDe(qRows, tabla) {
  const filas = await qRows(
    "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [tabla]);
  return new Set((filas || []).map(f => f.c));
}

async function indicesDe(qRows, tabla) {
  const filas = await qRows(
    "SELECT DISTINCT INDEX_NAME AS i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [tabla]);
  return new Set((filas || []).map(f => f.i));
}

/**
 * Crea las tablas si faltan y agrega columnas nuevas a las existentes. Idempotente.
 *
 * @param {{qRun, qRows}} dep
 * @param {{fkTenant?: string, columnasExtra?: Record<string,string>}} opciones
 */
async function crearTablas(dep, opciones = {}) {
  const { qRun, qRows } = dep;
  const extra = opciones.columnasExtra || {};
  // ⚠️ La clave foránea exige el mismo juego de caracteres e intercalación en las dos columnas. Las
  // tablas viejas de Skuld usan utf8mb4_unicode_ci y la intercalación por defecto es otra en MariaDB
  // y en MySQL 8 ("Foreign key constraint is incorrectly formed"). Se copia la de la columna destino.
  let cotejo = "";
  if (opciones.fkTenant) {
    const [, tabla, col] = /^(\w+)\((\w+)\)$/.exec(opciones.fkTenant) || [];
    const c = tabla ? (await qRows(
      "SELECT CHARACTER_SET_NAME AS cs, COLLATION_NAME AS co FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
      [tabla, col]))[0] : null;
    if (c?.cs && c?.co) cotejo = ` CHARACTER SET ${c.cs} COLLATE ${c.co}`;
  }
  const fk = opciones.fkTenant
    ? `,\n    CONSTRAINT fk_activos_tenant FOREIGN KEY (tenant_id) REFERENCES ${opciones.fkTenant} ON DELETE CASCADE`
    : "";

  const nucleoSql = COLUMNAS_NUCLEO.replace("tenant_id           VARCHAR(36)  NULL", `tenant_id           VARCHAR(36)${cotejo}  NULL`);
  await qRun(`CREATE TABLE IF NOT EXISTS activos (${nucleoSql}${
    Object.entries(extra).map(([c, def]) => `,\n    ${c} ${def}`).join("")},
    INDEX idx_act_tenant (tenant_id),
    INDEX idx_act_tipo (tenant_id, categoria, tipo),
    INDEX idx_act_estado (tenant_id, estado),
    INDEX idx_act_serie (serie),
    INDEX idx_act_padre (padre_id)${fk}
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Columnas agregadas después de la creación: se suman sin tocar las que ya están.
  const hay = await columnasDe(qRows, "activos");
  const nucleo = {};
  for (const l of COLUMNAS_NUCLEO.split("\n").map(x => x.trim()).filter(x => x && !x.startsWith("--"))) {
    const [col, ...resto] = l.replace(/,$/, "").split(/\s+/);
    if (col !== "id") nucleo[col] = resto.join(" ").replace(/\s+PRIMARY KEY/, "");
  }
  for (const [col, def] of Object.entries({ ...nucleo, ...extra })) {
    if (!hay.has(col)) await qRun(`ALTER TABLE activos ADD COLUMN ${col} ${def}`);
  }

  // Qué fuente reportó cada activo y qué dijo, tal cual. No se mezcla con el activo: se guarda
  // aparte para comparar y para saber de dónde salió cada dato.
  await qRun(`CREATE TABLE IF NOT EXISTS activo_fuentes (
    id          VARCHAR(36) PRIMARY KEY,
    activo_id   VARCHAR(36) NOT NULL,
    fuente      VARCHAR(20) NOT NULL,
    externo_id  VARCHAR(64) NULL,
    datos       JSON NULL,
    visto_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_af_activo_fuente (activo_id, fuente),
    INDEX idx_af_externo (fuente, externo_id),
    CONSTRAINT fk_af_activo FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Dos activos que podrían ser el mismo equipo. La ingesta no adivina: lo decide una persona.
  await qRun(`CREATE TABLE IF NOT EXISTS activo_uniones (
    id            VARCHAR(36) PRIMARY KEY,
    tenant_id     VARCHAR(36) NULL,
    activo_id     VARCHAR(36) NOT NULL,
    candidato_id  VARCHAR(36) NOT NULL,
    criterio      VARCHAR(200) NULL,
    fuente        VARCHAR(20) NULL,
    estado        ENUM('pendiente','unido','descartado') NOT NULL DEFAULT 'pendiente',
    resuelto_por  VARCHAR(120) NULL,
    resuelto_at   DATETIME NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_au_par (activo_id, candidato_id),
    INDEX idx_au_tenant (tenant_id, estado),
    CONSTRAINT fk_au_activo FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE CASCADE,
    CONSTRAINT fk_au_cand   FOREIGN KEY (candidato_id) REFERENCES activos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // 🔑 Historial campo por campo: quién, qué, cuándo, antes y después. No cuelga del activo por
  // clave foránea a propósito: un activo borrado por error tiene que seguir teniendo su historia.
  await qRun(`CREATE TABLE IF NOT EXISTS activo_historial (
    id          VARCHAR(36) PRIMARY KEY,
    tenant_id   VARCHAR(36) NULL,
    activo_id   VARCHAR(36) NOT NULL,
    accion      VARCHAR(20) NOT NULL,
    campo       VARCHAR(60) NULL,
    antes       TEXT NULL,
    despues     TEXT NULL,
    usuario     VARCHAR(120) NULL,
    ts          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ah_activo (activo_id, ts),
    INDEX idx_ah_tenant (tenant_id, ts)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Lo que vence. N por activo: garantía, soporte, fin de vida, licencia, contrato, certificado...
  await qRun(`CREATE TABLE IF NOT EXISTS activo_vencimientos (
    id              VARCHAR(36) PRIMARY KEY,
    tenant_id       VARCHAR(36) NULL,
    activo_id       VARCHAR(36) NOT NULL,
    tipo            VARCHAR(20) NOT NULL,
    descripcion     VARCHAR(300) NULL,
    fecha           DATE NOT NULL,
    costo_renovacion DECIMAL(14,2) NULL,
    moneda          VARCHAR(3) NULL,
    renovacion_auto TINYINT(1) NOT NULL DEFAULT 0,
    -- Quién recibe el aviso si no es el propietario del activo (p. ej. compras para una póliza).
    responsable     VARCHAR(200) NULL,
    responsable_correo VARCHAR(200) NULL,
    -- Días antes de la fecha en que se avisa, en JSON. NULL = los de la organización.
    avisos          JSON NULL,
    -- 'vigente' mientras corre; al renovar se carga la fecha nueva y queda 'renovado' el anterior.
    estado          ENUM('vigente','renovado','no_renovar') NOT NULL DEFAULT 'vigente',
    origen          VARCHAR(20) NOT NULL DEFAULT 'manual',
    notas           TEXT NULL,
    created_by      VARCHAR(120) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_av_fecha (tenant_id, estado, fecha),
    INDEX idx_av_activo (activo_id),
    CONSTRAINT fk_av_activo FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // 🔑 Registro de cada aviso enviado: es la evidencia de que se avisó (y a quién), y lo que
  // impide mandar el mismo aviso dos veces. Único por vencimiento y umbral.
  await qRun(`CREATE TABLE IF NOT EXISTS activo_avisos (
    id              VARCHAR(36) PRIMARY KEY,
    vencimiento_id  VARCHAR(36) NOT NULL,
    umbral          INT NOT NULL,
    destinatarios   VARCHAR(1000) NULL,
    resultado       VARCHAR(20) NOT NULL DEFAULT 'enviado',
    enviado_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_aa (vencimiento_id, umbral),
    CONSTRAINT fk_aa_venc FOREIGN KEY (vencimiento_id) REFERENCES activo_vencimientos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Entrega y devolución (A.5.10 y A.5.11): a quién se le dio, cuándo, si aceptó el uso aceptable
  // y si lo devolvió. Es lo que se revisa cuando una persona se va de la organización.
  await qRun(`CREATE TABLE IF NOT EXISTS activo_asignaciones (
    id              VARCHAR(36) PRIMARY KEY,
    tenant_id       VARCHAR(36) NULL,
    activo_id       VARCHAR(36) NOT NULL,
    persona         VARCHAR(200) NOT NULL,
    persona_correo  VARCHAR(200) NULL,
    entregado_at    DATE NOT NULL,
    acepto_uso      TINYINT(1) NOT NULL DEFAULT 0,
    devuelto_at     DATE NULL,
    estado_devolucion VARCHAR(300) NULL,
    notas           TEXT NULL,
    created_by      VARCHAR(120) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_as_activo (activo_id),
    INDEX idx_as_persona (tenant_id, persona),
    CONSTRAINT fk_as_activo FOREIGN KEY (activo_id) REFERENCES activos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Sincronización entre sistemas AllSafe (opcional). El que exporta emite un token de solo lectura del
  // inventario de UNA organización; se guarda solo su hash.
  await qRun(`CREATE TABLE IF NOT EXISTS activo_conectores (
    id            VARCHAR(36) PRIMARY KEY,
    tenant_id     VARCHAR(36) NULL,
    nombre        VARCHAR(120) NOT NULL,
    token_hash    CHAR(64) NOT NULL,
    creado_por    VARCHAR(120) NULL,
    ultimo_uso    DATETIME NULL,
    activo        TINYINT(1) NOT NULL DEFAULT 1,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ac_hash (token_hash),
    INDEX idx_ac_tenant (tenant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // El que importa guarda a dónde ir y con qué token. Una fila por organización.
  await qRun(`CREATE TABLE IF NOT EXISTS activo_sincronizaciones (
    id            VARCHAR(36) PRIMARY KEY,
    tenant_id     VARCHAR(36) NULL,
    url           VARCHAR(500) NOT NULL,
    token         VARCHAR(200) NOT NULL,
    habilitada    TINYINT(1) NOT NULL DEFAULT 1,
    ultimo_intento DATETIME NULL,
    ultimo_ok     DATETIME NULL,
    resultado     TEXT NULL,
    updated_by    VARCHAR(120) NULL,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_as_tenant (tenant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  return { columnas: await columnasDe(qRows, "activos"), indices: await indicesDe(qRows, "activos") };
}

module.exports = { crearTablas, CAMPOS, columnasDe };
