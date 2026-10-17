const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ConversationLog } = require('../src/chat/conversaciones');
const { createApp, MAX_MESSAGE_LENGTH } = require('../src/server');
const { BusinessRepository } = require('../src/knowledge/repository');

/** Negocio fijo, para que estos tests no dependan de cuál esté por defecto en data/. */
const NEGOCIO = {
  name: 'Negocio de Prueba',
  tagline: 'Para los tests',
  greeting: '¡Hola! Soy el asistente de prueba.',
  greetingRepeat: '¡Aquí sigo!',
  topics: ['Horarios', 'Precios'],
  intents: [
    { id: 'saludo', keywords: ['hola', 'buenas'], answer: '¡Hola! ¿En qué te ayudo?' },
    { id: 'horarios', keywords: ['horario', 'abren', 'a que hora'], answer: 'Abrimos de 10:00 a 20:00.' },
    { id: 'precios', keywords: ['precio', 'cuanto cuesta'], answer: 'El corte sale $12.000.' },
  ],
};

/** Levanta la app en un puerto libre y devuelve helpers para hablarle. */
async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-m1-'));
  const repository = new BusinessRepository({ dir });
  repository.save('negocio-de-prueba', NEGOCIO);

  const app = createApp({ repository, conversations: new ConversationLog({ dir: path.join(dir, 'conversaciones') }) });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    async post(path, body) {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    },
    async get(path) {
      const res = await fetch(base + path);
      return { status: res.status, body: await res.json() };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('GET /health responde ok', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.get('/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'ok');
    // Solo dice si está viva: cuántas cuentas o negocios hay no es público.
    assert.deepStrictEqual(Object.keys(body).sort(), ['status', 'uptime']);
  } finally {
    await srv.close();
  }
});

test('GET /api/business entrega lo que el sandbox necesita para pintarse', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.get('/api/business');
    assert.strictEqual(status, 200);
    assert.ok(body.name);
    assert.ok(body.greeting);
    assert.ok(Array.isArray(body.topics) && body.topics.length > 0);
  } finally {
    await srv.close();
  }
});

test('POST /api/chat responde y devuelve un sessionId', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.post('/api/chat', { message: '¿A qué hora abren?' });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.intent, 'horarios');
    assert.ok(body.reply.includes('10:00'));
    assert.ok(body.sessionId);
  } finally {
    await srv.close();
  }
});

test('la conversación mantiene la sesión entre mensajes', async () => {
  const srv = await startServer();
  try {
    const primera = await srv.post('/api/chat', { message: 'hola' });
    const sessionId = primera.body.sessionId;

    const segunda = await srv.post('/api/chat', { message: 'cuanto cuesta un corte', sessionId });
    assert.strictEqual(segunda.body.sessionId, sessionId);
    assert.strictEqual(segunda.body.intent, 'precios');

    // El saludo repetido dentro de la misma sesión usa la variante corta.
    const tercera = await srv.post('/api/chat', { message: 'hola', sessionId });
    assert.strictEqual(tercera.body.intent, 'saludo');
    assert.notStrictEqual(tercera.body.reply, primera.body.reply);
  } finally {
    await srv.close();
  }
});

test('POST /api/chat rechaza mensajes vacíos o ausentes', async () => {
  const srv = await startServer();
  try {
    assert.strictEqual((await srv.post('/api/chat', {})).status, 400);
    assert.strictEqual((await srv.post('/api/chat', { message: '' })).status, 400);
    assert.strictEqual((await srv.post('/api/chat', { message: '   ' })).status, 400);
    assert.strictEqual((await srv.post('/api/chat', { message: 123 })).status, 400);
  } finally {
    await srv.close();
  }
});

test('POST /api/chat rechaza mensajes demasiado largos', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.post('/api/chat', { message: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) });
    assert.strictEqual(status, 400);
    assert.ok(body.error.includes(String(MAX_MESSAGE_LENGTH)));
  } finally {
    await srv.close();
  }
});

test('POST /api/reset limpia la conversación y vuelve a saludar largo', async () => {
  const srv = await startServer();
  try {
    const primera = await srv.post('/api/chat', { message: 'hola' });
    const sessionId = primera.body.sessionId;

    await srv.post('/api/reset', { sessionId });

    const despues = await srv.post('/api/chat', { message: 'hola', sessionId });
    assert.strictEqual(despues.body.reply, primera.body.reply);
  } finally {
    await srv.close();
  }
});

test('el sandbox se sirve en la raíz', async () => {
  const srv = await startServer();
  try {
    const res = await fetch(srv.base + '/');
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('PymeBot'));
  } finally {
    await srv.close();
  }
});
