const test = require('node:test');
const assert = require('node:assert');
const { SessionStore } = require('../src/bot/sessions');

test('crea una sesión nueva cuando no se envía id', () => {
  const store = new SessionStore();
  const session = store.get(undefined);
  assert.ok(session.id);
  assert.deepStrictEqual(session.messages, []);
  assert.strictEqual(store.size, 1);
});

test('devuelve la misma sesión cuando se envía su id', () => {
  const store = new SessionStore();
  const primera = store.get();
  const segunda = store.get(primera.id);
  assert.strictEqual(primera.id, segunda.id);
  assert.strictEqual(store.size, 1);
});

test('un id inventado no revienta: crea una sesión nueva', () => {
  const store = new SessionStore();
  const session = store.get('id-que-no-existe');
  assert.ok(session.id);
  assert.notStrictEqual(session.id, 'id-que-no-existe');
});

test('el historial guarda los mensajes en orden', () => {
  const store = new SessionStore();
  const session = store.get();
  store.addMessage(session, 'user', 'hola');
  store.addMessage(session, 'bot', '¡Hola!');
  assert.strictEqual(session.messages.length, 2);
  assert.deepStrictEqual(
    session.messages.map((m) => m.role),
    ['user', 'bot'],
  );
});

test('el historial se recorta y conserva los mensajes más recientes', () => {
  const store = new SessionStore({ maxHistory: 4 });
  const session = store.get();
  for (let i = 1; i <= 10; i += 1) store.addMessage(session, 'user', `mensaje ${i}`);
  assert.strictEqual(session.messages.length, 4);
  assert.strictEqual(session.messages[3].text, 'mensaje 10');
  assert.strictEqual(session.messages[0].text, 'mensaje 7');
});

test('reset vacía el historial sin cambiar el id', () => {
  const store = new SessionStore();
  const session = store.get();
  store.addMessage(session, 'user', 'hola');
  session.greeted = true;

  const reseteada = store.reset(session.id);
  assert.strictEqual(reseteada.id, session.id);
  assert.deepStrictEqual(reseteada.messages, []);
  assert.strictEqual(reseteada.greeted, false);
});

test('reset sobre una sesión inexistente devuelve null en vez de fallar', () => {
  const store = new SessionStore();
  assert.strictEqual(store.reset('no-existe'), null);
});

test('las sesiones inactivas se descartan al vencer el TTL', () => {
  const store = new SessionStore({ ttlMs: 1000 });
  const session = store.get();
  assert.strictEqual(store.size, 1);

  const removidas = store.purgeExpired(Date.now() + 5000);
  assert.strictEqual(removidas, 1);
  assert.strictEqual(store.size, 0);
  assert.ok(!session.messages.length);
});

test('una sesión activa sobrevive a la limpieza', () => {
  const store = new SessionStore({ ttlMs: 60000 });
  store.get();
  store.purgeExpired(Date.now() + 1000);
  assert.strictEqual(store.size, 1);
});
