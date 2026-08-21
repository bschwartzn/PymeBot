const test = require('node:test');
const assert = require('node:assert');
const { normalize, tokenize, wordsMatch } = require('../src/bot/text');

test('normalize quita acentos, mayúsculas y signos de interrogación', () => {
  assert.strictEqual(normalize('¿Cuánto CUESTA?'), 'cuanto cuesta');
  assert.strictEqual(normalize('¡Hola!'), 'hola');
  assert.strictEqual(normalize('  Dónde   están  '), 'donde estan');
});

test('normalize conserva la ñ', () => {
  assert.strictEqual(normalize('Mañana'), 'mañana');
});

test('normalize tolera entradas que no son texto', () => {
  assert.strictEqual(normalize(null), '');
  assert.strictEqual(normalize(undefined), '');
  assert.strictEqual(normalize(42), '');
});

test('tokenize devuelve palabras limpias y nunca un token vacío', () => {
  assert.deepStrictEqual(tokenize('¿A qué hora abren?'), ['a', 'que', 'hora', 'abren']);
  assert.deepStrictEqual(tokenize('   '), []);
});

test('wordsMatch tolera el plural del español', () => {
  assert.ok(wordsMatch('horario', 'horarios'));
  assert.ok(wordsMatch('precios', 'precio'));
  assert.ok(wordsMatch('color', 'colores'));
  assert.ok(!wordsMatch('corte', 'color'));
});

test('wordsMatch no marca coincidencia entre palabras muy cortas', () => {
  assert.ok(!wordsMatch('la', 'las'));
});
