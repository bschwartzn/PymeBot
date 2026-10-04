/*
 * Conversaciones de PymeBot: el historial y quién está respondiendo.
 *
 * Cada conversación está en uno de dos modos:
 *   BOT_ACTIVE   el bot responde solo (por defecto).
 *   HUMAN_ACTIVE la atiende una persona del equipo y el bot se calla.
 *
 * Pasa a HUMAN_ACTIVE cuando el cliente pide hablar con una persona o cuando el negocio
 * la toma desde el panel; vuelve a BOT_ACTIVE cuando el negocio la devuelve.
 *
 * Lo usan el chat del cliente y el panel. Sin servidor, todo se guarda en el localStorage
 * de este navegador y las pestañas se avisan con el evento `storage`: funciona de verdad,
 * pero solo entre ventanas del mismo navegador. Con un servidor (o WhatsApp como canal),
 * este archivo es lo único que cambia: el resto habla con estas funciones.
 */
(function () {
  'use strict';

  var LLAVE = 'pymebot-conversaciones';
  var BOT = 'BOT_ACTIVE';
  var HUMANO = 'HUMAN_ACTIVE';

  /* ---------------------------------------------------------- almacenamiento */

  // Si el navegador no deja guardar (navegación privada estricta), la conversación vive
  // en memoria mientras la pestaña siga abierta.
  var memoria = null;

  function leer() {
    if (memoria) return memoria;
    try {
      var datos = JSON.parse(localStorage.getItem(LLAVE) || '{}');
      return datos && typeof datos === 'object' ? datos : {};
    } catch (err) {
      return {};
    }
  }

  function guardar(datos) {
    try {
      localStorage.setItem(LLAVE, JSON.stringify(datos));
    } catch (err) {
      memoria = datos;
    }
  }

  /**
   * Toda escritura relee antes de modificar: otra pestaña (el panel, o el chat) pudo
   * cambiar la conversación desde la última vez que se miró.
   */
  function modificar(id, cambio) {
    var datos = leer();
    var conversacion = datos[id];
    if (!conversacion) return null;
    cambio(conversacion);
    conversacion.actualizada = new Date().toISOString();
    guardar(datos);
    return conversacion;
  }

  function nuevoId(prefijo) {
    return prefijo + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* --------------------------------------------------------------- lectura */

  function obtener(id) {
    return leer()[id] || null;
  }

  /** Las más recientes primero. */
  function listar() {
    var datos = leer();
    return Object.keys(datos)
      .map(function (id) { return datos[id]; })
      .sort(function (a, b) { return a.actualizada < b.actualizada ? 1 : -1; });
  }

  /**
   * ¿Hay un cliente esperando que le conteste una persona?
   * Sí, si la atiende una persona y lo último que escribió el cliente todavía no tiene
   * respuesta del equipo.
   */
  function esperaRespuesta(conversacion) {
    if (!conversacion || conversacion.modo !== HUMANO) return false;
    var ultimoCliente = -1;
    var ultimoAgente = -1;
    conversacion.mensajes.forEach(function (m, i) {
      if (m.de === 'cliente') ultimoCliente = i;
      if (m.de === 'agente') ultimoAgente = i;
    });
    return ultimoCliente > ultimoAgente;
  }

  /* ------------------------------------------------------------- escritura */

  function crear(datosIniciales) {
    var ahora = new Date().toISOString();
    var conversacion = {
      id: nuevoId('c'),
      negocioId: datosIniciales.negocioId,
      negocioNombre: datosIniciales.negocioNombre,
      // El canal por el que llegó: 'web' hoy; mañana 'whatsapp' u otro.
      canal: datosIniciales.canal || 'web',
      modo: BOT,
      creada: ahora,
      actualizada: ahora,
      mensajes: [],
    };
    var datos = leer();
    datos[conversacion.id] = conversacion;
    guardar(datos);
    return conversacion;
  }

  /**
   * Agrega un mensaje. `de` es quién lo escribió: 'cliente', 'bot', 'agente' (una persona
   * del equipo) o 'sistema' (avisos de cambio de modo). Cada mensaje lleva su propio id,
   * que es lo que usan el chat y el panel para no pintar dos veces el mismo.
   */
  function agregar(id, mensaje) {
    return modificar(id, function (conversacion) {
      conversacion.mensajes.push({
        id: nuevoId('m'),
        de: mensaje.de,
        texto: String(mensaje.texto),
        at: new Date().toISOString(),
        intent: mensaje.intent,
        matched: mensaje.matched,
      });
    });
  }

  // Los ven el cliente y el panel, así que no hablan de "el cliente" ni de "tú".
  var AVISOS = {
    cliente: 'Conversación derivada a una persona del equipo.',
    agente: 'Una persona del equipo se unió a la conversación.',
    bot: 'El asistente automático vuelve a responder.',
  };

  /**
   * Cambia quién responde. Si ya estaba en ese modo no hace nada: así dos clics seguidos
   * o dos pestañas a la vez no dejan avisos repetidos en el historial.
   * @param {'cliente'|'agente'} porQuien quién pidió el cambio
   */
  function cambiarModo(id, modo, porQuien) {
    var actual = obtener(id);
    if (!actual || actual.modo === modo) return actual;
    return modificar(id, function (conversacion) {
      conversacion.modo = modo;
      conversacion.mensajes.push({
        id: nuevoId('m'),
        de: 'sistema',
        texto: modo === BOT ? AVISOS.bot : AVISOS[porQuien] || AVISOS.agente,
        at: new Date().toISOString(),
      });
    });
  }

  /** Una persona del equipo responde. Si el bot estaba a cargo, toma la conversación. */
  function responderComoAgente(id, texto) {
    if (!obtener(id)) return null;
    cambiarModo(id, HUMANO, 'agente');
    return agregar(id, { de: 'agente', texto: texto });
  }

  /* -------------------------------------------------- pedir hablar con alguien */

  function plegar(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /*
   * Frases, no palabras sueltas: "persona" sola aparece en "¿cuántas personas caben?", y
   * "ejecutivo" en "menú ejecutivo". Se comparan ya plegadas (sin tildes ni ñ).
   */
  var PIDE_PERSONA = [
    'hablar con una persona', 'hablar con alguien', 'hablar con un humano', 'hablar con una humana',
    'hablar con el dueno', 'hablar con la duena', 'hablar con un ejecutivo', 'hablar con una ejecutiva',
    'hablar con un agente', 'hablar con un operador', 'hablar con una operadora',
    'hablar con el encargado', 'hablar con la encargada', 'hablar con el equipo',
    'una persona real', 'persona de verdad', 'atencion humana', 'atencion personalizada',
    'que me atienda alguien', 'que me atienda una persona', 'me atienda una persona',
    'quiero una persona', 'necesito una persona', 'pasame con alguien', 'paseme con alguien',
    'comunicarme con alguien', 'comunicarme con una persona',
  ];
  var PALABRAS_PERSONA = ['humano', 'humana', 'operador', 'operadora'];

  function pideHumano(texto) {
    var plegado = plegar(texto);
    if (!plegado) return false;
    var conEspacios = ' ' + plegado + ' ';
    var porFrase = PIDE_PERSONA.some(function (frase) {
      return conEspacios.indexOf(' ' + frase + ' ') !== -1;
    });
    if (porFrase) return true;
    var palabras = plegado.split(' ');
    return PALABRAS_PERSONA.some(function (p) { return palabras.indexOf(p) !== -1; });
  }

  /** Identificador estable del negocio a partir de su nombre ("Cocinería Doña Elba" → "cocineria-dona-elba"). */
  function idDeNegocio(nombre) {
    return plegar(nombre).replace(/ /g, '-') || 'negocio';
  }

  /* ------------------------------------------------------------- avisos */

  /** Llama a `alCambiar` cuando OTRA pestaña modifica las conversaciones. */
  function suscribir(alCambiar) {
    function escuchar(evento) {
      if (evento.key === LLAVE || evento.key === null) alCambiar();
    }
    window.addEventListener('storage', escuchar);
    return function () {
      window.removeEventListener('storage', escuchar);
    };
  }

  window.PymeConversaciones = {
    BOT: BOT,
    HUMANO: HUMANO,
    obtener: obtener,
    listar: listar,
    crear: crear,
    agregar: agregar,
    cambiarModo: cambiarModo,
    responderComoAgente: responderComoAgente,
    esperaRespuesta: esperaRespuesta,
    pideHumano: pideHumano,
    idDeNegocio: idDeNegocio,
    suscribir: suscribir,
  };
})();
