const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { evaluar } = require('../scripts/eval');

/**
 * La evaluación no es solo una herramienta de diagnóstico: es una red de seguridad.
 * Sin este test, un cambio en el motor podría arreglar un caso y romper cinco sin que
 * nadie se entere hasta probarlo a mano.
 *
 * El piso se sube cuando un módulo mejora la comprensión. No se baja para que pase.
 */
const PISO = { 'dona-elba': 0.95, 'bella-vista': 1.0, 'boracay-spa': 0.98 };

const DIR = path.join(__dirname, '..', 'data', 'evals');

for (const archivo of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const evalSet = JSON.parse(fs.readFileSync(path.join(DIR, archivo), 'utf8'));
  const piso = PISO[evalSet.negocio];

  test(`${evalSet.negocio}: la precisión no baja de ${(piso * 100).toFixed(0)}%`, () => {
    assert.ok(piso !== undefined, `falta definir el piso de "${evalSet.negocio}" en este test`);

    const resultados = evaluar(evalSet);
    const fallos = resultados.filter((r) => !r.acierta);
    const precision = (resultados.length - fallos.length) / resultados.length;

    const detalle = fallos.map((f) => `  "${f.mensaje}" → ${f.obtuvo} (esperaba ${f.espera})`).join('\n');
    assert.ok(
      precision >= piso,
      `precisión ${(precision * 100).toFixed(1)}%, por debajo del piso.\n${detalle}`,
    );
  });
}

test('cada intención del negocio de referencia tiene al menos un caso de prueba', () => {
  const evalSet = JSON.parse(fs.readFileSync(path.join(DIR, 'dona-elba.json'), 'utf8'));
  const business = require('../data/businesses/dona-elba.json');

  const sinCubrir = business.intents
    .map((i) => i.id)
    .filter((id) => !evalSet.casos.some((c) => c.espera === id));

  assert.deepStrictEqual(sinCubrir, [], `intenciones sin ningún caso: ${sinCubrir.join(', ')}`);
});
