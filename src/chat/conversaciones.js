/**
 * Registro de conversaciones.
 *
 * Un archivo por negocio, una línea JSON por mensaje (formato JSONL). Se escribe
 * añadiendo al final, nunca reescribiendo: es barato, resiste un corte a mitad de
 * escritura —se pierde como mucho la última línea— y se puede leer con cualquier cosa.
 *
 * Para qué sirve: las conversaciones dejan de perderse al reiniciar, y sobre todo se
 * puede MEDIR qué preguntan los clientes y qué preguntas el bot no supo responder. Eso
 * último es lo más útil que le podemos dar al dueño de un negocio.
 */

const fs = require('fs');
const path = require('path');

const { conversationsDir } = require('../config');
const { isValidSlug } = require('../knowledge/schema');

/** Cuántas líneas se leen al calcular métricas. Evita cargar un archivo enorme en memoria. */
const MAX_LINEAS = 20000;

class ConversationLog {
  constructor({ dir = conversationsDir } = {}) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** El slug viene de fuera, así que aquí se corta el paso a rutas inventadas. */
  pathFor(slug) {
    if (!isValidSlug(slug)) return null;
    const file = path.join(this.dir, `${slug}.jsonl`);
    if (path.dirname(path.resolve(file)) !== path.resolve(this.dir)) return null;
    return file;
  }

  /**
   * Anota un intercambio: lo que escribió el cliente y lo que respondió el bot.
   * Nunca lanza: perder una línea del registro no puede tumbar una conversación.
   */
  registrar(slug, { conversationId, channel, pregunta, respuesta, intent, matched, score }) {
    const file = this.pathFor(slug);
    if (!file) return false;

    const linea = JSON.stringify({
      at: new Date().toISOString(),
      conversationId,
      channel,
      pregunta,
      respuesta,
      intent,
      matched,
      score,
    });

    try {
      fs.appendFileSync(file, `${linea}\n`, 'utf8');
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Todos los intercambios de un negocio, del más antiguo al más reciente. */
  leer(slug) {
    const file = this.pathFor(slug);
    if (!file || !fs.existsSync(file)) return [];

    let lineas;
    try {
      lineas = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    } catch (err) {
      return [];
    }

    // Solo las más recientes: un negocio con mucho tráfico no debe hacer lenta la métrica.
    if (lineas.length > MAX_LINEAS) lineas = lineas.slice(-MAX_LINEAS);

    const registros = [];
    for (const linea of lineas) {
      try {
        registros.push(JSON.parse(linea));
      } catch (err) {
        // Una línea a medias (por un corte al escribir) se ignora; el resto sirve igual.
      }
    }
    return registros;
  }

  borrar(slug) {
    const file = this.pathFor(slug);
    if (!file || !fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }
}

module.exports = { ConversationLog, MAX_LINEAS };
