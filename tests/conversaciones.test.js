const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ConversationLog } = require('../src/chat/conversaciones');
const { resumir } = require('../src/chat/metricas');
const { crearAtencion, MensajeInvalido } = require('../src/chat/atender');
const { SessionStore } = require('../src/bot/sessions');

const NEGOCIO = {
  name: 'Peluquería Test',
  topics: ['Horarios'],
  fallback: 'No entendí. Puedo ayudarte con:',
  intents: [
    { id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 10 a 20.' },
    { id: 'precios', keywords: ['precio', 'cuanto cuesta'], answer: 'El corte sale $12.000.' },
  ],
};

const logTemporal = () => new ConversationLog({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'pb-conv-')) });

/* ============================================================ registro */

test('cada intercambio queda anotado con lo que preguntó el cliente y lo que se respondió', () => {
  const log = logTemporal();
  log.registrar('negocio', {
    conversationId: 'c1',
    channel: 'web',
    pregunta: 'a que hora abren',
    respuesta: 'De 10 a 20.',
    intent: 'horarios',
    matched: true,
    score: 2.5,
  });

  const [registro] = log.leer('negocio');
  assert.strictEqual(registro.pregunta, 'a que hora abren');
  assert.strictEqual(registro.intent, 'horarios');
  assert.strictEqual(registro.matched, true);
  assert.ok(registro.at, 'debe llevar la fecha');
});

test('las conversaciones sobreviven a reiniciar: se releen del disco', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-conv-'));
  new ConversationLog({ dir }).registrar('negocio', {
    conversationId: 'c1', channel: 'web', pregunta: 'hola', respuesta: '¡Hola!', intent: 'saludo', matched: true, score: 1,
  });

  // Otra instancia, como tras un despliegue.
  assert.strictEqual(new ConversationLog({ dir }).leer('negocio').length, 1);
});

test('una línea a medias no invalida el resto del registro', () => {
  const log = logTemporal();
  log.registrar('negocio', { conversationId: 'c1', channel: 'web', pregunta: 'uno', respuesta: 'r', intent: 'x', matched: true, score: 1 });
  fs.appendFileSync(log.pathFor('negocio'), '{"pregunta": "cortada a la mit\n', 'utf8');
  log.registrar('negocio', { conversationId: 'c1', channel: 'web', pregunta: 'dos', respuesta: 'r', intent: 'x', matched: true, score: 1 });

  const registros = log.leer('negocio');
  assert.strictEqual(registros.length, 2, 'las líneas buenas deben leerse igual');
  assert.deepStrictEqual(registros.map((r) => r.pregunta), ['uno', 'dos']);
});

test('un slug inventado no escribe fuera del directorio', () => {
  const log = logTemporal();
  for (const malo of ['../fuera', '../../etc/passwd', 'con/barra']) {
    assert.strictEqual(log.pathFor(malo), null);
    assert.strictEqual(log.registrar(malo, { pregunta: 'x' }), false);
  }
  assert.deepStrictEqual(fs.readdirSync(log.dir), []);
});

test('leer un negocio sin conversaciones devuelve una lista vacía, no un error', () => {
  assert.deepStrictEqual(logTemporal().leer('nunca-hablado'), []);
});

/* ============================================================ métricas */

function registrosDePrueba(ahora) {
  const hace = (h) => new Date(ahora - h * 3600 * 1000).toISOString();
  return [
    { at: hace(1), conversationId: 'c1', channel: 'web', pregunta: 'a que hora abren', intent: 'horarios', matched: true },
    { at: hace(1), conversationId: 'c1', channel: 'web', pregunta: 'cuanto cuesta', intent: 'precios', matched: true },
    { at: hace(2), conversationId: 'c2', channel: 'web', pregunta: 'tienen estacionamiento?', intent: 'fallback', matched: false },
    { at: hace(3), conversationId: 'c3', channel: 'web', pregunta: 'tienen estacionamiento', intent: 'fallback', matched: false },
    { at: hace(4), conversationId: 'c4', channel: 'web', pregunta: 'a que hora abren', intent: 'horarios', matched: true },
    { at: hace(24 * 40), conversationId: 'viejo', channel: 'web', pregunta: 'antiguo', intent: 'horarios', matched: true },
  ];
}

test('el resumen cuenta mensajes y conversaciones, y deja fuera lo antiguo', () => {
  const ahora = Date.now();
  const r = resumir(registrosDePrueba(ahora), { dias: 14, ahora });

  assert.strictEqual(r.mensajes, 5, 'el de hace 40 días no entra en los últimos 14');
  assert.strictEqual(r.conversaciones, 4);
  assert.strictEqual(r.sinRespuesta, 2);
  assert.strictEqual(r.tasaDeAcierto, 60);
});

test('agrupa las preguntas sin respuesta aunque estén escritas distinto', () => {
  const ahora = Date.now();
  const r = resumir(registrosDePrueba(ahora), { ahora });

  // "tienen estacionamiento?" y "tienen estacionamiento" son la misma pregunta.
  assert.strictEqual(r.preguntasSinRespuesta.length, 1);
  assert.strictEqual(r.preguntasSinRespuesta[0].veces, 2);
  assert.ok(r.preguntasSinRespuesta[0].ejemplo.includes('estacionamiento'));
});

test('ordena los temas más preguntados de mayor a menor', () => {
  const ahora = Date.now();
  const [primero] = resumir(registrosDePrueba(ahora), { ahora }).temasMasPreguntados;
  assert.strictEqual(primero.clave, 'horarios');
  assert.strictEqual(primero.veces, 2);
});

test('los días sin tráfico aparecen en cero, no se saltan', () => {
  const ahora = Date.now();
  const r = resumir([], { dias: 7, ahora });
  assert.strictEqual(r.porDia.length, 7);
  assert.ok(r.porDia.every((d) => d.mensajes === 0));
  assert.strictEqual(r.tasaDeAcierto, null, 'sin mensajes no hay tasa que calcular');
});

test('el bot pausado no cuenta como pregunta sin respuesta', () => {
  const ahora = Date.now();
  const r = resumir(
    [{ at: new Date(ahora).toISOString(), conversationId: 'c1', channel: 'web', pregunta: 'hola', intent: 'pausado', matched: false }],
    { ahora },
  );
  assert.strictEqual(r.sinRespuesta, 0, 'que el dueño lo haya pausado no es un fallo del bot');
});

/* ============================================================ núcleo por canal */

test('el núcleo atiende igual venga de donde venga: es lo que hará posible WhatsApp', () => {
  const log = logTemporal();
  const atender = crearAtencion({ sessions: new SessionStore(), conversations: log });

  const web = atender({ texto: 'a que hora abren', negocio: NEGOCIO, slug: 'negocio', canal: 'web' });
  const whatsapp = atender({
    texto: 'a que hora abren',
    negocio: NEGOCIO,
    slug: 'negocio',
    canal: 'whatsapp',
    idExterno: '+56912345678',
  });

  assert.strictEqual(web.reply, whatsapp.reply, 'el mismo mensaje debe dar la misma respuesta');
  assert.strictEqual(web.intent, 'horarios');

  // Y el registro distingue de dónde vino cada uno.
  assert.deepStrictEqual(log.leer('negocio').map((r) => r.channel), ['web', 'whatsapp']);
});

test('la conversación se reconoce por su identificador en el canal', () => {
  const atender = crearAtencion({ sessions: new SessionStore() });

  const primera = atender({ texto: 'hola', negocio: NEGOCIO, slug: 'negocio', canal: 'whatsapp', idExterno: null });
  const segunda = atender({
    texto: 'cuanto cuesta',
    negocio: NEGOCIO,
    slug: 'negocio',
    canal: 'whatsapp',
    idExterno: primera.conversacion,
  });

  assert.strictEqual(segunda.conversacion, primera.conversacion, 'debe seguir la misma conversación');
  assert.strictEqual(segunda.intent, 'precios');
});

test('el núcleo rechaza mensajes vacíos o enormes con un error propio, no de HTTP', () => {
  const atender = crearAtencion({ sessions: new SessionStore() });
  const base = { negocio: NEGOCIO, slug: 'negocio', canal: 'web' };

  assert.throws(() => atender({ ...base, texto: '' }), MensajeInvalido);
  assert.throws(() => atender({ ...base, texto: '   ' }), MensajeInvalido);
  assert.throws(() => atender({ ...base, texto: 'a'.repeat(1001) }), MensajeInvalido);
});

test('si el registro falla, la conversación responde igual', () => {
  const logRoto = { registrar() { throw new Error('disco lleno'); } };
  const atender = crearAtencion({ sessions: new SessionStore(), conversations: logRoto });

  // Responder es lo que no puede fallar. Perder una línea de estadística es molesto;
  // dejar a un cliente sin respuesta porque el disco está lleno, no.
  const resultado = atender({ texto: 'a que hora abren', negocio: NEGOCIO, slug: 'negocio', canal: 'web' });
  assert.strictEqual(resultado.reply, 'De 10 a 20.');
  assert.strictEqual(resultado.intent, 'horarios');
});
