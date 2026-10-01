/**
 * Desafío del segundo paso del ingreso. Módulo común a los sistemas que piden el código de doble
 * factor en una pantalla aparte (Skuld, Gjallarhorn y Heimdall).
 *
 * 🔴 **Qué corrige (01/10/2026).** El primer paso (usuario y contraseña) devolvía el id del usuario,
 * y el segundo (`verify-totp`) entregaba la sesión a quien mandara ese id con un código válido. Nada
 * probaba que se hubiera pasado por la contraseña: el doble factor quedaba reducido a uno. Tampoco
 * se miraba si la cuenta estaba deshabilitada o bloqueada.
 *
 * 🔑 **Cómo.** El primer paso entrega un desafío firmado, que vence a los cinco minutos y lleva la
 * versión del token del usuario. El segundo paso solo acepta un desafío válido: sin contraseña
 * correcta no hay desafío, y un cambio de contraseña en el medio lo invalida.
 *
 * ⚠️ **Se firma con una clave DERIVADA, no con el secreto de las sesiones.** Firmado con el mismo
 * secreto, el desafío sería un JWT válido para el middleware de autenticación, que podría aceptarlo
 * como sesión. Con la clave derivada, ninguno de los dos sirve en lugar del otro.
 */
"use strict";
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const PROPOSITO = "segundo-factor";
const VIGENCIA = "5m";
const MENSAJE_VENCIDO = "La verificación venció o no es válida. Volvé a ingresar usuario y contraseña.";

const clave = (secreto) => crypto.createHmac("sha256", String(secreto)).update("allsafe:desafio-2fa:v1").digest();

/** Lo emite el primer paso, recién después de comprobar la contraseña. */
function emitir(usuario, secreto) {
  return jwt.sign({ p: PROPOSITO, uid: String(usuario.id), tv: usuario.token_version || 0 },
    clave(secreto), { expiresIn: VIGENCIA, algorithm: "HS256" });
}

/**
 * Devuelve el usuario del desafío, o null si el desafío no es válido, venció, o la contraseña
 * cambió desde que se emitió. No mira la habilitación ni el bloqueo: eso lo decide quien llama,
 * con los mismos mensajes que el primer paso.
 */
async function usuario(qRow, desafio, secreto) {
  if (!desafio || typeof desafio !== "string") return null;
  let d;
  try {
    d = jwt.verify(desafio, clave(secreto), { algorithms: ["HS256"] });
  } catch {
    return null;
  }
  if (!d || d.p !== PROPOSITO || !d.uid) return null;
  const u = await qRow("SELECT * FROM users WHERE id = ?", [d.uid]);
  if (!u || (u.token_version || 0) !== d.tv) return null;
  return u;
}

module.exports = { emitir, usuario, MENSAJE_VENCIDO, VIGENCIA };
