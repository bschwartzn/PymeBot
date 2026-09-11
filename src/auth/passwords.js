/**
 * Hash de contraseñas.
 *
 * scrypt viene en Node, así que no hace falta bcrypt ni una dependencia nativa. Es lento a
 * propósito: esa lentitud es justamente lo que hace caro probar contraseñas a la fuerza.
 *
 * Formato guardado:  scrypt$<N>$<salt hex>$<hash hex>
 * Se guarda el costo dentro del hash para poder subirlo en el futuro sin invalidar lo viejo.
 */

const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');

const COST = 16384; // N de scrypt
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** Longitud mínima. No se exige mayúsculas ni símbolos: obliga a claves peores y anotadas. */
const MIN_LENGTH = 8;
const MAX_LENGTH = 200;

function hashPassword(password, cost = COST) {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES, { N: cost });
  return `scrypt$${cost}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Comprueba una contraseña contra su hash.
 * La comparación es en tiempo constante: comparar con === filtra información por el tiempo
 * que tarda en fallar.
 */
function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const partes = stored.split('$');
  if (partes.length !== 4 || partes[0] !== 'scrypt') return false;

  const cost = Number(partes[1]);
  if (!Number.isInteger(cost) || cost < 1024) return false;

  let salt;
  let esperado;
  try {
    salt = Buffer.from(partes[2], 'hex');
    esperado = Buffer.from(partes[3], 'hex');
  } catch (err) {
    return false;
  }
  if (salt.length === 0 || esperado.length === 0) return false;

  let calculado;
  try {
    calculado = scryptSync(password, salt, esperado.length, { N: cost });
  } catch (err) {
    return false; // contraseña absurdamente larga, parámetros corruptos, etc.
  }

  return timingSafeEqual(calculado, esperado);
}

/** @returns {string|null} el problema, o null si la contraseña sirve. */
function checkPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`;
  }
  if (password.length > MAX_LENGTH) {
    return `La contraseña no puede superar los ${MAX_LENGTH} caracteres.`;
  }
  if (/^\d+$/.test(password)) {
    return 'La contraseña no puede ser solo números.';
  }
  return null;
}

module.exports = { hashPassword, verifyPassword, checkPasswordStrength, MIN_LENGTH };
