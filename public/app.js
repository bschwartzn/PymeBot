/* Sandbox del chat. Sin frameworks: fetch + DOM. */

const messagesEl = document.getElementById('messages');
const topicsEl = document.getElementById('topics');
const formEl = document.getElementById('form');
const inputEl = document.getElementById('input');
const sendEl = formEl.querySelector('.send');
const resetEl = document.getElementById('reset');

let sessionId = null;

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

async function loadBusiness() {
  try {
    const res = await fetch('/api/business');
    const business = await res.json();

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
      body: JSON.stringify({ sessionId, message }),
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

loadBusiness();
inputEl.focus();
