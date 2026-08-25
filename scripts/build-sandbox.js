/**
 * Genera dist/sandbox.html: el mismo sandbox, pero en un único archivo que se abre
 * con doble clic o se publica en cualquier hosting estático, sin servidor.
 *
 * El motor NO se reescribe: se toma tal cual de src/bot/ y se le quitan las líneas de
 * require/module.exports, que son lo único que el navegador no entiende. Así el archivo
 * publicado y el servidor local responden exactamente igual.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Quita las líneas de CommonJS para poder concatenar los módulos en un solo scope. */
function toBrowserScript(source) {
  return source
    .replace(/^const .*= require\(.*\);\n/gm, '')
    .replace(/^module\.exports = .*;\n/gm, '')
    .trim();
}

const engine = [toBrowserScript(read('src', 'bot', 'text.js')), toBrowserScript(read('src', 'bot', 'engine.js'))].join(
  '\n\n',
);
// Se empaquetan todos los negocios configurados, para que el sandbox sin servidor
// también permita cambiar entre ellos. `npm run build:sandbox -- bella-vista` empaqueta solo uno.
const { validateBusiness } = require(path.join(ROOT, 'src', 'knowledge', 'schema'));
const DIR = path.join(ROOT, 'data', 'businesses');

const pedido = process.argv[2] || process.env.PYMEBOT_BUSINESS || null;
const slugs = (pedido ? [pedido] : fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))).sort();

if (slugs.length === 0) throw new Error('No hay ningún negocio en data/businesses/.');

const negocios = slugs.map((slug) => {
  const { ok, errors, business } = validateBusiness(JSON.parse(read('data', 'businesses', `${slug}.json`)));
  if (!ok) {
    throw new Error(`El negocio "${slug}" no es válido:\n` + errors.map((e) => `  - ${e.mensaje}`).join('\n'));
  }
  return { slug, ...business };
});

const business = JSON.stringify(negocios, null, 2);

const template = read('scripts', 'sandbox-template.html');
const html = template
  .replace('/*__ENGINE__*/', () => engine)
  .replace('/*__BUSINESS__*/', () => business);

if (html.includes('__ENGINE__') || html.includes('__BUSINESS__')) {
  throw new Error('La plantilla no se rellenó: faltan los marcadores de inyección.');
}

const out = path.join(ROOT, 'dist', 'sandbox.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

console.log(
  `dist/sandbox.html generado · ${negocios.map((n) => n.name).join(', ')} · ${(html.length / 1024).toFixed(1)} KB`,
);
