/*
 * La conversación que ve el cliente final.
 *
 * Compartido por todos los chats (los de ejemplo, el del enlace compartido y la vista
 * previa del panel). El motor de respuestas sigue en cada página (`respond`); aquí está
 * lo que la rodea: el historial, que sobrevive a recargar la página, y el traspaso a una
 * persona del equipo, durante el cual el bot no responde.
 *
 * Necesita ../conversaciones.js cargado antes.
 */
(function () {
  'use strict';

  var C = window.PymeConversaciones;

  // Estilos de lo nuevo, con las variables de color de cada página: así se ve igual en
  // claro y en oscuro sin tocar el CSS de las cinco copias del chat.
  var ESTILOS =
    '.burbuja.agente{align-self:flex-start;background:var(--panel);border:1.5px solid var(--marca);border-bottom-left-radius:5px}' +
    '.burbuja.agente .quien{display:block;font-size:12px;font-weight:600;color:var(--marca);margin-bottom:2px}' +
    '.burbuja.sistema{align-self:center;background:transparent;color:var(--suave);font-size:13px;text-align:center;padding:2px 10px;max-width:100%}' +
    '.modo{display:inline-block;margin-top:3px;font-size:12px;font-weight:600;border-radius:999px;padding:1px 9px;background:var(--burbuja);color:var(--suave)}' +
    '.modo.humano{background:var(--marca);color:var(--marca-texto)}' +
    '.burbuja a{color:inherit;text-decoration:underline;overflow-wrap:anywhere}';

  /** Clave con la que este navegador recuerda su conversación con cada negocio. */
  function llaveDeSesion(negocioId) {
    return 'pymebot-chat:' + negocioId;
  }

  // Sin almacenamiento, cada recarga es una conversación nueva: el chat funciona igual.
  function recordada(llave) {
    try {
      return localStorage.getItem(llave);
    } catch (err) {
      return null;
    }
  }

  function recordar(llave, valor) {
    try {
      localStorage.setItem(llave, valor);
    } catch (err) {
      /* sin guardar */
    }
  }

  /**
   * Arranca el chat de un negocio.
   * @param {object} negocio  el negocio tal como lo usa `respond`
   * @param {object} [opciones]
   * @param {boolean} [opciones.prueba]  vista previa del panel: cada apertura es una
   *   conversación nueva en vez de retomar la anterior.
   */
  function iniciar(negocio, opciones) {
    opciones = opciones || {};

    var hiloEl = document.getElementById('hilo');
    var atajosEl = document.getElementById('atajos');
    var formEl = document.getElementById('escribir');
    var campoEl = document.getElementById('campo');
    var enviarEl = document.getElementById('enviar');
    var rubroEl = document.getElementById('rubro');

    var estilo = document.createElement('style');
    estilo.textContent = ESTILOS;
    document.head.appendChild(estilo);

    var modoEl = document.createElement('span');
    modoEl.className = 'modo';
    rubroEl.after(modoEl);

    var negocioId = C.idDeNegocio(negocio.name);
    var canal = opciones.prueba ? 'prueba' : 'web';
    var placeholderOriginal = campoEl.placeholder;

    /* ---------------------------------------------- la conversación de esta visita */

    var llave = llaveDeSesion(negocioId);
    var guardada = opciones.prueba ? null : recordada(llave);
    var conversacion = guardada ? C.obtener(guardada) : null;

    if (!conversacion) {
      conversacion = C.crear({ negocioId: negocioId, negocioNombre: negocio.name, canal: canal });
      C.agregar(conversacion.id, {
        de: 'bot',
        texto: negocio.active === false ? negocio.pausedMessage : negocio.greeting,
        intent: 'bienvenida',
      });
      if (!opciones.prueba) recordar(llave, conversacion.id);
    }
    var id = conversacion.id;

    // El motor solo recuerda si ya saludó; se deduce del historial para que recargar la
    // página no vuelva a soltar el saludo largo.
    var sesion = {
      greeted: (C.obtener(id).mensajes || []).some(function (m) {
        return m.de === 'bot' && m.intent === 'saludo';
      }),
    };

    /* ----------------------------------------------------------------- pintar */

    var pintados = {};
    var escribiendoEl = null;

    /**
     * Agrega el texto con sus links clicables: en el teléfono, "agenda en https://…" tiene
     * que poder tocarse. Se arma con nodos de texto y <a>, nunca con innerHTML, así que lo
     * que escriba un cliente no puede inyectar nada.
     */
    function textoConEnlaces(el, texto) {
      texto.split(/(https?:\/\/[^\s]+)/).forEach(function (parte, i) {
        if (i % 2 === 0) {
          if (parte) el.appendChild(document.createTextNode(parte));
          return;
        }
        // El punto o la coma que cierran la frase no son parte del link.
        var url = parte.replace(/[.,;:!?)]+$/, '');
        var enlace = document.createElement('a');
        enlace.href = url;
        enlace.target = '_blank';
        enlace.rel = 'noopener';
        enlace.textContent = url.replace(/^https?:\/\//, '');
        el.appendChild(enlace);
        if (url !== parte) el.appendChild(document.createTextNode(parte.slice(url.length)));
      });
    }

    function burbuja(mensaje) {
      var el = document.createElement('div');
      el.className = 'burbuja ' + mensaje.de;
      if (mensaje.de === 'agente') {
        var quien = document.createElement('span');
        quien.className = 'quien';
        quien.textContent = 'Persona del equipo';
        el.appendChild(quien);
      }
      textoConEnlaces(el, mensaje.texto);
      // Si el bot está "escribiendo", lo nuevo va antes del indicador.
      hiloEl.insertBefore(el, escribiendoEl);
    }

    /**
     * Pinta lo que falte del historial. Es el ÚNICO camino por el que algo aparece en
     * pantalla, lo escriba quien lo escriba y desde la pestaña que sea; como cada mensaje
     * tiene id, llamarlo de más nunca duplica nada.
     */
    function pintar() {
      var actual = C.obtener(id);
      if (!actual) return;

      actual.mensajes.forEach(function (mensaje) {
        if (pintados[mensaje.id]) return;
        pintados[mensaje.id] = true;
        burbuja(mensaje);
      });

      var humano = actual.modo === C.HUMANO;
      modoEl.className = 'modo' + (humano ? ' humano' : '');
      modoEl.textContent = humano ? 'Te atiende una persona del equipo' : 'Asistente automático';
      // Con el bot pausado no hay asistente automático que anunciar.
      modoEl.hidden = !humano && negocio.active === false;
      campoEl.placeholder = humano ? 'Escribe tu mensaje…' : placeholderOriginal;

      hiloEl.scrollTop = hiloEl.scrollHeight;
    }

    function mostrarEscribiendo() {
      escribiendoEl = document.createElement('div');
      escribiendoEl.className = 'burbuja bot escribiendo';
      escribiendoEl.innerHTML = '<i></i><i></i><i></i>';
      hiloEl.appendChild(escribiendoEl);
      hiloEl.scrollTop = hiloEl.scrollHeight;
    }

    function quitarEscribiendo() {
      if (escribiendoEl) escribiendoEl.remove();
      escribiendoEl = null;
    }

    /* ----------------------------------------------------------------- enviar */

    function avisoDeTraspaso() {
      var partes = ['Listo, le avisé a una persona del equipo y te va a responder por aquí mismo. Puedes seguir escribiendo.'];
      if (negocio.handoff) partes.push(negocio.handoff);
      return partes.join('\n');
    }

    /** Lo que hace el bot con un mensaje del cliente, si es que le toca responder. */
    function contestar(mensaje) {
      // Mientras "escribía", una persona pudo tomar la conversación desde el panel.
      if (C.obtener(id).modo === C.HUMANO) return;

      if (negocio.active !== false && C.pideHumano(mensaje)) {
        C.agregar(id, { de: 'bot', texto: avisoDeTraspaso(), intent: 'persona', matched: true });
        C.cambiarModo(id, C.HUMANO, 'cliente');
        return;
      }

      // window.respond y no una referencia guardada: la vista previa del panel lo envuelve
      // después de cargar la página para registrar las métricas.
      var resultado = window.respond(mensaje, negocio, sesion);
      C.agregar(id, { de: 'bot', texto: resultado.reply, intent: resultado.intent, matched: resultado.matched });
      if (resultado.intent === 'saludo') sesion.greeted = true;
    }

    function enviar(texto) {
      var mensaje = String(texto || '').trim();
      if (!mensaje) return;

      C.agregar(id, { de: 'cliente', texto: mensaje });
      campoEl.value = '';
      pintar();

      // Con una persona a cargo, el mensaje le llega a ella y el bot no se mete.
      if (C.obtener(id).modo === C.HUMANO) {
        campoEl.focus();
        return;
      }

      enviarEl.disabled = true;
      mostrarEscribiendo();

      // Una pausa breve para que se lea como una conversación.
      setTimeout(function () {
        quitarEscribiendo();
        contestar(mensaje);
        pintar();
        enviarEl.disabled = false;
        campoEl.focus();
      }, 300);
    }

    formEl.addEventListener('submit', function (evento) {
      evento.preventDefault();
      enviar(campoEl.value);
    });

    rubroEl.textContent = negocio.tagline || '';

    if (negocio.active !== false) {
      (negocio.topics || []).forEach(function (tema) {
        var boton = document.createElement('button');
        boton.className = 'atajo';
        boton.type = 'button';
        boton.textContent = tema;
        boton.addEventListener('click', function () {
          enviar(tema);
        });
        atajosEl.appendChild(boton);
      });
    }

    // Lo que responda el equipo desde el panel, o un cambio de modo, llega por aquí.
    C.suscribir(pintar);
    pintar();
  }

  window.PymeChat = { iniciar: iniciar };
})();
