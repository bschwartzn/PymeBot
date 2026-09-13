/**
 * Punto de arranque del servidor.
 *
 * Separado de server.js a propósito: ahí vive `createApp`, que los tests importan sin
 * levantar nada. Aquí vive todo lo que solo ocurre al correr de verdad — preparar el disco,
 * escuchar en un puerto y cerrar ordenadamente.
 */

const fs = require('fs');
const path = require('path');

const config = require('./config');
const { createApp } = require('./server');
const { BusinessRepository } = require('./knowledge/repository');

/** De dónde salen los negocios de ejemplo dentro de la imagen. */
const SEMILLAS = [
  path.join(__dirname, '..', 'semillas', 'businesses'),
  path.join(__dirname, '..', 'data', 'businesses'),
];

/**
 * Un disco recién creado viene vacío, así que el panel aparecería sin nada que mostrar y
 * el chat respondería que no hay ningún negocio. Se copian los ejemplos la primera vez.
 *
 * Solo la primera vez: si el directorio ya tiene algo, no se toca nada. Un despliegue
 * nuevo no puede pisar los negocios reales de un cliente.
 */
function sembrarSiEstaVacio() {
  fs.mkdirSync(config.businessesDir, { recursive: true });

  const yaHay = fs.readdirSync(config.businessesDir).filter((f) => f.endsWith('.json'));
  if (yaHay.length > 0) return 0;

  const origen = SEMILLAS.find((dir) => fs.existsSync(dir) && dir !== config.businessesDir);
  if (!origen) return 0;

  let copiados = 0;
  for (const archivo of fs.readdirSync(origen).filter((f) => f.endsWith('.json'))) {
    fs.copyFileSync(path.join(origen, archivo), path.join(config.businessesDir, archivo));
    copiados += 1;
  }
  return copiados;
}

function arrancar() {
  const sembrados = sembrarSiEstaVacio();

  const repository = new BusinessRepository();
  const app = createApp({ repository });

  const server = app.listen(config.port, () => {
    const base = config.publicUrl || `http://localhost:${config.port}`;

    console.log(`\n  🤖 PymeBot escuchando en el puerto ${config.port}`);
    console.log(`     Panel del dueño:  ${base}/panel.html`);
    console.log(`     Datos en:         ${config.dataDir}`);
    console.log(`     Negocios:         ${repository.list().length}${sembrados ? ` (${sembrados} de ejemplo, primer arranque)` : ''}`);

    if (config.isProduction && !config.publicUrl) {
      console.warn('     ⚠  Sin PYMEBOT_PUBLIC_URL: los links compartidos y el QR se deducirán de cada petición.');
    }
    console.log('');
  });

  /*
   * Cierre ordenado.
   *
   * Al desplegar, el hosting manda SIGTERM y espera antes de matar el proceso. Sin
   * atenderlo, las peticiones en curso se cortan y una escritura a medias podría dejar un
   * archivo de negocio corrupto. Se deja de aceptar conexiones, se termina lo que está en
   * curso, y recién ahí se sale.
   */
  let cerrando = false;
  for (const senal of ['SIGTERM', 'SIGINT']) {
    process.on(senal, () => {
      if (cerrando) return;
      cerrando = true;
      console.log(`\n  ${senal} recibida: cerrando ordenadamente…`);

      server.close(() => {
        console.log('  Listo.');
        process.exit(0);
      });

      // Red de seguridad: si algo queda colgado, no bloquear el despliegue para siempre.
      setTimeout(() => {
        console.warn('  Algunas conexiones no cerraron a tiempo. Saliendo igual.');
        process.exit(0);
      }, 10000).unref();
    });
  }

  return server;
}

if (require.main === module) arrancar();

module.exports = { arrancar, sembrarSiEstaVacio };
