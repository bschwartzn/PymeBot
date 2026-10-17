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
const os = require('os');
const express = require('express');
const QRCode = require('qrcode');

const { respond } = require('./bot/engine');
const { SessionStore } = require('./bot/sessions');
const { BusinessRepository, ValidationError } = require('./knowledge/repository');
const { UserStore, AuthError } = require('./auth/users');
const { AuthSessionStore, readCookie, cookieOptions, COOKIE_NAME } = require('./auth/sessions');
const { ConversationLog } = require('./chat/conversaciones');
const { resumir, conversaciones } = require('./chat/metricas');
const { crearAtencion, MensajeInvalido } = require('./chat/atender');
const { rateLimit } = require('./http/limits');
const { cabecerasDeSeguridad } = require('./http/seguridad');
const config = require('./config');

/** Largo máximo de un mensaje. Un cliente real no escribe 2.000 caracteres. */
const MAX_MESSAGE_LENGTH = 1000;

/** Negocio que se usa en el chat cuando nadie pide uno en particular. */
const DEFAULT_SLUG = config.defaultBusiness;

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
  conversations = new ConversationLog(),
  registroAbierto = config.registroAbierto,
  modoCliente = config.modoCliente,
} = {}) {
  /*
   * El núcleo de la conversación, sin HTTP dentro. Cualquier canal (la web hoy, WhatsApp
   * mañana) llama a esto; lo único que cambia entre canales es de dónde sale `idExterno`.
   */
  const atender = crearAtencion({ sessions, conversations });
  const app = express();

  /*
   * Cuántos proxies hay delante. Render, Fly y Railway ponen uno.
   * Sin esto req.ip sería la IP del proxy y TODOS los visitantes compartirían el mismo
   * contador del límite de peticiones, dejándolo inservible. Se confía en un número fijo
   * de saltos y no en la cabecera a ciegas, que cualquiera podría falsificar.
   */
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(cabecerasDeSeguridad({ isProduction: config.isProduction }));

  /*
   * Defensa contra peticiones forjadas desde otro sitio (CSRF), además de la cookie
   * sameSite. Un navegador siempre manda Origin en un POST, PUT o DELETE: si viene de otra
   * dirección, no es el panel ni el chat de este servidor y no se atiende.
   */
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origen = req.get('origin');
    if (!origen) return next(); // curl, el hosting, un canal servidor a servidor
    let host;
    try {
      host = new URL(origen).host;
    } catch (err) {
      host = null;
    }
    const propios = [req.get('host'), req.get('x-forwarded-host')];
    if (config.publicUrl) propios.push(new URL(config.publicUrl).host);
    if (!host || !propios.includes(host)) {
      return res.status(403).json({ error: 'Petición rechazada.' });
    }
    next();
  });

  app.use(express.json({ limit: '256kb' }));

  // En el bot de un cliente, la portada es su chat. El sandbox interno (que muestra el
  // motor por dentro) no se publica.
  if (modoCliente) {
    app.get(['/', '/index.html', '/app.js'], (req, res) => {
      res.redirect(302, `/c/${encodeURIComponent(DEFAULT_SLUG)}`);
    });
  }

  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      // Los archivos llevan su contenido en el nombre solo en dist/; aquí se revalida.
      maxAge: config.isProduction ? '5m' : 0,
    }),
  );

  const limitarChat = rateLimit({
    ...config.limits.chat,
    mensaje: 'Estás escribiendo muy rápido. Espera unos segundos e inténtalo de nuevo.',
  });
  const limitarAuth = rateLimit({
    ...config.limits.auth,
    mensaje: 'Demasiados intentos. Espera unos minutos antes de volver a probar.',
  });
  const limitarEscritura = rateLimit(config.limits.write);

  /**
   * Intentos fallidos de login, por correo E IP.
   *
   * Solo por correo, cualquiera podría dejar a la dueña sin poder entrar escribiendo mal su
   * contraseña diez veces. Por correo e IP, el que se equivoca se bloquea a sí mismo; y el
   * límite por IP de limitarAuth frena a quien prueba muchos correos.
   */
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

  /**
   * Resuelve qué negocio atiende esta petición.
   *
   * Distingue dos casos que parecen iguales pero no lo son:
   *   - No se pidió ninguno  → se usa el por defecto. Es el caso del sandbox.
   *   - Se pidió uno y no existe → NO se cae a otro. Un link público mal escrito o de un
   *     negocio dado de baja haría que el cliente reciba las respuestas de otra empresa,
   *     sin enterarse. Mejor decir que el chat no existe.
   */
  function resolveBusiness(slug) {
    if (slug) {
      const pedido = repository.get(slug);
      return pedido ? { slug, business: pedido } : { slug, business: null, noEncontrado: true };
    }

    const porDefecto = repository.get(DEFAULT_SLUG);
    if (porDefecto) return { slug: DEFAULT_SLUG, business: porDefecto };

    const primero = repository.list()[0];
    if (primero) return { slug: primero.slug, business: repository.get(primero.slug) };

    return { slug: null, business: null };
  }

  function chatNoDisponible(res) {
    return res.status(404).json({
      error: 'Este chat no está disponible. Puede que el enlace haya cambiado.',
    });
  }

  /**
   * La dirección pública del chat de un negocio.
   *
   * Detrás de un proxy o de un túnel, el host real viene en las cabeceras X-Forwarded-*:
   * sin mirarlas, el link compartido y el QR apuntarían a "localhost".
   */
  function publicUrl(req, slug) {
    const base =
      config.publicUrl ||
      `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    return `${base.replace(/\/+$/, '')}/c/${encodeURIComponent(slug)}`;
  }

  /**
   * ¿Esta dirección solo existe dentro del computador que corre el servidor?
   *
   * Importa porque el QR se escanea CON UN TELÉFONO. Un QR que codifica "localhost"
   * nunca va a funcionar: en el teléfono, localhost es el propio teléfono.
   */
  function esSoloLocal(url) {
    try {
      const host = new URL(url).hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
    } catch (err) {
      return false;
    }
  }

  /**
   * La dirección del servidor dentro de la red local (la wifi de la casa o del local).
   * Es lo que sí puede abrir un teléfono conectado a la misma red.
   */
  function urlEnLaRed(req, slug) {
    // El puerto sale de la petición, no de process.env.PORT: si el servidor arrancó en
    // otro puerto (o PORT no está definida), la dirección sugerida sería la equivocada.
    const desdeHost = String(req.get('host') || '').split(':')[1];
    const puerto = desdeHost || req.socket.localPort || process.env.PORT || 3000;

    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const nic of interfaces || []) {
        if (nic.family === 'IPv4' && !nic.internal) {
          return `http://${nic.address}:${puerto}/c/${encodeURIComponent(slug)}`;
        }
      }
    }
    return null;
  }

  function sinNegocios(res) {
    return res.status(503).json({ error: 'Todavía no hay ningún negocio configurado.' });
  }

  // Lo consulta el hosting para saber si la instancia está viva. Tiene que ser barato y
  // no depender de nada que pueda fallar por su cuenta.
  // Cuántas cuentas o sesiones hay no es asunto de quien pregunta: solo si está viva.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  /** Lo que el panel necesita saber antes de iniciar sesión. */
  app.get('/api/instalacion', (req, res) => {
    res.json({ registroAbierto });
  });

  /**
   * Los negocios con los que se puede conversar: alimenta el selector del sandbox.
   * En el bot de un cliente no hay selector, y listar lo que hay no le sirve a nadie más.
   */
  app.get('/api/directory', (req, res) => {
    if (modoCliente) return res.status(404).json({ error: 'No disponible.' });
    res.json({ businesses: repository.list().map(({ slug, name }) => ({ slug, name })) });
  });

  app.get('/api/business', (req, res) => {
    const { slug, business, noEncontrado } = resolveBusiness(req.query.slug);
    if (noEncontrado) return chatNoDisponible(res);
    if (!business) return sinNegocios(res);

    res.json({
      slug,
      name: business.name,
      tagline: business.tagline,
      greeting: business.active ? business.greeting : business.pausedMessage,
      topics: business.active ? business.topics : [],
      active: business.active,
      // La dueña probando su propio bot: el chat se lo avisa, y esa conversación no cuenta.
      esDueno: Boolean(req.user && business.ownerId === req.user.id),
    });
  });

  /**
   * El canal web. Es un adaptador delgado: traduce la petición HTTP a `atender` y
   * devuelve su respuesta. Un adaptador de WhatsApp hará exactamente lo mismo con el
   * webhook, sin tocar nada del núcleo.
   */
  app.post('/api/chat', limitarChat, (req, res) => {
    const { sessionId, message, business: pedido } = req.body || {};

    // Cada lectura va al disco, así que un cambio guardado en el panel aplica ya.
    const { slug, business, noEncontrado } = resolveBusiness(typeof pedido === 'string' ? pedido : undefined);
    if (noEncontrado) return chatNoDisponible(res);
    if (!business) return sinNegocios(res);

    // Lo que la dueña escribe para probar su bot no se mezcla con lo que preguntan sus
    // clientes: si no, las cifras y la lista de "no supo responder" quedarían falseadas.
    const esPrueba = Boolean(req.user && business.ownerId === req.user.id);

    let resultado;
    try {
      resultado = atender({
        texto: message,
        negocio: business,
        slug,
        canal: 'web',
        // En la web, la conversación la identifica lo que guardó el navegador.
        idExterno: typeof sessionId === 'string' ? sessionId : null,
        registrar: !esPrueba,
      });
    } catch (err) {
      if (err instanceof MensajeInvalido) return res.status(400).json({ error: err.message });
      throw err;
    }

    res.json({
      sessionId: resultado.conversacion,
      business: slug,
      reply: resultado.reply,
      intent: resultado.intent,
      matched: resultado.matched,
      score: resultado.score,
      prueba: esPrueba,
    });
  });

  /**
   * La página que el negocio le comparte a sus clientes: /c/mi-negocio
   *
   * Es una sola página para todos los negocios; el slug se lee de la URL en el navegador.
   * Así no hay que generar ni desplegar nada al dar de alta un negocio nuevo.
   */
  app.get('/c/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'chat.html'));
  });

  /**
   * El QR del chat, para imprimir y dejarlo en el mesón o en la mesa.
   * Va en SVG porque se imprime: no pierde nitidez a ningún tamaño.
   */
  app.get('/api/businesses/:slug/qr.svg', async (req, res) => {
    if (!repository.exists(req.params.slug)) {
      return res.status(404).json({ error: 'Ese negocio no existe.' });
    }

    // ?red=1 codifica la dirección dentro de la red local, que es la que sirve para
    // escanear desde un teléfono mientras se prueba en el computador.
    const destino =
      req.query.red === '1'
        ? urlEnLaRed(req, req.params.slug) || publicUrl(req, req.params.slug)
        : publicUrl(req, req.params.slug);

    const svg = await QRCode.toString(destino, {
      type: 'svg',
      margin: 1,
      // Nivel Q: sigue leyéndose aunque el papel se manche o se raye.
      errorCorrectionLevel: 'Q',
    });

    res.type('image/svg+xml').send(svg);
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

  app.post('/api/auth/signup', limitarAuth, (req, res) => {
    if (!registroAbierto) {
      return res.status(403).json({ error: 'El registro de cuentas nuevas está cerrado.' });
    }
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

  app.post('/api/auth/login', limitarAuth, (req, res) => {
    const { email, password } = req.body || {};
    const clave = `${UserStore.normalizeEmail(email)}|${req.ip}`;

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

  /**
   * Cambia la contraseña. Pide la actual (una sesión olvidada abierta no basta para
   * quedarse con la cuenta) y cierra todas las demás sesiones: si alguien más había
   * entrado, queda fuera.
   */
  app.post('/api/auth/password', limitarAuth, requireAuth, (req, res) => {
    const { actual, nueva } = req.body || {};
    try {
      users.setPassword(req.user.id, nueva, { actual: typeof actual === 'string' ? actual : '' });
    } catch (err) {
      if (err instanceof AuthError) return res.status(422).json({ error: err.message, campo: err.campo });
      throw err;
    }
    authSessions.destroyAllFor(req.user.id);
    abrirSesion(res, req.user);
    res.json({ ok: true });
  });

  // ============================================================ PRIVADO: el panel

  /** Solo los negocios de quien pregunta. */
  app.get('/api/businesses', requireAuth, (req, res) => {
    res.json({ businesses: repository.listByOwner(req.user.id) });
  });

  /** Los ejemplos que vienen con PymeBot, para copiar uno y partir de ahí. */
  app.get('/api/examples', requireAuth, (req, res) => {
    res.json({ examples: modoCliente ? [] : repository.listExamples() });
  });

  app.get('/api/businesses/:slug', requireAuth, requireOwnedBusiness, (req, res) => {
    res.json({ slug: req.params.slug, business: req.business });
  });

  /** Todo lo que el dueño necesita para llevar clientes a su bot. */
  app.get('/api/businesses/:slug/share', requireAuth, requireOwnedBusiness, (req, res) => {
    const url = publicUrl(req, req.params.slug);
    const origen = url.slice(0, url.indexOf('/c/'));
    const soloLocal = esSoloLocal(url);

    res.json({
      url,
      qr: `/api/businesses/${req.params.slug}/qr.svg`,
      embed:
        `<script src="${origen}/widget.js" data-negocio="${req.params.slug}" defer></script>`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`Resuelve tus dudas por aquí: ${url}`)}`,
      // Si la dirección solo existe en este computador, el QR no sirve para escanear.
      // Se ofrece la de la red local, que un teléfono en la misma wifi sí puede abrir.
      soloLocal,
      urlEnLaRed: soloLocal ? urlEnLaRed(req, req.params.slug) : null,
      qrEnLaRed: soloLocal ? `/api/businesses/${req.params.slug}/qr.svg?red=1` : null,
    });
  });

  /** Qué preguntaron los clientes, y qué no supo responder el bot. */
  app.get('/api/businesses/:slug/metrics', requireAuth, requireOwnedBusiness, (req, res) => {
    const dias = Math.min(Math.max(Number(req.query.dias) || 14, 1), 90);
    res.json(resumir(conversations.leer(req.params.slug), { dias }));
  });

  /**
   * Las conversaciones completas, para leerlas.
   *
   * Son datos de los clientes del negocio, así que solo las ve su dueño: van detrás de
   * requireOwnedBusiness igual que todo lo demás.
   */
  app.get('/api/businesses/:slug/conversations', requireAuth, requireOwnedBusiness, (req, res) => {
    const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200);
    res.json({ conversaciones: conversaciones(conversations.leer(req.params.slug), { limite }) });
  });

  /** Vacía las conversaciones: por ejemplo, las de las pruebas antes de abrir al público. */
  app.delete('/api/businesses/:slug/conversations', limitarEscritura, requireAuth, requireOwnedBusiness, (req, res) => {
    conversations.borrar(req.params.slug);
    res.json({ ok: true });
  });

  app.post('/api/businesses', limitarEscritura, requireAuth, (req, res) => {
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
    const ejemplo = modoCliente ? null : repository.get(req.params.slug);
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

  app.put('/api/businesses/:slug', limitarEscritura, requireAuth, requireOwnedBusiness, (req, res) => {
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
    // Las conversaciones se van con el negocio: no tiene sentido guardar el registro de
    // algo que ya no existe, y son datos de clientes de alguien.
    conversations.borrar(req.params.slug);
    res.json({ ok: true });
  });

  // Una ruta de la API que no existe responde en JSON, como el resto de la API.
  app.use('/api', (req, res) => res.status(404).json({ error: 'No existe.' }));

  /*
   * Último recurso. Un JSON mal formado es culpa de quien lo mandó (400); cualquier otra
   * cosa es nuestra (500). En ningún caso sale el detalle interno del error: diría qué
   * archivos y versiones hay por dentro.
   */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
      return res.status(err.status || 400).json({ error: 'La petición no es válida.' });
    }
    console.error('Error no controlado:', err);
    res.status(500).json({ error: 'Algo falló de nuestro lado. Inténtalo de nuevo en un momento.' });
  });

  return app;
}

module.exports = { createApp, MAX_MESSAGE_LENGTH, DEFAULT_SLUG, negocioInicial };
