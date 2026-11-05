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

/**
 * Pone el texto con los links tocables: en el teléfono, "agenda en https://..." tiene que
 * abrir la agenda. Se arma con nodos de texto y <a>, nunca con innerHTML, así que lo que
 * escriba un cliente no puede inyectar nada.
 */
function textoConEnlaces(el, texto) {
  String(texto).split(/(https?:\/\/[^\s]+)/).forEach((parte, i) => {
    if (i % 2 === 0) {
      if (parte) el.appendChild(document.createTextNode(parte));
      return;
    }
    // El punto o la coma que cierran la frase no son parte del link.
    const url = parte.replace(/[.,;:!?)]+$/, '');
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.textContent = url.replace(/^https?:\/\//, '');
    el.appendChild(enlace);
    if (url !== parte) el.appendChild(document.createTextNode(parte.slice(url.length)));
  });
}

function burbuja(texto, quien) {
  const el = document.createElement('div');
  el.className = `burbuja ${quien}`;
  textoConEnlaces(el, texto);
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
    document.getElementById('prueba').hidden = !datos.esDueno;

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
    // Mientras atiende una persona, el bot no responde: la respuesta llega por novedades.
    if (datos.reply) burbuja(datos.reply, 'bot');
    if (desde === null) revisarNovedades();
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

/* --------------------------------------------------------- atención en vivo */

/*
 * La dueña puede entrar a la conversación desde su panel. Lo que ella escribe llega por
 * aquí: el chat pregunta cada pocos segundos si hay algo nuevo desde el último mensaje que
 * vio. Se cuenta por número de mensaje y no por hora, porque el reloj del teléfono puede
 * estar mal.
 */
const NOVEDADES_MS = 3000;
let desde = null;
let revisando = false;

function burbujaDelEquipo(texto) {
  const el = burbuja(texto, 'equipo');
  const quien = document.createElement('span');
  quien.className = 'quien';
  quien.textContent = 'Equipo';
  el.prepend(quien);
}

async function revisarNovedades() {
  if (!sessionId || revisando || document.hidden) return;
  revisando = true;
  try {
    const parametros = new URLSearchParams({ sessionId });
    if (desde !== null) parametros.set('desde', String(desde));
    const res = await fetch(`/api/chat/novedades?${parametros}`);
    if (!res.ok) return;
    const datos = await res.json();
    for (const mensaje of datos.mensajes || []) {
      if (mensaje.quien === 'dueno') burbujaDelEquipo(mensaje.texto);
      else burbuja(mensaje.texto, 'sistema');
    }
    if (typeof datos.desde === 'number') desde = datos.desde;
  } catch (err) {
    /* sin conexión: se vuelve a intentar en el próximo turno */
  } finally {
    revisando = false;
  }
}

setInterval(revisarNovedades, NOVEDADES_MS);
document.addEventListener('visibilitychange', revisarNovedades);

cargarNegocio();
revisarNovedades();
