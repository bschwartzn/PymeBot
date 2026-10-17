const test = require('node:test');
const assert = require('node:assert');

const { respond } = require('../src/bot/engine');
const { casiIgual, wordsMatch, tokenize } = require('../src/bot/text');

const NEGOCIO = {
  name: 'Spa',
  fallback: 'No entendí.',
  handoff: 'Escríbenos por WhatsApp al +56 9 1234 5678.',
  topics: ['Horario', 'Precios'],
  intents: [
    { id: 'saludo', keywords: ['hola', 'buenas'], answer: '¡Hola!' },
    { id: 'horarios', keywords: ['horario', 'abren', 'cuanto dura'], answer: 'De 10 a 21.' },
    { id: 'precios', keywords: ['precio', 'cuanto cuesta'], answer: '$50.000.' },
    { id: 'contacto', keywords: ['telefono', 'correo'], answer: '+56 9 1234 5678.' },
    { id: 'cierre', keywords: ['no', 'ok', 'nada'], answer: '¡Perfecto!' },
    { id: 'despedida', keywords: ['chao'], answer: '¡Chao!' },
    { id: 'agradecimiento', keywords: ['gracias'], answer: '¡De nada!' },
  ],
};

const intent = (mensaje) => respond(mensaje, NEGOCIO).intent;

test('la cortesía no se apropia de una pregunta de verdad', () => {
  assert.strictEqual(intent('no'), 'cierre');
  assert.strictEqual(intent('ok, nada mas'), 'cierre');
  assert.strictEqual(intent('no tienen estacionamiento?'), 'fallback');
  assert.strictEqual(intent('hola, tienen estacionamiento?'), 'fallback');
  assert.strictEqual(intent('hola, cuanto cuesta?'), 'precios', 'la pregunta manda sobre el saludo');
});

test('en un empate de cortesía gana la despedida', () => {
  assert.strictEqual(intent('ok chao'), 'despedida');
  assert.strictEqual(intent('gracias chao'), 'despedida', 'si se despide, se despide');
});

test('entiende faltas de ortografía y letras alargadas', () => {
  assert.strictEqual(intent('presio?'), 'precios');
  assert.strictEqual(intent('horaio'), 'horarios');
  assert.strictEqual(intent('holaaa'), 'saludo');
  assert.deepStrictEqual(tokenize('Graciasss'), ['gracias']);
});

test('la tolerancia a faltas no inventa coincidencias', () => {
  assert.ok(!casiIgual('corro', 'correo'), 'palabras cortas no');
  assert.ok(!casiIgual('caro', 'cara'));
  assert.ok(!casiIgual('sesion', 'lesion'), 'la primera letra tiene que coincidir');
  assert.strictEqual(intent('corro maratones'), 'fallback');
});

test('las frases toleran plural y verbo en plural', () => {
  assert.ok(wordsMatch('duran', 'dura'));
  assert.ok(wordsMatch('cuestan', 'cuesta'));
  assert.strictEqual(intent('cuanto duran'), 'horarios');
  assert.strictEqual(intent('cuanto cuestan'), 'precios');
});

test('quien pide hablar con una persona recibe el contacto', () => {
  const r = respond('quiero hablar con una persona', NEGOCIO);
  assert.strictEqual(r.intent, 'hablar_con_persona');
  assert.strictEqual(r.reply, NEGOCIO.handoff);
  assert.strictEqual(intent('eres un bot?'), 'hablar_con_persona');
  // "persona" suelta no basta: es una pregunta de precio.
  assert.strictEqual(intent('cuanto cuesta por persona'), 'precios');
});
