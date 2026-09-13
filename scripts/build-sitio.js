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
 * Uso:  npm run build:sitio -- https://bschwartzn.github.io/pymebot-web
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SALIDA = path.join(ROOT, 'dist', 'sitio');

/** La base pública. Importa para que los links entre páginas no se rompan. */
const BASE = (process.argv[2] || '').replace(/\/+$/, '');

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

// --- El panel de demostración ---
correr('build-demo.js', [`${BASE}/chat/dona-elba.html`]);
fs.copyFileSync(path.join(ROOT, 'dist', 'demo.html'), path.join(SALIDA, 'panel.html'));

// --- La landing, que es la portada del sitio ---
correr('build-landing.js', ['dona-elba', `${BASE}/panel.html`, `${BASE}/chat/dona-elba.html`]);
fs.copyFileSync(path.join(ROOT, 'dist', 'pymebot.html'), path.join(SALIDA, 'index.html'));

// GitHub Pages procesa el sitio con Jekyll salvo que se le diga que no. Sin esto, ignora
// cualquier archivo o carpeta que empiece por guion bajo.
fs.writeFileSync(path.join(SALIDA, '.nojekyll'), '');

const archivos = [];
(function recorrer(dir, prefijo = '') {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativo = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) recorrer(path.join(dir, entrada.name), relativo);
    else archivos.push(relativo);
  }
})(SALIDA);

console.log(`dist/sitio/ armado para ${BASE || '(sin base)'}`);
for (const archivo of archivos) {
  const kb = (fs.statSync(path.join(SALIDA, archivo)).size / 1024).toFixed(1);
  console.log(`  ${archivo.padEnd(28)} ${kb} KB`);
}
