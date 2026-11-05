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

/** Lo que se le agrega al contacto cuando el cliente pide una persona. */
const AVISO_PERSONA = 'Ya le avisé al equipo: si alguien está disponible, te escribirá aquí mismo.';

/** Lo que ve el cliente cuando la dueña entra o sale de la conversación. */
const AVISO_TOMADA = 'Te está atendiendo una persona del equipo.';
const AVISO_DEVUELTA = 'Te dejo de nuevo con el asistente automático. ¿En qué más te ayudo?';

/**
 * @param {object} deps  { sessions, conversations }
 * @returns una función `atender` con las dependencias ya dentro, más las acciones de la
 *   dueña sobre una conversación en curso (responderComoDueno, tomar, devolver).
 */
function crearAtencion({ sessions, conversations = null }) {
  /**
   * Anota una línea en el registro. Nunca lanza: perder una línea de estadística es
   * molesto; dejar a un cliente sin respuesta porque el disco está lleno, no.
   */
  function registrarEnElLog({ registrar = true, slug, sesion, canal, prueba, enVivo = false, autor = null, ...linea }) {
    if (!registrar || !conversations || !slug) return;
    try {
      conversations.registrar(slug, {
        conversationId: sesion.id,
        channel: canal,
        matched: true,
        score: 0,
        ...linea,
        prueba,
        enVivo,
        autor,
      });
    } catch (err) {
      console.error('No se pudo registrar la conversación:', err.message);
    }
  }

  /**
   * @param {object} entrada
   * @param {string} entrada.texto      lo que escribió la persona
   * @param {object} entrada.negocio    el negocio ya cargado y validado
   * @param {string} entrada.slug       su identificador, para el registro
   * @param {string} entrada.canal      'web', 'whatsapp', …
   * @param {string} [entrada.idExterno] identificador de la conversación en ese canal
   * @param {boolean} [entrada.registrar] false para no dejar ningún registro
   * @param {boolean} [entrada.prueba] la dueña probando su bot: se guarda marcado, para
   *   que pueda leerlo, pero no cuenta en las cifras
   */
  function atender({ texto, negocio, slug, canal = 'web', idExterno = null, registrar = true, prueba = false }) {
    if (typeof texto !== 'string' || texto.trim() === '') {
      throw new MensajeInvalido('El mensaje no puede estar vacío.');
    }
    if (texto.length > MAX_LARGO) {
      throw new MensajeInvalido(`El mensaje supera el máximo de ${MAX_LARGO} caracteres.`);
    }

    const sesion = sessions.get(idExterno);
    // De qué negocio es la conversación: el panel lista solo las suyas.
    sesion.slug = slug;
    sesion.canal = canal;
    sesion.prueba = prueba;
    sessions.addMessage(sesion, 'user', texto);

    // La dueña tomó la conversación: el bot se calla y el mensaje le llega a ella.
    if (sesion.modo === 'persona') {
      registrarEnElLog({ registrar, slug, sesion, canal, prueba, pregunta: texto, respuesta: null, intent: 'en_vivo', enVivo: true });
      return { conversacion: sesion.id, reply: null, intent: 'en_vivo', matched: true, score: 0, enVivo: true };
    }

    const resultado = respond(texto, negocio, sesion);

    // Pidió una persona: el bot le da el contacto y sigue respondiendo, pero la dueña ve en
    // el panel que alguien la espera y puede entrar a la conversación desde ahí.
    if (resultado.intent === 'hablar_con_persona') {
      sesion.esperaPersona = true;
      resultado.reply = `${resultado.reply}\n\n${AVISO_PERSONA}`;
    }

    sessions.addMessage(sesion, 'bot', resultado.reply);
    if (resultado.intent === 'saludo') sesion.greeted = true;

    registrarEnElLog({
      registrar,
      slug,
      sesion,
      canal,
      prueba,
      pregunta: texto,
      respuesta: resultado.reply,
      intent: resultado.intent,
      matched: resultado.matched,
      score: Number(resultado.score.toFixed(2)),
    });

    return {
      conversacion: sesion.id,
      reply: resultado.reply,
      intent: resultado.intent,
      matched: resultado.matched,
      score: Number(resultado.score.toFixed(2)),
    };
  }

  /**
   * Lo que hace la dueña desde el panel con una conversación en curso. Cada acción le deja
   * al cliente un mensaje que su chat recoge solo, sin recargar.
   */
  function sesionDe(slug, id) {
    const sesion = sessions.find(id);
    return sesion && sesion.slug === slug ? sesion : null;
  }

  /** La dueña escribe: la conversación pasa a ser suya y el bot deja de responder. */
  function responderComoDueno({ slug, id, texto }) {
    if (typeof texto !== 'string' || texto.trim() === '') {
      throw new MensajeInvalido('El mensaje no puede estar vacío.');
    }
    if (texto.length > MAX_LARGO) {
      throw new MensajeInvalido(`El mensaje supera el máximo de ${MAX_LARGO} caracteres.`);
    }
    const sesion = sesionDe(slug, id);
    if (!sesion) return null;

    sesion.modo = 'persona';
    sesion.esperaPersona = false;
    sessions.addMessage(sesion, 'dueno', texto.trim());
    registrarEnElLog({
      slug, sesion, canal: sesion.canal, prueba: sesion.prueba,
      pregunta: null, respuesta: texto.trim(), intent: 'dueno', enVivo: true, autor: 'dueno',
    });
    return sesion;
  }

  /** La dueña toma la conversación sin escribir todavía: el bot se calla desde ya. */
  function tomar({ slug, id }) {
    const sesion = sesionDe(slug, id);
    if (!sesion) return null;
    if (sesion.modo !== 'persona') {
      sesion.modo = 'persona';
      sessions.addMessage(sesion, 'sistema', AVISO_TOMADA);
    }
    return sesion;
  }

  /** La dueña devuelve la conversación: el bot vuelve a responder. */
  function devolver({ slug, id }) {
    const sesion = sesionDe(slug, id);
    if (!sesion) return null;
    sesion.esperaPersona = false;
    if (sesion.modo !== 'bot') {
      sesion.modo = 'bot';
      sessions.addMessage(sesion, 'sistema', AVISO_DEVUELTA);
    }
    return sesion;
  }

  atender.responderComoDueno = responderComoDueno;
  atender.tomar = tomar;
  atender.devolver = devolver;
  return atender;
}

module.exports = { crearAtencion, MensajeInvalido, MAX_LARGO, AVISO_PERSONA, AVISO_TOMADA, AVISO_DEVUELTA };
