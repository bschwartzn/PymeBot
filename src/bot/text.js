/**
 * Utilidades de texto.
 *
 * El objetivo es que "¿Cuánto CUESTA?" y "cuanto cuesta" sean lo mismo para el motor.
 * En español esto significa: minúsculas, sin acentos, sin signos de puntuación
 * (incluidos ¿ ¡) y sin espacios sobrantes.
 */

/** Pasa un texto a su forma canónica comparable. */
function normalize(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    // La ñ es una letra propia del español, no una n con acento: se protege antes de
    // que NFD la descomponga, o 'año' se convertiría en 'ano'.
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita los acentos ya separados por NFD
    .replace(/\u0001/g, 'ñ')
    .replace(/[^a-z0-9ñ\s]/g, ' ') // ¿ ? ! . , y emojis se vuelven espacio
    .replace(/\s+/g, ' ')
    .trim();
}

/** Divide un texto normalizado en palabras. */
function tokenize(text) {
  const normalized = normalize(text);
  return normalized ? normalized.split(' ') : [];
}

/**
 * Compara dos palabras tolerando el plural del español.
 * "horarios" debe encontrar la palabra clave "horario", y "precio" la clave "precios".
 */
function wordsMatch(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return false; // evita que "la"/"las" cuenten como coincidencia
  return long === short + 's' || long === short + 'es';
}

module.exports = { normalize, tokenize, wordsMatch };
