/**
 * Arma el sitio estático que se publica en GitHub Pages.
 *
 * Qué incluye y qué no, y por qué:
 *
 *   SÍ  · la landing para posibles clientes
 *   SÍ  · el chat de cada negocio, funcionando de verdad (el motor va dentro del archivo)
 *   SÍ  · el panel de demostración, con los cambios guardados en el navegador
 *
 *   NO  · el panel real con cuentas, porque un hosting estático no puede guardar nada ni
 *         autenticar a nadie. Eso necesita el servidor Node y un disco persistente.
 *
 * Todo se genera desde src/, como el resto del proyecto: el sitio publicado no puede
 * prometer un bot distinto del que existe.
 *
 * Los links entre páginas son RELATIVOS, no absolutos. Eso hace que el mismo sitio
 * funcione servido en la raíz de un dominio, en un subdirectorio de GitHub Pages, o
 * arrastrado a cualquier hosting estático, sin reconstruirlo.
 *
 * Deja también un .zip listo para arrastrar a un hosting estático (Netlify Drop,
 * Cloudflare Pages), que es la forma más rápida de tener una dirección pública sin
 * configurar nada.
 *
 * Uso:  npm run build:sitio
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SALIDA = path.join(ROOT, 'dist', 'sitio');

function correr(script, args = []) {
  execFileSync('node', [path.join(__dirname, script), ...args], { cwd: ROOT, stdio: 'pipe' });
}

const negocios = fs
  .readdirSync(path.join(ROOT, 'data', 'businesses'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(path.join(SALIDA, 'chat'), { recursive: true });

// --- El chat de cada negocio ---
for (const slug of negocios) {
  correr('build-chat.js', [slug]);
  fs.copyFileSync(path.join(ROOT, 'dist', `chat-${slug}.html`), path.join(SALIDA, 'chat', `${slug}.html`));
}

// --- La página que abre un negocio que viaja dentro del link ---
// Es lo que hace que el botón "Compartir" del panel entregue un link que de verdad
// funciona, aun sin servidor: la información del negocio va en el propio enlace.
const { validateBusiness } = require(path.join(ROOT, 'src', 'knowledge', 'schema'));
void validateBusiness; // se usa abajo solo para no re-leer el esquema

function aNavegador(fuente) {
  return fuente
    .replace(/^const .*= require\(.*\);\n/gm, '')
    .replace(/^module\.exports = .*;\n/gm, '')
    .trim();
}

const motor = [
  aNavegador(fs.readFileSync(path.join(ROOT, 'src', 'bot', 'text.js'), 'utf8')),
  aNavegador(fs.readFileSync(path.join(ROOT, 'src', 'bot', 'engine.js'), 'utf8')),
].join('\n\n');

fs.writeFileSync(
  path.join(SALIDA, 'chat', 'compartido.html'),
  fs
    .readFileSync(path.join(ROOT, 'scripts', 'chat-compartido-template.html'), 'utf8')
    .replace('/*__ESTILOS__*/', () => fs.readFileSync(path.join(ROOT, 'public', 'chat.css'), 'utf8'))
    .replace('/*__ENGINE__*/', () => motor),
);

// --- El panel de demostración ---
// Ruta relativa: panel.html vive en la raíz del sitio, igual que index.html.
correr('build-demo.js', ['chat/dona-elba.html']);
fs.copyFileSync(path.join(ROOT, 'dist', 'demo.html'), path.join(SALIDA, 'panel.html'));

// --- La landing, que es la portada del sitio ---
correr('build-landing.js', ['dona-elba', 'panel.html', 'chat/dona-elba.html']);
fs.copyFileSync(path.join(ROOT, 'dist', 'pymebot.html'), path.join(SALIDA, 'index.html'));

// GitHub Pages procesa el sitio con Jekyll salvo que se le diga que no. Sin esto, ignora
// cualquier archivo o carpeta que empiece por guion bajo.
fs.writeFileSync(path.join(SALIDA, '.nojekyll'), '');

/**
 * Empaqueta un directorio en un .zip, sin dependencias.
 *
 * Se escribe el formato a mano —dos estructuras, un CRC y deflate, que ya viene en Node—
 * en vez de sumar una librería de compresión a un proyecto que solo necesita esto una vez
 * por despliegue.
 */
function empaquetar(origen, destino) {
  const entradas = [];
  (function recorrer(dir, prefijo = '') {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const relativo = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
      if (entrada.isDirectory()) recorrer(path.join(dir, entrada.name), relativo);
      else entradas.push({ nombre: relativo, datos: fs.readFileSync(path.join(dir, entrada.name)) });
    }
  })(origen);

  const trozos = [];
  const central = [];
  let posicion = 0;

  for (const { nombre, datos } of entradas) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crc = zlib.crc32 ? zlib.crc32(datos) : crc32(datos);

    // El CRC y el tamaño son SIEMPRE los del archivo original, no los del comprimido.
    const comprimido = datos.length ? zlib.deflateRawSync(datos, { level: 9 }) : datos;
    const metodo = datos.length ? 8 : 0; // 8 = deflate; un archivo vacío va tal cual

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // firma
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);

    trozos.push(local, nombreBuf, comprimido);

    const cabecera = Buffer.alloc(46);
    cabecera.writeUInt32LE(0x02014b50, 0);
    cabecera.writeUInt16LE(20, 4);
    cabecera.writeUInt16LE(20, 6);
    cabecera.writeUInt16LE(0x0800, 8);
    cabecera.writeUInt16LE(metodo, 10);
    cabecera.writeUInt32LE(crc, 16);
    cabecera.writeUInt32LE(comprimido.length, 20);
    cabecera.writeUInt32LE(datos.length, 24);
    cabecera.writeUInt16LE(nombreBuf.length, 28);
    cabecera.writeUInt32LE(posicion, 42);
    central.push(cabecera, nombreBuf);

    posicion += local.length + nombreBuf.length + comprimido.length;
  }

  const centralBuf = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(centralBuf.length, 12);
  fin.writeUInt32LE(posicion, 16);

  fs.writeFileSync(destino, Buffer.concat([...trozos, centralBuf, fin]));
  return entradas.length;
}

/** CRC-32, por si la versión de Node no trae zlib.crc32. */
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const archivos = [];
(function recorrer(dir, prefijo = '') {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativo = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) recorrer(path.join(dir, entrada.name), relativo);
    else archivos.push(relativo);
  }
})(SALIDA);

console.log('dist/sitio/ armado (links relativos: sirve en cualquier hosting estático)');
for (const archivo of archivos) {
  const kb = (fs.statSync(path.join(SALIDA, archivo)).size / 1024).toFixed(1);
  console.log(`  ${archivo.padEnd(28)} ${kb} KB`);
}

const zip = path.join(ROOT, 'dist', 'pymebot-sitio.zip');
empaquetar(SALIDA, zip);
console.log(`\ndist/pymebot-sitio.zip · ${(fs.statSync(zip).size / 1024).toFixed(1)} KB`);
console.log('Descomprímelo y arrastra la carpeta a app.netlify.com/drop para tener una dirección pública.');
