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
const business = read('src', 'config', 'business.json').trim();

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

console.log(`dist/sandbox.html generado · ${(html.length / 1024).toFixed(1)} KB`);
