/**
 * Guarda y lee los negocios.
 *
 * Un archivo JSON por negocio dentro de data/businesses/. Sin base de datos: para el
 * volumen de un MVP, el sistema de archivos alcanza y se puede inspeccionar a ojo.
 *
 * No hay caché a propósito. Cada lectura va al disco, así que un cambio guardado desde el
 * editor aplica en la siguiente pregunta sin reiniciar el servidor: la recarga en caliente
 * sale gratis en vez de costar un mecanismo de invalidación.
 */

const fs = require('fs');
const path = require('path');

const { validateBusiness, slugify, isValidSlug } = require('./schema');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'data', 'businesses');

/** Error con la lista de problemas que el editor le muestra al usuario. */
class ValidationError extends Error {
  constructor(errors, warnings = []) {
    super('La información del negocio tiene errores.');
    this.name = 'ValidationError';
    this.errors = errors;
    this.warnings = warnings;
  }
}

class BusinessRepository {
  constructor({ dir = DEFAULT_DIR } = {}) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Traduce un slug a una ruta, rechazando cualquier cosa que no sea un slug limpio.
   * El slug llega desde la URL, así que aquí es donde se corta el paso a rutas
   * como "../../etc/passwd".
   */
  pathFor(slug) {
    if (!isValidSlug(slug)) return null;
    const file = path.join(this.dir, `${slug}.json`);
    // Cinturón y tirantes: el resultado tiene que seguir dentro del directorio de datos.
    if (path.dirname(path.resolve(file)) !== path.resolve(this.dir)) return null;
    return file;
  }

  /** Resumen de todos los negocios, para el selector y el listado del editor. */
  list() {
    const archivos = fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    return archivos
      .map((archivo) => {
        const slug = archivo.replace(/\.json$/, '');
        const business = this.get(slug);
        if (!business) return null;
        return {
          slug,
          name: business.name,
          tagline: business.tagline,
          intents: business.intents.length,
          ownerId: business.ownerId,
          active: business.active,
        };
      })
      .filter(Boolean);
  }

  /** Solo los negocios de un dueño. */
  listByOwner(ownerId) {
    return this.list().filter((n) => n.ownerId === ownerId);
  }

  /** Los negocios sin dueño: los ejemplos que vienen con PymeBot. */
  listExamples() {
    return this.list().filter((n) => n.ownerId === null);
  }

  /** Devuelve el negocio ya normalizado, o null si no existe o está corrupto. */
  get(slug) {
    const file = this.pathFor(slug);
    if (!file || !fs.existsSync(file)) return null;

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      return null; // un archivo roto no debe tumbar el servidor
    }

    const { ok, business } = validateBusiness(raw);
    return ok ? business : null;
  }

  exists(slug) {
    const file = this.pathFor(slug);
    return Boolean(file) && fs.existsSync(file);
  }

  /**
   * Valida y guarda. Lanza ValidationError si la información no sirve.
   * @returns {{slug: string, business: object, warnings: Array}}
   */
  save(slug, raw) {
    const file = this.pathFor(slug);
    if (!file) throw new ValidationError([{ campo: 'slug', mensaje: `El identificador "${slug}" no es válido.` }]);

    const { ok, errors, warnings, business } = validateBusiness(raw);
    if (!ok) throw new ValidationError(errors, warnings);

    // Escritura atómica: si algo falla a mitad de camino, el archivo anterior queda intacto.
    const temporal = `${file}.tmp`;
    fs.writeFileSync(temporal, `${JSON.stringify(business, null, 2)}\n`, 'utf8');
    fs.renameSync(temporal, file);

    return { slug, business, warnings };
  }

  /** Crea un negocio nuevo derivando el slug del nombre, sin pisar uno existente. */
  create(raw) {
    const { ok, errors, warnings } = validateBusiness(raw);
    if (!ok) throw new ValidationError(errors, warnings);

    const base = slugify(raw.name) || 'negocio';
    let slug = base;
    let n = 2;
    while (this.exists(slug)) {
      slug = `${base}-${n}`.slice(0, 40);
      n += 1;
    }

    return this.save(slug, raw);
  }

  remove(slug) {
    const file = this.pathFor(slug);
    if (!file || !fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }
}

module.exports = { BusinessRepository, ValidationError, DEFAULT_DIR };
