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
const { Avisos } = require('../src/http/eventos');
const { AVISO_PERSONA, AVISO_TOMADA, AVISO_DEVUELTA } = require('../src/chat/atender');

const CLAVE = 'clave-de-la-duena';

async function servidor() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-atencion-'));
  const repository = new BusinessRepository({ dir: path.join(dir, 'businesses') });
  const users = new UserStore({ file: path.join(dir, 'users.json') });
  const duena = users.create({ email: 'duena@spa.cl', password: CLAVE });
  users.create({ email: 'otra@spa.cl', password: CLAVE });
  repository.save('spa', {
    name: 'Spa',
    handoff: 'Escríbenos por WhatsApp.',
    topics: ['Horario'],
    intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 10 a 21.' }],
    ownerId: duena.id,
  });

  const conversations = new ConversationLog({ dir: path.join(dir, 'conversaciones') });
  const avisos = new Avisos();
  const app = createApp({
    repository,
    users,
    authSessions: new AuthSessionStore({ file: path.join(dir, 'sessions.json') }),
    conversations,
    avisos,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function pedir(method, ruta, { body, cookie } = {}) {
    const res = await fetch(`${base}${ruta}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async function entrar(email) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: CLAVE }),
    });
    return res.headers.get('set-cookie').split(';')[0];
  }

  const chat = (message, sessionId) =>
    pedir('POST', '/api/chat', { body: { business: 'spa', message, sessionId } });
  const novedades = (sessionId, desde) =>
    pedir('GET', `/api/chat/novedades?sessionId=${sessionId}${desde === undefined ? '' : `&desde=${desde}`}`);

  return {
    pedir,
    entrar,
    chat,
    novedades,
    conversations,
    close: () => {
      avisos.cerrarTodo();
      return new Promise((r) => server.close(r));
    },
  };
}

test('el cliente pide una persona: el bot da el contacto, avisa y la dueña lo ve esperando', async () => {
  const srv = await servidor();
  try {
    const { body } = await srv.chat('quiero hablar con una persona');
    assert.strictEqual(body.intent, 'hablar_con_persona');
    assert.ok(body.reply.includes('WhatsApp'));
    assert.ok(body.reply.includes(AVISO_PERSONA));

    const duena = await srv.entrar('duena@spa.cl');
    const lista = (await srv.pedir('GET', '/api/businesses/spa/en-vivo', { cookie: duena })).body.conversaciones;
    assert.strictEqual(lista.length, 1);
    assert.strictEqual(lista[0].id, body.sessionId);
    assert.strictEqual(lista[0].esperaPersona, true);
    assert.strictEqual(lista[0].modo, 'bot');

    // Mientras nadie la tome, el bot sigue respondiendo.
    const despues = await srv.chat('a que hora abren', body.sessionId);
    assert.strictEqual(despues.body.reply, 'De 10 a 21.');
  } finally {
    await srv.close();
  }
});

test('la dueña responde: el bot se calla, el cliente recibe su mensaje y ella el del cliente', async () => {
  const srv = await servidor();
  try {
    const { body: primero } = await srv.chat('hola, quiero hablar con alguien');
    const id = primero.sessionId;
    const inicio = (await srv.novedades(id)).body;
    assert.deepStrictEqual(inicio.mensajes, [], 'al abrir, el chat solo recibe el punto de partida');

    const duena = await srv.entrar('duena@spa.cl');
    const respondio = await srv.pedir('POST', `/api/businesses/spa/en-vivo/${id}/responder`, {
      cookie: duena,
      body: { texto: 'Hola, soy Ana del spa. ¿En qué te ayudo?' },
    });
    assert.strictEqual(respondio.status, 200);
    assert.strictEqual(respondio.body.conversacion.modo, 'persona');
    assert.strictEqual(respondio.body.conversacion.esperaPersona, false);

    // El chat del cliente recoge lo que escribió la dueña.
    const nuevas = (await srv.novedades(id, inicio.desde)).body;
    assert.strictEqual(nuevas.modo, 'persona');
    assert.deepStrictEqual(nuevas.mensajes.map((m) => [m.quien, m.texto]), [
      ['dueno', 'Hola, soy Ana del spa. ¿En qué te ayudo?'],
    ]);
    // Pedir de nuevo desde el último no repite nada.
    assert.deepStrictEqual((await srv.novedades(id, nuevas.desde)).body.mensajes, []);

    // Ahora el cliente le escribe a ella: el bot no responde.
    const delCliente = await srv.chat('a que hora abren', id);
    assert.strictEqual(delCliente.body.reply, null);
    assert.strictEqual(delCliente.body.enVivo, true);

    const enElPanel = (await srv.pedir('GET', '/api/businesses/spa/en-vivo', { cookie: duena })).body.conversaciones[0];
    assert.deepStrictEqual(enElPanel.mensajes.slice(-2).map((m) => m.quien), ['dueno', 'cliente']);
  } finally {
    await srv.close();
  }
});

test('la dueña devuelve la conversación: el bot vuelve a responder y el cliente se entera', async () => {
  const srv = await servidor();
  try {
    const id = (await srv.chat('horario?')).body.sessionId;
    const desde = (await srv.novedades(id)).body.desde;
    const duena = await srv.entrar('duena@spa.cl');

    await srv.pedir('POST', `/api/businesses/spa/en-vivo/${id}/tomar`, { cookie: duena });
    assert.strictEqual((await srv.chat('hola?', id)).body.reply, null, 'tomada, el bot se calla');

    await srv.pedir('POST', `/api/businesses/spa/en-vivo/${id}/devolver`, { cookie: duena });
    assert.strictEqual((await srv.chat('a que hora abren', id)).body.reply, 'De 10 a 21.');

    const avisos = (await srv.novedades(id, desde)).body.mensajes.map((m) => [m.quien, m.texto]);
    assert.deepStrictEqual(avisos, [['sistema', AVISO_TOMADA], ['sistema', AVISO_DEVUELTA]]);
  } finally {
    await srv.close();
  }
});

test('los mensajes en vivo se leen en las conversaciones pero no cuentan en las cifras', async () => {
  const srv = await servidor();
  try {
    const id = (await srv.chat('a que hora abren')).body.sessionId;
    const duena = await srv.entrar('duena@spa.cl');
    await srv.pedir('POST', `/api/businesses/spa/en-vivo/${id}/responder`, { cookie: duena, body: { texto: 'Hola, te ayudo yo.' } });
    await srv.chat('gracias!', id);

    const conversacion = (await srv.pedir('GET', '/api/businesses/spa/conversations', { cookie: duena })).body.conversaciones[0];
    assert.strictEqual(conversacion.enVivo, true);
    assert.strictEqual(conversacion.sinRespuesta, 0, 'lo que respondió la dueña no es un fallo del bot');
    assert.deepStrictEqual(
      conversacion.mensajes.map((m) => [m.pregunta, m.respuesta, m.autor]),
      [['a que hora abren', 'De 10 a 21.', null], [null, 'Hola, te ayudo yo.', 'dueno'], ['gracias!', null, null]],
    );

    const cifras = (await srv.pedir('GET', '/api/businesses/spa/metrics', { cookie: duena })).body;
    assert.strictEqual(cifras.mensajes, 1);
    assert.strictEqual(cifras.sinRespuesta, 0);
  } finally {
    await srv.close();
  }
});

test('nadie más puede ver ni atender las conversaciones de un negocio', async () => {
  const srv = await servidor();
  try {
    const id = (await srv.chat('quiero hablar con una persona')).body.sessionId;
    const ruta = `/api/businesses/spa/en-vivo/${id}/responder`;

    assert.strictEqual((await srv.pedir('GET', '/api/businesses/spa/en-vivo')).status, 401);
    assert.strictEqual((await srv.pedir('POST', ruta, { body: { texto: 'hola' } })).status, 401);

    const otra = await srv.entrar('otra@spa.cl');
    assert.strictEqual((await srv.pedir('GET', '/api/businesses/spa/en-vivo', { cookie: otra })).status, 404);
    assert.strictEqual((await srv.pedir('POST', ruta, { cookie: otra, body: { texto: 'hola' } })).status, 404);

    // Una conversación que no existe, o un mensaje vacío, no rompen nada.
    const duena = await srv.entrar('duena@spa.cl');
    assert.strictEqual((await srv.pedir('POST', '/api/businesses/spa/en-vivo/no-existe/responder', { cookie: duena, body: { texto: 'hola' } })).status, 404);
    assert.strictEqual((await srv.pedir('POST', ruta, { cookie: duena, body: { texto: '   ' } })).status, 400);

    // Sin una conversación válida, las novedades no dicen nada.
    assert.deepStrictEqual((await srv.novedades('inventado')).body.mensajes, []);
  } finally {
    await srv.close();
  }
});
