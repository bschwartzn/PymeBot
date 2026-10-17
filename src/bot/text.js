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

/**
 * Forma usada solo para COMPARAR, no para mostrar.
 *
 * Añade a la normalización el plegado de la ñ. La ñ se conserva en `normalize` porque es
 * una letra propia del español, pero al comparar tiene que dar igual cómo se escribió:
 * el dueño del negocio escribe la palabra clave "cumpleanos" y el cliente pregunta por
 * "cumpleaños". Confundir "año" con "ano" es un riesgo teórico; que no coincidan las
 * palabras clave escritas sin ñ es un fallo que ocurre todos los días.
 */
function fold(text) {
  return alargadas(normalize(text).replace(/ñ/g, 'n'));
}

/**
 * Deshace las letras alargadas: "holaaa" → "hola", "graciasss" → "gracias".
 * Solo tres o más repeticiones: dos letras iguales seguidas son ortografía normal ("lluvia",
 * "acceso") y no se tocan.
 */
function alargadas(texto) {
  return texto.replace(/([a-z])\1{2,}/g, '$1');
}

/** Divide un texto normalizado en palabras. */
function tokenize(text) {
  const normalized = alargadas(normalize(text));
  return normalized ? normalized.split(' ') : [];
}

/**
 * Compara dos palabras tolerando el plural del español.
 * "horarios" debe encontrar la palabra clave "horario", y "precio" la clave "precios"; y
 * "cuestan" la clave "cuesta".
 */
function wordsMatch(rawA, rawB) {
  const a = rawA.replace(/ñ/g, 'n');
  const b = rawB.replace(/ñ/g, 'n');
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return false; // evita que "la"/"las" cuenten como coincidencia
  if (long === short + 's' || long === short + 'es') return true;
  // El verbo en plural: "dura" y "duran", "cuesta" y "cuestan", "abre" y "abren".
  return /[aeiou]$/.test(short) && long === short + 'n';
}

/**
 * ¿Es una falta de ortografía de la palabra clave? "presios" por "precios", "masjae" por
 * "masaje", "rezerva" por "reserva".
 *
 * Una sola letra de diferencia (cambiada, sobrante, faltante o dos letras traspuestas), y
 * solo entre palabras de 6 letras o más que empiezan igual: en palabras cortas una letra
 * cambia el sentido ("caro" y "cara", "corro" y "correo"), y casi nadie se equivoca en la
 * primera letra.
 */
function casiIgual(rawA, rawB) {
  const a = rawA.replace(/ñ/g, 'n');
  const b = rawB.replace(/ñ/g, 'n');
  if (a.length < 6 || b.length < 6 || a[0] !== b[0]) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  return distancia(a, b) <= 1;
}

/** Distancia de Damerau-Levenshtein (con trasposiciones), cortada en cuanto pasa de 1. */
function distancia(a, b) {
  const filas = [];
  for (let i = 0; i <= a.length; i += 1) {
    filas[i] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      if (i === 0) {
        filas[i][j] = j;
        continue;
      }
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(filas[i - 1][j] + 1, filas[i][j - 1] + 1, filas[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, filas[i - 2][j - 2] + 1);
      }
      filas[i][j] = d;
    }
    if (Math.min(...filas[i]) > 1) return 2;
  }
  return filas[a.length][b.length];
}

module.exports = { normalize, fold, tokenize, wordsMatch, casiIgual };
