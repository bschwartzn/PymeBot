const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ConversationLog } = require('../src/chat/conversaciones');
const { createApp } = require('../src/server');
const { BusinessRepository } = require('../src/knowledge/repository');
const { UserStore } = require('../src/auth/users');
const { AuthSessionStore } = require('../src/auth/sessions');
const { puedeIrEnIframe } = require('../src/http/seguridad');
const { rateLimit } = require('../src/http/limits');

const NEGOCIO = {
  name: 'Peluquería Test',
  topics: ['Horarios'],
  intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 10 a 20.' }],
};

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-prod-'));
  const repository = new BusinessRepository({ dir: path.join(dir, 'businesses') });
  repository.save('negocio', NEGOCIO);

  const server = await new Promise((r) => {
    const s = createApp({
      repository,
      users: new UserStore({ file: path.join(dir, 'users.json') }),
      authSessions: new AuthSessionStore({ file: path.join(dir, 'sessions.json') }),
      conversations: new ConversationLog({ dir: path.join(dir, 'conversaciones') }),
    }).listen(0, () => r(s));
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    get: (ruta) => fetch(base + ruta),
    chat: (mensaje) =>
      fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: mensaje, business: 'negocio' }),
      }),
    close: () => new Promise((r) => server.close(r)),
  };
}

/* ============================================================ cabeceras */

test('el panel no puede ir dentro de un iframe ajeno', async () => {
  const srv = await startServer();
  try {
    const res = await srv.get('/panel.html');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally {
    await srv.close();
  }
});

test('el chat del cliente SÍ puede: es lo que hace el widget en la web del negocio', async () => {
  const srv = await startServer();
  try {
    const res = await srv.get('/c/negocio');
    assert.strictEqual(res.headers.get('x-frame-options'), null, 'no debe bloquear el iframe');
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors \*/);

    const widget = await srv.get('/widget.js');
    assert.match(widget.headers.get('content-security-policy'), /frame-ancestors \*/);
  } finally {
    await srv.close();
  }
});

test('puedeIrEnIframe distingue las rutas públicas de las privadas', () => {
  for (const publica of ['/c/mi-negocio', '/c/otro', '/widget.js']) {
    assert.ok(puedeIrEnIframe(publica), `${publica} debería poder enmarcarse`);
  }
  for (const privada of ['/panel.html', '/api/businesses', '/', '/index.html']) {
    assert.ok(!puedeIrEnIframe(privada), `${privada} NO debería poder enmarcarse`);
  }
});

test('la política de contenido prohíbe scripts en línea', async () => {
  const srv = await startServer();
  try {
    const csp = (await srv.get('/c/negocio')).headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.ok(!csp.includes("'unsafe-inline'"), 'permitir scripts en línea anularía la CSP');
    assert.ok(!csp.includes("'unsafe-eval'"));
  } finally {
    await srv.close();
  }
});

test('no se anuncia la tecnología del servidor', async () => {
  const srv = await startServer();
  try {
    assert.strictEqual((await srv.get('/health')).headers.get('x-powered-by'), null);
    assert.strictEqual((await srv.get('/health')).headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await srv.close();
  }
});

/* ============================================================ límites */

test('el límite corta al superar el máximo y dice cuánto esperar', async () => {
  const llamadas = [];
  const middleware = rateLimit({ max: 3, windowMs: 60000 });

  const req = { ip: '1.2.3.4' };
  const res = {
    cabeceras: {},
    set(k, v) {
      this.cabeceras[k] = v;
    },
    status(c) {
      llamadas.push(c);
      return { json: () => {} };
    },
  };

  let pasadas = 0;
  for (let i = 0; i < 5; i += 1) middleware(req, res, () => { pasadas += 1; });

  assert.strictEqual(pasadas, 3, 'deberían pasar exactamente 3');
  assert.deepStrictEqual(llamadas, [429, 429]);
  assert.ok(Number(res.cabeceras['Retry-After']) > 0, 'debe decir cuántos segundos esperar');
});

test('cada IP tiene su propio contador: un abusador no bloquea a los demás', () => {
  const middleware = rateLimit({ max: 2, windowMs: 60000 });
  const res = { set() {}, status: () => ({ json: () => {} }) };

  let pasaronDeLaOtra = 0;
  for (let i = 0; i < 5; i += 1) middleware({ ip: '1.1.1.1' }, res, () => {});
  for (let i = 0; i < 2; i += 1) middleware({ ip: '2.2.2.2' }, res, () => { pasaronDeLaOtra += 1; });

  assert.strictEqual(pasaronDeLaOtra, 2, 'la segunda IP no debería verse afectada');
});

test('el chat público está limitado de verdad', async () => {
  const srv = await startServer();
  try {
    const codigos = [];
    for (let i = 0; i < 34; i += 1) codigos.push((await srv.chat('hola')).status);

    assert.ok(codigos.includes(429), 'el chat público debe tener límite antes de ser difundido');
    assert.strictEqual(codigos.filter((c) => c === 200).length, 30, 'el límite por defecto son 30');
  } finally {
    await srv.close();
  }
});

/* ============================================================ arranque */

test('un disco vacío se siembra con los ejemplos, y uno con datos no se toca', () => {
  const { sembrarSiEstaVacio } = require('../src/arranque');
  const config = require('../src/config');

  // Con datos reales dentro, sembrar no debe pisar nada.
  const antes = fs.readdirSync(config.businessesDir).length;
  assert.strictEqual(sembrarSiEstaVacio(), 0, 'no debe sembrar sobre un disco con datos');
  assert.strictEqual(fs.readdirSync(config.businessesDir).length, antes);
});

test('la configuración se puede redirigir por variables de entorno', () => {
  // Se recarga el módulo con otra variable, como haría el hosting.
  const ruta = require.resolve('../src/config');
  const original = process.env.PYMEBOT_DATA_DIR;
  delete require.cache[ruta];

  process.env.PYMEBOT_DATA_DIR = '/tmp/disco-de-prueba';
  const config = require('../src/config');

  assert.strictEqual(config.dataDir, '/tmp/disco-de-prueba');
  assert.strictEqual(config.businessesDir, '/tmp/disco-de-prueba/businesses');
  assert.strictEqual(config.usersFile, '/tmp/disco-de-prueba/users.json');

  // Dejar todo como estaba para no afectar a los demás tests.
  if (original === undefined) delete process.env.PYMEBOT_DATA_DIR;
  else process.env.PYMEBOT_DATA_DIR = original;
  delete require.cache[ruta];
  require('../src/config');
});
