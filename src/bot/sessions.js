/**
 * Memoria de conversación.
 *
 * En el MVP vive en la memoria del proceso: si el servidor se reinicia, se pierde.
 * Es una decisión consciente — no necesitamos una base de datos para validar la idea.
 */

const { randomUUID } = require('crypto');

/** Una sesión inactiva se descarta a los 30 minutos. */
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Guardamos como mucho los últimos 40 mensajes de cada conversación. */
const MAX_HISTORY = 40;

class SessionStore {
  constructor({ ttlMs = SESSION_TTL_MS, maxHistory = MAX_HISTORY } = {}) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;
    this.maxHistory = maxHistory;
  }

  /** Devuelve la sesión pedida o crea una nueva. Nunca devuelve null. */
  get(sessionId) {
    this.purgeExpired();

    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      session.lastSeenAt = Date.now();
      return session;
    }

    const session = {
      id: randomUUID(),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      greeted: false,
      messages: [],
      // Quién responde: 'bot' (por defecto) o 'persona', cuando la dueña tomó la conversación.
      modo: 'bot',
      // El cliente pidió hablar con una persona y nadie le ha respondido todavía.
      esperaPersona: false,
      // Número del último mensaje: el chat pide "lo nuevo desde el N" sin depender del reloj.
      seq: 0,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** La sesión pedida, o null. A diferencia de `get`, nunca crea una nueva. */
  find(sessionId) {
    this.purgeExpired();
    return (sessionId && this.sessions.get(sessionId)) || null;
  }

  /** Las sesiones vivas de un negocio, para el panel. */
  listFor(slug) {
    this.purgeExpired();
    return [...this.sessions.values()].filter((s) => s.slug === slug && s.messages.length > 0);
  }

  /** Agrega un mensaje al historial, recortando los más antiguos si hace falta. */
  addMessage(session, role, text) {
    session.seq = (session.seq || 0) + 1;
    session.messages.push({ role, text, at: Date.now(), n: session.seq });
    if (session.messages.length > this.maxHistory) {
      session.messages = session.messages.slice(-this.maxHistory);
    }
    session.lastSeenAt = Date.now();
    return session;
  }

  /** Vacía el historial de una sesión sin cambiar su id. */
  reset(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.messages = [];
    session.greeted = false;
    session.lastSeenAt = Date.now();
    return session;
  }

  /** Elimina las sesiones que superaron el TTL. Evita que la memoria crezca sin límite. */
  purgeExpired(now = Date.now()) {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastSeenAt > this.ttlMs) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  get size() {
    return this.sessions.size;
  }
}

module.exports = { SessionStore, SESSION_TTL_MS, MAX_HISTORY };
