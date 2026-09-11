/**
 * Genera dist/chat-<negocio>.html: la página del cliente en un solo archivo.
 *
 * Para qué sirve: probar con clientes reales HOY, sin servidor, sin dominio y sin
 * contratar hosting. Se sube a cualquier alojamiento estático, o se abre con doble clic.
 *
 * Qué se pierde: al no haber servidor, el dueño no puede editar la información desde el
 * panel (hay que regenerar el archivo), y las conversaciones no quedan en ninguna parte.
 * Para lo segundo hace falta el servidor completo.
 *
 * El motor y los estilos se toman del código real: no hay una copia paralela que se pueda
 * desincronizar.
 *
 * Uso:  npm run build:chat -- dona-elba
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

const slug = process.argv[2] || process.env.PYMEBOT_BUSINESS || 'dona-elba';

const { ok, errors, business } = validateBusiness(
  JSON.parse(read('data', 'businesses', `${slug}.json`)),
);
if (!ok) {
  throw new Error(`El negocio "${slug}" no es válido:\n${errors.map((e) => `  - ${e.mensaje}`).join('\n')}`);
}

const engine = [toBrowserScript(read('src', 'bot', 'text.js')), toBrowserScript(read('src', 'bot', 'engine.js'))].join(
  '\n\n',
);

const template = read('scripts', 'chat-template.html');
const html = template
  .replace('/*__ESTILOS__*/', () => read('public', 'chat.css'))
  .replace('/*__ENGINE__*/', () => engine)
  .replace('/*__BUSINESS__*/', () => JSON.stringify(business, null, 2))
  .replace(/__NOMBRE__/g, () => business.name.replace(/[<>&"]/g, ''));

for (const marcador of ['__ESTILOS__', '__ENGINE__', '__BUSINESS__', '__NOMBRE__']) {
  if (html.includes(marcador)) throw new Error(`La plantilla no se rellenó: queda ${marcador}.`);
}

const out = path.join(ROOT, 'dist', `chat-${slug}.html`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);

console.log(`dist/chat-${slug}.html generado · ${business.name} · ${(html.length / 1024).toFixed(1)} KB`);
