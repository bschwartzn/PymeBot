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

const CLAVE = 'unaclavesegura';

const NEGOCIO = {
  name: 'Peluquería Test',
  topics: ['Horarios'],
  intents: [
    { id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 10 a 20.' },
    { id: 'precios', keywords: ['precio', 'cuanto cuesta'], answer: 'El corte sale $12.000.' },
  ],
};

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-api-'));
  const repository = new BusinessRepository({ dir: path.join(dir, 'businesses') });
  const users = new UserStore({ file: path.join(dir, 'users.json') });
  const authSessions = new AuthSessionStore({ file: path.join(dir, 'sessions.json') });
  const conversations = new ConversationLog({ dir: path.join(dir, 'conversaciones') });

  const server = await new Promise((r) => {
    const s = createApp({ repository, users, authSessions, conversations }).listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Cliente con cookie propia, como un navegador. */
  function cliente() {
    let cookie = null;
    const pedir = async (method, ruta, body) => {
      const res = await fetch(base + ruta, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return { status: res.status, body: await res.json() };
    };
    return {
      get: (r) => pedir('GET', r),
      post: (r, b) => pedir('POST', r, b),
      put: (r, b) => pedir('PUT', r, b),
      del: (r) => pedir('DELETE', r),
      entrar: (email) => pedir('POST', '/api/auth/signup', { email, password: CLAVE }),
    };
  }

  /** Un dueño con sesión abierta y un negocio suyo. */
  async function dueno(email, negocio = NEGOCIO) {
    const c = cliente();
    const { body } = await c.entrar(email);
    const { slug } = repository.create({ ...negocio, ownerId: body.user.id });
    return { ...c, userId: body.user.id, slug };
  }

  return {
    base,
    dir,
    repository,
    cliente,
    dueno,
    close: () => new Promise((r) => server.close(r)),
  };
}

/* ============================================================ sin sesión */

test('sin sesión no se puede ver ni tocar ningún negocio', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const anonimo = srv.cliente();

    assert.strictEqual((await anonimo.get('/api/businesses')).status, 401);
    assert.strictEqual((await anonimo.get(`/api/businesses/${ana.slug}`)).status, 401);
    assert.strictEqual((await anonimo.post('/api/businesses', { name: 'Mío' })).status, 401);
    assert.strictEqual((await anonimo.put(`/api/businesses/${ana.slug}`, NEGOCIO)).status, 401);
    assert.strictEqual((await anonimo.del(`/api/businesses/${ana.slug}`)).status, 401);
  } finally {
    await srv.close();
  }
});

test('el chat sigue siendo público: conversar no exige cuenta', async () => {
  const srv = await startServer();
  try {
    await srv.dueno('ana@ejemplo.cl');
    const anonimo = srv.cliente();

    const chat = await anonimo.post('/api/chat', { message: 'a que hora abren' });
    assert.strictEqual(chat.status, 200);
    assert.strictEqual(chat.body.reply, 'De 10 a 20.');

    assert.strictEqual((await anonimo.get('/api/directory')).status, 200);
    assert.strictEqual((await anonimo.get('/api/business')).status, 200);
  } finally {
    await srv.close();
  }
});

/* ============================================================ aislamiento entre dueños */

test('cada dueño solo ve sus propios negocios', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl', { ...NEGOCIO, name: 'Peluquería de Ana' });
    const beto = await srv.dueno('beto@ejemplo.cl', { ...NEGOCIO, name: 'Taller de Beto' });

    const deAna = (await ana.get('/api/businesses')).body.businesses;
    const deBeto = (await beto.get('/api/businesses')).body.businesses;

    assert.deepStrictEqual(deAna.map((n) => n.name), ['Peluquería de Ana']);
    assert.deepStrictEqual(deBeto.map((n) => n.name), ['Taller de Beto']);
  } finally {
    await srv.close();
  }
});

test('un dueño no puede leer, editar ni borrar el negocio de otro', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const beto = await srv.dueno('beto@ejemplo.cl');

    // Responde 404 y no 403: decir "existe pero no es tuyo" ya filtra información.
    assert.strictEqual((await beto.get(`/api/businesses/${ana.slug}`)).status, 404);
    assert.strictEqual((await beto.put(`/api/businesses/${ana.slug}`, { ...NEGOCIO, name: 'Secuestrado' })).status, 404);
    assert.strictEqual((await beto.del(`/api/businesses/${ana.slug}`)).status, 404);

    // Y el negocio de Ana quedó intacto.
    assert.strictEqual(srv.repository.get(ana.slug).name, 'Peluquería Test');
  } finally {
    await srv.close();
  }
});

test('nadie puede apropiarse de un negocio mandando otro ownerId', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const beto = await srv.dueno('beto@ejemplo.cl');

    // Ana intenta regalarle su negocio a Beto... y el servidor ignora el ownerId del cuerpo.
    await ana.put(`/api/businesses/${ana.slug}`, { ...NEGOCIO, ownerId: beto.userId });
    assert.strictEqual(srv.repository.get(ana.slug).ownerId, ana.userId);

    // Y Beto sigue sin verlo.
    assert.strictEqual((await beto.get(`/api/businesses/${ana.slug}`)).status, 404);
  } finally {
    await srv.close();
  }
});

test('los ejemplos sin dueño no los puede editar nadie', async () => {
  const srv = await startServer();
  try {
    srv.repository.save('ejemplo', NEGOCIO); // sin ownerId
    const ana = await srv.dueno('ana@ejemplo.cl');

    assert.strictEqual((await ana.get('/api/businesses/ejemplo')).status, 404);
    assert.strictEqual((await ana.put('/api/businesses/ejemplo', NEGOCIO)).status, 404);
    assert.strictEqual((await ana.del('/api/businesses/ejemplo')).status, 404);
    assert.strictEqual(srv.repository.get('ejemplo').ownerId, null);
  } finally {
    await srv.close();
  }
});

test('copiar un ejemplo lo deja en la cuenta de quien lo copió', async () => {
  const srv = await startServer();
  try {
    srv.repository.save('ejemplo', { ...NEGOCIO, name: 'Negocio de Ejemplo' });
    const ana = await srv.dueno('ana@ejemplo.cl');

    const copia = await ana.post('/api/examples/ejemplo/copy');
    assert.strictEqual(copia.status, 201);
    assert.strictEqual(copia.body.business.ownerId, ana.userId);
    assert.ok(copia.body.business.name.includes('mi copia'));

    // El original no se tocó.
    assert.strictEqual(srv.repository.get('ejemplo').ownerId, null);
  } finally {
    await srv.close();
  }
});

/* ============================================================ edición */

test('crear, guardar y borrar el negocio propio funciona de punta a punta', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');

    const creado = await ana.post('/api/businesses', { name: 'Café Central' });
    assert.strictEqual(creado.status, 201);
    assert.strictEqual(creado.body.slug, 'cafe-central');

    const guardado = await ana.put(`/api/businesses/${creado.body.slug}`, {
      ...NEGOCIO,
      name: 'Café Central',
      intents: [{ id: 'horarios', keywords: ['horario'], answer: 'Ahora de 8 a 20.' }],
    });
    assert.strictEqual(guardado.status, 200);
    assert.strictEqual(srv.repository.get(creado.body.slug).intents[0].answer, 'Ahora de 8 a 20.');

    assert.strictEqual((await ana.del(`/api/businesses/${creado.body.slug}`)).status, 200);
    assert.strictEqual(srv.repository.exists(creado.body.slug), false);
  } finally {
    await srv.close();
  }
});

test('guardar información inválida devuelve 422 y no toca lo anterior', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');

    const { status, body } = await ana.put(`/api/businesses/${ana.slug}`, { name: '', intents: [] });
    assert.strictEqual(status, 422);
    assert.ok(body.errors.length >= 2);
    assert.strictEqual(srv.repository.get(ana.slug).name, 'Peluquería Test');
  } finally {
    await srv.close();
  }
});

test('guardar algo dudoso se permite, pero devuelve advertencias', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const { status, body } = await ana.put(`/api/businesses/${ana.slug}`, {
      ...NEGOCIO,
      intents: [
        { id: 'horarios', keywords: ['corte'], answer: 'De 10 a 20.' },
        { id: 'precios', keywords: ['corte'], answer: '$12.000.' },
      ],
    });
    assert.strictEqual(status, 200);
    assert.ok(body.warnings.some((w) => w.mensaje.includes('horarios') && w.mensaje.includes('precios')));
  } finally {
    await srv.close();
  }
});

test('un cambio guardado se refleja en el chat sin reiniciar el servidor', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const anonimo = srv.cliente();

    const antes = await anonimo.post('/api/chat', { message: 'a que hora abren', business: ana.slug });
    assert.strictEqual(antes.body.reply, 'De 10 a 20.');

    await ana.put(`/api/businesses/${ana.slug}`, {
      ...NEGOCIO,
      intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'Cambiamos: ahora de 11 a 21.' }],
    });

    const despues = await anonimo.post('/api/chat', { message: 'a que hora abren', business: ana.slug });
    assert.strictEqual(despues.body.reply, 'Cambiamos: ahora de 11 a 21.');
  } finally {
    await srv.close();
  }
});

test('un slug con recorrido de rutas no escribe fuera del directorio de datos', async () => {
  const srv = await startServer();
  const padre = path.dirname(srv.repository.dir);

  try {
    const ana = await srv.dueno('ana@ejemplo.cl');

    // La foto se toma DESPUÉS de registrar al dueño: ese registro crea users.json y
    // sessions.json en el mismo directorio, y son archivos legítimos.
    const antes = fs.readdirSync(padre).sort();
    const negociosAntes = srv.repository.list().map((n) => n.slug);

    const maliciosos = ['..%2f..%2fpwned', '%2e%2e%2f%2e%2e%2fpwned', '..%5c..%5cpwned'];

    for (const slug of maliciosos) {
      const { status } = await ana.put(`/api/businesses/${slug}`, NEGOCIO);
      assert.ok(status === 404 || status === 422, `${slug} debería rechazarse, devolvió ${status}`);
    }

    assert.deepStrictEqual(fs.readdirSync(padre).sort(), antes, 'se creó algo fuera del directorio de datos');
    assert.deepStrictEqual(srv.repository.list().map((n) => n.slug), negociosAntes);
    assert.ok(!fs.existsSync(path.join(padre, 'pwned.json')));
  } finally {
    await srv.close();
  }
});

test('sin ningún negocio configurado, el chat lo dice en vez de fallar', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.cliente().post('/api/chat', { message: 'hola' });
    assert.strictEqual(status, 503);
    assert.ok(body.error.length > 0);
  } finally {
    await srv.close();
  }
});

test('las conversaciones son privadas: solo las lee el dueño del negocio', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const beto = await srv.dueno('beto@ejemplo.cl');
    const anonimo = srv.cliente();

    // Un cliente conversa con el bot de Ana.
    await anonimo.post('/api/chat', { message: 'a que hora abren', business: ana.slug });

    const deAna = await ana.get(`/api/businesses/${ana.slug}/conversations`);
    assert.strictEqual(deAna.status, 200);
    assert.strictEqual(deAna.body.conversaciones.length, 1);
    assert.strictEqual(deAna.body.conversaciones[0].mensajes[0].pregunta, 'a que hora abren');

    // Son datos de los clientes de Ana: nadie más los ve.
    assert.strictEqual((await beto.get(`/api/businesses/${ana.slug}/conversations`)).status, 404);
    assert.strictEqual((await anonimo.get(`/api/businesses/${ana.slug}/conversations`)).status, 401);
  } finally {
    await srv.close();
  }
});

test('al eliminar un negocio se borran sus conversaciones', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    await srv.cliente().post('/api/chat', { message: 'hola', business: ana.slug });

    await ana.del(`/api/businesses/${ana.slug}`);

    // Recreado con el mismo identificador, no debe heredar las conversaciones de antes.
    srv.repository.save(ana.slug, { ...NEGOCIO, ownerId: ana.userId });
    const despues = await ana.get(`/api/businesses/${ana.slug}/conversations`);
    assert.deepStrictEqual(despues.body.conversaciones, []);
  } finally {
    await srv.close();
  }
});
