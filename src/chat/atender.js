/**
 * Atender un mensaje. El núcleo de la conversación, sin saber nada de HTTP ni de la web.
 *
 * Esta es la frontera que hace que WhatsApp sea después un adaptador y no una reescritura.
 * Un canal solo tiene que traducir su formato a esto:
 *
 *     atender({ texto, negocio, canal: 'whatsapp', idExterno: '+56912345678' })
 *
 * y devolver el `reply` por donde corresponda. Todo lo demás —encontrar la conversación,
 * recordar el contexto, responder y dejar registro— ocurre aquí igual para todos.
 *
 * `idExterno` es la clave de la conversación EN SU CANAL: en la web, el identificador de
 * sesión que guarda el navegador; en WhatsApp, el número de teléfono. Esa sola diferencia
 * es todo lo que separa un canal del otro.
 */

const { respond } = require('../bot/engine');

/** Largo máximo de un mensaje. Un cliente real no escribe 2.000 caracteres. */
const MAX_LARGO = 1000;

class MensajeInvalido extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'MensajeInvalido';
  }
}

/**
 * @param {object} deps  { sessions, conversations }
 * @returns una función `atender` con las dependencias ya dentro.
 */
function crearAtencion({ sessions, conversations = null }) {
  /**
   * @param {object} entrada
   * @param {string} entrada.texto      lo que escribió la persona
   * @param {object} entrada.negocio    el negocio ya cargado y validado
   * @param {string} entrada.slug       su identificador, para el registro
   * @param {string} entrada.canal      'web', 'whatsapp', …
   * @param {string} [entrada.idExterno] identificador de la conversación en ese canal
   * @param {boolean} [entrada.registrar] false para las pruebas del dueño: no cuentan
   */
  return function atender({ texto, negocio, slug, canal = 'web', idExterno = null, registrar = true }) {
    if (typeof texto !== 'string' || texto.trim() === '') {
      throw new MensajeInvalido('El mensaje no puede estar vacío.');
    }
    if (texto.length > MAX_LARGO) {
      throw new MensajeInvalido(`El mensaje supera el máximo de ${MAX_LARGO} caracteres.`);
    }

    const sesion = sessions.get(idExterno);
    sessions.addMessage(sesion, 'user', texto);

    const resultado = respond(texto, negocio, sesion);

    sessions.addMessage(sesion, 'bot', resultado.reply);
    if (resultado.intent === 'saludo') sesion.greeted = true;

    // El registro nunca puede tumbar una conversación. Perder una línea de estadística es
    // molesto; dejar a un cliente sin respuesta porque el disco está lleno, no.
    if (registrar && conversations && slug) {
      try {
        conversations.registrar(slug, {
          conversationId: sesion.id,
          channel: canal,
          pregunta: texto,
          respuesta: resultado.reply,
          intent: resultado.intent,
          matched: resultado.matched,
          score: Number(resultado.score.toFixed(2)),
        });
      } catch (err) {
        console.error('No se pudo registrar la conversación:', err.message);
      }
    }

    return {
      conversacion: sesion.id,
      reply: resultado.reply,
      intent: resultado.intent,
      matched: resultado.matched,
      score: Number(resultado.score.toFixed(2)),
    };
  };
}

module.exports = { crearAtencion, MensajeInvalido, MAX_LARGO };
