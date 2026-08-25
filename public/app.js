/* Sandbox del chat. Sin frameworks: fetch + DOM. */

const messagesEl = document.getElementById('messages');
const topicsEl = document.getElementById('topics');
const formEl = document.getElementById('form');
const inputEl = document.getElementById('input');
const sendEl = formEl.querySelector('.send');
const resetEl = document.getElementById('reset');
const negocioEl = document.getElementById('negocio');

let sessionId = null;
/** Qué negocio estamos probando. Lo fija el editor con ?negocio=… o el selector. */
let negocio = new URLSearchParams(location.search).get('negocio') || null;

function addBubble(text, who) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${who}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function showTyping() {
  const bubble = document.createElement('div');
  bubble.className = 'bubble bot typing';
  bubble.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

/** Llena el selector con los negocios configurados. */
async function loadNegocios() {
  try {
    const { businesses } = await (await fetch('/api/businesses')).json();
    negocioEl.innerHTML = '';
    for (const item of businesses) {
      const option = document.createElement('option');
      option.value = item.slug;
      option.textContent = item.name;
      negocioEl.appendChild(option);
    }
    // El selector solo aparece si de verdad hay entre qué elegir.
    negocioEl.parentElement.hidden = businesses.length < 2;
  } catch (err) {
    negocioEl.parentElement.hidden = true;
  }
}

async function loadBusiness() {
  try {
    const url = negocio ? `/api/business?slug=${encodeURIComponent(negocio)}` : '/api/business';
    const res = await fetch(url);
    const business = await res.json();

    if (!res.ok) {
      addBubble(business.error || 'No se pudo cargar el negocio.', 'error');
      return;
    }

    negocio = business.slug;
    negocioEl.value = business.slug;

    document.getElementById('business-name').textContent = business.name;
    document.getElementById('business-tagline').textContent = business.tagline;
    document.title = `${business.name} — PymeBot Sandbox`;

    addBubble(business.greeting, 'bot');

    topicsEl.innerHTML = '';
    for (const topic of business.topics) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.textContent = topic;
      chip.addEventListener('click', () => sendMessage(topic));
      topicsEl.appendChild(chip);
    }
  } catch (err) {
    addBubble('No pude conectar con el servidor. ¿Está corriendo `npm start`?', 'error');
  }
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message) return;

  addBubble(message, 'user');
  inputEl.value = '';
  sendEl.disabled = true;

  const typing = showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message, business: negocio }),
    });
    const data = await res.json();
    typing.remove();

    if (!res.ok) {
      addBubble(data.error || 'Ocurrió un error inesperado.', 'error');
      return;
    }

    sessionId = data.sessionId;
    addBubble(data.reply, 'bot');
  } catch (err) {
    typing.remove();
    addBubble('No pude conectar con el servidor.', 'error');
  } finally {
    sendEl.disabled = false;
    inputEl.focus();
  }
}

// Cambiar de negocio empieza una conversación nueva: la memoria era de otro bot.
negocioEl.addEventListener('change', () => {
  negocio = negocioEl.value;
  sessionId = null;
  messagesEl.innerHTML = '';
  loadBusiness();
  inputEl.focus();
});

formEl.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage(inputEl.value);
});

resetEl.addEventListener('click', async () => {
  if (sessionId) {
    await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  }
  sessionId = null;
  messagesEl.innerHTML = '';
  loadBusiness();
  inputEl.focus();
});

(async () => {
  await loadNegocios();
  await loadBusiness();
  inputEl.focus();
})();
