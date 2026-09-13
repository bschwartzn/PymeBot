/* Panel del dueño: acceso, negocios y configuración del bot. Sin frameworks. */

const $ = (id) => document.getElementById(id);

const accesoEl = $('acceso');
const panelEl = $('panel');
const listaEl = $('lista');
const ejemplosEl = $('ejemplos');
const formEl = $('form');
const sinNegociosEl = $('sin-negocios');
const tituloEl = $('titulo');
const estadoEl = $('estado');
const slugEl = $('slug-actual');
const mensajesEl = $('mensajes');
const intentsEl = $('intents');
const plantillaEl = $('plantilla-intent');
const probarEl = $('probar');
const umbralValorEl = $('umbral-valor');

let usuario = null;
let slugActual = null;

/* ------------------------------------------------------------------ red */

async function api(method, ruta, body) {
  const res = await fetch(ruta, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, datos };
}

/* ------------------------------------------------------------- mensajes */

function limpiarMensajes() {
  mensajesEl.innerHTML = '';
}

function mostrarMensaje(tipo, titulo, detalles = []) {
  const caja = document.createElement('div');
  caja.className = `msg ${tipo}`;
  caja.appendChild(document.createTextNode(titulo));

  if (detalles.length > 0) {
    const ul = document.createElement('ul');
    for (const detalle of detalles) {
      const li = document.createElement('li');
      li.textContent = detalle;
      ul.appendChild(li);
    }
    caja.appendChild(ul);
  }

  mensajesEl.appendChild(caja);
  caja.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function mostrarErrorAcceso(cajaId, texto) {
  const caja = $(cajaId);
  caja.textContent = texto;
  caja.hidden = !texto;
}

/* --------------------------------------------------------------- acceso */

function mostrarAcceso() {
  accesoEl.hidden = false;
  panelEl.hidden = true;
}

function mostrarPanel() {
  accesoEl.hidden = true;
  panelEl.hidden = false;
  $('quien').textContent = usuario.name ? `${usuario.name} · ${usuario.email}` : usuario.email;
}

$('tab-entrar').addEventListener('click', () => cambiarTab(true));
$('tab-crear').addEventListener('click', () => cambiarTab(false));

function cambiarTab(entrar) {
  $('tab-entrar').setAttribute('aria-selected', String(entrar));
  $('tab-crear').setAttribute('aria-selected', String(!entrar));
  $('form-entrar').hidden = !entrar;
  $('form-crear').hidden = entrar;
  mostrarErrorAcceso('error-entrar', '');
  mostrarErrorAcceso('error-crear', '');
}

$('form-entrar').addEventListener('submit', async (event) => {
  event.preventDefault();
  mostrarErrorAcceso('error-entrar', '');

  const form = event.target;
  const { ok, datos } = await api('POST', '/api/auth/login', {
    email: form.email.value,
    password: form.password.value,
  });

  if (!ok) {
    mostrarErrorAcceso('error-entrar', datos.error || 'No se pudo entrar.');
    return;
  }
  usuario = datos.user;
  await entrarAlPanel();
});

$('form-crear').addEventListener('submit', async (event) => {
  event.preventDefault();
  mostrarErrorAcceso('error-crear', '');

  const form = event.target;
  const { ok, datos } = await api('POST', '/api/auth/signup', {
    name: form.name.value,
    email: form.email.value,
    password: form.password.value,
    businessName: form.businessName.value,
  });

  if (!ok) {
    mostrarErrorAcceso('error-crear', datos.error || 'No se pudo crear la cuenta.');
    return;
  }
  usuario = datos.user;
  await entrarAlPanel();
});

$('salir').addEventListener('click', async () => {
  await api('POST', '/api/auth/logout');
  usuario = null;
  slugActual = null;
  formEl.hidden = true;
  mostrarAcceso();
});

/* -------------------------------------------------------------- listados */

async function cargarLista() {
  const { datos } = await api('GET', '/api/businesses');
  const negocios = datos.businesses || [];

  listaEl.innerHTML = '';
  for (const negocio of negocios) {
    const li = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.setAttribute('aria-current', String(negocio.slug === slugActual));

    boton.appendChild(document.createTextNode(negocio.name));
    const cuenta = document.createElement('span');
    cuenta.className = 'cuenta';
    cuenta.textContent =
      `${negocio.intents} ${negocio.intents === 1 ? 'pregunta' : 'preguntas'}` +
      (negocio.active ? '' : ' · pausado');
    boton.appendChild(cuenta);

    boton.addEventListener('click', () => abrir(negocio.slug));
    li.appendChild(boton);
    listaEl.appendChild(li);
  }

  sinNegociosEl.hidden = negocios.length > 0;
  if (negocios.length === 0) formEl.hidden = true;

  return negocios;
}

async function cargarEjemplos() {
  const { datos } = await api('GET', '/api/examples');
  ejemplosEl.innerHTML = '';

  for (const ejemplo of datos.examples || []) {
    const li = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = `Copiar “${ejemplo.name}”`;
    boton.addEventListener('click', async () => {
      const { ok, datos: copia } = await api('POST', `/api/examples/${ejemplo.slug}/copy`);
      if (!ok) return;
      await abrir(copia.slug);
      mostrarMensaje('ok', 'Ejemplo copiado a tu cuenta. Edítalo con la información de tu negocio.');
    });
    li.appendChild(boton);
    ejemplosEl.appendChild(li);
  }
}

/* -------------------------------------------------------------- edición */

function agregarIntent(intent = { id: '', keywords: [], answer: '' }) {
  const nodo = plantillaEl.content.cloneNode(true);
  nodo.querySelector('.intent-id').value = intent.id;
  nodo.querySelector('.intent-keywords').value = (intent.keywords || []).join(', ');
  nodo.querySelector('.intent-answer').value = intent.answer;

  const bloque = nodo.querySelector('.intent');
  nodo.querySelector('.btn-icon').addEventListener('click', () => bloque.remove());

  intentsEl.appendChild(nodo);
  return bloque;
}

function pintarEstado(activo) {
  estadoEl.textContent = activo ? 'Activo' : 'Pausado';
  estadoEl.className = `pill ${activo ? 'activo' : 'pausado'}`;
}

function pintarUmbral(valor) {
  const n = Number(valor);
  const etiqueta = n <= 1 ? 'permisivo' : n <= 2 ? 'equilibrado' : 'exigente';
  umbralValorEl.textContent = `${n} · ${etiqueta}`;
}

function pintar(slug, business) {
  slugActual = slug;
  formEl.hidden = false;
  sinNegociosEl.hidden = true;
  limpiarMensajes();

  tituloEl.textContent = business.name;
  slugEl.textContent = `/${slug}`;
  probarEl.href = `/?negocio=${encodeURIComponent(slug)}`;

  formEl.name.value = business.name;
  formEl.tagline.value = business.tagline || '';
  formEl.greeting.value = business.greeting || '';
  formEl.greetingRepeat.value = business.greetingRepeat || '';
  formEl.fallback.value = business.fallback || '';
  formEl.handoff.value = business.handoff || '';
  formEl.pausedMessage.value = business.pausedMessage || '';
  formEl.topics.value = (business.topics || []).join('\n');

  formEl.active.checked = business.active !== false;
  formEl.confidenceThreshold.value = business.confidenceThreshold || 1;

  pintarEstado(formEl.active.checked);
  pintarUmbral(formEl.confidenceThreshold.value);

  intentsEl.innerHTML = '';
  (business.intents || []).forEach((intent) => agregarIntent(intent));
}

function leerFormulario() {
  const intents = [...intentsEl.querySelectorAll('.intent')].map((bloque) => ({
    id: bloque.querySelector('.intent-id').value.trim(),
    keywords: bloque
      .querySelector('.intent-keywords')
      .value.split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    answer: bloque.querySelector('.intent-answer').value.trim(),
  }));

  return {
    name: formEl.name.value.trim(),
    tagline: formEl.tagline.value.trim(),
    greeting: formEl.greeting.value.trim(),
    greetingRepeat: formEl.greetingRepeat.value.trim(),
    fallback: formEl.fallback.value.trim(),
    handoff: formEl.handoff.value.trim(),
    pausedMessage: formEl.pausedMessage.value.trim(),
    active: formEl.active.checked,
    confidenceThreshold: Number(formEl.confidenceThreshold.value),
    topics: formEl.topics.value
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean),
    intents,
  };
}

/* ------------------------------------------------------------ compartir */

/** Copia al portapapeles y confirma en el propio botón. */
async function copiar(texto, boton) {
  const original = boton.textContent;
  try {
    await navigator.clipboard.writeText(texto);
    boton.textContent = '¡Copiado!';
  } catch (err) {
    // Sin permiso de portapapeles (o sin HTTPS): al menos dejamos el texto seleccionado.
    const campo = boton.previousElementSibling;
    if (campo && campo.select) campo.select();
    boton.textContent = 'Copia con Ctrl+C';
  }
  setTimeout(() => {
    boton.textContent = original;
  }, 2000);
}

/** Pinta la dirección, el QR y el resto de las formas de compartir. */
async function pintarCompartir(slug, url, rutaQr) {
  $('url-publica').value = url;
  $('abrir-url').href = url;
  $('descargar-qr').href = rutaQr;
  $('descargar-qr').setAttribute('download', `qr-${slug}.svg`);

  // El QR se pide como texto y se inserta: así se ve en pantalla y se imprime nítido.
  const res = await fetch(rutaQr);
  $('qr').innerHTML = res.ok ? await res.text() : '';
}

async function cargarCompartir(slug) {
  const { ok, datos } = await api('GET', `/api/businesses/${slug}/share`);
  if (!ok) return;

  $('codigo-embed').value = datos.embed;
  $('compartir-whatsapp').href = datos.whatsapp;

  await pintarCompartir(slug, datos.url, datos.qr);

  // Avisar cuando la dirección no sirve para escanear desde un teléfono.
  const aviso = $('aviso-local');
  const boton = $('usar-red');
  aviso.hidden = !datos.soloLocal;

  if (datos.soloLocal) {
    if (datos.urlEnLaRed) {
      $('sugerencia-red').textContent =
        ` Para probar desde tu celular conectado a la misma wifi, usa ${datos.urlEnLaRed}`;
      boton.hidden = false;
      boton.onclick = () => {
        pintarCompartir(slug, datos.urlEnLaRed, datos.qrEnLaRed);
        aviso.hidden = true;
      };
    } else {
      $('sugerencia-red').textContent =
        ' Publica PymeBot en un servidor con dirección propia para que el QR funcione.';
      boton.hidden = true;
    }
  }
}

$('copiar-url').addEventListener('click', (e) => copiar($('url-publica').value, e.target));
$('copiar-embed').addEventListener('click', (e) => copiar($('codigo-embed').value, e.target));

/* -------------------------------------------------------- conversaciones */

function cifra(contenedor, valor, etiqueta, clase = '') {
  const caja = document.createElement('div');
  caja.className = `cifra ${clase}`.trim();

  const b = document.createElement('b');
  b.textContent = valor;
  caja.appendChild(b);

  const span = document.createElement('span');
  span.textContent = etiqueta;
  caja.appendChild(span);

  contenedor.appendChild(caja);
}

/** Minúsculas, sin acentos ni signos: la misma forma que usa el bot para comparar. */
function limpiar(texto) {
  return String(texto)
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, 'ñ')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Un identificador que no choque con los que ya existen. */
function identificadorLibre(texto) {
  const usados = new Set(
    [...intentsEl.querySelectorAll('.intent-id')].map((el) => el.value.trim()).filter(Boolean),
  );

  const base =
    limpiar(texto)
      .split(' ')
      .filter((p) => p.length > 3)
      .slice(0, 2)
      .join('_') || 'pregunta';

  if (!usados.has(base)) return base;

  let n = 2;
  while (usados.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/**
 * Convierte una pregunta sin responder en una pregunta configurada.
 *
 * Es el cierre del círculo: el bot falla, tú lo ves aquí, y lo arreglas sin salir de la
 * pantalla. Se rellenan el identificador y las palabras clave para que solo haya que
 * escribir la respuesta.
 */
function convertirEnPregunta(texto) {
  document.querySelector('.seccion-tab[data-seccion="preguntas"]').click();

  const bloque = agregarIntent({
    // Sin signos: "cigarros?" como palabra clave se ve mal y confunde a quien lo edita.
    id: identificadorLibre(texto),
    keywords: limpiar(texto)
      .split(' ')
      .filter((p) => p.length > 3)
      .slice(0, 6),
    answer: '',
  });

  bloque.scrollIntoView({ block: 'center', behavior: 'smooth' });
  bloque.querySelector('.intent-answer').focus();

  mostrarMensaje('ok', `Revisa las palabras clave y escribe la respuesta para «${texto}». Después, Guardar.`);
}

async function cargarConversaciones(slug) {
  const { ok, datos } = await api('GET', `/api/businesses/${slug}/metrics`);
  if (!ok) return;

  const cifrasEl = $('cifras');
  cifrasEl.innerHTML = '';
  cifra(cifrasEl, datos.conversaciones, 'conversaciones');
  cifra(cifrasEl, datos.mensajes, 'preguntas recibidas');
  cifra(
    cifrasEl,
    datos.tasaDeAcierto === null ? '—' : `${datos.tasaDeAcierto}%`,
    'supo responder',
    datos.tasaDeAcierto === null ? '' : datos.tasaDeAcierto >= 80 ? 'buena' : 'floja',
  );
  cifra(cifrasEl, datos.sinRespuesta, 'no supo responder');

  // Preguntas sin respuesta: lo más accionable de toda la pantalla.
  const pendientesEl = $('sin-respuesta');
  pendientesEl.innerHTML = '';

  if (datos.preguntasSinRespuesta.length === 0) {
    const p = document.createElement('p');
    p.className = 'vacio-seccion';
    p.textContent =
      datos.mensajes === 0
        ? 'Todavía no hay conversaciones. Comparte tu link y vuelve a mirar.'
        : 'Tu bot respondió todo lo que le preguntaron. 🎉';
    pendientesEl.appendChild(p);
  }

  for (const pregunta of datos.preguntasSinRespuesta) {
    const fila = document.createElement('div');
    fila.className = 'pendiente';

    const texto = document.createElement('span');
    texto.className = 'texto';
    texto.textContent = pregunta.ejemplo;
    fila.appendChild(texto);

    if (pregunta.veces > 1) {
      const veces = document.createElement('span');
      veces.className = 'veces';
      veces.textContent = `${pregunta.veces} veces`;
      fila.appendChild(veces);
    }

    const boton = document.createElement('button');
    boton.className = 'btn-ghost';
    boton.type = 'button';
    boton.textContent = 'Responder esto';
    boton.addEventListener('click', () => convertirEnPregunta(pregunta.ejemplo));
    fila.appendChild(boton);

    pendientesEl.appendChild(fila);
  }

  // Temas más preguntados.
  const temasEl = $('mas-preguntados');
  temasEl.innerHTML = '';
  const tope = Math.max(1, ...datos.temasMasPreguntados.map((t) => t.veces));

  if (datos.temasMasPreguntados.length === 0) {
    const p = document.createElement('p');
    p.className = 'vacio-seccion';
    p.textContent = 'Aún no hay preguntas respondidas que mostrar.';
    temasEl.appendChild(p);
  }

  for (const tema of datos.temasMasPreguntados) {
    const fila = document.createElement('div');
    fila.className = 'barra';

    const nombre = document.createElement('span');
    nombre.className = 'nombre';
    nombre.textContent = tema.clave;
    fila.appendChild(nombre);

    const pista = document.createElement('span');
    pista.className = 'pista';
    const relleno = document.createElement('span');
    relleno.className = 'relleno';
    relleno.style.width = `${Math.round((tema.veces / tope) * 100)}%`;
    pista.appendChild(relleno);
    fila.appendChild(pista);

    const valor = document.createElement('span');
    valor.className = 'valor';
    valor.textContent = tema.veces;
    fila.appendChild(valor);

    temasEl.appendChild(fila);
  }
}

async function abrir(slug) {
  const { ok, datos } = await api('GET', `/api/businesses/${slug}`);
  if (!ok) {
    mostrarMensaje('error', 'No se pudo abrir ese negocio.');
    return;
  }
  pintar(slug, datos.business);
  await Promise.all([cargarLista(), cargarCompartir(slug), cargarConversaciones(slug)]);
}

/* -------------------------------------------------------------- guardar */

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  limpiarMensajes();

  const boton = formEl.querySelector('.btn');
  boton.disabled = true;

  try {
    const { ok, status, datos } = await api('PUT', `/api/businesses/${slugActual}`, leerFormulario());

    if (status === 401) {
      usuario = null;
      mostrarAcceso();
      return;
    }
    if (!ok) {
      mostrarMensaje(
        'error',
        'No se pudo guardar. Corrige esto:',
        (datos.errors || [{ mensaje: datos.error }]).map((e) => e.mensaje),
      );
      return;
    }

    mostrarMensaje(
      'ok',
      datos.business.active
        ? 'Guardado. El bot ya responde con esta información.'
        : 'Guardado. Ojo: el bot está pausado, así que no responde preguntas.',
    );
    if (datos.warnings && datos.warnings.length > 0) {
      mostrarMensaje(
        'warn',
        'Se guardó, pero revisa esto porque puede hacer que el bot responda mal:',
        datos.warnings.map((w) => w.mensaje),
      );
    }

    tituloEl.textContent = datos.business.name;
    pintarEstado(datos.business.active);
    await cargarLista();
  } catch (err) {
    mostrarMensaje('error', 'No se pudo conectar con el servidor.');
  } finally {
    boton.disabled = false;
  }
});

/* ------------------------------------------------------ crear y eliminar */

$('agregar-intent').addEventListener('click', () => {
  const bloque = agregarIntent();
  bloque.querySelector('.intent-id').focus();
});

$('nuevo').addEventListener('click', async () => {
  const nombre = prompt('¿Cómo se llama el negocio?');
  if (!nombre || !nombre.trim()) return;

  const { ok, datos } = await api('POST', '/api/businesses', { name: nombre.trim() });
  if (!ok) {
    mostrarMensaje('error', 'No se pudo crear.', (datos.errors || []).map((e) => e.mensaje));
    return;
  }

  await abrir(datos.slug);
  mostrarMensaje('ok', 'Negocio creado. Edita las preguntas de ejemplo y agrega las tuyas.');
});

$('eliminar').addEventListener('click', async () => {
  if (!slugActual) return;
  if (!confirm(`¿Eliminar "${tituloEl.textContent}"? No se puede deshacer.`)) return;

  await api('DELETE', `/api/businesses/${slugActual}`);

  slugActual = null;
  formEl.hidden = true;
  limpiarMensajes();
  const negocios = await cargarLista();
  if (negocios.length > 0) abrir(negocios[0].slug);
});

/* ------------------------------------------------------------ secciones */

for (const tab of document.querySelectorAll('.seccion-tab')) {
  tab.addEventListener('click', () => {
    for (const otro of document.querySelectorAll('.seccion-tab')) otro.classList.remove('activo');
    tab.classList.add('activo');

    for (const bloque of formEl.querySelectorAll('.bloque')) {
      bloque.hidden = bloque.dataset.seccion !== tab.dataset.seccion;
    }
  });
}

formEl.active.addEventListener('change', () => pintarEstado(formEl.active.checked));
formEl.confidenceThreshold.addEventListener('input', () => pintarUmbral(formEl.confidenceThreshold.value));

/* --------------------------------------------------------------- inicio */

async function entrarAlPanel() {
  mostrarPanel();
  await cargarEjemplos();
  const negocios = await cargarLista();
  if (negocios.length > 0) await abrir(negocios[0].slug);
}

(async () => {
  const { datos } = await api('GET', '/api/auth/me');
  if (datos.user) {
    usuario = datos.user;
    await entrarAlPanel();
  } else {
    mostrarAcceso();
  }
})();
