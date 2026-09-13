const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ConversationLog } = require('../src/chat/conversaciones');
const { createApp } = require('../src/server');
const { BusinessRepository } = require('../src/knowledge/repository');
const { UserStore } = require('../src/auth/users');
const { AuthSessionStore, COOKIE_NAME } = require('../src/auth/sessions');
const { hashPassword, verifyPassword } = require('../src/auth/passwords');

const CLAVE = 'unaclavesegura';

/** Servidor aislado: su propio disco para negocios, usuarios y sesiones. */
async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-auth-'));
  const repository = new BusinessRepository({ dir: path.join(dir, 'businesses') });
  const users = new UserStore({ file: path.join(dir, 'users.json') });
  const authSessions = new AuthSessionStore({ file: path.join(dir, 'sessions.json') });
  const conversations = new ConversationLog({ dir: path.join(dir, 'conversaciones') });

  // Un ejemplo sin dueño, como los que trae PymeBot.
  repository.save('ejemplo', {
    name: 'Negocio de Ejemplo',
    topics: ['Horarios'],
    intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 9 a 18.' }],
  });

  const server = await new Promise((r) => {
    const s = createApp({ repository, users, authSessions, conversations }).listen(0, () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Cliente que recuerda su cookie, como un navegador. */
  function cliente() {
    let cookie = null;
    return {
      get cookie() {
        return cookie;
      },
      async pedir(method, ruta, body) {
        const res = await fetch(base + ruta, {
          method,
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: res.status, body: await res.json(), setCookie };
      },
      get: (r) => this_.pedir('GET', r),
    };
  }

  const hacerCliente = () => {
    const c = cliente();
    return {
      get cookie() {
        return c.cookie;
      },
      get: (r) => c.pedir('GET', r),
      post: (r, b) => c.pedir('POST', r, b),
      put: (r, b) => c.pedir('PUT', r, b),
      del: (r) => c.pedir('DELETE', r),
      async registrar(email, extra = {}) {
        return c.pedir('POST', '/api/auth/signup', { email, password: CLAVE, ...extra });
      },
    };
  };

  return {
    base,
    repository,
    users,
    authSessions,
    cliente: hacerCliente,
    close: () => new Promise((r) => server.close(r)),
  };
}

/* ============================================================ contraseñas */

test('la contraseña nunca se guarda en texto plano', async () => {
  const srv = await startServer();
  try {
    await srv.cliente().registrar('ana@ejemplo.cl');
    const crudo = fs.readFileSync(srv.users.file, 'utf8');
    assert.ok(!crudo.includes(CLAVE), 'la contraseña aparece en el archivo de usuarios');
    assert.ok(crudo.includes('scrypt$'), 'debería guardarse un hash de scrypt');
  } finally {
    await srv.close();
  }
});

test('el mismo texto produce hashes distintos (sal por usuario)', () => {
  assert.notStrictEqual(hashPassword(CLAVE), hashPassword(CLAVE));
  assert.ok(verifyPassword(CLAVE, hashPassword(CLAVE)));
});

test('un hash corrupto o manipulado no valida nada', () => {
  for (const basura of ['', 'scrypt$', 'scrypt$1$aa$bb', 'md5$1$aa$bb', null, 'scrypt$16384$$']) {
    assert.strictEqual(verifyPassword(CLAVE, basura), false, `debería rechazar ${JSON.stringify(basura)}`);
  }
});

/* ============================================================ registro */

test('el registro crea la cuenta, deja la sesión abierta y no devuelve el hash', async () => {
  const srv = await startServer();
  try {
    const c = srv.cliente();
    const { status, body, setCookie } = await c.registrar('ana@ejemplo.cl', { name: 'Ana' });

    assert.strictEqual(status, 201);
    assert.strictEqual(body.user.email, 'ana@ejemplo.cl');
    assert.strictEqual(body.user.name, 'Ana');
    assert.ok(!('passwordHash' in body.user), 'el hash no debe salir del servidor');
    assert.ok(setCookie.includes(COOKIE_NAME));
  } finally {
    await srv.close();
  }
});

test('la cookie de sesión es httpOnly, sameSite y con ruta', async () => {
  const srv = await startServer();
  try {
    const { setCookie } = await srv.cliente().registrar('ana@ejemplo.cl');
    assert.ok(/HttpOnly/i.test(setCookie), 'falta HttpOnly: un XSS podría robar la sesión');
    assert.ok(/SameSite=Lax/i.test(setCookie), 'falta SameSite: expone a CSRF');
    assert.ok(/Path=\//i.test(setCookie));
  } finally {
    await srv.close();
  }
});

test('el correo no distingue mayúsculas y no se puede repetir', async () => {
  const srv = await startServer();
  try {
    await srv.cliente().registrar('Ana@Ejemplo.CL');
    const repetido = await srv.cliente().registrar('ana@ejemplo.cl');
    assert.strictEqual(repetido.status, 422);
    assert.ok(repetido.body.error.includes('Ya existe'));
    assert.strictEqual(srv.users.count, 1);
  } finally {
    await srv.close();
  }
});

test('rechaza correos y contraseñas que no sirven, diciendo cuál falla', async () => {
  const srv = await startServer();
  try {
    const c = srv.cliente();
    assert.strictEqual((await c.post('/api/auth/signup', { email: 'no-es-correo', password: CLAVE })).body.campo, 'email');
    assert.strictEqual((await c.post('/api/auth/signup', { email: 'a@b.cl', password: 'corta' })).body.campo, 'password');
    assert.strictEqual((await c.post('/api/auth/signup', { email: 'a@b.cl', password: '12345678' })).body.campo, 'password');
    assert.strictEqual(srv.users.count, 0);
  } finally {
    await srv.close();
  }
});

test('al registrarse con el nombre del negocio, queda uno creado y es suyo', async () => {
  const srv = await startServer();
  try {
    const c = srv.cliente();
    const { body } = await c.registrar('ana@ejemplo.cl', { businessName: 'Panadería La Espiga' });

    assert.strictEqual(body.business, 'panaderia-la-espiga');
    const mios = await c.get('/api/businesses');
    assert.strictEqual(mios.body.businesses.length, 1);
    assert.strictEqual(mios.body.businesses[0].ownerId, body.user.id);
  } finally {
    await srv.close();
  }
});

/* ============================================================ inicio de sesión */

test('login correcto abre sesión; /me la reconoce', async () => {
  const srv = await startServer();
  try {
    await srv.cliente().registrar('ana@ejemplo.cl');

    const c = srv.cliente();
    const login = await c.post('/api/auth/login', { email: 'ana@ejemplo.cl', password: CLAVE });
    assert.strictEqual(login.status, 200);

    const yo = await c.get('/api/auth/me');
    assert.strictEqual(yo.body.user.email, 'ana@ejemplo.cl');
  } finally {
    await srv.close();
  }
});

test('correo inexistente y contraseña errónea dan el MISMO mensaje', async () => {
  const srv = await startServer();
  try {
    await srv.cliente().registrar('ana@ejemplo.cl');
    const c = srv.cliente();

    const noExiste = await c.post('/api/auth/login', { email: 'nadie@ejemplo.cl', password: CLAVE });
    const claveMala = await c.post('/api/auth/login', { email: 'ana@ejemplo.cl', password: 'otraclave123' });

    assert.strictEqual(noExiste.status, 401);
    assert.strictEqual(claveMala.status, 401);
    // Mensajes distintos le confirmarían a un atacante qué correos están dados de alta.
    assert.strictEqual(noExiste.body.error, claveMala.body.error);
  } finally {
    await srv.close();
  }
});

test('tras muchos intentos fallidos, el login se bloquea un rato', async () => {
  const srv = await startServer();
  try {
    await srv.cliente().registrar('ana@ejemplo.cl');
    const c = srv.cliente();

    let ultimo;
    for (let i = 0; i < 12; i += 1) {
      ultimo = await c.post('/api/auth/login', { email: 'ana@ejemplo.cl', password: 'malaclave123' });
    }
    assert.strictEqual(ultimo.status, 429);

    // Y el bloqueo aguanta aunque después se acierte la contraseña.
    const conLaBuena = await c.post('/api/auth/login', { email: 'ana@ejemplo.cl', password: CLAVE });
    assert.strictEqual(conLaBuena.status, 429);
  } finally {
    await srv.close();
  }
});

test('cerrar sesión invalida el token en el servidor, no solo en el navegador', async () => {
  const srv = await startServer();
  try {
    const c = srv.cliente();
    await c.registrar('ana@ejemplo.cl');
    const cookieRobada = c.cookie;

    await c.post('/api/auth/logout');

    // Un atacante que se hubiera quedado con la cookie tampoco puede usarla.
    const res = await fetch(`${srv.base}/api/businesses`, { headers: { Cookie: cookieRobada } });
    assert.strictEqual(res.status, 401);
  } finally {
    await srv.close();
  }
});

test('una cookie inventada no vale', async () => {
  const srv = await startServer();
  try {
    for (const falsa of [`${COOKIE_NAME}=x`, `${COOKIE_NAME}=${'a'.repeat(64)}`, `${COOKIE_NAME}=`]) {
      const res = await fetch(`${srv.base}/api/businesses`, { headers: { Cookie: falsa } });
      assert.strictEqual(res.status, 401, `debería rechazar ${falsa.slice(0, 30)}`);
    }
  } finally {
    await srv.close();
  }
});
