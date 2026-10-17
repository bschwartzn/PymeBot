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

const CLAVE = 'clave-de-la-duena';
const NEGOCIO = {
  name: 'Spa de Prueba',
  topics: ['Horarios'],
  intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 10 a 21.' }],
};

/**
 * Un servidor aislado como el de un cliente: la dueña ya tiene cuenta y su negocio.
 * `opciones` se pasan a createApp (registroAbierto, modoCliente).
 */
async function servidor(opciones = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-seg-'));
  const repository = new BusinessRepository({ dir: path.join(dir, 'businesses') });
  const users = new UserStore({ file: path.join(dir, 'users.json') });
  const authSessions = new AuthSessionStore({ file: path.join(dir, 'sessions.json') });
  const conversations = new ConversationLog({ dir: path.join(dir, 'conversaciones') });

  const duena = users.create({ email: 'duena@spa.cl', password: CLAVE });
  repository.save('spa', { ...NEGOCIO, ownerId: duena.id });
  repository.save('ejemplo', NEGOCIO); // sin dueño, como los ejemplos de PymeBot

  const app = createApp({ repository, users, authSessions, conversations, ...opciones });
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Un navegador: recuerda su cookie. */
  function navegador({ ip = null, origen = null } = {}) {
    let cookie = null;
    return async function pedir(method, ruta, body) {
      const res = await fetch(base + ruta, {
        method,
        redirect: 'manual',
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(ip ? { 'X-Forwarded-For': ip } : {}),
          ...(origen ? { Origin: origen } : {}),
        },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const texto = await res.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch (err) {
        json = null;
      }
      return { status: res.status, body: json, texto, headers: res.headers };
    };
  }

  async function entrar(pedir, password = CLAVE) {
    return pedir('POST', '/api/auth/login', { email: 'duena@spa.cl', password });
  }

  return { base, navegador, entrar, conversations, users, close: () => new Promise((r) => server.close(r)) };
}

test('con el registro cerrado nadie puede crear una cuenta', async () => {
  const srv = await servidor({ registroAbierto: false });
  try {
    const pedir = srv.navegador();
    const res = await pedir('POST', '/api/auth/signup', { email: 'intruso@x.cl', password: 'otraclave123' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(srv.users.findByEmail('intruso@x.cl'), null);
    assert.deepStrictEqual((await pedir('GET', '/api/instalacion')).body, { registroAbierto: false });
  } finally {
    await srv.close();
  }
});

test('una petición que modifica algo desde otro sitio se rechaza (CSRF)', async () => {
  const srv = await servidor();
  try {
    const ajeno = srv.navegador({ origen: 'https://sitio-malicioso.com' });
    assert.strictEqual((await ajeno('POST', '/api/auth/login', { email: 'duena@spa.cl', password: CLAVE })).status, 403);

    const propio = srv.navegador({ origen: srv.base });
    assert.strictEqual((await propio('POST', '/api/auth/login', { email: 'duena@spa.cl', password: CLAVE })).status, 200);
  } finally {
    await srv.close();
  }
});

test('fallar la contraseña desde una IP no bloquea a la dueña en la suya', async () => {
  const srv = await servidor();
  try {
    const atacante = srv.navegador({ ip: '203.0.113.9' });
    for (let i = 0; i < 12; i += 1) await srv.entrar(atacante, 'clave-equivocada');
    assert.strictEqual((await srv.entrar(atacante)).status, 429, 'el atacante queda bloqueado');

    const duena = srv.navegador({ ip: '198.51.100.7' });
    assert.strictEqual((await srv.entrar(duena)).status, 200, 'la dueña sigue entrando');
  } finally {
    await srv.close();
  }
});

test('cambiar la contraseña exige la actual y cierra las demás sesiones', async () => {
  const srv = await servidor();
  try {
    const telefono = srv.navegador();
    const computador = srv.navegador();
    await srv.entrar(telefono);
    await srv.entrar(computador);

    const mal = await computador('POST', '/api/auth/password', { actual: 'no-es', nueva: 'nueva-clave-123' });
    assert.strictEqual(mal.status, 422);

    const bien = await computador('POST', '/api/auth/password', { actual: CLAVE, nueva: 'nueva-clave-123' });
    assert.strictEqual(bien.status, 200);

    assert.strictEqual((await computador('GET', '/api/businesses')).status, 200, 'quien la cambió sigue dentro');
    assert.strictEqual((await telefono('GET', '/api/businesses')).status, 401, 'el otro dispositivo queda fuera');
    assert.strictEqual((await srv.entrar(srv.navegador())).status, 401, 'la contraseña vieja ya no sirve');
    assert.strictEqual((await srv.entrar(srv.navegador(), 'nueva-clave-123')).status, 200);
  } finally {
    await srv.close();
  }
});

test('las pruebas de la dueña no se mezclan con las conversaciones de sus clientes', async () => {
  const srv = await servidor();
  try {
    const duena = srv.navegador();
    await srv.entrar(duena);
    const suya = await duena('POST', '/api/chat', { business: 'spa', message: 'a que hora abren' });
    assert.strictEqual(suya.body.prueba, true);
    assert.strictEqual((await duena('GET', '/api/business?slug=spa')).body.esDueno, true);

    const cliente = srv.navegador();
    const delCliente = await cliente('POST', '/api/chat', { business: 'spa', message: 'horario?' });
    assert.strictEqual(delCliente.body.prueba, false);
    assert.strictEqual((await cliente('GET', '/api/business?slug=spa')).body.esDueno, false);

    const registro = srv.conversations.leer('spa');
    assert.deepStrictEqual(registro.map((r) => r.pregunta), ['horario?']);
  } finally {
    await srv.close();
  }
});

test('la dueña puede vaciar sus conversaciones, y nadie más', async () => {
  const srv = await servidor();
  try {
    await srv.navegador()('POST', '/api/chat', { business: 'spa', message: 'horario' });

    assert.strictEqual((await srv.navegador()('DELETE', '/api/businesses/spa/conversations')).status, 401);
    assert.strictEqual(srv.conversations.leer('spa').length, 1);

    const duena = srv.navegador();
    await srv.entrar(duena);
    assert.strictEqual((await duena('DELETE', '/api/businesses/spa/conversations')).status, 200);
    assert.strictEqual(srv.conversations.leer('spa').length, 0);
  } finally {
    await srv.close();
  }
});

test('en el bot de un cliente la portada abre su chat y no hay ejemplos ni directorio', async () => {
  const srv = await servidor({ modoCliente: true, registroAbierto: false });
  try {
    const pedir = srv.navegador();
    const portada = await pedir('GET', '/');
    assert.strictEqual(portada.status, 302);
    assert.match(portada.headers.get('location'), /^\/c\//);
    assert.strictEqual((await pedir('GET', '/index.html')).status, 302, 'el sandbox interno no se publica');
    assert.strictEqual((await pedir('GET', '/api/directory')).status, 404);

    await srv.entrar(pedir);
    assert.deepStrictEqual((await pedir('GET', '/api/examples')).body, { examples: [] });
    assert.strictEqual((await pedir('POST', '/api/examples/ejemplo/copy')).status, 404);
  } finally {
    await srv.close();
  }
});

test('/health no dice cuántas cuentas ni sesiones hay', async () => {
  const srv = await servidor();
  try {
    const { body } = await srv.navegador()('GET', '/health');
    assert.deepStrictEqual(Object.keys(body).sort(), ['status', 'uptime']);
  } finally {
    await srv.close();
  }
});

test('un JSON mal formado responde 400 sin detalles internos', async () => {
  const srv = await servidor();
  try {
    const res = await srv.navegador()('POST', '/api/chat', '{"message": ');
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, { error: 'La petición no es válida.' });
    assert.ok(!/node_modules|at \w+ \(/.test(res.texto), 'no filtra la traza del error');
  } finally {
    await srv.close();
  }
});

test('un mensaje con tipos raros no rompe el chat', async () => {
  const srv = await servidor();
  try {
    const pedir = srv.navegador();
    const raro = await pedir('POST', '/api/chat', { business: ['spa'], sessionId: { $ne: 1 }, message: 'horario' });
    assert.strictEqual(raro.status, 200);
    assert.strictEqual(typeof raro.body.reply, 'string');
    assert.strictEqual((await pedir('POST', '/api/chat', { message: 42 })).status, 400);
  } finally {
    await srv.close();
  }
});

test('el registro de conversaciones tiene un techo de tamaño', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-techo-'));
  const log = new ConversationLog({ dir, maxBytes: 2000 });
  const linea = { conversationId: 'c', channel: 'web', pregunta: 'x'.repeat(200), respuesta: 'y', intent: 'i', matched: true, score: 1 };

  for (let i = 0; i < 100; i += 1) log.registrar('spa', linea);

  const archivos = fs.readdirSync(dir);
  assert.deepStrictEqual(archivos.sort(), ['spa.anterior.jsonl', 'spa.jsonl']);
  const total = archivos.reduce((suma, f) => suma + fs.statSync(path.join(dir, f)).size, 0);
  assert.ok(total < 2 * 2000 + 1000, `ocupa ${total} bytes: debería quedar acotado`);
  assert.ok(log.leer('spa').length > 0, 'lo reciente se sigue leyendo');

  log.borrar('spa');
  assert.deepStrictEqual(fs.readdirSync(dir), [], 'borrar se lleva también lo archivado');
});
