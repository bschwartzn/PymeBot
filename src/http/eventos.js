/**
 * Avisos en tiempo real para el panel del dueño (Server-Sent Events).
 *
 * El panel abre una conexión que queda abierta, y el servidor escribe en ella cada vez que
 * un cliente manda un mensaje. Así la dueña ve la pregunta al instante, sin recargar.
 *
 * SSE y no WebSockets: el aviso va en un solo sentido (del servidor al panel), funciona
 * sobre HTTP normal detrás de cualquier proxy, el navegador reconecta solo si se corta, y
 * no hace falta ninguna dependencia.
 *
 * Vive en memoria, como el límite de peticiones: con una sola instancia del servidor
 * alcanza. Con varias, cada una avisaría solo a los paneles conectados a ella.
 */

/** Cada cuánto se manda un latido para que los proxies no corten la conexión inactiva. */
const LATIDO_MS = 25 * 1000;

/** Paneles abiertos a la vez por negocio. Una dueña con varios dispositivos usa unos pocos. */
const MAX_POR_NEGOCIO = 20;

class Avisos {
  constructor({ latidoMs = LATIDO_MS, maxPorNegocio = MAX_POR_NEGOCIO } = {}) {
    /** slug → Set de respuestas HTTP abiertas */
    this.abiertas = new Map();
    this.maxPorNegocio = maxPorNegocio;
    this.latido = setInterval(() => this.escribirATodos(': latido\n\n'), latidoMs);
    // El latido no debe mantener vivo el proceso al apagarlo.
    this.latido.unref();
  }

  /**
   * Deja abierta la respuesta `res` recibiendo los avisos del negocio `slug`.
   * @returns {boolean} false si ya hay demasiados paneles abiertos para ese negocio
   */
  suscribir(slug, req, res) {
    const conjunto = this.abiertas.get(slug) || new Set();
    if (conjunto.size >= this.maxPorNegocio) return false;

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx y algunos proxies guardan la respuesta antes de mandarla: esto lo evita.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // Si se corta, el navegador espera esto antes de reconectar.
    res.write('retry: 5000\n\n');

    conjunto.add(res);
    this.abiertas.set(slug, conjunto);

    req.on('close', () => {
      conjunto.delete(res);
      if (conjunto.size === 0) this.abiertas.delete(slug);
    });
    return true;
  }

  /** Avisa a los paneles abiertos de un negocio. */
  avisar(slug, evento, datos) {
    const conjunto = this.abiertas.get(slug);
    if (!conjunto) return 0;
    const mensaje = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
    for (const res of conjunto) res.write(mensaje);
    return conjunto.size;
  }

  escribirATodos(texto) {
    for (const conjunto of this.abiertas.values()) {
      for (const res of conjunto) res.write(texto);
    }
  }

  /** Cierra todas las conexiones: al apagar el servidor, para no dejarlo esperando. */
  cerrarTodo() {
    clearInterval(this.latido);
    for (const conjunto of this.abiertas.values()) {
      for (const res of conjunto) res.end();
    }
    this.abiertas.clear();
  }

  get size() {
    let total = 0;
    for (const conjunto of this.abiertas.values()) total += conjunto.size;
    return total;
  }
}

module.exports = { Avisos, LATIDO_MS, MAX_POR_NEGOCIO };
