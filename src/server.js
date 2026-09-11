/**
 * PymeBot — servidor.
 *
 * M1: núcleo conversacional y sandbox.
 * M2: varios negocios, editables desde el navegador.
 * M3 (panel): cuentas de dueño, cada negocio con su dueño, y la configuración del bot.
 *
 * La frontera importante es entre lo público y lo privado:
 *   - PÚBLICO  → el chat. Cualquiera conversa con cualquier bot, sin cuenta. Es el producto.
 *   - PRIVADO  → el panel. Solo el dueño ve y edita SUS negocios.
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
const { UserStore, AuthError } = require('./auth/users');
const { AuthSessionStore, readCookie, cookieOptions, COOKIE_NAME } = require('./auth/sessions');

/** Largo máximo de un mensaje. Un cliente real no escribe 2.000 caracteres. */
const MAX_MESSAGE_LENGTH = 1000;

/** Negocio que se usa en el chat cuando nadie pide uno en particular. */
const DEFAULT_SLUG = process.env.PYMEBOT_BUSINESS || 'dona-elba';

/** Freno a la fuerza bruta contra el login. */
const LOGIN_MAX_INTENTOS = 10;
const LOGIN_VENTANA_MS = 15 * 60 * 1000;

/** Con qué empieza un negocio recién creado, para que el panel no arranque en blanco. */
function negocioInicial(nombre) {
  return {
    name: nombre,
    tagline: '',
    topics: ['Horarios', 'Precios', 'Cómo llegar'],
    intents: [
      {
        id: 'horarios',
        keywords: ['horario', 'abren', 'cierran', 'atienden', 'a que hora'],
        answer: 'Atendemos de lunes a viernes de 9:00 a 18:00.',
      },
      {
        id: 'ubicacion',
        keywords: ['donde estan', 'direccion', 'ubicacion', 'como llegar'],
        answer: 'Estamos en (escribe aquí tu dirección).',
      },
    ],
  };
}

function createApp({
  repository = new BusinessRepository(),
  users = new UserStore(),
  authSessions = new AuthSessionStore(),
  sessions = new SessionStore(),
} = {}) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  /** Intentos fallidos de login, por correo. Se limpia solo. */
  const intentosFallidos = new Map();

  function registrarFallo(clave) {
    const ahora = Date.now();
    const previo = intentosFallidos.get(clave);
    if (!previo || ahora - previo.desde > LOGIN_VENTANA_MS) {
      intentosFallidos.set(clave, { desde: ahora, cuenta: 1 });
      return;
    }
    previo.cuenta += 1;
  }

  function estaBloqueado(clave) {
    const previo = intentosFallidos.get(clave);
    if (!previo) return false;
    if (Date.now() - previo.desde > LOGIN_VENTANA_MS) {
      intentosFallidos.delete(clave);
      return false;
    }
    return previo.cuenta >= LOGIN_MAX_INTENTOS;
  }

  // ------------------------------------------------------------------ sesión del dueño

  /** Deja en req.user al dueño que hizo la petición, o null. Nunca corta la petición. */
  function attachUser(req, res, next) {
    const token = readCookie(req, COOKIE_NAME);
    const userId = token ? authSessions.userIdFor(token) : null;
    req.user = userId ? UserStore.publicView(users.findById(userId)) : null;
    next();
  }

  /** Corta la petición si no hay sesión iniciada. */
  function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Necesitas iniciar sesión.' });
    next();
  }

  /**
   * Carga el negocio de la ruta comprobando que le pertenezca a quien pregunta.
   *
   * Un negocio ajeno responde 404, no 403: decir "existe pero no es tuyo" le confirma a
   * un desconocido qué negocios hay dados de alta.
   */
  function requireOwnedBusiness(req, res, next) {
    const business = repository.get(req.params.slug);
    if (!business || business.ownerId !== req.user.id) {
      return res.status(404).json({ error: 'Ese negocio no existe.' });
    }
    req.business = business;
    next();
  }

  app.use(attachUser);

  function manejarValidacion(err, res) {
    if (err instanceof ValidationError) {
      res.status(422).json({ error: err.message, errors: err.errors, warnings: err.warnings });
      return true;
    }
    return false;
  }

  // ============================================================ PÚBLICO: el chat

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
    return res.status(503).json({ error: 'Todavía no hay ningún negocio configurado.' });
  }

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      businesses: repository.list().length,
      users: users.count,
      sessions: sessions.size,
    });
  });

  /** Los negocios con los que se puede conversar. Público: alimenta el selector del chat. */
  app.get('/api/directory', (req, res) => {
    res.json({ businesses: repository.list().map(({ slug, name }) => ({ slug, name })) });
  });

  app.get('/api/business', (req, res) => {
    const { slug, business } = resolveBusiness(req.query.slug);
    if (!business) return sinNegocios(res);

    res.json({
      slug,
      name: business.name,
      tagline: business.tagline,
      greeting: business.active ? business.greeting : business.pausedMessage,
      topics: business.active ? business.topics : [],
      active: business.active,
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

    // Cada lectura va al disco, así que un cambio guardado en el panel aplica ya.
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

  // ============================================================ CUENTAS

  function abrirSesion(res, user) {
    const token = authSessions.create(user.id);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return user;
  }

  app.post('/api/auth/signup', (req, res) => {
    const { email, password, name, businessName } = req.body || {};

    let user;
    try {
      user = users.create({ email, password, name });
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(422).json({ error: err.message, campo: err.campo });
      }
      throw err;
    }

    // Crear la cuenta y quedarse sin nada que configurar es una mala primera impresión.
    let slug = null;
    if (typeof businessName === 'string' && businessName.trim()) {
      try {
        ({ slug } = repository.create({ ...negocioInicial(businessName.trim()), ownerId: user.id }));
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        // Un nombre de negocio inválido no debe impedir que la cuenta quede creada.
      }
    }

    abrirSesion(res, user);
    res.status(201).json({ user, business: slug });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const clave = UserStore.normalizeEmail(email);

    if (estaBloqueado(clave)) {
      return res.status(429).json({
        error: 'Demasiados intentos fallidos. Espera unos minutos antes de volver a probar.',
      });
    }

    const user = users.authenticate(email, password);
    if (!user) {
      registrarFallo(clave);
      // Un mensaje único para los dos casos: no confirmamos qué correos existen.
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    intentosFallidos.delete(clave);
    abrirSesion(res, user);
    res.json({ user });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = readCookie(req, COOKIE_NAME);
    if (token) authSessions.destroy(token);
    res.clearCookie(COOKIE_NAME, cookieOptions({ maxAge: 0 }));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: req.user });
  });

  // ============================================================ PRIVADO: el panel

  /** Solo los negocios de quien pregunta. */
  app.get('/api/businesses', requireAuth, (req, res) => {
    res.json({ businesses: repository.listByOwner(req.user.id) });
  });

  /** Los ejemplos que vienen con PymeBot, para copiar uno y partir de ahí. */
  app.get('/api/examples', requireAuth, (req, res) => {
    res.json({ examples: repository.listExamples() });
  });

  app.get('/api/businesses/:slug', requireAuth, requireOwnedBusiness, (req, res) => {
    res.json({ slug: req.params.slug, business: req.business });
  });

  app.post('/api/businesses', requireAuth, (req, res) => {
    const nombre = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!nombre) return res.status(422).json({ error: 'El negocio necesita un nombre.' });

    try {
      const { slug, business, warnings } = repository.create({
        ...negocioInicial(nombre),
        ownerId: req.user.id,
      });
      res.status(201).json({ slug, business, warnings });
    } catch (err) {
      if (!manejarValidacion(err, res)) throw err;
    }
  });

  /** Copia un ejemplo a la cuenta de quien lo pide. */
  app.post('/api/examples/:slug/copy', requireAuth, (req, res) => {
    const ejemplo = repository.get(req.params.slug);
    if (!ejemplo || ejemplo.ownerId !== null) {
      return res.status(404).json({ error: 'Ese ejemplo no existe.' });
    }

    try {
      const { slug, business } = repository.create({
        ...ejemplo,
        name: `${ejemplo.name} (mi copia)`,
        ownerId: req.user.id,
      });
      res.status(201).json({ slug, business });
    } catch (err) {
      if (!manejarValidacion(err, res)) throw err;
    }
  });

  app.put('/api/businesses/:slug', requireAuth, requireOwnedBusiness, (req, res) => {
    try {
      // El dueño se toma del servidor, nunca del cuerpo: si no, cualquiera regalaría
      // o se apropiaría de un negocio ajeno mandando otro ownerId.
      const { slug, business, warnings } = repository.save(req.params.slug, {
        ...req.body,
        ownerId: req.user.id,
      });
      res.json({ slug, business, warnings });
    } catch (err) {
      if (!manejarValidacion(err, res)) throw err;
    }
  });

  app.delete('/api/businesses/:slug', requireAuth, requireOwnedBusiness, (req, res) => {
    repository.remove(req.params.slug);
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
    console.log(`\n  🤖 PymeBot escuchando en http://localhost:${port}`);
    console.log(`     Panel del dueño:    http://localhost:${port}/panel.html`);
    console.log(`     Negocios cargados:  ${repository.list().length}\n`);
  });
}

module.exports = { createApp, MAX_MESSAGE_LENGTH, DEFAULT_SLUG, negocioInicial };
