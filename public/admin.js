/* Editor de negocios. Sin frameworks: fetch + DOM. */

const listaEl = document.getElementById('lista');
const formEl = document.getElementById('form');
const vacioEl = document.getElementById('vacio');
const tituloEl = document.getElementById('titulo');
const slugEl = document.getElementById('slug-actual');
const mensajesEl = document.getElementById('mensajes');
const intentsEl = document.getElementById('intents');
const plantillaEl = document.getElementById('plantilla-intent');
const probarEl = document.getElementById('probar');

let slugActual = null;

/* ------------------------------------------------------------------ mensajes */

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

/* ------------------------------------------------------------------- listado */

async function cargarLista() {
  const { businesses } = await (await fetch('/api/businesses')).json();

  listaEl.innerHTML = '';
  for (const negocio of businesses) {
    const li = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.setAttribute('aria-current', String(negocio.slug === slugActual));

    boton.appendChild(document.createTextNode(negocio.name));
    const cuenta = document.createElement('span');
    cuenta.className = 'cuenta';
    cuenta.textContent = `${negocio.intents} ${negocio.intents === 1 ? 'pregunta' : 'preguntas'}`;
    boton.appendChild(cuenta);

    boton.addEventListener('click', () => abrir(negocio.slug));
    li.appendChild(boton);
    listaEl.appendChild(li);
  }

  return businesses;
}

/* -------------------------------------------------------------------- edición */

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

function pintar(slug, business) {
  slugActual = slug;
  formEl.hidden = false;
  vacioEl.hidden = true;
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
  formEl.topics.value = (business.topics || []).join('\n');

  intentsEl.innerHTML = '';
  (business.intents || []).forEach((intent) => agregarIntent(intent));
}

/** Arma el objeto que espera la API a partir de lo que hay en el formulario. */
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
    topics: formEl.topics.value
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean),
    intents,
  };
}

async function abrir(slug) {
  const res = await fetch(`/api/businesses/${slug}`);
  if (!res.ok) {
    mostrarMensaje('error', 'No se pudo abrir ese negocio.');
    return;
  }
  const { business } = await res.json();
  pintar(slug, business);
  await cargarLista();
}

/* -------------------------------------------------------------------- guardar */

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  limpiarMensajes();

  const boton = formEl.querySelector('.btn');
  boton.disabled = true;

  try {
    const res = await fetch(`/api/businesses/${slugActual}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leerFormulario()),
    });
    const data = await res.json();

    if (!res.ok) {
      mostrarMensaje(
        'error',
        'No se pudo guardar. Corrige esto:',
        (data.errors || [{ mensaje: data.error }]).map((e) => e.mensaje),
      );
      return;
    }

    mostrarMensaje('ok', 'Guardado. El chat ya responde con esta información.');
    if (data.warnings && data.warnings.length > 0) {
      mostrarMensaje(
        'warn',
        'Se guardó, pero revisa esto porque puede hacer que el bot responda mal:',
        data.warnings.map((w) => w.mensaje),
      );
    }

    tituloEl.textContent = data.business.name;
    await cargarLista();
  } catch (err) {
    mostrarMensaje('error', 'No se pudo conectar con el servidor.');
  } finally {
    boton.disabled = false;
  }
});

/* ---------------------------------------------------------- crear y eliminar */

document.getElementById('agregar-intent').addEventListener('click', () => {
  const bloque = agregarIntent();
  bloque.querySelector('.intent-id').focus();
});

document.getElementById('nuevo').addEventListener('click', async () => {
  const nombre = prompt('¿Cómo se llama el negocio?');
  if (!nombre || !nombre.trim()) return;

  // Un negocio nuevo arranca con una pregunta de ejemplo, para que se entienda la idea.
  const res = await fetch('/api/businesses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nombre.trim(),
      topics: ['Horarios'],
      intents: [
        {
          id: 'horarios',
          keywords: ['horario', 'abren', 'cierran', 'a que hora'],
          answer: 'Atendemos de lunes a viernes de 9:00 a 18:00.',
        },
      ],
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    mostrarMensaje('error', 'No se pudo crear.', (data.errors || []).map((e) => e.mensaje));
    return;
  }

  await abrir(data.slug);
  mostrarMensaje('ok', 'Negocio creado. Edita la pregunta de ejemplo y agrega las tuyas.');
});

document.getElementById('eliminar').addEventListener('click', async () => {
  if (!slugActual) return;
  if (!confirm(`¿Eliminar "${tituloEl.textContent}"? No se puede deshacer.`)) return;

  await fetch(`/api/businesses/${slugActual}`, { method: 'DELETE' });

  slugActual = null;
  formEl.hidden = true;
  vacioEl.hidden = false;
  limpiarMensajes();
  await cargarLista();
});

/* --------------------------------------------------------------------- inicio */

(async () => {
  const negocios = await cargarLista();
  if (negocios.length > 0) abrir(negocios[0].slug);
})();
