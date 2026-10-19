"use strict";
/**
 * Taxonomía del inventario de activos. Canónico: se copia igual a Skuld y a Gjallarhorn.
 *
 * 🔑 **Una sola lista de qué es un activo.** Skuld tenía siete tablas, una por tipo, y Gjallarhorn
 * una sola de equipos de red. Con dos taxonomías, un mismo servidor era "servidor" en un sistema y
 * "host" en el otro, y no había forma de reconciliarlos. Acá se define una vez.
 *
 * Las categorías siguen ISO/IEC 27005 (activos primarios y de soporte) agrupadas como las usa un
 * relevamiento real: lo que se toca (hardware), lo que corre (software), lo que se consume
 * (servicios), lo que se protege (información), lo que vale sin ser tangible y dónde está todo.
 */

const CATEGORIAS = {
  hardware: {
    nombre: "Hardware",
    tipos: {
      servidor: "Servidor", pc: "Puesto de trabajo", notebook: "Notebook", movil: "Dispositivo móvil",
      thin_client: "Thin client", workstation: "Estación de alto rendimiento", red: "Equipo de red",
      seguridad: "Equipo de seguridad (firewall, UTM)", almacenamiento: "Almacenamiento (NAS, SAN, cabina)",
      energia: "Energía (UPS, SAI)", impresora: "Impresora", iot: "IoT y OT", periferico: "Periférico",
      otro_hw: "Otro hardware",
    },
  },
  software: {
    nombre: "Software",
    tipos: {
      aplicacion: "Aplicación", licencia: "Licencia de software", sistema_operativo: "Sistema operativo",
      base_datos_motor: "Motor de base de datos", firmware: "Firmware", desarrollo_propio: "Desarrollo propio",
    },
  },
  servicio: {
    nombre: "Servicios",
    tipos: {
      interno: "Servicio interno", saas: "SaaS", nube: "Infraestructura en la nube",
      expuesto: "Servicio expuesto a Internet", proveedor: "Servicio de un proveedor",
      dominio: "Dominio", certificado: "Certificado digital",
    },
  },
  informacion: {
    nombre: "Información",
    tipos: {
      base_datos: "Base de datos", documentos: "Documentos", archivos: "Archivos", correos: "Correo",
      respaldos: "Respaldos", codigo: "Código fuente", credenciales: "Credenciales y secretos",
      papel: "Información en papel",
    },
  },
  intangible: {
    nombre: "Intangibles",
    tipos: {
      reputacion: "Reputación", propiedad_intelectual: "Propiedad intelectual", proceso: "Proceso",
      marca: "Marca", know_how: "Conocimiento (know-how)", certificacion: "Certificación",
    },
  },
  instalacion: {
    nombre: "Instalaciones",
    tipos: { sede: "Sede", datacenter: "Centro de datos o sala de servidores", rack: "Rack", oficina: "Oficina" },
  },
};

/** tipo -> categoría, para validar que el par sea coherente. */
const CATEGORIA_DE = {};
for (const [cat, def] of Object.entries(CATEGORIAS)) for (const t of Object.keys(def.tipos)) CATEGORIA_DE[t] = cat;

/**
 * Ciclo de vida. `baja` saca al activo de los avisos de vencimiento y de los tableros, pero NO lo
 * borra: ISO 27001 A.7.14 pide poder demostrar cómo se dispuso de un equipo que guardaba datos.
 * Borrar es para un error de carga, y queda en el historial igual.
 */
const ESTADOS = {
  planificado: "Planificado", alta: "En alta", produccion: "En producción", almacen: "En depósito",
  prestamo: "Prestado", reparacion: "En reparación (RMA)", retiro: "En retiro", baja: "Dado de baja",
};
const ESTADOS_INACTIVOS = ["baja"];

const CRITICIDAD = ["baja", "media", "alta", "critica"];
const CLASIFICACION = ["publica", "interna", "confidencial", "restringida"];

/** Cómo se dispuso de un activo dado de baja (NIST SP 800-88 para los medios con datos). */
const DISPOSICION = {
  borrado_seguro: "Borrado seguro", destruccion: "Destrucción física", donacion: "Donación",
  venta: "Venta", devolucion_proveedor: "Devolución al proveedor", reciclaje: "Reciclaje", otro: "Otro",
};

/**
 * 🔑 **Lo que vence.** Es lo que no existía en ningún sistema: hasta ahora la única fecha era la de
 * las licencias de Skuld. Un activo tiene N vencimientos, no un campo por tipo, porque un mismo
 * servidor tiene garantía, contrato de soporte y fin de vida del fabricante a la vez.
 */
const TIPOS_VENCIMIENTO = {
  garantia: "Garantía", soporte: "Fin de soporte del fabricante", fin_vida: "Fin de vida (EOL)",
  licencia: "Licencia o suscripción", contrato: "Contrato de mantenimiento", certificado: "Certificado digital",
  dominio: "Dominio", poliza: "Póliza de seguro", calibracion: "Calibración o revisión", revision: "Revisión del activo",
  otro: "Otro",
};

/** Avisos por defecto, en días antes de la fecha. El 0 es el día que vence. */
const AVISOS_DEFECTO = [90, 60, 30, 7, 0];

/** Fuentes de las que puede venir un activo. `manual` es lo declarado por una persona. */
const FUENTES = ["manual", "csv", "huginn", "zabbix", "glpi", "sondeo", "skuld", "gjallarhorn", "propio"];

/** Lo verificado en la red frente a lo declarado: así se distingue el origen del dato. */
const FUENTES_VERIFICADAS = ["huginn", "zabbix", "glpi", "sondeo", "gjallarhorn", "propio"];

module.exports = {
  CATEGORIAS, CATEGORIA_DE, ESTADOS, ESTADOS_INACTIVOS, CRITICIDAD, CLASIFICACION, DISPOSICION,
  TIPOS_VENCIMIENTO, AVISOS_DEFECTO, FUENTES, FUENTES_VERIFICADAS,
};
