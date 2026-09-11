/**
 * Validación de la información de un negocio.
 *
 * Quien edita esto no es un programador, así que:
 *   - los ERRORES impiden guardar y explican en castellano qué falta,
 *   - las ADVERTENCIAS sí dejan guardar, pero avisan de lo que suele hacer que el bot
 *     responda mal (por ejemplo, dos intenciones que compiten por la misma palabra).
 */

const { normalize } = require('../bot/text');

/** Textos que el negocio puede omitir; se rellenan con algo razonable. */
const DEFAULTS = {
  tagline: '',
  greeting: '¡Hola! 👋 ¿En qué te puedo ayudar?',
  greetingRepeat: '¡Aquí sigo! ¿En qué más te ayudo?',
  fallback: 'Perdona, no estoy seguro de haber entendido eso. Puedo ayudarte con estos temas:',
  handoff: '',
  topics: [],
  /** Con el bot pausado, el chat responde el mensaje de pausa en vez de intentar entender. */
  active: true,
  /**
   * Qué tan seguro tiene que estar el motor para responder, en vez de caer en el respaldo.
   * Más alto = responde menos, pero se equivoca menos. Más bajo = responde más, arriesgando
   * contestar un tema por otro.
   */
  confidenceThreshold: 1,
  pausedMessage: 'En este momento no estamos atendiendo por aquí. Escríbenos directamente y te respondemos a la brevedad.',
};

/** Rango aceptado para el umbral de confianza. Fuera de esto el bot se vuelve inútil. */
const THRESHOLD = { min: 0.5, max: 6 };

const MAX = { name: 80, tagline: 140, texto: 1000, keyword: 60, intents: 100, keywords: 40 };

/**
 * Artículos, preposiciones y conjunciones. Como palabra clave no distinguen nada: harían
 * que la intención compita en casi cualquier frase. Deliberadamente NO incluye palabras
 * como "no" u "ok", que sí son señales útiles para cerrar una conversación.
 */
const PALABRAS_VACIAS = new Set(
  ('el la los las un una unos unas de del al y o u en con por para que se lo su sus mi mis tu tus ' +
    'este esta esto ese esa eso es son era ser hay muy mas mas tambien pero como cuando donde')
    .split(' '),
);

const esTexto = (v) => typeof v === 'string' && v.trim() !== '';

/** Convierte un nombre en un identificador usable como nombre de archivo y en la URL. */
function slugify(text) {
  const base = normalize(text).replace(/ñ/g, 'n').replace(/\s+/g, '-').replace(/-+/g, '-');
  return base.slice(0, 40).replace(/^-|-$/g, '');
}

/** Solo aceptamos slugs así: evita que una ruta se escape del directorio de datos. */
function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(slug);
}

function validarIntenciones(intents, errors, warnings) {
  if (!Array.isArray(intents) || intents.length === 0) {
    errors.push({ campo: 'intents', mensaje: 'El negocio necesita al menos una pregunta configurada.' });
    return;
  }
  if (intents.length > MAX.intents) {
    errors.push({ campo: 'intents', mensaje: `No se pueden configurar más de ${MAX.intents} preguntas.` });
    return;
  }

  const idsVistos = new Set();
  /** palabra clave normalizada → ids de intención que la usan */
  const duenoDeClave = new Map();

  intents.forEach((intent, i) => {
    const donde = `intents[${i}]`;
    const etiqueta = esTexto(intent && intent.id) ? `"${intent.id}"` : `número ${i + 1}`;

    if (!intent || typeof intent !== 'object') {
      errors.push({ campo: donde, mensaje: `La pregunta ${etiqueta} no tiene el formato correcto.` });
      return;
    }

    if (!esTexto(intent.id)) {
      errors.push({ campo: `${donde}.id`, mensaje: `La pregunta ${etiqueta} necesita un identificador.` });
    } else if (idsVistos.has(intent.id)) {
      errors.push({ campo: `${donde}.id`, mensaje: `El identificador "${intent.id}" está repetido.` });
    } else {
      idsVistos.add(intent.id);
    }

    if (!esTexto(intent.answer)) {
      errors.push({ campo: `${donde}.answer`, mensaje: `La pregunta ${etiqueta} no tiene respuesta.` });
    } else if (intent.answer.length > MAX.texto) {
      errors.push({
        campo: `${donde}.answer`,
        mensaje: `La respuesta de ${etiqueta} supera los ${MAX.texto} caracteres.`,
      });
    }

    if (!Array.isArray(intent.keywords) || intent.keywords.filter(esTexto).length === 0) {
      errors.push({
        campo: `${donde}.keywords`,
        mensaje: `La pregunta ${etiqueta} necesita al menos una palabra clave.`,
      });
      return;
    }
    if (intent.keywords.length > MAX.keywords) {
      errors.push({
        campo: `${donde}.keywords`,
        mensaje: `La pregunta ${etiqueta} tiene demasiadas palabras clave (máximo ${MAX.keywords}).`,
      });
      return;
    }

    const clavesDeEsta = new Set();
    for (const keyword of intent.keywords) {
      if (!esTexto(keyword)) continue;
      if (keyword.length > MAX.keyword) {
        errors.push({
          campo: `${donde}.keywords`,
          mensaje: `La palabra clave "${keyword.slice(0, 30)}…" de ${etiqueta} es demasiado larga.`,
        });
        continue;
      }

      const clave = normalize(keyword);
      if (!clave) {
        warnings.push({
          campo: `${donde}.keywords`,
          mensaje: `La palabra clave "${keyword}" de ${etiqueta} no tiene letras ni números, así que nunca va a coincidir.`,
        });
        continue;
      }

      if (clavesDeEsta.has(clave)) {
        warnings.push({
          campo: `${donde}.keywords`,
          mensaje: `${etiqueta} repite la palabra clave "${keyword}".`,
        });
        continue; // ya avisamos por esta palabra en su primera aparición
      }
      clavesDeEsta.add(clave);

      // Una palabra vacía como clave hace que la intención coincida con casi cualquier frase.
      if (PALABRAS_VACIAS.has(clave)) {
        warnings.push({
          campo: `${donde}.keywords`,
          mensaje: `"${keyword}" aparece en casi cualquier frase, así que ${etiqueta} va a responder cuando no corresponde. Usa una palabra propia del tema.`,
        });
      }

      if (!duenoDeClave.has(clave)) duenoDeClave.set(clave, []);
      const duenos = duenoDeClave.get(clave);
      if (!duenos.includes(intent.id)) duenos.push(intent.id);
    }
  });

  // El motivo más común de que el bot responda otra cosa: dos preguntas compiten por la misma palabra.
  for (const [clave, duenos] of duenoDeClave) {
    if (duenos.length > 1) {
      warnings.push({
        campo: 'intents',
        mensaje: `La palabra "${clave}" está en varias preguntas (${duenos.join(', ')}). El bot tendrá que adivinar cuál responder.`,
      });
    }
  }
}

/**
 * Valida y normaliza un negocio.
 * @returns {{ok: boolean, errors: Array, warnings: Array, business: object|null}}
 */
function validateBusiness(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      errors: [{ campo: '', mensaje: 'La información del negocio no tiene el formato correcto.' }],
      warnings,
      business: null,
    };
  }

  if (!esTexto(raw.name)) {
    errors.push({ campo: 'name', mensaje: 'El negocio necesita un nombre.' });
  } else if (raw.name.length > MAX.name) {
    errors.push({ campo: 'name', mensaje: `El nombre supera los ${MAX.name} caracteres.` });
  }

  for (const campo of ['tagline', 'greeting', 'greetingRepeat', 'fallback', 'handoff']) {
    const valor = raw[campo];
    if (valor === undefined || valor === null || valor === '') continue;
    if (typeof valor !== 'string') {
      errors.push({ campo, mensaje: `El campo "${campo}" debe ser texto.` });
    } else if (valor.length > (campo === 'tagline' ? MAX.tagline : MAX.texto)) {
      errors.push({ campo, mensaje: `El campo "${campo}" es demasiado largo.` });
    }
  }

  if (raw.active !== undefined && typeof raw.active !== 'boolean') {
    errors.push({ campo: 'active', mensaje: 'El estado del bot debe ser activo o pausado.' });
  }

  if (raw.confidenceThreshold !== undefined) {
    const valor = Number(raw.confidenceThreshold);
    if (!Number.isFinite(valor) || valor < THRESHOLD.min || valor > THRESHOLD.max) {
      errors.push({
        campo: 'confidenceThreshold',
        mensaje: `El nivel de exigencia debe estar entre ${THRESHOLD.min} y ${THRESHOLD.max}.`,
      });
    }
  }

  if (raw.pausedMessage !== undefined && raw.pausedMessage !== null && raw.pausedMessage !== '') {
    if (typeof raw.pausedMessage !== 'string' || raw.pausedMessage.length > MAX.texto) {
      errors.push({ campo: 'pausedMessage', mensaje: 'El mensaje de pausa no es válido.' });
    }
  }

  if (raw.ownerId !== undefined && raw.ownerId !== null && typeof raw.ownerId !== 'string') {
    errors.push({ campo: 'ownerId', mensaje: 'El dueño del negocio no es válido.' });
  }

  if (raw.topics !== undefined) {
    if (!Array.isArray(raw.topics)) {
      errors.push({ campo: 'topics', mensaje: 'Los temas sugeridos deben ser una lista.' });
    } else if (raw.topics.some((t) => !esTexto(t))) {
      errors.push({ campo: 'topics', mensaje: 'Hay un tema sugerido vacío.' });
    }
  }

  validarIntenciones(raw.intents, errors, warnings);

  if (errors.length === 0 && (!Array.isArray(raw.topics) || raw.topics.length === 0)) {
    warnings.push({
      campo: 'topics',
      mensaje: 'Sin temas sugeridos, cuando el bot no entienda no podrá ofrecer alternativas.',
    });
  }

  if (errors.length > 0) return { ok: false, errors, warnings, business: null };

  const business = {
    name: raw.name.trim(),
    ...DEFAULTS,
    ...Object.fromEntries(
      ['tagline', 'greeting', 'greetingRepeat', 'fallback', 'handoff', 'pausedMessage']
        .filter((c) => esTexto(raw[c]))
        .map((c) => [c, raw[c].trim()]),
    ),
    // Un negocio sin dueño es una demo: se puede leer, no editar.
    ownerId: typeof raw.ownerId === 'string' && raw.ownerId ? raw.ownerId : null,
    active: raw.active === undefined ? DEFAULTS.active : Boolean(raw.active),
    confidenceThreshold:
      raw.confidenceThreshold === undefined ? DEFAULTS.confidenceThreshold : Number(raw.confidenceThreshold),
    topics: Array.isArray(raw.topics) ? raw.topics.map((t) => t.trim()) : [],
    intents: raw.intents.map((intent) => ({
      id: intent.id.trim(),
      keywords: intent.keywords.filter(esTexto).map((k) => k.trim()),
      answer: intent.answer.trim(),
    })),
  };

  return { ok: true, errors, warnings, business };
}

module.exports = { validateBusiness, slugify, isValidSlug, DEFAULTS, MAX, THRESHOLD };
