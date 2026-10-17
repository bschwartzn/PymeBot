/**
 * Arranca el bot de Boracay Spa en este computador, para probarlo en dos dispositivos sin
 * contratar hosting: el panel aquí y el chat en un teléfono conectado a la misma wifi.
 *
 * Uso:  npm run boracay
 *
 * Pide el correo y la contraseña de la dueña (no quedan guardados en ningún archivo del
 * proyecto, solo su hash en data-local/) y muestra las dos direcciones a abrir.
 */

const os = require('os');
const path = require('path');
const readline = require('readline');

function preguntar(rl, texto) {
  return new Promise((resolver) => rl.question(texto, (r) => resolver(r.trim())));
}

/** La dirección de este computador en la wifi: la que puede abrir un teléfono. */
function ipEnLaRed() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const nic of interfaces || []) {
      if (nic.family === 'IPv4' && !nic.internal) return nic.address;
    }
  }
  return null;
}

(async () => {
  const email = process.env.PYMEBOT_DUENO_EMAIL;
  const password = process.env.PYMEBOT_DUENO_PASSWORD;

  if (!email || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\n  Bot de Boracay Spa en este computador\n');
    process.env.PYMEBOT_DUENO_EMAIL = email || (await preguntar(rl, '  Correo de la dueña: '));
    process.env.PYMEBOT_DUENO_PASSWORD = password || (await preguntar(rl, '  Contraseña (mínimo 8 caracteres): '));
    rl.close();
  }

  const puerto = process.env.PORT || '3000';
  process.env.PORT = puerto;
  // Los datos de esta prueba van aparte de data/, que es parte del proyecto.
  process.env.PYMEBOT_DATA_DIR = process.env.PYMEBOT_DATA_DIR || path.join(__dirname, '..', 'data-local');

  const ip = ipEnLaRed();
  const base = ip ? `http://${ip}:${puerto}` : `http://localhost:${puerto}`;
  // El QR y los links del panel tienen que llevar al teléfono a esta dirección, no a localhost.
  process.env.PYMEBOT_PUBLIC_URL = process.env.PYMEBOT_PUBLIC_URL || base;

  require('../src/arranque').arrancar();

  setTimeout(() => {
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  En ESTE computador, el panel de la dueña:  http://localhost:${puerto}/panel.html`);
    if (ip) {
      console.log(`  En el TELÉFONO (misma wifi), el chat:      ${base}`);
      console.log('  (o escanea el QR de la pestaña Compartir del panel)');
    } else {
      console.log('  No encontré una red wifi: el teléfono no podrá conectarse.');
    }
    console.log('  Para detenerlo: Ctrl + C');
    console.log('  ─────────────────────────────────────────────────────────\n');
  }, 300);
})();
