/*
 * Burbuja de chat para el sitio web del negocio.
 *
 * Se instala con una sola línea:
 *   <script src="https://TU-SERVIDOR/widget.js" data-negocio="mi-negocio" defer></script>
 *
 * El chat va dentro de un iframe a propósito: así los estilos del sitio del cliente y los
 * del chat no se pisan, en ninguna de las dos direcciones.
 */

(function () {
  var script = document.currentScript;
  if (!script) return;

  var negocio = script.getAttribute('data-negocio');
  if (!negocio) {
    console.warn('[PymeBot] Falta data-negocio en la etiqueta <script>.');
    return;
  }

  var origen = new URL(script.src, location.href).origin;
  var color = script.getAttribute('data-color') || '#1f6feb';
  var etiqueta = script.getAttribute('data-etiqueta') || '¿Dudas? Escríbenos';
  var abierto = false;

  var estilos = document.createElement('style');
  estilos.textContent = [
    '.pymebot-boton{position:fixed;bottom:20px;right:20px;z-index:2147483000;',
    'display:flex;align-items:center;gap:9px;border:0;border-radius:999px;cursor:pointer;',
    'padding:13px 20px;font:600 15px/1 system-ui,-apple-system,sans-serif;color:#fff;',
    'background:' + color + ';box-shadow:0 6px 24px rgba(0,0,0,.22)}',
    '.pymebot-boton:hover{filter:brightness(1.07)}',
    '.pymebot-panel{position:fixed;bottom:88px;right:20px;z-index:2147483000;',
    'width:min(390px,calc(100vw - 32px));height:min(600px,calc(100dvh - 120px));',
    'border:0;border-radius:16px;background:#fff;display:none;',
    'box-shadow:0 12px 44px rgba(0,0,0,.24)}',
    '.pymebot-panel.abierto{display:block}',
    '@media (max-width:480px){.pymebot-panel{bottom:0;right:0;width:100vw;height:100dvh;border-radius:0}',
    '.pymebot-panel.abierto~.pymebot-boton{display:none}}',
  ].join('');
  document.head.appendChild(estilos);

  var marco = document.createElement('iframe');
  marco.className = 'pymebot-panel';
  marco.title = 'Chat de atención';
  marco.setAttribute('loading', 'lazy');

  var boton = document.createElement('button');
  boton.className = 'pymebot-boton';
  boton.type = 'button';
  boton.setAttribute('aria-expanded', 'false');
  boton.innerHTML =
    '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>' +
    '</svg><span></span>';
  boton.querySelector('span').textContent = etiqueta;

  boton.addEventListener('click', function () {
    abierto = !abierto;
    // El iframe se carga la primera vez que se abre, no al entrar al sitio.
    if (abierto && !marco.src) marco.src = origen + '/c/' + encodeURIComponent(negocio);
    marco.classList.toggle('abierto', abierto);
    boton.setAttribute('aria-expanded', String(abierto));
    boton.querySelector('span').textContent = abierto ? 'Cerrar' : etiqueta;
  });

  function montar() {
    document.body.appendChild(marco);
    document.body.appendChild(boton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
