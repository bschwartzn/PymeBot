/**
 * Genera dist/pymebot.html: la página para enseñarle PymeBot a un dueño de pyme.
 *
 * Lleva el bot funcionando dentro, con el motor real y un negocio real del repositorio.
 * Es a propósito: a un dueño de pyme no lo convence una captura de pantalla, lo convence
 * escribir "¿a qué hora abren?" y ver la respuesta.
 *
 * Uso:  npm run build:landing
 *       npm run build:landing -- dona-elba https://url-del-demo https://url-del-chat
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const { validateBusiness } = require(path.join(ROOT, 'src', 'knowledge', 'schema'));

/** Quita las líneas de CommonJS para poder concatenar los módulos en un solo scope. */
function toBrowserScript(source) {
  return source
    .replace(/^const .*= require\(.*\);\n/gm, '')
    .replace(/^module\.exports = .*;\n/gm, '')
    .trim();
}

const slug = process.argv[2] || 'dona-elba';
const URL_PANEL = process.argv[3] || 'https://claude.ai/code/artifact/9ad9fe08-3ce7-41b5-b478-77fa84414764';
const URL_CHAT = process.argv[4] || 'https://claude.ai/code/artifact/4d34c5d9-3097-45a1-a714-5fd08fcd2ed9';

const { ok, errors, business } = validateBusiness(JSON.parse(read('data', 'businesses', `${slug}.json`)));
if (!ok) {
  throw new Error(`El negocio "${slug}" no es válido:\n${errors.map((e) => `  - ${e.mensaje}`).join('\n')}`);
}

const motor = [
  toBrowserScript(read('src', 'bot', 'text.js')),
  toBrowserScript(read('src', 'bot', 'engine.js')),
].join('\n\n');

const html = read('scripts', 'landing-template.html')
  .replace('/*__ENGINE__*/', () => motor)
  .replace('/*__BUSINESS__*/', () => JSON.stringify(business, null, 2))
  .replace(/__URL_PANEL__/g, () => URL_PANEL)
  .replace(/__URL_CHAT__/g, () => URL_CHAT);

for (const marcador of ['__ENGINE__', '__BUSINESS__', '__URL_PANEL__', '__URL_CHAT__']) {
  if (html.includes(marcador)) throw new Error(`La plantilla no se rellenó: queda ${marcador}.`);
}

const out = path.join(ROOT, 'dist', 'pymebot.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

console.log(`dist/pymebot.html generado · bot de ${business.name} · ${(html.length / 1024).toFixed(1)} KB`);
