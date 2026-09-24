/**
 * TOTP (RFC 6238) del lado del servidor: generar el secreto, armar el URI de alta y verificar
 * el codigo de seis digitos.
 *
 * 🔑 **Este archivo es la fuente canonica y se copia igual a cada producto**, como el modulo de
 * licencias. Nace de encontrar OCHO implementaciones distintas del mismo algoritmo repartidas en
 * los backends, con SEIS variantes de codigo y dos ventanas de tolerancia diferentes: el segundo
 * factor es lo ultimo que conviene tener duplicado, porque cada copia envejece sola y la unica
 * forma de enterarse es que alguien no pueda entrar.
 *
 * ⚠️ **La ventana de tolerancia es de ±2 pasos, un minuto en total, y hay que MEDIRLA, no leerla.**
 * Estuvo en ±10 en tres sistemas, que son diez minutos: un codigo visto por encima del hombro, o
 * que quedo en una captura mandada por mensajeria, seguia sirviendo diez minutos despues, y en vez
 * de haber un codigo valido por vez habia veintiuno. Un minuto cubre de sobra un reloj de telefono
 * desincronizado, que es lo que se buscaba al abrirla. La prueba de `pruebas/totp.test.js` genera
 * codigos a distintos desfasajes y comprueba cual acepta, para que el numero del comentario no
 * pueda separarse del que corre.
 *
 * ⚠️ **Verificar NUNCA lanza.** Una entrada que no sea una cadena de seis digitos es "codigo
 * incorrecto", no un error 500. El campo de la pantalla ya filtra, pero un pedido armado a mano no
 * pasa por la pantalla.
 */

const crypto = require("crypto");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Pasos de 30 s de tolerancia hacia atras y hacia adelante. Un solo lugar donde vive el numero. */
const VENTANA_PASOS = 2;

/** Duracion de cada paso, en segundos. Es el estandar y no se toca. */
const PASO_SEGUNDOS = 30;

/** Convierte un secreto en base32 a bytes. Ignora lo que no sea del alfabeto, incluido el padding. */
function base32ABytes(secreto) {
  let bits = "";
  for (const ch of String(secreto).toUpperCase().replace(/=+$/, "")) {
    const i = B32.indexOf(ch);
    if (i === -1) continue;
    bits += i.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** El codigo HOTP de seis digitos para un contador dado. */
function codigoDe(secreto, contador) {
  const clave = base32ABytes(secreto);
  if (!clave.length) return null;
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(contador / 0x100000000), 0);
  msg.writeUInt32BE(contador >>> 0, 4);
  const hmac = crypto.createHmac("sha1", clave).update(msg).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const num = ((hmac[off] & 0x7f) << 24 | hmac[off + 1] << 16 | hmac[off + 2] << 8 | hmac[off + 3]) % 1000000;
  return String(num).padStart(6, "0");
}

/**
 * Verifica un codigo contra el secreto.
 *
 * `ahora` se puede pasar para probar, en milisegundos. En produccion no se pasa.
 */
function verificar(secreto, codigo, { ahora = Date.now() } = {}) {
  // ⚠️ La FORMA se valida antes de tocar criptografia: exactamente seis digitos, nada mas.
  if (typeof codigo !== "string" || !/^[0-9]{6}$/.test(codigo.trim())) return false;
  const esperado = codigo.trim();
  try {
    const paso = Math.floor(ahora / 1000 / PASO_SEGUNDOS);
    for (let i = -VENTANA_PASOS; i <= VENTANA_PASOS; i++) {
      const c = codigoDe(secreto, paso + i);
      // 🔑 Comparacion en tiempo constante: dos cadenas de seis digitos filtran poco, pero no
      // cuesta nada y evita que esto sea el ejemplo de manual que alguien cite despues.
      if (c && c.length === esperado.length &&
          crypto.timingSafeEqual(Buffer.from(c), Buffer.from(esperado))) return true;
    }
    return false;
  } catch {
    // Un secreto invalido o cualquier otra sorpresa es "codigo incorrecto", no una excepcion.
    return false;
  }
}

/** Secreto nuevo en base32, de 32 caracteres, con aleatoriedad criptografica. */
function generarSecreto(largo = 32) {
  const bytes = crypto.randomBytes(largo);
  let s = "";
  for (let i = 0; i < largo; i++) s += B32[bytes[i] % 32];
  return s;
}

/**
 * URI `otpauth://` para el QR de alta.
 *
 * ⚠️ **La cuenta y el emisor se escapan.** Un nombre de usuario con un `:` o un `&` parte el URI
 * y la app de autenticacion queda con una entrada rota o, peor, con otra cuenta.
 */
function uriDeAlta(secreto, cuenta, emisor = "AllSafe") {
  const e = encodeURIComponent(emisor);
  const c = encodeURIComponent(String(cuenta || ""));
  return `otpauth://totp/${e}:${c}?secret=${secreto}&issuer=${e}&algorithm=SHA1&digits=6&period=${PASO_SEGUNDOS}`;
}

module.exports = { verificar, generarSecreto, uriDeAlta, codigoDe, base32ABytes,
                   VENTANA_PASOS, PASO_SEGUNDOS };
