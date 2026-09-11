/**
 * Genera dist/demo.html: el panel del dueño funcionando en un solo archivo, sin servidor.
 *
 * Para qué sirve: mostrarle a un dueño de pyme cómo configuraría su bot, y ver si entiende
 * el concepto de "palabras clave". Es la parte del producto sobre la que más hace falta
 * escuchar, y la que no se puede enseñar con un archivo estático... salvo así.
 *
 * Cómo funciona: se toman el HTML, el CSS y el JavaScript REALES del panel, sin tocarlos,
 * y se sustituye únicamente `fetch` por una implementación que guarda en el navegador.
 * El panel no se entera de que no hay servidor. Eso significa que:
 *   - la validación es la de verdad (src/knowledge/schema.js),
 *   - el bot de la vista previa es el de verdad (src/bot/),
 *   - y el demo no puede desviarse del producto, porque es el producto.
 *
 * Lo único simulado es la persistencia (queda en el navegador) y el inicio de sesión, que
 * en el demo no comprueba nada. Está dicho en pantalla.
 */

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Quita las líneas de CommonJS para poder concatenar los módulos en un solo scope. */
function toBrowserScript(source) {
  return source
    .replace(/^const .*= require\(.*\);\n/gm, '')
    .replace(/^module\.exports = .*;\n/gm, '')
    .trim();
}

/** Un texto que va DENTRO de un <script> no puede contener la secuencia de cierre. */
function comoCadenaJs(texto) {
  return JSON.stringify(texto).replace(/<\/script/gi, '<\\/script');
}

/** El cuerpo del panel real, sin su <script src>, que aquí va embebido. */
function cuerpoDelPanel() {
  const html = read('public', 'panel.html');
  const cuerpo = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  return cuerpo.replace(/\s*<script src="panel\.js"><\/script>/, '').trim();
}

(async () => {
  const motor = [
    toBrowserScript(read('src', 'bot', 'text.js')),
    toBrowserScript(read('src', 'bot', 'engine.js')),
  ].join('\n\n');

  // La plantilla del chat, con estilos y motor ya dentro: la vista previa la rellena con el
  // negocio que se esté editando, en el momento.
  const plantillaChat = read('scripts', 'chat-template.html')
    .replace('/*__ESTILOS__*/', () => read('public', 'chat.css'))
    .replace('/*__ENGINE__*/', () => motor);

  const ejemplos = fs
    .readdirSync(path.join(ROOT, 'data', 'businesses'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ slug: f.replace(/\.json$/, ''), ...JSON.parse(read('data', 'businesses', f)) }));

  /*
   * El QR del demo.
   *
   * No puede apuntar al negocio que se está editando, y conviene entender por qué: los
   * negocios del demo viven en el localStorage de ESE navegador, así que un teléfono que
   * escaneara un enlace al propio demo abriría uno vacío. Y meter el negocio dentro del QR
   * tampoco sirve: un negocio configurado pesa ~8 KB y un QR admite ~1,6 KB.
   *
   * Así que apunta a un chat publicado de verdad. Es escaneable y abre un bot que funciona,
   * que es lo que hay que enseñar. La pantalla dice que es un ejemplo.
   *
   * Se pasa por argumento porque depende de dónde esté publicado:
   *   npm run build:demo -- https://mi-chat-publicado
   */
  const URL_CHAT_DEMO =
    process.argv[2] ||
    process.env.PYMEBOT_DEMO_CHAT_URL ||
    'https://claude.ai/code/artifact/4d34c5d9-3097-45a1-a714-5fd08fcd2ed9';

  const qrMuestra = await QRCode.toString(URL_CHAT_DEMO, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'Q',
  });

  const html = read('scripts', 'demo-template.html')
    .replace('/*__ESTILOS_PANEL__*/', () => read('public', 'panel.css'))
    .replace('<!--__CUERPO_PANEL__-->', () => cuerpoDelPanel())
    .replace('/*__SCHEMA__*/', () => toBrowserScript(read('src', 'knowledge', 'schema.js')))
    .replace('/*__MOTOR__*/', () => motor)
    .replace('/*__PANEL_JS__*/', () => read('public', 'panel.js'))
    .replace('/*__EJEMPLOS__*/', () => JSON.stringify(ejemplos, null, 2))
    .replace('/*__PLANTILLA_CHAT__*/', () => comoCadenaJs(plantillaChat))
    .replace('/*__QR__*/', () => comoCadenaJs(qrMuestra))
    .replace('/*__URL_CHAT_DEMO__*/', () => comoCadenaJs(URL_CHAT_DEMO));

  for (const marcador of ['__ESTILOS_PANEL__', '__CUERPO_PANEL__', '__SCHEMA__', '__MOTOR__', '__PANEL_JS__', '__EJEMPLOS__', '__PLANTILLA_CHAT__', '__QR__', '__URL_CHAT_DEMO__']) {
    if (html.includes(marcador)) throw new Error(`La plantilla no se rellenó: queda ${marcador}.`);
  }

  const out = path.join(ROOT, 'dist', 'demo.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);

  console.log(
    `dist/demo.html generado · ${ejemplos.length} ejemplos · QR → ${URL_CHAT_DEMO} · ${(html.length / 1024).toFixed(1)} KB`,
  );
})();
