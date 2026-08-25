const test = require('node:test');
const assert = require('node:assert');
const { validateBusiness, slugify, isValidSlug } = require('../src/knowledge/schema');

const NEGOCIO_MINIMO = {
  name: 'Taller X',
  intents: [{ id: 'horarios', keywords: ['horario', 'abren'], answer: 'De 9 a 18.' }],
};

const mensajes = (lista) => lista.map((e) => e.mensaje).join(' | ');

test('un negocio mínimo es válido', () => {
  const { ok, errors } = validateBusiness(NEGOCIO_MINIMO);
  assert.ok(ok, mensajes(errors));
});

test('los textos opcionales se rellenan con valores por defecto', () => {
  const { business } = validateBusiness(NEGOCIO_MINIMO);
  assert.ok(business.greeting.length > 0);
  assert.ok(business.fallback.length > 0);
  assert.deepStrictEqual(business.topics, []);
});

test('los negocios de ejemplo que vienen en el repo son válidos', () => {
  for (const archivo of ['bella-vista', 'taller-don-pepe']) {
    const { ok, errors } = validateBusiness(require(`../data/businesses/${archivo}.json`));
    assert.ok(ok, `${archivo}: ${mensajes(errors)}`);
  }
});

test('exige nombre', () => {
  const { ok, errors } = validateBusiness({ ...NEGOCIO_MINIMO, name: '  ' });
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.campo === 'name'));
});

test('exige al menos una pregunta', () => {
  assert.ok(!validateBusiness({ name: 'X', intents: [] }).ok);
  assert.ok(!validateBusiness({ name: 'X' }).ok);
});

test('exige respuesta y palabras clave en cada pregunta', () => {
  const sinRespuesta = validateBusiness({ name: 'X', intents: [{ id: 'a', keywords: ['hola'] }] });
  assert.ok(!sinRespuesta.ok);
  assert.ok(sinRespuesta.errors.some((e) => e.campo.endsWith('.answer')));

  const sinClaves = validateBusiness({ name: 'X', intents: [{ id: 'a', keywords: [], answer: 'hola' }] });
  assert.ok(!sinClaves.ok);
  assert.ok(sinClaves.errors.some((e) => e.campo.endsWith('.keywords')));
});

test('detecta identificadores repetidos', () => {
  const { ok, errors } = validateBusiness({
    name: 'X',
    intents: [
      { id: 'a', keywords: ['uno'], answer: 'r' },
      { id: 'a', keywords: ['dos'], answer: 'r' },
    ],
  });
  assert.ok(!ok);
  assert.ok(mensajes(errors).includes('repetido'));
});

test('los mensajes de error están en castellano y sin jerga técnica', () => {
  const { errors } = validateBusiness({ name: '', intents: [] });
  for (const error of errors) {
    assert.ok(/^[A-ZÁÉÍÓÚÑ¡]/.test(error.mensaje), `"${error.mensaje}" debería empezar con mayúscula`);
    assert.ok(error.mensaje.endsWith('.'), `"${error.mensaje}" debería terminar en punto`);
    assert.ok(!/undefined|null|Error:|string|array/i.test(error.mensaje), `"${error.mensaje}" tiene jerga`);
  }
});

/* --- Advertencias: no impiden guardar, pero explican por qué el bot responderá mal --- */

test('avisa cuando dos preguntas compiten por la misma palabra clave', () => {
  const { ok, warnings } = validateBusiness({
    name: 'X',
    topics: ['Uno'],
    intents: [
      { id: 'precios', keywords: ['corte'], answer: 'r' },
      { id: 'servicios', keywords: ['corte'], answer: 'r' },
    ],
  });
  assert.ok(ok, 'debe dejar guardar igual');
  assert.ok(warnings.some((w) => w.mensaje.includes('precios') && w.mensaje.includes('servicios')));
});

test('avisa cuando una palabra clave es una palabra vacía', () => {
  const { warnings } = validateBusiness({
    name: 'X',
    topics: ['Uno'],
    intents: [{ id: 'a', keywords: ['de', 'horario'], answer: 'r' }],
  });
  assert.ok(warnings.some((w) => w.mensaje.includes('"de"')));
});

test('no avisa por palabras cortas que sí son señales útiles', () => {
  const { warnings } = validateBusiness({
    name: 'X',
    topics: ['Uno'],
    intents: [{ id: 'cierre', keywords: ['no', 'ok'], answer: 'r' }],
  });
  assert.deepStrictEqual(warnings, [], mensajes(warnings));
});

test('avisa cuando una palabra clave está repetida dentro de la misma pregunta', () => {
  const { warnings } = validateBusiness({
    name: 'X',
    topics: ['Uno'],
    intents: [{ id: 'a', keywords: ['horario', 'Horarios', 'horario'], answer: 'r' }],
  });
  assert.strictEqual(warnings.filter((w) => w.mensaje.includes('repite')).length, 1);
});

test('avisa cuando no hay temas sugeridos', () => {
  const { warnings } = validateBusiness(NEGOCIO_MINIMO);
  assert.ok(warnings.some((w) => w.campo === 'topics'));
});

/* --- Identificadores --- */

test('slugify produce identificadores usables en archivos y URLs', () => {
  assert.strictEqual(slugify('Peluquería Bella Vista'), 'peluqueria-bella-vista');
  assert.strictEqual(slugify('Taller Don Pepe & Hijos'), 'taller-don-pepe-hijos');
  assert.strictEqual(slugify('Panadería La Ñaña'), 'panaderia-la-nana');
  assert.ok(slugify('X'.repeat(80)).length <= 40);
});

test('isValidSlug rechaza todo lo que no sea un identificador limpio', () => {
  assert.ok(isValidSlug('bella-vista'));
  for (const malo of ['../x', 'Bella', 'con espacio', '', '-empieza-con-guion', 'x'.repeat(41), null]) {
    assert.ok(!isValidSlug(malo), `debería rechazar ${JSON.stringify(malo)}`);
  }
});

test('no revienta con entradas que no son un objeto', () => {
  for (const basura of [null, undefined, 'texto', 42, []]) {
    const { ok, errors } = validateBusiness(basura);
    assert.ok(!ok);
    assert.ok(errors.length > 0);
  }
});
