/**
 * Qué preguntan los clientes, y qué no supo responder el bot.
 *
 * La métrica que de verdad le sirve al dueño no es cuántos mensajes recibió: es la lista
 * de preguntas que su bot NO supo contestar. Cada una es una respuesta que le falta
 * configurar, y arreglarla es trabajo de dos minutos.
 */

const { normalize } = require('../bot/text');

const DIAS_POR_DEFECTO = 14;

function diaDe(iso) {
  return String(iso).slice(0, 10);
}

/** Agrupa preguntas parecidas para no repetir veinte veces la misma. */
function agrupar(registros, clave) {
  const grupos = new Map();

  for (const registro of registros) {
    const k = clave(registro);
    if (!k) continue;

    if (!grupos.has(k)) grupos.set(k, { clave: k, veces: 0, ejemplo: registro.pregunta, ultima: registro.at });
    const grupo = grupos.get(k);
    grupo.veces += 1;
    if (registro.at > grupo.ultima) {
      grupo.ultima = registro.at;
      grupo.ejemplo = registro.pregunta;
    }
  }

  return [...grupos.values()].sort((a, b) => b.veces - a.veces || (a.clave < b.clave ? -1 : 1));
}

/**
 * Resume la actividad de un negocio.
 * @param {Array} registros lo que devuelve ConversationLog.leer
 */
function resumir(registros, { dias = DIAS_POR_DEFECTO, ahora = Date.now() } = {}) {
  const desde = new Date(ahora - dias * 24 * 60 * 60 * 1000).toISOString();
  const recientes = registros.filter((r) => r.at >= desde);

  const conversaciones = new Set(recientes.map((r) => r.conversationId));
  const sinRespuesta = recientes.filter((r) => r.matched === false && r.intent !== 'pausado');

  // Los días se rellenan aunque no haya tráfico: un hueco en el gráfico también informa.
  const porDia = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    const dia = diaDe(new Date(ahora - i * 24 * 60 * 60 * 1000).toISOString());
    porDia.push({ dia, mensajes: recientes.filter((r) => diaDe(r.at) === dia).length });
  }

  return {
    dias,
    mensajes: recientes.length,
    conversaciones: conversaciones.size,
    mensajesPorConversacion: conversaciones.size
      ? Number((recientes.length / conversaciones.size).toFixed(1))
      : 0,

    // El número que le importa al dueño: cuánto NO supo responder su bot.
    sinRespuesta: sinRespuesta.length,
    tasaDeAcierto: recientes.length
      ? Number((((recientes.length - sinRespuesta.length) / recientes.length) * 100).toFixed(1))
      : null,

    porDia,

    /** Las preguntas que el bot no supo responder, agrupadas y de mayor a menor. */
    preguntasSinRespuesta: agrupar(sinRespuesta, (r) => normalize(r.pregunta)).slice(0, 25),

    /** De qué temas preguntan más, entre los que sí sabe responder. */
    temasMasPreguntados: agrupar(
      recientes.filter((r) => r.matched),
      (r) => r.intent,
    ).slice(0, 12),

    canales: agrupar(recientes, (r) => r.channel || 'web'),
  };
}

/**
 * Reconstruye las conversaciones a partir del registro plano.
 *
 * El registro guarda un intercambio por línea; aquí se juntan los de una misma
 * conversación para poder LEERLAS, no solo contarlas. Ver qué le dijo un cliente de verdad
 * al bot vale más que cualquier cifra: es donde se descubre que la respuesta era correcta
 * pero sonaba seca, o que la persona preguntó tres veces lo mismo de distinta forma.
 */
function conversaciones(registros, { limite = 50 } = {}) {
  const porId = new Map();

  for (const registro of registros) {
    const id = registro.conversationId || 'sin-id';

    if (!porId.has(id)) {
      porId.set(id, {
        id,
        canal: registro.channel || 'web',
        inicio: registro.at,
        fin: registro.at,
        mensajes: [],
        sinRespuesta: 0,
      });
    }

    const conversacion = porId.get(id);
    conversacion.fin = registro.at;
    conversacion.mensajes.push({
      at: registro.at,
      pregunta: registro.pregunta,
      respuesta: registro.respuesta,
      intent: registro.intent,
      matched: registro.matched,
    });
    if (registro.matched === false && registro.intent !== 'pausado') conversacion.sinRespuesta += 1;
  }

  // Las más recientes primero: es lo que el dueño quiere mirar al entrar.
  return [...porId.values()].sort((a, b) => (a.fin < b.fin ? 1 : -1)).slice(0, limite);
}

module.exports = { resumir, agrupar, conversaciones };
