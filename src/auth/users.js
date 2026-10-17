/**
 * Cuentas de dueños de negocio.
 *
 * Un solo archivo JSON, como los negocios: para el volumen de un MVP alcanza y se puede
 * inspeccionar a ojo. La contraseña nunca se guarda, solo su hash.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const { hashPassword, verifyPassword, checkPasswordStrength } = require('./passwords');

const { usersFile: DEFAULT_FILE } = require('../config');

/** Validación de correo deliberadamente laxa: lo estricto rechaza direcciones válidas. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 200;
const MAX_NAME = 80;

/** Un hash cualquiera, para que comprobar un correo inexistente tarde lo mismo. */
const HASH_DE_RELLENO = hashPassword('relleno-que-nunca-coincide');

class AuthError extends Error {
  constructor(mensaje, campo = null) {
    super(mensaje);
    this.name = 'AuthError';
    this.campo = campo;
  }
}

class UserStore {
  constructor({ file = DEFAULT_FILE } = {}) {
    this.file = file;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }

  read() {
    if (!fs.existsSync(this.file)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (err) {
      return []; // un archivo roto no debe tumbar el servidor
    }
  }

  write(users) {
    const temporal = `${this.file}.tmp`;
    fs.writeFileSync(temporal, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
    fs.renameSync(temporal, this.file);
  }

  /** El correo es la identidad: se normaliza para que "Ana@X.CL" y "ana@x.cl" sean la misma. */
  static normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
  }

  findByEmail(email) {
    const buscado = UserStore.normalizeEmail(email);
    return this.read().find((u) => u.email === buscado) || null;
  }

  findById(id) {
    return this.read().find((u) => u.id === id) || null;
  }

  get count() {
    return this.read().length;
  }

  /** Crea una cuenta. Lanza AuthError con un mensaje mostrable si algo no sirve. */
  create({ email, password, name, businessName }) {
    const correo = UserStore.normalizeEmail(email);

    if (!correo || !EMAIL.test(correo) || correo.length > MAX_EMAIL) {
      throw new AuthError('Escribe un correo válido.', 'email');
    }
    const problema = checkPasswordStrength(password);
    if (problema) throw new AuthError(problema, 'password');

    if (name !== undefined && name !== null && typeof name !== 'string') {
      throw new AuthError('El nombre no es válido.', 'name');
    }
    if (typeof name === 'string' && name.length > MAX_NAME) {
      throw new AuthError(`El nombre no puede superar los ${MAX_NAME} caracteres.`, 'name');
    }

    const users = this.read();
    if (users.some((u) => u.email === correo)) {
      throw new AuthError('Ya existe una cuenta con ese correo.', 'email');
    }

    const user = {
      id: randomUUID(),
      email: correo,
      name: (typeof name === 'string' ? name.trim() : '') || correo.split('@')[0],
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    users.push(user);
    this.write(users);

    return UserStore.publicView(user, { businessName });
  }

  /**
   * Comprueba correo y contraseña.
   * Devuelve null cuando algo no calza, sin distinguir si fue el correo o la contraseña:
   * un mensaje distinto para cada caso le confirma a un atacante qué correos existen.
   */
  authenticate(email, password) {
    const user = this.findByEmail(email);
    if (!user) {
      // Se calcula un hash igual: si un correo inexistente respondiera al instante, el
      // tiempo de respuesta delataría qué correos tienen cuenta.
      verifyPassword(typeof password === 'string' ? password : '', HASH_DE_RELLENO);
      return null;
    }
    if (!verifyPassword(password, user.passwordHash)) return null;
    return UserStore.publicView(user);
  }

  /**
   * Cambia la contraseña de una cuenta. Lanza AuthError con un mensaje mostrable.
   * @param {object} [opciones]
   * @param {string} [opciones.actual] si viene, tiene que ser la contraseña vigente
   * @param {string} [opciones.desdeEntorno] hash de la contraseña del hosting que la dejó así
   */
  setPassword(userId, nueva, { actual, desdeEntorno } = {}) {
    const users = this.read();
    const user = users.find((u) => u.id === userId);
    if (!user) throw new AuthError('Esa cuenta no existe.');

    if (actual !== undefined && !verifyPassword(actual, user.passwordHash)) {
      throw new AuthError('La contraseña actual no es correcta.', 'actual');
    }
    const problema = checkPasswordStrength(nueva);
    if (problema) throw new AuthError(problema, 'nueva');

    user.passwordHash = hashPassword(nueva);
    user.passwordChangedAt = new Date().toISOString();
    if (desdeEntorno !== undefined) user.passwordFromEnv = desdeEntorno;
    this.write(users);
    return UserStore.publicView(user);
  }

  /** La forma del usuario que sí puede salir del servidor: sin el hash. */
  static publicView(user) {
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
  }
}

module.exports = { UserStore, AuthError };
