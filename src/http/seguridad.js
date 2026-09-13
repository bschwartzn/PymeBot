/**
 * Cabeceras de seguridad.
 *
 * Escritas a mano en vez de añadir Helmet: son cinco cabeceras, se entiende lo que hace
 * cada una, y evita una dependencia más en un proyecto que quiere quedarse simple.
 */

/**
 * Content-Security-Policy.
 *
 * Las páginas de PymeBot no tienen ni un script ni un estilo en línea, así que se puede
 * prohibir 'unsafe-inline' del todo: si alguien lograra inyectar un <script> en una
 * respuesta del bot, el navegador no lo ejecutaría.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * Qué páginas pueden ir dentro de un <iframe> de otro sitio.
 *
 * El chat del cliente SÍ tiene que poder: es exactamente lo que hace el widget que el dueño
 * pega en su página web. El panel NO: si se pudiera enmarcar, alguien montaría una página
 * encima para que el dueño hiciera clic en botones que no ve (clickjacking).
 */
function puedeIrEnIframe(ruta) {
  return ruta.startsWith('/c/') || ruta === '/widget.js';
}

function cabecerasDeSeguridad({ isProduction = false } = {}) {
  return function middleware(req, res, next) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');

    if (puedeIrEnIframe(req.path)) {
      // frame-ancestors * : cualquier pyme puede incrustar su chat en su propio sitio.
      res.set('Content-Security-Policy', `${CSP}; frame-ancestors *`);
    } else {
      res.set('Content-Security-Policy', `${CSP}; frame-ancestors 'none'`);
      res.set('X-Frame-Options', 'DENY'); // por navegadores antiguos sin frame-ancestors
    }

    // Solo con HTTPS: decirle al navegador que no vuelva a entrar por http.
    if (isProduction) {
      res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }

    next();
  };
}

module.exports = { cabecerasDeSeguridad, puedeIrEnIframe, CSP };
