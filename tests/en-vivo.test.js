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

const CLAVE = 'clave-de-la-duena';

async function servidor() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-vivo-'));
  const repository = new BusinessRepository({ dir: path.join(dir, 'businesses') });
  const users = new UserStore({ file: path.join(dir, 'users.json') });
  const duena = users.create({ email: 'duena@spa.cl', password: CLAVE });
  const otra = users.create({ email: 'otra@spa.cl', password: CLAVE });
  repository.save('spa', {
    name: 'Spa',
    handoff: 'Escríbenos por WhatsApp.',
    topics: ['Horario'],
    intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 10 a 21.' }],
    ownerId: duena.id,
  });
  void otra;

  const avisos = new Avisos();
  const app = createApp({
    repository,
    users,
    authSessions: new AuthSessionStore({ file: path.join(dir, 'sessions.json') }),
    conversations: new ConversationLog({ dir: path.join(dir, 'conversaciones') }),
    avisos,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function entrar(email) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: CLAVE }),
    });
    return res.headers.get('set-cookie').split(';')[0];
  }

  function chat(message, cookie) {
    return fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ business: 'spa', message }),
    });
  }

  /** Abre el canal en vivo y junta los eventos que lleguen. */
  async function escuchar(cookie) {
    const controlador = new AbortController();
    const res = await fetch(`${base}/api/businesses/spa/eventos`, {
      headers: cookie ? { Cookie: cookie } : {},
      signal: controlador.signal,
    });
    const eventos = [];
    if (res.ok) {
      (async () => {
        const decodificador = new TextDecoder();
        let resto = '';
        try {
          for await (const trozo of res.body) {
            resto += decodificador.decode(trozo, { stream: true });
            const bloques = resto.split('\n\n');
            resto = bloques.pop();
            for (const bloque of bloques) {
              const tipo = /^event: (.+)$/m.exec(bloque);
              const datos = /^data: (.+)$/m.exec(bloque);
              if (tipo && datos) eventos.push({ tipo: tipo[1], datos: JSON.parse(datos[1]) });
            }
          }
        } catch (err) {
          /* se cerró la conexión */
        }
      })();
    }
    return { res, eventos, cerrar: () => controlador.abort() };
  }

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  return {
    entrar,
    chat,
    escuchar,
    esperar,
    avisos,
    close: () => {
      avisos.cerrarTodo();
      return new Promise((r) => server.close(r));
    },
  };
}

test('la dueña recibe al instante cada mensaje de un cliente', async () => {
  const srv = await servidor();
  try {
    const panel = await srv.escuchar(await srv.entrar('duena@spa.cl'));
    assert.strictEqual(panel.res.status, 200);
    assert.match(panel.res.headers.get('content-type'), /text\/event-stream/);
    await srv.esperar(50);

    await srv.chat('a que hora abren');
    await srv.chat('tienen estacionamiento?');
    await srv.chat('quiero hablar con una persona');
    await srv.esperar(100);

    assert.deepStrictEqual(
      panel.eventos.map((e) => [e.tipo, e.datos.pregunta, e.datos.sinRespuesta, e.datos.pideUnaPersona]),
      [
        ['mensaje', 'a que hora abren', false, false],
        ['mensaje', 'tienen estacionamiento?', true, false],
        ['mensaje', 'quiero hablar con una persona', false, true],
      ],
    );
    panel.cerrar();
  } finally {
    await srv.close();
  }
});

test('las pruebas de la dueña le llegan al panel marcadas como prueba', async () => {
  const srv = await servidor();
  try {
    const cookie = await srv.entrar('duena@spa.cl');
    const panel = await srv.escuchar(cookie);
    await srv.esperar(50);
    await srv.chat('horario', cookie);
    await srv.esperar(100);
    assert.strictEqual(panel.eventos.length, 1);
    assert.strictEqual(panel.eventos[0].datos.prueba, true);
    panel.cerrar();
  } finally {
    await srv.close();
  }
});

test('nadie más puede escuchar las conversaciones en vivo', async () => {
  const srv = await servidor();
  try {
    assert.strictEqual((await srv.escuchar(null)).res.status, 401, 'sin sesión');
    const ajena = await srv.escuchar(await srv.entrar('otra@spa.cl'));
    assert.strictEqual(ajena.res.status, 404, 'otra cuenta no ve un negocio que no es suyo');
  } finally {
    await srv.close();
  }
});

test('al cerrar el panel se libera la conexión', async () => {
  const srv = await servidor();
  try {
    const panel = await srv.escuchar(await srv.entrar('duena@spa.cl'));
    await srv.esperar(50);
    assert.strictEqual(srv.avisos.size, 1);
    panel.cerrar();
    await srv.esperar(100);
    assert.strictEqual(srv.avisos.size, 0);
  } finally {
    await srv.close();
  }
});
