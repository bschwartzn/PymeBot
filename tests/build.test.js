const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SALIDA = path.join(ROOT, 'dist', 'sandbox.html');

/**
 * El sandbox autocontenido se genera desde src/. Estos tests evitan que se
 * desincronice del código real o que quede publicado con CommonJS adentro.
 */
test('la build genera un sandbox autocontenido y al día', () => {
  execFileSync('node', ['scripts/build-sandbox.js'], { cwd: ROOT });

  const html = fs.readFileSync(SALIDA, 'utf8');
  const dir = path.join(ROOT, 'data', 'businesses');
  const negocios = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  // Trae el motor real, no una copia escrita a mano.
  assert.ok(html.includes('function respond('), 'falta la función respond del motor');
  assert.ok(html.includes('function normalize('), 'falta la normalización de texto');

  // Trae todos los negocios configurados, no solo uno.
  assert.ok(negocios.length >= 2, 'el repo debería traer más de un negocio de ejemplo');
  for (const archivo of negocios) {
    const business = JSON.parse(fs.readFileSync(path.join(dir, archivo), 'utf8'));
    assert.ok(html.includes(business.name), `falta el negocio ${business.name}`);
    for (const intent of business.intents) {
      assert.ok(html.includes(`"${intent.id}"`), `falta la intención ${intent.id} de ${business.name}`);
    }
  }

  // Nada de CommonJS ni marcadores sin rellenar: el navegador no los entiende.
  assert.ok(!html.includes('module.exports'), 'quedó un module.exports en el HTML');
  assert.ok(!/require\(['"]\.\//.test(html), 'quedó un require() relativo en el HTML');
  assert.ok(!html.includes('__ENGINE__'), 'quedó un marcador de inyección sin rellenar');
  assert.ok(!html.includes('__BUSINESS__'), 'quedó un marcador de inyección sin rellenar');

  // Sin recursos externos: debe abrir con doble clic, sin servidor.
  assert.ok(!html.includes('src="'), 'el HTML referencia un script externo');
  assert.ok(!html.includes('fetch('), 'el HTML hace peticiones de red');
});

test('el sandbox generado responde igual que el motor del servidor', () => {
  const html = fs.readFileSync(SALIDA, 'utf8');
  const { respond } = require('../src/bot/engine');

  // Si el HTML contiene la respuesta exacta que da el motor, están sincronizados.
  for (const slug of ['bella-vista', 'taller-don-pepe']) {
    const business = require(`../data/businesses/${slug}.json`);
    for (const pregunta of ['a que hora abren', 'cuanto cuesta', 'donde estan']) {
      const esperado = respond(pregunta, business).reply;
      assert.ok(html.includes(esperado.slice(0, 40)), `${slug}: falta la respuesta a "${pregunta}"`);
    }
  }
});
