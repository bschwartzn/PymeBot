const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../src/server');
const { BusinessRepository } = require('../src/knowledge/repository');

const NEGOCIO = {
  name: 'Peluquería Test',
  topics: ['Horarios'],
  intents: [
    { id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 10 a 20.' },
    { id: 'precios', keywords: ['precio', 'cuanto cuesta'], answer: 'El corte sale $12.000.' },
  ],
};

/** Servidor con su propio directorio de datos, para no tocar los negocios reales. */
async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-api-'));
  const repository = new BusinessRepository({ dir });
  repository.save('peluqueria-test', NEGOCIO);

  const server = await new Promise((r) => {
    const s = createApp({ repository }).listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const pedir = async (method, ruta, body) => {
    const res = await fetch(base + ruta, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };

  return {
    repository,
    dir,
    get: (r) => pedir('GET', r),
    post: (r, b) => pedir('POST', r, b),
    put: (r, b) => pedir('PUT', r, b),
    del: (r) => pedir('DELETE', r),
    close: () => new Promise((r) => server.close(r)),
  };
}

test('GET /api/businesses lista los negocios configurados', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.get('/api/businesses');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.businesses.length, 1);
    assert.strictEqual(body.businesses[0].slug, 'peluqueria-test');
    assert.strictEqual(body.businesses[0].intents, 2);
  } finally {
    await srv.close();
  }
});

test('GET /api/businesses/:slug entrega el negocio completo', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.get('/api/businesses/peluqueria-test');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.business.name, 'Peluquería Test');
    assert.strictEqual(body.business.intents.length, 2);
  } finally {
    await srv.close();
  }
});

test('un negocio que no existe devuelve 404, no un error del servidor', async () => {
  const srv = await startServer();
  try {
    assert.strictEqual((await srv.get('/api/businesses/no-existe')).status, 404);
    assert.strictEqual((await srv.put('/api/businesses/no-existe', NEGOCIO)).status, 404);
    assert.strictEqual((await srv.del('/api/businesses/no-existe')).status, 404);
  } finally {
    await srv.close();
  }
});

test('POST crea un negocio y devuelve su identificador', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.post('/api/businesses', { ...NEGOCIO, name: 'Café Central' });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.slug, 'cafe-central');
    assert.strictEqual(srv.repository.list().length, 2);
  } finally {
    await srv.close();
  }
});

test('guardar información inválida devuelve 422 con los errores explicados', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.put('/api/businesses/peluqueria-test', { name: '', intents: [] });
    assert.strictEqual(status, 422);
    assert.ok(body.errors.length >= 2);
    for (const error of body.errors) {
      assert.ok(typeof error.mensaje === 'string' && error.mensaje.length > 0);
    }
    // El negocio anterior no se tocó.
    assert.strictEqual(srv.repository.get('peluqueria-test').name, 'Peluquería Test');
  } finally {
    await srv.close();
  }
});

test('guardar algo dudoso sí se permite, pero devuelve advertencias', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.put('/api/businesses/peluqueria-test', {
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
    const antes = await srv.post('/api/chat', { message: 'a que hora abren', business: 'peluqueria-test' });
    assert.strictEqual(antes.body.reply, 'De 10 a 20.');

    await srv.put('/api/businesses/peluqueria-test', {
      ...NEGOCIO,
      intents: [
        { id: 'horarios', keywords: ['horario', 'abren'], answer: 'Cambiamos: ahora de 11 a 21.' },
        NEGOCIO.intents[1],
      ],
    });

    const despues = await srv.post('/api/chat', { message: 'a que hora abren', business: 'peluqueria-test' });
    assert.strictEqual(despues.body.reply, 'Cambiamos: ahora de 11 a 21.');
  } finally {
    await srv.close();
  }
});

test('DELETE elimina el negocio', async () => {
  const srv = await startServer();
  try {
    assert.strictEqual((await srv.del('/api/businesses/peluqueria-test')).status, 200);
    assert.deepStrictEqual(srv.repository.list(), []);
  } finally {
    await srv.close();
  }
});

test('el chat responde con el negocio que se le pide', async () => {
  const srv = await startServer();
  try {
    srv.repository.save('otro-negocio', {
      name: 'Otro',
      topics: ['Horarios'],
      intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'Otro horario distinto.' }],
    });

    const uno = await srv.post('/api/chat', { message: 'a que hora abren', business: 'peluqueria-test' });
    const dos = await srv.post('/api/chat', { message: 'a que hora abren', business: 'otro-negocio' });

    assert.strictEqual(uno.body.reply, 'De 10 a 20.');
    assert.strictEqual(dos.body.reply, 'Otro horario distinto.');
    assert.strictEqual(dos.body.business, 'otro-negocio');
  } finally {
    await srv.close();
  }
});

test('pedir un negocio inexistente en el chat no rompe: cae en uno disponible', async () => {
  const srv = await startServer();
  try {
    const { status, body } = await srv.post('/api/chat', { message: 'hola', business: 'no-existe' });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.business, 'peluqueria-test');
  } finally {
    await srv.close();
  }
});

test('un slug con recorrido de rutas no escribe fuera del directorio de datos', async () => {
  const srv = await startServer();
  const padre = path.dirname(srv.dir);
  const antes = fs.readdirSync(padre).length;

  try {
    // Codificado, para que Express no lo normalice antes de llegar a la ruta.
    const maliciosos = [
      '..%2f..%2fpwned',
      '%2e%2e%2f%2e%2e%2fpwned',
      '..%5c..%5cpwned',
      'peluqueria-test%2f..%2f..%2fpwned',
    ];

    for (const slug of maliciosos) {
      const { status } = await srv.put(`/api/businesses/${slug}`, NEGOCIO);
      assert.ok(status === 404 || status === 422, `${slug} debería rechazarse, devolvió ${status}`);
    }

    assert.strictEqual(fs.readdirSync(padre).length, antes, 'se creó algo fuera del directorio de datos');
    assert.deepStrictEqual(
      srv.repository.list().map((n) => n.slug),
      ['peluqueria-test'],
    );
    assert.ok(!fs.existsSync(path.join(padre, 'pwned.json')));
  } finally {
    await srv.close();
  }
});

test('sin ningún negocio configurado, el chat lo dice en vez de fallar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-vacio-'));
  const repository = new BusinessRepository({ dir });
  const server = await new Promise((r) => {
    const s = createApp({ repository }).listen(0, () => r(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hola' }),
    });
    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.ok(body.error.includes('/admin'));
  } finally {
    await new Promise((r) => server.close(r));
  }
});
