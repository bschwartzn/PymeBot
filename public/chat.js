/*
 * Chat del cliente final.
 *
 * El negocio se deduce de la URL (/c/<slug>), así que el mismo archivo sirve para todos
 * sin generar una página por negocio.
 */

const hiloEl = document.getElementById('hilo');
const atajosEl = document.getElementById('atajos');
const formEl = document.getElementById('escribir');
const campoEl = document.getElementById('campo');
const enviarEl = document.getElementById('enviar');

/** /c/mi-negocio → "mi-negocio" */
const NEGOCIO = decodeURIComponent((location.pathname.split('/')[2] || '').trim());

/** La conversación se recuerda dentro de la pestaña: recargar no debería borrarla. */
const CLAVE_SESION = `pymebot:${NEGOCIO}`;

function leerSesion() {
  try {
    return sessionStorage.getItem(CLAVE_SESION);
  } catch (err) {
    return null; // navegación privada, almacenamiento bloqueado
  }
}

function guardarSesion(id) {
  try {
    sessionStorage.setItem(CLAVE_SESION, id);
  } catch (err) {
    /* si no se puede guardar, la conversación simplemente empieza de nuevo */
  }
}

let sessionId = leerSesion();

function burbuja(texto, quien) {
  const el = document.createElement('div');
  el.className = `burbuja ${quien}`;
  el.textContent = texto;
  hiloEl.appendChild(el);
  hiloEl.scrollTop = hiloEl.scrollHeight;
  return el;
}

function escribiendo() {
  const el = document.createElement('div');
  el.className = 'burbuja bot escribiendo';
  el.innerHTML = '<i></i><i></i><i></i>';
  hiloEl.appendChild(el);
  hiloEl.scrollTop = hiloEl.scrollHeight;
  return el;
}

async function cargarNegocio() {
  try {
    const res = await fetch(`/api/business?slug=${encodeURIComponent(NEGOCIO)}`);
    const datos = await res.json();

    if (!res.ok) {
      burbuja(datos.error || 'Este chat no está disponible en este momento.', 'aviso');
      campoEl.disabled = true;
      enviarEl.disabled = true;
      return;
    }

    document.getElementById('negocio').textContent = datos.name;
    document.getElementById('rubro').textContent = datos.tagline || '';
    document.title = datos.name;

    burbuja(datos.greeting, 'bot');

    // Con el bot pausado no se ofrecen atajos: no va a responder ninguno.
    atajosEl.innerHTML = '';
    for (const tema of datos.topics || []) {
      const boton = document.createElement('button');
      boton.className = 'atajo';
      boton.type = 'button';
      boton.textContent = tema;
      boton.addEventListener('click', () => enviar(tema));
      atajosEl.appendChild(boton);
    }
  } catch (err) {
    burbuja('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.', 'aviso');
  }
}

async function enviar(texto) {
  const mensaje = String(texto || '').trim();
  if (!mensaje) return;

  burbuja(mensaje, 'cliente');
  campoEl.value = '';
  enviarEl.disabled = true;

  const pensando = escribiendo();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: mensaje, business: NEGOCIO }),
    });
    const datos = await res.json();
    pensando.remove();

    if (!res.ok) {
      burbuja(datos.error || 'No pudimos responder en este momento.', 'aviso');
      return;
    }

    sessionId = datos.sessionId;
    guardarSesion(sessionId);
    burbuja(datos.reply, 'bot');
  } catch (err) {
    pensando.remove();
    burbuja('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.', 'aviso');
  } finally {
    enviarEl.disabled = false;
    campoEl.focus();
  }
}

formEl.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(campoEl.value);
});

cargarNegocio();
