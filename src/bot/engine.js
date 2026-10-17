/**
 * Motor de intenciones.
 *
 * Estrategia deliberadamente simple: cada intención declara palabras clave y una
 * respuesta. Se puntúa cuántas palabras clave aparecen en el mensaje y gana la
 * intención con mayor puntaje, siempre que supere un umbral mínimo de confianza.
 *
 * Es determinista, se testea con facilidad y no depende de ningún servicio externo.
 */

const { normalize, fold, tokenize, wordsMatch, casiIgual } = require('./text');

/**
 * Puntaje mínimo por defecto para aceptar una intención. Debajo de esto, respondemos el
 * respaldo. Cada negocio puede subirlo o bajarlo desde su panel: subirlo hace que el bot
 * responda menos pero se equivoque menos, bajarlo al revés.
 */
const CONFIDENCE_THRESHOLD = 1;

/**
 * Intenciones de cortesía: saludar, agradecer, cerrar, despedirse.
 *
 * Se tratan aparte porque sus palabras clave ("no", "ok", "hola", "nada") aparecen dentro de
 * preguntas de verdad. "¿No tienen estacionamiento?" no es un cierre de conversación, y
 * "hola, ¿atienden a domicilio?" no se contesta con un saludo. Solo ganan cuando el mensaje
 * es únicamente cortesía; si trae algo más, responde el tema o, si no lo hay, el respaldo.
 */
const PRIORIDAD_CORTESIA = ['despedida', 'agradecimiento', 'saludo', 'cierre'];
const CORTESIA = new Set(PRIORIDAD_CORTESIA);

/** Palabras de relleno que acompañan a la cortesía sin cambiarla ("muchas gracias por la info"). */
const RELLENO = new Set(
  ('a al de del el la las lo los y o que por para con me te le se mi tu su un una uno ' +
    'muy mucho muchas muchos todo toda eso esto era es fue ya si mas bueno buena bien super ' +
    'info informacion ayuda atencion amable entonces igual pues po nomas oye che tanto')
    .split(' '),
);

/**
 * Pedir hablar con una persona. Son frases, no palabras sueltas: "persona" sola aparece en
 * "¿cuánto cuesta por persona?", y "alguien" en "¿alguien me puede decir el horario?".
 */
const PIDE_PERSONA = [
  'hablar con una persona', 'hablar con alguien', 'hablar con un humano', 'hablar con una humana',
  'hablar con el dueno', 'hablar con la duena', 'hablar con un ejecutivo', 'hablar con una ejecutiva',
  'hablar con un agente', 'hablar con el encargado', 'hablar con la encargada',
  'hablar con el equipo', 'hablar con recepcion', 'una persona real', 'persona de verdad',
  'alguien de verdad', 'atencion humana', 'que me atienda alguien', 'me atienda una persona',
  'me puede atender alguien', 'quiero una persona', 'necesito una persona', 'pasame con alguien',
  'paseme con alguien', 'comunicarme con alguien', 'comunicarme con una persona', 'eres un bot',
  'eres un robot', 'eres una maquina',
];

function pideUnaPersona(mensajePlegado) {
  return PIDE_PERSONA.some((frase) => mensajePlegado.includes(` ${frase} `));
}

/** El umbral que corresponde a este negocio. */
function thresholdFor(business) {
  const propio = business && Number(business.confidenceThreshold);
  return Number.isFinite(propio) && propio > 0 ? propio : CONFIDENCE_THRESHOLD;
}

/**
 * Puntúa una palabra clave contra el mensaje del usuario.
 * Las claves de varias palabras ("cuanto cuesta") valen más que las de una sola,
 * porque son mucho más específicas.
 */
function scoreKeyword(keyword, messageTokens, paddedMessage, conocidas = new Set()) {
  // `fold` en vez de `normalize`: comparar tiene que ser indiferente a cómo se escribió la ñ.
  const normalizedKeyword = fold(keyword);
  if (!normalizedKeyword) return 0;

  const keywordWords = normalizedKeyword.split(' ');

  if (keywordWords.length > 1) {
    return contieneFrase(messageTokens, keywordWords) ? keywordWords.length * 1.5 : 0;
  }

  // Una palabra larga ("transferencia") es mejor señal que una corta ("hora").
  const peso = normalizedKeyword.length >= 6 ? 1.5 : 1;

  if (messageTokens.some((token) => wordsMatch(token, normalizedKeyword))) return peso;

  // Con una falta de ortografía cuenta un poco menos: si otra intención calza exacta, gana.
  // Una palabra que ya existe tal cual ("muchas", o la clave de otro tema) no es una falta
  // de ortografía: "muchas gracias" no tiene nada que ver con "mechas".
  const conFalta = messageTokens.some(
    (token) => !conocidas.has(fold(token)) && casiIgual(token, normalizedKeyword),
  );
  if (conFalta) return peso * 0.8;

  return 0;
}

/**
 * ¿El mensaje es solo cortesía? Cada palabra tiene que ser parte de una palabra clave de
 * cortesía o relleno. "no, eso era todo" sí; "no tienen estacionamiento" no.
 */
function esSoloCortesia(messageTokens, paddedMessage, intents) {
  const claves = intents.filter((i) => CORTESIA.has(i.id)).flatMap((i) => i.keywords || []);

  const cubiertas = new Set();
  for (const keyword of claves) {
    const plegada = fold(keyword);
    if (!plegada) continue;
    if (plegada.includes(' ')) {
      if (contieneFrase(messageTokens, plegada.split(' '))) plegada.split(' ').forEach((p) => cubiertas.add(p));
    } else {
      for (const token of messageTokens) {
        if (wordsMatch(token, plegada) || casiIgual(token, plegada)) cubiertas.add(fold(token));
      }
    }
  }

  return messageTokens.every((token) => cubiertas.has(fold(token)) || RELLENO.has(fold(token)));
}

/**
 * ¿Aparece la frase, palabra por palabra y seguida? Cada palabra tolera plural y verbo en
 * plural, así que "cuanto duran" encuentra la frase "cuanto dura" y "fines de semana" la
 * frase "fin de semana".
 */
function contieneFrase(messageTokens, palabras) {
  for (let i = 0; i + palabras.length <= messageTokens.length; i += 1) {
    if (palabras.every((palabra, j) => wordsMatch(messageTokens[i + j], palabra))) return true;
  }
  return false;
}

/** Puntúa una intención completa. */
function scoreIntent(intent, messageTokens, paddedMessage, conocidas) {
  let score = 0;
  for (const keyword of intent.keywords || []) {
    score += scoreKeyword(keyword, messageTokens, paddedMessage, conocidas);
  }
  return score;
}

/**
 * Busca la mejor intención para un mensaje.
 * @returns {{intent: object|null, score: number}}
 */
function matchIntent(message, business) {
  const messageTokens = tokenize(message);
  if (messageTokens.length === 0) return { intent: null, score: 0 };

  const paddedMessage = ` ${fold(message)} `;

  const umbral = thresholdFor(business);
  const intents = business.intents || [];

  // Las palabras que el negocio usa tal cual, más el relleno común del español.
  const conocidas = new Set(RELLENO);
  for (const intent of intents) {
    for (const keyword of intent.keywords || []) fold(keyword).split(' ').forEach((p) => conocidas.add(p));
  }

  // Primero los temas: si el mensaje pregunta algo, eso manda sobre el saludo que lo acompañe.
  let best = null;
  let bestScore = 0;
  for (const intent of intents) {
    if (CORTESIA.has(intent.id)) continue;
    const score = scoreIntent(intent, messageTokens, paddedMessage, conocidas);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  if (bestScore >= umbral) return { intent: best, score: bestScore };

  // Sin tema: la cortesía solo responde si el mensaje no trae nada más.
  // En un empate gana la que cierra la conversación: "ok chao" es una despedida.
  let cortesia = null;
  let cortesiaScore = 0;
  const porPrioridad = intents
    .filter((i) => CORTESIA.has(i.id))
    .sort((x, y) => PRIORIDAD_CORTESIA.indexOf(x.id) - PRIORIDAD_CORTESIA.indexOf(y.id));
  for (const intent of porPrioridad) {
    const score = scoreIntent(intent, messageTokens, paddedMessage, conocidas);
    if (score > cortesiaScore) {
      cortesia = intent;
      cortesiaScore = score;
    }
  }
  if (cortesiaScore >= umbral && esSoloCortesia(messageTokens, paddedMessage, intents)) {
    // Si se despide, se despide: "gracias, chao" cierra la conversación aunque "gracias"
    // pese más que "chao".
    const despedida = intents.find((i) => i.id === 'despedida');
    const scoreDespedida = despedida ? scoreIntent(despedida, messageTokens, paddedMessage, conocidas) : 0;
    if (scoreDespedida >= umbral) return { intent: despedida, score: scoreDespedida };
    return { intent: cortesia, score: cortesiaScore };
  }

  return { intent: null, score: Math.max(bestScore, cortesiaScore) };
}

/** Arma el mensaje de "no entendí" con la lista de temas que el negocio sí cubre. */
function buildFallback(business) {
  const topics = (business.topics || []).map((topic) => `• ${topic}`).join('\n');
  const parts = [business.fallback];
  if (topics) parts.push(topics);
  if (business.handoff) parts.push(business.handoff);
  return parts.filter(Boolean).join('\n');
}

/**
 * Genera la respuesta a un mensaje.
 *
 * `session` aporta el mínimo de contexto conversacional del MVP: saber si el bot ya
 * saludó, para no repetir el saludo largo en cada "hola".
 *
 * @returns {{reply: string, intent: string, score: number, matched: boolean}}
 */
function respond(message, business, session = null) {
  // Bot pausado: no se intenta entender nada, se responde lo que el dueño dejó escrito.
  if (business && business.active === false) {
    return {
      reply: business.pausedMessage || 'En este momento no estamos atendiendo por aquí.',
      intent: 'pausado',
      score: 0,
      matched: false,
    };
  }

  const normalized = normalize(message);

  if (!normalized) {
    // Sin texto real. Distinguimos dos casos que se ven iguales para el motor:
    // un mensaje realmente vacío, y uno que sí traía contenido (solo emojis o signos)
    // pero que la normalización dejó sin palabras. Decirle "no recibí nada" a quien
    // acaba de escribir 👍 es confuso, así que ese caso va al fallback normal.
    const escribioAlgo = typeof message === 'string' && message.trim() !== '';
    if (escribioAlgo) {
      return { reply: buildFallback(business), intent: 'fallback', score: 0, matched: false };
    }
    return {
      reply: 'No recibí ningún mensaje. ¿Me cuentas en qué te puedo ayudar?',
      intent: 'vacio',
      score: 0,
      matched: false,
    };
  }

  // Quien pide una persona tiene que recibir el contacto, no una respuesta automática más.
  // Si el negocio armó su propia intención para esto, se respeta la suya.
  const propia = (business.intents || []).find((i) => i.id === 'hablar_con_persona');
  if (!propia && business.handoff && pideUnaPersona(` ${fold(message)} `)) {
    return { reply: business.handoff, intent: 'hablar_con_persona', score: 0, matched: true };
  }

  const { intent, score } = matchIntent(message, business);

  if (!intent) {
    return { reply: buildFallback(business), intent: 'fallback', score, matched: false };
  }

  let reply = intent.answer;

  // Único comportamiento contextual del MVP: no repetir el saludo largo.
  if (intent.id === 'saludo' && session && session.greeted) {
    reply = business.greetingRepeat || reply;
  }

  return { reply, intent: intent.id, score, matched: true };
}

module.exports = { respond, matchIntent, buildFallback, thresholdFor, CONFIDENCE_THRESHOLD, CORTESIA };
