/**
 * Errores de las rutas asíncronas: que ninguno pueda tirar el proceso. Módulo común a todos los
 * backends, incluidas las ediciones Community.
 *
 * 🔴 **Qué corrige (01/10/2026).** Express 4 no captura el rechazo de un handler `async`: queda
 * como promesa rechazada sin manejar y, desde Node 15, eso termina el proceso. Un pedido malformado
 * sin sesión (en el CRM, `POST /api/auth/login` con `password: {}`) tiraba el backend; PM2 lo
 * levantaba, y repitiéndolo se lo mantenía caído. En Heimdall, el señuelo recibe ese tráfico por
 * diseño.
 *
 * 🔑 **Cómo.** Se reemplaza `Layer.prototype.handle_request`, el punto por el que Express llama a
 * cada handler: si devuelve una promesa, su rechazo se pasa a `next(err)` y llega al manejador final
 * de errores del sistema, que responde 500 sin exponer el detalle. Es lo mismo que hace el paquete
 * `express-async-errors`; se escribe acá para no sumar una dependencia a nueve backends y para que
 * la prueba lo cubra.
 *
 * ⚠️ Se instala UNA vez al arrancar, antes de recibir pedidos. Afecta a todas las rutas, incluidas
 * las ya declaradas, porque el reemplazo es sobre el prototipo.
 *
 * Además, `unhandledRejection` se registra en vez de terminar el proceso: una promesa suelta fuera
 * de un pedido (una tarea de fondo) no tiene por qué apagar el sistema. `uncaughtException` sí
 * termina, porque deja el proceso en un estado desconocido; PM2 o Docker lo vuelven a levantar.
 */
"use strict";

function instalar({ registrar = console.error } = {}) {
  let Layer;
  try {
    Layer = require("express/lib/router/layer");
  } catch {
    throw new Error("async-seguro: no encuentro express/lib/router/layer (¿Express 5? Ese ya captura los rechazos y este módulo sobra)");
  }
  if (Layer.prototype.__asyncSeguro) return;

  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // es un manejador de errores, no de pedidos
    try {
      const r = fn(req, res, next);
      if (r && typeof r.then === "function") r.then(undefined, (e) => next(e || new Error("Rechazo sin motivo")));
    } catch (e) {
      next(e);
    }
  };
  Layer.prototype.__asyncSeguro = true;

  process.on("unhandledRejection", (e) => {
    registrar("[async-seguro] promesa rechazada sin manejar:", e && e.stack ? e.stack : e);
  });
}

module.exports = { instalar };
