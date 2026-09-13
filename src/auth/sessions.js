/**
 * Sesiones iniciadas.
 *
 * El navegador recibe un token opaco y aleatorio en una cookie; el servidor guarda a qué
 * usuario corresponde. El token no lleva información dentro, así que no hace falta firmarlo
 * y se puede revocar de verdad borrándolo de aquí.
 *
 * Se persiste en disco para que reiniciar el servidor no eche a todo el mundo.
 */

const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const { sessionsFile: DEFAULT_FILE } = require('../config');

/** Una sesión dura 30 días. Pasado eso hay que volver a entrar. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const COOKIE_NAME = 'pymebot_session';

class AuthSessionStore {
  constructor({ file = DEFAULT_FILE, ttlMs = TTL_MS } = {}) {
    this.file = file;
    this.ttlMs = ttlMs;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }

  read() {
    if (!fs.existsSync(this.file)) return {};
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (err) {
      return {};
    }
  }

  write(sessions) {
    const temporal = `${this.file}.tmp`;
    fs.writeFileSync(temporal, `${JSON.stringify(sessions, null, 2)}\n`, 'utf8');
    fs.renameSync(temporal, this.file);
  }

  /** Abre una sesión y devuelve el token que va en la cookie. */
  create(userId) {
    const sessions = this.purge(this.read());
    // 32 bytes de aleatoriedad criptográfica: no se adivina ni se enumera.
    const token = randomBytes(32).toString('hex');
    sessions[token] = { userId, expiresAt: Date.now() + this.ttlMs };
    this.write(sessions);
    return token;
  }

  /** @returns {string|null} el id del usuario dueño de ese token, si sigue vigente. */
  userIdFor(token) {
    if (typeof token !== 'string' || token.length !== 64) return null;
    const sesion = this.read()[token];
    if (!sesion) return null;
    if (sesion.expiresAt <= Date.now()) {
      this.destroy(token);
      return null;
    }
    return sesion.userId;
  }

  destroy(token) {
    const sessions = this.read();
    if (!sessions[token]) return false;
    delete sessions[token];
    this.write(sessions);
    return true;
  }

  /** Cierra todas las sesiones de un usuario (por ejemplo, al cambiar la contraseña). */
  destroyAllFor(userId) {
    const sessions = this.read();
    let borradas = 0;
    for (const [token, sesion] of Object.entries(sessions)) {
      if (sesion.userId === userId) {
        delete sessions[token];
        borradas += 1;
      }
    }
    if (borradas > 0) this.write(sessions);
    return borradas;
  }

  purge(sessions = this.read()) {
    const ahora = Date.now();
    for (const [token, sesion] of Object.entries(sessions)) {
      if (!sesion || sesion.expiresAt <= ahora) delete sessions[token];
    }
    return sessions;
  }
}

/** Parsea la cabecera Cookie. Son pocas líneas; no vale la pena una dependencia. */
function readCookie(req, name) {
  const cabecera = req.headers ? req.headers.cookie : null;
  if (!cabecera) return null;

  for (const trozo of cabecera.split(';')) {
    const corte = trozo.indexOf('=');
    if (corte === -1) continue;
    if (trozo.slice(0, corte).trim() !== name) continue;
    try {
      return decodeURIComponent(trozo.slice(corte + 1).trim());
    } catch (err) {
      return null;
    }
  }
  return null;
}

/**
 * Cookie de sesión.
 * - httpOnly: el JavaScript de la página no puede leerla, así que un XSS no la roba.
 * - sameSite=lax: no viaja en peticiones cruzadas, que es la base del CSRF.
 * - secure: solo bajo HTTPS. Se desactiva en local, donde no hay HTTPS.
 */
function cookieOptions({ secure = process.env.NODE_ENV === 'production', maxAge = TTL_MS } = {}) {
  return { httpOnly: true, sameSite: 'lax', secure, maxAge, path: '/' };
}

module.exports = { AuthSessionStore, readCookie, cookieOptions, COOKIE_NAME, TTL_MS };
