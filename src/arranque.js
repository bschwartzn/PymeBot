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
const { UserStore, AuthError } = require('./auth/users');
const { AuthSessionStore } = require('./auth/sessions');
const { hashPassword, verifyPassword } = require('./auth/passwords');

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

  // El bot de un cliente no lleva negocios de ejemplo: serían chats de prueba públicos.
  if (config.modoCliente) return 0;

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

/**
 * Deja lista la cuenta del dueño de la demostración y su negocio.
 *
 * Corre en cada arranque y es idempotente: crea la cuenta si falta y el negocio si falta,
 * pero no toca ninguno de los dos si ya existen. Lo que el dueño edite desde el panel se
 * conserva entre despliegues; y si el hosting no tiene disco, se vuelve a crear solo.
 *
 * @returns {{ email: string, slug: string } | null}
 */
function prepararDueno({
  dueno = config.dueno,
  users = new UserStore(),
  repository = new BusinessRepository(),
  authSessions = new AuthSessionStore(),
} = {}) {
  if (!dueno.email || !dueno.password) return null;

  let user = users.findByEmail(dueno.email);
  if (!user) {
    const creado = users.create({ email: dueno.email, password: dueno.password });
    users.setPassword(creado.id, dueno.password, { desdeEntorno: hashPassword(dueno.password) });
    user = users.findById(creado.id);
  } else if (!user.passwordFromEnv || !verifyPassword(dueno.password, user.passwordFromEnv)) {
    /*
     * La contraseña del hosting cambió: es la forma de recuperar la cuenta sin correo de
     * recuperación. Se aplica una sola vez —si después la dueña la cambia desde el panel,
     * los reinicios no se la pisan— y cierra todas las sesiones abiertas.
     */
    users.setPassword(user.id, dueno.password, { desdeEntorno: hashPassword(dueno.password) });
    authSessions.destroyAllFor(user.id);
  }

  const negocio = JSON.parse(fs.readFileSync(dueno.negocio, 'utf8'));
  const slug = path.basename(dueno.negocio, '.json');
  if (!repository.exists(slug)) {
    repository.save(slug, { ...negocio, ownerId: user.id });
  }

  return { email: user.email, slug };
}

/**
 * En el bot de un cliente, los negocios de ejemplo sobran: quedarían como chats públicos de
 * prueba en su dirección. Solo se borran los que son ejemplos (sin dueño y con el nombre de
 * un archivo de ejemplo), nunca un negocio de alguien.
 */
function quitarEjemplos({
  repository = new BusinessRepository(),
  modoCliente = config.modoCliente,
  semillas = SEMILLAS,
} = {}) {
  if (!modoCliente) return 0;
  const ejemplos = semillas
    .filter((dir) => fs.existsSync(dir) && path.resolve(dir) !== path.resolve(repository.dir))
    .flatMap((dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.json')))
    .map((f) => f.replace(/\.json$/, ''));

  let quitados = 0;
  for (const slug of new Set(ejemplos)) {
    const negocio = repository.get(slug);
    if (negocio && negocio.ownerId === null) {
      repository.remove(slug);
      quitados += 1;
    }
  }
  return quitados;
}

function arrancar() {
  const sembrados = sembrarSiEstaVacio();

  const repository = new BusinessRepository();

  // Una contraseña del hosting que no sirve (muy corta, por ejemplo) no puede dejar el chat
  // caído: los clientes siguen atendidos y el registro dice exactamente qué corregir.
  let dueno = null;
  try {
    dueno = prepararDueno({ repository });
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    console.error(`  ⚠  No se pudo preparar la cuenta del dueño: ${err.message}`);
    console.error('     Corrige PYMEBOT_DUENO_PASSWORD en el hosting y vuelve a desplegar.');
  }
  quitarEjemplos({ repository });
  const app = createApp({ repository });

  const server = app.listen(config.port, () => {
    const base = config.publicUrl || `http://localhost:${config.port}`;

    console.log(`\n  🤖 PymeBot escuchando en el puerto ${config.port}`);
    console.log(`     Panel del dueño:  ${base}/panel.html`);
    console.log(`     Datos en:         ${config.dataDir}`);
    console.log(`     Negocios:         ${repository.list().length}${sembrados ? ` (${sembrados} de ejemplo, primer arranque)` : ''}`);
    if (dueno) {
      console.log(`     Cuenta del dueño: ${dueno.email} → ${base}/c/${dueno.slug}`);
    }

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

module.exports = { arrancar, sembrarSiEstaVacio, prepararDueno, quitarEjemplos };
