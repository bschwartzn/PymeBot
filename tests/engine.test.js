const test = require('node:test');
const assert = require('node:assert');
const { respond, matchIntent } = require('../src/bot/engine');
const business = require('../data/businesses/bella-vista.json');

/** Cada par es: lo que escribe un cliente real → la intención que esperamos. */
const CASOS = [
  ['hola', 'saludo'],
  ['Buenos días', 'saludo'],
  ['¿A qué hora abren?', 'horarios'],
  ['cual es el horario', 'horarios'],
  ['abren los domingos?', 'horarios'],
  ['¿Cuánto cuesta un corte?', 'precios'],
  ['cuanto vale el color', 'precios'],
  ['que servicios ofrecen', 'servicios'],
  ['hacen barba?', 'servicios'],
  ['¿Dónde están ubicados?', 'ubicacion'],
  ['como llegar al local', 'ubicacion'],
  ['quiero reservar una hora', 'reservas'],
  ['puedo agendar una cita', 'reservas'],
  ['aceptan tarjeta?', 'pagos'],
  ['puedo pagar con transferencia', 'pagos'],
  ['cual es su telefono', 'contacto'],
  ['muchas gracias', 'agradecimiento'],
  ['chao', 'despedida'],
];

for (const [pregunta, intencionEsperada] of CASOS) {
  test(`"${pregunta}" → intención "${intencionEsperada}"`, () => {
    const result = respond(pregunta, business);
    assert.strictEqual(result.intent, intencionEsperada);
    assert.ok(result.matched, 'debería haber matcheado una intención');
    assert.ok(result.reply.length > 0, 'la respuesta no puede estar vacía');
  });
}

test('una pregunta fuera de tema cae en el fallback con la lista de temas', () => {
  const result = respond('¿venden repuestos de automóvil?', business);
  assert.strictEqual(result.intent, 'fallback');
  assert.strictEqual(result.matched, false);
  assert.ok(result.reply.includes('Horarios de atención'));
  assert.ok(result.reply.includes(business.handoff));
});

test('un mensaje vacío o de puro ruido no rompe el motor', () => {
  assert.strictEqual(respond('', business).intent, 'vacio');
  assert.strictEqual(respond('   ', business).intent, 'vacio');
  // Puro ruido sí es un mensaje: se responde con el fallback, no con 'no recibí nada'.
  assert.strictEqual(respond('!!!???', business).intent, 'fallback');
});

test('el saludo no se repite si la sesión ya fue saludada', () => {
  const primera = respond('hola', business, { greeted: false });
  const segunda = respond('hola', business, { greeted: true });

  assert.strictEqual(primera.intent, 'saludo');
  assert.strictEqual(segunda.intent, 'saludo');
  assert.notStrictEqual(primera.reply, segunda.reply);
  assert.strictEqual(segunda.reply, business.greetingRepeat);
});

test('una frase de varias palabras puntúa más que una palabra suelta', () => {
  const frase = matchIntent('cuanto cuesta', business);
  const suelta = matchIntent('valor', business);
  assert.ok(frase.score > suelta.score);
});

test('el motor funciona con un negocio distinto sin tocar el código', () => {
  const otroNegocio = {
    name: 'Taller Don Pepe',
    fallback: 'No entendí.',
    topics: ['Horarios'],
    intents: [{ id: 'revision', keywords: ['revision', 'mantencion'], answer: 'La revisión cuesta $30.000.' }],
  };
  const result = respond('quiero una mantencion', otroNegocio);
  assert.strictEqual(result.intent, 'revision');
  assert.strictEqual(result.reply, 'La revisión cuesta $30.000.');
});

/* --- Casos encontrados durante la validación manual del Módulo 1 --- */

test('un mensaje de solo emojis va al fallback, no a "no recibí nada"', () => {
  const result = respond('🙂👍', business);
  assert.strictEqual(result.intent, 'fallback');
  assert.ok(result.reply.includes('Horarios de atención'));
});

test('un mensaje de solo signos también va al fallback', () => {
  assert.strictEqual(respond('???', business).intent, 'fallback');
});

test('sigue distinguiendo el mensaje realmente vacío', () => {
  assert.strictEqual(respond('', business).intent, 'vacio');
  assert.strictEqual(respond('   ', business).intent, 'vacio');
});

test('"quiero cortarme el pelo" encuentra los servicios', () => {
  assert.strictEqual(respond('quiero cortarme el pelo', business).intent, 'servicios');
  assert.strictEqual(respond('me quiero teñir el cabello', business).intent, 'servicios');
});

test('"no" y "ok" cierran la conversación en vez de listar todos los temas', () => {
  assert.strictEqual(respond('no', business).intent, 'cierre');
  assert.strictEqual(respond('ok', business).intent, 'cierre');
  assert.strictEqual(respond('nada más, gracias', business).matched, true);
});

test('la intención de cierre no le gana a una pregunta real que contenga "no"', () => {
  assert.strictEqual(respond('no aceptan tarjeta?', business).intent, 'pagos');
  assert.strictEqual(respond('no sé cuánto cuesta el corte', business).intent, 'precios');
});

test('preguntar por el precio de un corte sigue ganando sobre servicios', () => {
  assert.strictEqual(respond('cuanto sale el corte de pelo', business).intent, 'precios');
  assert.strictEqual(respond('cuanto vale la barba', business).intent, 'precios');
});

test('"no, gracias" cierra la conversación en vez de volver a preguntar', () => {
  const result = respond('no, gracias', business);
  assert.strictEqual(result.intent, 'cierre');
  assert.ok(!result.reply.includes('¿Necesitas algo más?'));
});

test('el motor encuentra la intención escriba el cliente la ñ o no', () => {
  const negocio = {
    name: 'X',
    topics: ['Uno'],
    intents: [{ id: 'eventos', keywords: ['cumpleanos', 'celebracion'], answer: 'Hacemos cumpleaños.' }],
  };
  assert.strictEqual(respond('hacen cumpleaños?', negocio).intent, 'eventos');
  assert.strictEqual(respond('hacen cumpleanos?', negocio).intent, 'eventos');
});

test('el plegado de la ñ también funciona en palabras clave de varias palabras', () => {
  const negocio = {
    name: 'X',
    topics: ['Uno'],
    intents: [{ id: 'ninos', keywords: ['para ninos'], answer: 'Sí, es apto.' }],
  };
  assert.strictEqual(respond('esto es para niños?', negocio).intent, 'ninos');
});

/* --- Configuración del bot que el dueño controla desde el panel --- */

const NEGOCIO_CONFIG = {
  name: 'X',
  topics: ['Uno'],
  fallback: 'No entendí.',
  intents: [
    { id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 9 a 18.' },
    { id: 'precios', keywords: ['precio'], answer: 'Sale $10.000.' },
  ],
};

test('subir la exigencia hace que el bot responda menos, y bajarla que responda más', () => {
  // "abren" puntúa 1: alcanza justo con el umbral por defecto.
  assert.strictEqual(respond('abren hoy?', NEGOCIO_CONFIG).intent, 'horarios');

  // Con la exigencia al máximo, el mismo mensaje ya no alcanza.
  const exigente = { ...NEGOCIO_CONFIG, confidenceThreshold: 4 };
  const resultado = respond('abren hoy?', exigente);
  assert.strictEqual(resultado.intent, 'fallback');
  assert.strictEqual(resultado.score, 1, 'el puntaje no cambia: lo que cambia es cuánto se exige');

  // Y con la exigencia mínima vuelve a responder.
  assert.strictEqual(respond('abren hoy?', { ...NEGOCIO_CONFIG, confidenceThreshold: 0.5 }).intent, 'horarios');
});

test('un umbral ausente o inválido no rompe nada: se usa el de siempre', () => {
  for (const valor of [undefined, null, 0, -1, 'alto', NaN]) {
    const negocio = { ...NEGOCIO_CONFIG, confidenceThreshold: valor };
    assert.strictEqual(respond('abren hoy?', negocio).intent, 'horarios', `falló con ${valor}`);
  }
});

test('con el bot pausado se responde el mensaje de pausa y no se intenta entender', () => {
  const pausado = {
    ...NEGOCIO_CONFIG,
    active: false,
    pausedMessage: 'Estamos de vacaciones hasta marzo.',
  };

  for (const mensaje of ['a que hora abren', 'hola', 'cuanto cuesta']) {
    const resultado = respond(mensaje, pausado);
    assert.strictEqual(resultado.reply, 'Estamos de vacaciones hasta marzo.');
    assert.strictEqual(resultado.intent, 'pausado');
    assert.strictEqual(resultado.matched, false);
  }
});

test('un bot pausado sin mensaje propio igual dice algo', () => {
  const resultado = respond('hola', { ...NEGOCIO_CONFIG, active: false });
  assert.ok(resultado.reply.length > 0);
  assert.strictEqual(resultado.intent, 'pausado');
});

test('el bot activo se comporta igual que siempre', () => {
  assert.strictEqual(respond('a que hora abren', { ...NEGOCIO_CONFIG, active: true }).intent, 'horarios');
});
