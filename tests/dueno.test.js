const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { prepararDueno, quitarEjemplos } = require('../src/arranque');
const { AuthSessionStore } = require('../src/auth/sessions');
const { BusinessRepository } = require('../src/knowledge/repository');
const { UserStore } = require('../src/auth/users');
const { validateBusiness } = require('../src/knowledge/schema');
const { respond } = require('../src/bot/engine');

const BORACAY = path.join(__dirname, '..', 'data', 'demo', 'boracay-spa.json');

function entorno() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-dueno-'));
  return {
    users: new UserStore({ file: path.join(dir, 'users.json') }),
    repository: new BusinessRepository({ dir: path.join(dir, 'businesses') }),
    dueno: { email: 'Duena@Ejemplo.cl', password: 'clave-segura-123', negocio: BORACAY },
  };
}

test('sin correo ni contraseña no se crea ninguna cuenta', () => {
  const e = entorno();
  assert.strictEqual(prepararDueno({ ...e, dueno: { ...e.dueno, password: '' } }), null);
  assert.strictEqual(e.users.count, 0);
  assert.strictEqual(e.repository.list().length, 0);
});

test('crea la cuenta del dueño con Boracay ya cargado y a su nombre', () => {
  const e = entorno();
  const resultado = prepararDueno(e);

  assert.deepStrictEqual(resultado, { email: 'duena@ejemplo.cl', slug: 'boracay-spa' });
  const user = e.users.authenticate('duena@ejemplo.cl', 'clave-segura-123');
  assert.ok(user, 'la contraseña del entorno abre la cuenta');
  assert.deepStrictEqual(e.repository.listByOwner(user.id).map((n) => n.slug), ['boracay-spa']);
});

test('al volver a arrancar no pisa lo que el dueño editó', () => {
  const e = entorno();
  prepararDueno(e);
  const negocio = e.repository.get('boracay-spa');
  e.repository.save('boracay-spa', { ...negocio, greeting: 'Editado desde el panel' });

  prepararDueno(e);

  assert.strictEqual(e.users.count, 1);
  assert.strictEqual(e.repository.get('boracay-spa').greeting, 'Editado desde el panel');
});

test('Boracay es válido y responde lo que preguntaría un cliente', () => {
  const negocio = JSON.parse(fs.readFileSync(BORACAY, 'utf8'));
  const { ok, warnings } = validateBusiness(negocio);
  assert.ok(ok);
  assert.deepStrictEqual(warnings, []);

  for (const pregunta of ['¿a qué hora abren?', 'cuanto cuesta un masaje', 'como agendo una hora']) {
    assert.ok(respond(pregunta, negocio).matched, `debería entender «${pregunta}»`);
  }
});

test('cambiar la contraseña en el hosting recupera la cuenta y cierra sus sesiones', () => {
  const e = entorno();
  const authSessions = new AuthSessionStore({ file: path.join(path.dirname(e.users.file), 'sessions.json') });
  prepararDueno({ ...e, authSessions });
  const user = e.users.findByEmail('duena@ejemplo.cl');
  const token = authSessions.create(user.id);

  prepararDueno({ ...e, authSessions, dueno: { ...e.dueno, password: 'la-recuperada-456' } });

  assert.ok(e.users.authenticate('duena@ejemplo.cl', 'la-recuperada-456'));
  assert.strictEqual(e.users.authenticate('duena@ejemplo.cl', 'clave-segura-123'), null);
  assert.strictEqual(authSessions.userIdFor(token), null, 'las sesiones abiertas se cierran');
});

test('si la dueña cambió su contraseña en el panel, reiniciar no se la pisa', () => {
  const e = entorno();
  prepararDueno(e);
  const user = e.users.findByEmail('duena@ejemplo.cl');
  e.users.setPassword(user.id, 'la-del-panel-789', { actual: 'clave-segura-123' });

  prepararDueno(e);

  assert.ok(e.users.authenticate('duena@ejemplo.cl', 'la-del-panel-789'));
});

test('en el bot de un cliente se quitan los ejemplos, nunca un negocio con dueño', () => {
  const e = entorno();
  const semillas = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-semillas-'));
  fs.writeFileSync(path.join(semillas, 'ejemplo.json'), '{}');
  fs.writeFileSync(path.join(semillas, 'boracay-spa.json'), '{}');

  prepararDueno(e);
  e.repository.save('ejemplo', { name: 'Ejemplo', intents: [{ id: 'a', keywords: ['a'], answer: 'a' }] });

  assert.strictEqual(quitarEjemplos({ repository: e.repository, modoCliente: false, semillas: [semillas] }), 0);
  assert.strictEqual(quitarEjemplos({ repository: e.repository, modoCliente: true, semillas: [semillas] }), 1);
  assert.deepStrictEqual(e.repository.list().map((n) => n.slug), ['boracay-spa']);
});
