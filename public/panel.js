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

async function cargarCompartir(slug) {
  const { ok, datos } = await api('GET', `/api/businesses/${slug}/share`);
  if (!ok) return;

  $('url-publica').value = datos.url;
  $('abrir-url').href = datos.url;
  $('codigo-embed').value = datos.embed;
  $('compartir-whatsapp').href = datos.whatsapp;
  $('descargar-qr').href = datos.qr;
  $('descargar-qr').setAttribute('download', `qr-${slug}.svg`);

  // El QR se pide como texto y se inserta: así se ve en pantalla y se imprime nítido.
  const res = await fetch(datos.qr);
  $('qr').innerHTML = res.ok ? await res.text() : '';
}

$('copiar-url').addEventListener('click', (e) => copiar($('url-publica').value, e.target));
$('copiar-embed').addEventListener('click', (e) => copiar($('codigo-embed').value, e.target));

async function abrir(slug) {
  const { ok, datos } = await api('GET', `/api/businesses/${slug}`);
  if (!ok) {
    mostrarMensaje('error', 'No se pudo abrir ese negocio.');
    return;
  }
  pintar(slug, datos.business);
  await Promise.all([cargarLista(), cargarCompartir(slug)]);
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
