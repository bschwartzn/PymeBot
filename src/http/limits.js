/**
 * Límite de peticiones por IP.
 *
 * Sin dependencias: una ventana deslizante en memoria alcanza de sobra para el volumen de
 * un MVP y evita añadir Redis a un proyecto que todavía no lo necesita.
 *
 * Lo que NO hace: si algún día corren varias instancias, cada una cuenta por su lado. Para
 * frenar abuso automatizado sigue sirviendo; para un límite exacto haría falta algo
 * compartido.
 */

/** Crea un middleware que limita a `max` peticiones por IP en `windowMs`. */
function rateLimit({ max, windowMs, mensaje = 'Demasiadas peticiones. Espera un momento.' }) {
  /** IP → { desde, cuenta } */
  const visitas = new Map();

  function limpiar(ahora) {
    for (const [ip, visita] of visitas) {
      if (ahora - visita.desde > windowMs) visitas.delete(ip);
    }
  }

  return function middleware(req, res, next) {
    const ahora = Date.now();

    // Barrido perezoso: sin temporizadores que mantengan vivo el proceso al apagarlo.
    if (visitas.size > 5000) limpiar(ahora);

    // req.ip respeta 'trust proxy', así que detrás de un proxy es la IP real del cliente
    // y no la del proxy. Sin eso, todos los visitantes compartirían el mismo contador.
    const ip = req.ip || 'desconocida';
    const visita = visitas.get(ip);

    if (!visita || ahora - visita.desde > windowMs) {
      visitas.set(ip, { desde: ahora, cuenta: 1 });
      return next();
    }

    visita.cuenta += 1;

    if (visita.cuenta > max) {
      const faltan = Math.ceil((visita.desde + windowMs - ahora) / 1000);
      res.set('Retry-After', String(faltan));
      return res.status(429).json({ error: mensaje });
    }

    return next();
  };
}

module.exports = { rateLimit };
