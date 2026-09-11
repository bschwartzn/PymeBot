/**
 * Mide qué tan seguido el bot acierta.
 *
 * Corre un conjunto de preguntas escritas como las escribiría un cliente real y compara
 * la intención que detecta el motor contra la que se esperaba. Sirve para dos cosas:
 *   - encontrar los fallos concretos en vez de buscarlos a ojo;
 *   - comparar módulos: si el Módulo 3 mejora la comprensión, tiene que subir este número.
 *
 * Uso:  npm run eval            (todos los conjuntos)
 *       npm run eval -- dona-elba
 */

const fs = require('fs');
const path = require('path');

const { respond } = require('../src/bot/engine');
const { validateBusiness } = require('../src/knowledge/schema');

const ROOT = path.join(__dirname, '..');
const DIR_EVALS = path.join(ROOT, 'data', 'evals');
const DIR_NEGOCIOS = path.join(ROOT, 'data', 'businesses');

function cargarNegocio(slug) {
  const { ok, errors, business } = validateBusiness(
    JSON.parse(fs.readFileSync(path.join(DIR_NEGOCIOS, `${slug}.json`), 'utf8')),
  );
  if (!ok) throw new Error(`El negocio "${slug}" no es válido: ${errors.map((e) => e.mensaje).join(' ')}`);
  return business;
}

/** Corre un conjunto y devuelve los resultados, sin imprimir nada. */
function evaluar(evalSet) {
  const business = cargarNegocio(evalSet.negocio);

  return evalSet.casos.map((caso) => {
    const resultado = respond(caso.mensaje, business);
    return {
      mensaje: caso.mensaje,
      espera: caso.espera,
      obtuvo: resultado.intent,
      score: resultado.score,
      acierta: resultado.intent === caso.espera,
    };
  });
}

/** Clasifica un fallo, porque no todos duelen igual. */
function tipoDeFallo({ espera, obtuvo }) {
  if (espera === 'fallback') return 'responde algo que no sabe';
  if (obtuvo === 'fallback') return 'no entiende';
  return 'confunde de tema';
}

function informar(evalSet) {
  const resultados = evaluar(evalSet);
  const fallos = resultados.filter((r) => !r.acierta);
  const aciertos = resultados.length - fallos.length;
  const porcentaje = ((aciertos / resultados.length) * 100).toFixed(1);

  console.log(`\n━━━ ${evalSet.negocio} ━━━`);
  console.log(`${aciertos}/${resultados.length} correctas  ·  ${porcentaje}% de acierto\n`);

  if (fallos.length === 0) {
    console.log('  Sin fallos.\n');
    return { total: resultados.length, aciertos, fallos };
  }

  // Agrupados por tipo: es lo que dice en qué hay que trabajar.
  const porTipo = new Map();
  for (const fallo of fallos) {
    const tipo = tipoDeFallo(fallo);
    if (!porTipo.has(tipo)) porTipo.set(tipo, []);
    porTipo.get(tipo).push(fallo);
  }

  for (const [tipo, lista] of [...porTipo].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${tipo.toUpperCase()} (${lista.length})`);
    for (const f of lista) {
      console.log(`    "${f.mensaje}"`);
      console.log(`       esperaba: ${f.espera}   ·   obtuvo: ${f.obtuvo} (${f.score.toFixed(1)})`);
    }
    console.log('');
  }

  return { total: resultados.length, aciertos, fallos };
}

if (require.main === module) {
  const pedido = process.argv[2];
  const archivos = fs
    .readdirSync(DIR_EVALS)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !pedido || f === `${pedido}.json`);

  if (archivos.length === 0) {
    console.error(`No hay conjuntos de prueba${pedido ? ` para "${pedido}"` : ''} en data/evals/.`);
    process.exit(1);
  }

  let total = 0;
  let aciertos = 0;
  for (const archivo of archivos) {
    const evalSet = JSON.parse(fs.readFileSync(path.join(DIR_EVALS, archivo), 'utf8'));
    const r = informar(evalSet);
    total += r.total;
    aciertos += r.aciertos;
  }

  if (archivos.length > 1) {
    console.log(`━━━ TOTAL ━━━\n${aciertos}/${total}  ·  ${((aciertos / total) * 100).toFixed(1)}%\n`);
  }
}

module.exports = { evaluar, cargarNegocio };
