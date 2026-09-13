/**
 * Configuración de entorno, en un solo lugar.
 *
 * Todo lo que cambia entre tu computador y el servidor de producción se lee aquí, no
 * repartido por el código. Así desplegar es definir unas pocas variables, y se ve de un
 * vistazo cuáles son.
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');

/** true en el servidor de producción. Cambia las cookies y el detalle de los errores. */
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Dónde se guardan negocios, cuentas y sesiones.
 *
 * En producción esto DEBE apuntar a un disco persistente. Si queda dentro del contenedor,
 * cada despliegue borra todas las cuentas y todos los negocios.
 */
const DATA_DIR = process.env.PYMEBOT_DATA_DIR
  ? path.resolve(process.env.PYMEBOT_DATA_DIR)
  : path.join(ROOT, 'data');

/**
 * Cuántos proxies hay delante del servidor.
 *
 * Render, Fly y Railway ponen exactamente uno. Importa porque la IP del cliente llega en
 * la cabecera X-Forwarded-For, y el límite de peticiones se cuenta por IP: si se confía en
 * la cabecera a ciegas, cualquiera la falsifica y el límite deja de servir para nada.
 */
const TRUST_PROXY = process.env.PYMEBOT_TRUST_PROXY === undefined
  ? 1
  : Number(process.env.PYMEBOT_TRUST_PROXY) || 0;

const config = {
  isProduction,
  port: Number(process.env.PORT) || 3000,

  dataDir: DATA_DIR,
  businessesDir: path.join(DATA_DIR, 'businesses'),
  usersFile: path.join(DATA_DIR, 'users.json'),
  sessionsFile: path.join(DATA_DIR, 'sessions.json'),
  conversationsDir: path.join(DATA_DIR, 'conversations'),

  trustProxy: TRUST_PROXY,

  /** Dirección pública, para los links compartidos y el QR. */
  publicUrl: (process.env.PYMEBOT_PUBLIC_URL || '').replace(/\/+$/, ''),

  /** Negocio que atiende el chat cuando no se pide uno en particular. */
  defaultBusiness: process.env.PYMEBOT_BUSINESS || 'dona-elba',

  /**
   * Límites de peticiones por IP. Son por instancia del servidor.
   * Generosos para una pyme real, suficientes para frenar un abuso automatizado.
   */
  limits: {
    chat: { max: Number(process.env.PYMEBOT_LIMIT_CHAT) || 30, windowMs: 60 * 1000 },
    auth: { max: Number(process.env.PYMEBOT_LIMIT_AUTH) || 30, windowMs: 15 * 60 * 1000 },
    write: { max: Number(process.env.PYMEBOT_LIMIT_WRITE) || 120, windowMs: 60 * 1000 },
  },
};

module.exports = config;
