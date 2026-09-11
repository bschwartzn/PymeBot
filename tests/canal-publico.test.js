const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../src/server');
const { BusinessRepository } = require('../src/knowledge/repository');
const { UserStore } = require('../src/auth/users');
const { AuthSessionStore } = require('../src/auth/sessions');

const CLAVE = 'unaclavesegura';
const NEGOCIO = {
  name: 'Peluquería Test',
  topics: ['Horarios'],
  intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 10 a 20.' }],
};

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-canal-'));
  const repository = new BusinessRepository({ dir: path.join(dir, 'businesses') });
  const users = new UserStore({ file: path.join(dir, 'users.json') });
  const authSessions = new AuthSessionStore({ file: path.join(dir, 'sessions.json') });

  const server = await new Promise((r) => {
    const s = createApp({ repository, users, authSessions }).listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  function cliente() {
    let cookie = null;
    const pedir = async (method, ruta, body, headers = {}) => {
      const res = await fetch(base + ruta, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const tipo = res.headers.get('content-type') || '';
      return {
        status: res.status,
        tipo,
        body: tipo.includes('json') ? await res.json() : await res.text(),
      };
    };
    return {
      get: (r, h) => pedir('GET', r, null, h),
      post: (r, b) => pedir('POST', r, b),
      entrar: (email) => pedir('POST', '/api/auth/signup', { email, password: CLAVE }),
    };
  }

  async function dueno(email, negocio = NEGOCIO) {
    const c = cliente();
    const { body } = await c.entrar(email);
    const { slug } = repository.create({ ...negocio, ownerId: body.user.id });
    return { ...c, userId: body.user.id, slug };
  }

  return { base, repository, cliente, dueno, close: () => new Promise((r) => server.close(r)) };
}

/* ============================================================ página del cliente */

test('/c/<negocio> sirve la página del chat, sin necesidad de cuenta', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const { status, body } = await srv.cliente().get(`/c/${ana.slug}`);

    assert.strictEqual(status, 200);
    assert.ok(body.includes('chat.js'), 'debería cargar el chat del cliente');
    // La página del cliente no debe traer nada del panel ni del sandbox.
    assert.ok(!body.includes('panel.js'));
    assert.ok(!/diagn[óo]stico/i.test(body), 'el cliente no debe ver el diagnóstico de intenciones');
    assert.ok(!/sandbox/i.test(body), 'el cliente no debe ver que esto es un sandbox');
  } finally {
    await srv.close();
  }
});

test('la página del chat es la misma para cualquier negocio: no hay que desplegar nada al crear uno', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const beto = await srv.dueno('beto@ejemplo.cl', { ...NEGOCIO, name: 'Taller de Beto' });

    const uno = await srv.cliente().get(`/c/${ana.slug}`);
    const dos = await srv.cliente().get(`/c/${beto.slug}`);
    assert.strictEqual(uno.body, dos.body);

    // Lo que cambia es lo que responde la API para cada uno.
    const info = await srv.cliente().get(`/api/business?slug=${beto.slug}`);
    assert.strictEqual(info.body.name, 'Taller de Beto');
  } finally {
    await srv.close();
  }
});

test('un cliente puede conversar por la página pública sin cuenta', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const visitante = srv.cliente();

    const chat = await visitante.post('/api/chat', { message: 'a que hora abren', business: ana.slug });
    assert.strictEqual(chat.status, 200);
    assert.strictEqual(chat.body.reply, 'De 10 a 20.');
  } finally {
    await srv.close();
  }
});

test('un negocio pausado no ofrece atajos y saluda con el mensaje de pausa', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    srv.repository.save(ana.slug, {
      ...NEGOCIO,
      ownerId: ana.userId,
      active: false,
      pausedMessage: 'Volvemos el lunes.',
    });

    const info = await srv.cliente().get(`/api/business?slug=${ana.slug}`);
    assert.strictEqual(info.body.active, false);
    assert.strictEqual(info.body.greeting, 'Volvemos el lunes.');
    assert.deepStrictEqual(info.body.topics, [], 'no tiene sentido ofrecer atajos que no responderá');
  } finally {
    await srv.close();
  }
});

/* ============================================================ QR */

test('el QR se sirve como SVG imprimible', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const { status, tipo, body } = await srv.cliente().get(`/api/businesses/${ana.slug}/qr.svg`);

    assert.strictEqual(status, 200);
    assert.ok(tipo.includes('image/svg+xml'));
    assert.ok(body.startsWith('<?xml') || body.includes('<svg'));
  } finally {
    await srv.close();
  }
});

test('el QR de un negocio inexistente da 404', async () => {
  const srv = await startServer();
  try {
    assert.strictEqual((await srv.cliente().get('/api/businesses/no-existe/qr.svg')).status, 404);
  } finally {
    await srv.close();
  }
});

/* ============================================================ compartir */

test('compartir entrega el link, el QR, el código para la web y el enlace de WhatsApp', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const { status, body } = await ana.get(`/api/businesses/${ana.slug}/share`);

    assert.strictEqual(status, 200);
    assert.ok(body.url.endsWith(`/c/${ana.slug}`), `url inesperada: ${body.url}`);
    assert.ok(body.qr.includes(ana.slug));
    assert.ok(body.embed.includes('widget.js') && body.embed.includes(`data-negocio="${ana.slug}"`));
    assert.ok(body.whatsapp.startsWith('https://wa.me/'));
    assert.ok(decodeURIComponent(body.whatsapp).includes(body.url));
  } finally {
    await srv.close();
  }
});

test('los datos para compartir son privados: exigen ser el dueño', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const beto = await srv.dueno('beto@ejemplo.cl');

    assert.strictEqual((await srv.cliente().get(`/api/businesses/${ana.slug}/share`)).status, 401);
    assert.strictEqual((await beto.get(`/api/businesses/${ana.slug}/share`)).status, 404);
  } finally {
    await srv.close();
  }
});

test('detrás de un proxy, el link compartido usa el host real y no localhost', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const { body } = await ana.get(`/api/businesses/${ana.slug}/share`, {
      'X-Forwarded-Host': 'chat.mipyme.cl',
      'X-Forwarded-Proto': 'https',
    });

    assert.strictEqual(body.url, `https://chat.mipyme.cl/c/${ana.slug}`);
    assert.ok(body.embed.includes('https://chat.mipyme.cl/widget.js'));
  } finally {
    await srv.close();
  }
});

test('el widget se sirve y sabe montarse solo', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.cliente().get('/widget.js');
    assert.strictEqual(status, 200);
    assert.ok(body.includes('data-negocio'));
    assert.ok(body.includes('/c/'), 'el widget debe apuntar a la página pública del chat');
  } finally {
    await srv.close();
  }
});

/* --- Un link que ya no existe no debe llevar al bot de otro negocio --- */

test('pedir un negocio inexistente NO cae en otro: dice que el chat no existe', async () => {
  const srv = await startServer();
  try {
    await srv.dueno('ana@ejemplo.cl'); // hay otro negocio disponible al que podría caer
    const visitante = srv.cliente();

    const info = await visitante.get('/api/business?slug=no-existe');
    assert.strictEqual(info.status, 404, 'un link roto no debe mostrar el bot de otra empresa');
    assert.ok(info.body.error.includes('enlace'));

    const chat = await visitante.post('/api/chat', { message: 'hola', business: 'no-existe' });
    assert.strictEqual(chat.status, 404);
  } finally {
    await srv.close();
  }
});

test('sin pedir negocio sí se usa el por defecto: es el caso del sandbox', async () => {
  const srv = await startServer();
  try {
    const ana = await srv.dueno('ana@ejemplo.cl');
    const { status, body } = await srv.cliente().post('/api/chat', { message: 'a que hora abren' });

    assert.strictEqual(status, 200);
    assert.strictEqual(body.business, ana.slug);
  } finally {
    await srv.close();
  }
});
