/**
 * Motor de intenciones.
 *
 * Estrategia deliberadamente simple: cada intención declara palabras clave y una
 * respuesta. Se puntúa cuántas palabras clave aparecen en el mensaje y gana la
 * intención con mayor puntaje, siempre que supere un umbral mínimo de confianza.
 *
 * Es determinista, se testea con facilidad y no depende de ningún servicio externo.
 */

const { normalize, fold, tokenize, wordsMatch } = require('./text');

/** Puntaje mínimo para aceptar una intención. Debajo de esto, respondemos el fallback. */
const CONFIDENCE_THRESHOLD = 1;

/**
 * Puntúa una palabra clave contra el mensaje del usuario.
 * Las claves de varias palabras ("cuanto cuesta") valen más que las de una sola,
 * porque son mucho más específicas.
 */
function scoreKeyword(keyword, messageTokens, paddedMessage) {
  // `fold` en vez de `normalize`: comparar tiene que ser indiferente a cómo se escribió la ñ.
  const normalizedKeyword = fold(keyword);
  if (!normalizedKeyword) return 0;

  const keywordWords = normalizedKeyword.split(' ');

  if (keywordWords.length > 1) {
    return paddedMessage.includes(` ${normalizedKeyword} `) ? keywordWords.length * 1.5 : 0;
  }

  const found = messageTokens.some((token) => wordsMatch(token, normalizedKeyword));
  if (!found) return 0;

  // Una palabra larga ("transferencia") es mejor señal que una corta ("hora").
  return normalizedKeyword.length >= 6 ? 1.5 : 1;
}

/** Puntúa una intención completa. */
function scoreIntent(intent, messageTokens, paddedMessage) {
  let score = 0;
  for (const keyword of intent.keywords || []) {
    score += scoreKeyword(keyword, messageTokens, paddedMessage);
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

  let best = null;
  let bestScore = 0;

  for (const intent of business.intents || []) {
    const score = scoreIntent(intent, messageTokens, paddedMessage);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }

  if (bestScore < CONFIDENCE_THRESHOLD) return { intent: null, score: bestScore };
  return { intent: best, score: bestScore };
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

module.exports = { respond, matchIntent, buildFallback, CONFIDENCE_THRESHOLD };
