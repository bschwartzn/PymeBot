/**
 * PymeBot — Módulo 1: núcleo conversacional + sandbox.
 *
 * Dos contratos que el resto del sistema reutilizará sin cambios:
 *   - POST /api/chat  → el punto de entrada de cualquier canal (web hoy, WhatsApp en M5)
 *   - business.json   → la información del negocio
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

const { respond } = require('./bot/engine');
const { SessionStore } = require('./bot/sessions');

/** Largo máximo de un mensaje. Un cliente real no escribe 2.000 caracteres. */
const MAX_MESSAGE_LENGTH = 1000;

const DEFAULT_BUSINESS_PATH = path.join(__dirname, 'config', 'business.json');

function loadBusiness(filePath = DEFAULT_BUSINESS_PATH) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const business = JSON.parse(raw);

  if (!business.name) throw new Error(`El negocio en ${filePath} no tiene "name"`);
  if (!Array.isArray(business.intents) || business.intents.length === 0) {
    throw new Error(`El negocio en ${filePath} no tiene intenciones definidas`);
  }
  return business;
}

function createApp({ business = loadBusiness(), sessions = new SessionStore() } = {}) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', business: business.name, sessions: sessions.size });
  });

  // Lo que el sandbox necesita para pintarse: nombre, saludo inicial y temas sugeridos.
  app.get('/api/business', (req, res) => {
    res.json({
      name: business.name,
      tagline: business.tagline || '',
      greeting: business.greeting || '¡Hola! ¿En qué te puedo ayudar?',
      topics: business.topics || [],
    });
  });

  app.post('/api/chat', (req, res) => {
    const { sessionId, message } = req.body || {};

    if (typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'El campo "message" es obligatorio.' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `El mensaje supera el máximo de ${MAX_MESSAGE_LENGTH} caracteres.`,
      });
    }

    const session = sessions.get(sessionId);
    sessions.addMessage(session, 'user', message);

    const result = respond(message, business, session);

    sessions.addMessage(session, 'bot', result.reply);
    if (result.intent === 'saludo') session.greeted = true;

    res.json({
      sessionId: session.id,
      reply: result.reply,
      intent: result.intent,
      matched: result.matched,
      score: Number(result.score.toFixed(2)),
    });
  });

  app.post('/api/reset', (req, res) => {
    const { sessionId } = req.body || {};
    const session = sessions.reset(sessionId);
    res.json({ ok: true, sessionId: session ? session.id : null });
  });

  return app;
}

// Solo levanta el servidor cuando se ejecuta directamente (los tests importan createApp).
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`\n  🤖 PymeBot (Módulo 1) escuchando en http://localhost:${port}\n`);
  });
}

module.exports = { createApp, loadBusiness, MAX_MESSAGE_LENGTH };
