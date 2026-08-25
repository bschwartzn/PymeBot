const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { BusinessRepository, ValidationError } = require('../src/knowledge/repository');

/** Cada test trabaja sobre un directorio propio y desechable. */
function repoTemporal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pymebot-'));
  return new BusinessRepository({ dir });
}

const NEGOCIO = {
  name: 'Panadería La Espiga',
  topics: ['Horarios'],
  intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 7 a 21.' }],
};

test('crea un negocio y le deriva el identificador del nombre', () => {
  const repo = repoTemporal();
  const { slug, business } = repo.create(NEGOCIO);
  assert.strictEqual(slug, 'panaderia-la-espiga');
  assert.strictEqual(business.name, 'Panadería La Espiga');
  assert.ok(repo.exists(slug));
});

test('dos negocios con el mismo nombre no se pisan', () => {
  const repo = repoTemporal();
  const primero = repo.create(NEGOCIO);
  const segundo = repo.create(NEGOCIO);
  assert.notStrictEqual(primero.slug, segundo.slug);
  assert.strictEqual(segundo.slug, 'panaderia-la-espiga-2');
  assert.strictEqual(repo.list().length, 2);
});

test('list devuelve un resumen de cada negocio', () => {
  const repo = repoTemporal();
  repo.create(NEGOCIO);
  const [resumen] = repo.list();
  assert.deepStrictEqual(resumen, {
    slug: 'panaderia-la-espiga',
    name: 'Panadería La Espiga',
    tagline: '',
    intents: 1,
  });
});

test('guardar y volver a leer devuelve lo mismo', () => {
  const repo = repoTemporal();
  const { slug } = repo.create(NEGOCIO);
  const leido = repo.get(slug);
  assert.strictEqual(leido.intents[0].answer, 'De 7 a 21.');
});

test('un cambio guardado se ve en la siguiente lectura, sin reiniciar nada', () => {
  const repo = repoTemporal();
  const { slug } = repo.create(NEGOCIO);

  repo.save(slug, { ...NEGOCIO, intents: [{ id: 'horarios', keywords: ['horario'], answer: 'Ahora de 8 a 20.' }] });

  assert.strictEqual(repo.get(slug).intents[0].answer, 'Ahora de 8 a 20.');
});

test('no guarda un negocio inválido y explica por qué', () => {
  const repo = repoTemporal();
  const { slug } = repo.create(NEGOCIO);

  assert.throws(
    () => repo.save(slug, { name: '', intents: [] }),
    (err) => {
      assert.ok(err instanceof ValidationError);
      assert.ok(err.errors.length >= 2);
      return true;
    },
  );

  // El negocio anterior tiene que haber quedado intacto.
  assert.strictEqual(repo.get(slug).name, 'Panadería La Espiga');
});

test('un intento de guardar fuera del directorio de datos se rechaza', () => {
  const repo = repoTemporal();
  for (const malo of ['../fuera', '../../etc/passwd', 'con/barra']) {
    assert.throws(() => repo.save(malo, NEGOCIO), ValidationError);
  }
  assert.deepStrictEqual(repo.list(), []);
});

test('leer un negocio inexistente devuelve null en vez de fallar', () => {
  const repo = repoTemporal();
  assert.strictEqual(repo.get('no-existe'), null);
  assert.strictEqual(repo.get('../../etc/passwd'), null);
  assert.strictEqual(repo.exists('no-existe'), false);
});

test('un archivo corrupto no tumba el servidor: se ignora', () => {
  const repo = repoTemporal();
  repo.create(NEGOCIO);
  fs.writeFileSync(path.join(repo.dir, 'roto.json'), '{ esto no es json', 'utf8');

  assert.strictEqual(repo.get('roto'), null);
  assert.strictEqual(repo.list().length, 1, 'el negocio bueno debe seguir apareciendo');
});

test('un archivo con JSON válido pero información inválida también se ignora', () => {
  const repo = repoTemporal();
  fs.writeFileSync(path.join(repo.dir, 'incompleto.json'), '{"name":"Sin preguntas"}', 'utf8');
  assert.strictEqual(repo.get('incompleto'), null);
  assert.deepStrictEqual(repo.list(), []);
});

test('eliminar quita el negocio y avisa si no existía', () => {
  const repo = repoTemporal();
  const { slug } = repo.create(NEGOCIO);
  assert.strictEqual(repo.remove(slug), true);
  assert.strictEqual(repo.exists(slug), false);
  assert.strictEqual(repo.remove(slug), false);
  assert.strictEqual(repo.remove('../../algo'), false);
});

test('el guardado no deja archivos temporales tirados', () => {
  const repo = repoTemporal();
  repo.create(NEGOCIO);
  assert.ok(!fs.readdirSync(repo.dir).some((f) => f.endsWith('.tmp')));
});
