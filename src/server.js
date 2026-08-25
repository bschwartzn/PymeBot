/**
 * PymeBot — servidor.
 *
 * Módulo 1: el núcleo conversacional y el sandbox.
 * Módulo 2: varios negocios, editables desde el navegador.
 *
 * Contratos que el resto del sistema reutiliza sin cambios:
 *   - POST /api/chat  → el punto de entrada de cualquier canal (web hoy, WhatsApp en M5)
 *   - un JSON por negocio en data/businesses/
 */

const path = require('path');
const express = require('express');

const { respond } = require('./bot/engine');
const { SessionStore } = require('./bot/sessions');
const { BusinessRepository, ValidationError } = require('./knowledge/repository');

/** Largo máximo de un mensaje. Un cliente real no escribe 2.000 caracteres. */
const MAX_MESSAGE_LENGTH = 1000;

/** Negocio que se usa cuando nadie pide uno en particular. */
const DEFAULT_SLUG = process.env.PYMEBOT_BUSINESS || 'bella-vista';

function createApp({ repository = new BusinessRepository(), sessions = new SessionStore() } = {}) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  /** Resuelve el negocio pedido, cayendo al primero disponible si el slug no existe. */
  function resolveBusiness(slug) {
    const pedido = slug && repository.get(slug);
    if (pedido) return { slug, business: pedido };

    const porDefecto = repository.get(DEFAULT_SLUG);
    if (porDefecto) return { slug: DEFAULT_SLUG, business: porDefecto };

    const primero = repository.list()[0];
    if (primero) return { slug: primero.slug, business: repository.get(primero.slug) };

    return { slug: null, business: null };
  }

  function sinNegocios(res) {
    return res.status(503).json({
      error: 'Todavía no hay ningún negocio configurado. Crea uno en /admin.',
    });
  }

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      businesses: repository.list().length,
      sessions: sessions.size,
    });
  });

  // ---------------------------------------------------------------- conversación

  // Lo que el sandbox necesita para pintarse.
  app.get('/api/business', (req, res) => {
    const { slug, business } = resolveBusiness(req.query.slug);
    if (!business) return sinNegocios(res);

    res.json({
      slug,
      name: business.name,
      tagline: business.tagline,
      greeting: business.greeting,
      topics: business.topics,
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

    // Cada lectura va al disco, así que un cambio guardado en el editor aplica ya.
    const { slug, business } = resolveBusiness(req.body.business);
    if (!business) return sinNegocios(res);

    const session = sessions.get(sessionId);
    sessions.addMessage(session, 'user', message);

    const result = respond(message, business, session);

    sessions.addMessage(session, 'bot', result.reply);
    if (result.intent === 'saludo') session.greeted = true;

    res.json({
      sessionId: session.id,
      business: slug,
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

  // ---------------------------------------------------- base de conocimiento (M2)

  app.get('/api/businesses', (req, res) => {
    res.json({ businesses: repository.list() });
  });

  app.get('/api/businesses/:slug', (req, res) => {
    const business = repository.get(req.params.slug);
    if (!business) return res.status(404).json({ error: 'Ese negocio no existe.' });
    res.json({ slug: req.params.slug, business });
  });

  app.post('/api/businesses', (req, res) => {
    try {
      const { slug, business, warnings } = repository.create(req.body);
      res.status(201).json({ slug, business, warnings });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(422).json({ error: err.message, errors: err.errors, warnings: err.warnings });
      }
      throw err;
    }
  });

  app.put('/api/businesses/:slug', (req, res) => {
    if (!repository.exists(req.params.slug)) {
      return res.status(404).json({ error: 'Ese negocio no existe.' });
    }
    try {
      const { slug, business, warnings } = repository.save(req.params.slug, req.body);
      res.json({ slug, business, warnings });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(422).json({ error: err.message, errors: err.errors, warnings: err.warnings });
      }
      throw err;
    }
  });

  app.delete('/api/businesses/:slug', (req, res) => {
    if (!repository.remove(req.params.slug)) {
      return res.status(404).json({ error: 'Ese negocio no existe.' });
    }
    res.json({ ok: true });
  });

  return app;
}

// Solo levanta el servidor cuando se ejecuta directamente (los tests importan createApp).
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const repository = new BusinessRepository();
  const app = createApp({ repository });

  app.listen(port, () => {
    const negocios = repository.list();
    console.log(`\n  🤖 PymeBot escuchando en http://localhost:${port}`);
    console.log(`     Editor de negocios:   http://localhost:${port}/admin.html`);
    console.log(`     Negocios cargados:    ${negocios.map((n) => n.slug).join(', ') || 'ninguno'}\n`);
  });
}

module.exports = { createApp, MAX_MESSAGE_LENGTH, DEFAULT_SLUG };
