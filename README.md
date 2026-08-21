# PymeBot 🤖

Chatbot para pequeñas empresas. Responde las preguntas frecuentes de los clientes
(horarios, precios, servicios, ubicación) con la información que el propio negocio
configura.

> **Estado: Módulo 1 — núcleo conversacional + sandbox.**
> El desarrollo es modular y progresivo: cada módulo se construye, se prueba y se corrige
> antes de pasar al siguiente. El plan completo está en [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Probarlo en 30 segundos

```bash
npm install
npm start
```

Abre **http://localhost:3000** y escribe, por ejemplo:

- `¿A qué hora abren?`
- `cuanto cuesta un corte`
- `dónde están ubicados`
- `quiero pedir hora`
- `tienen wifi?` ← para ver cómo responde cuando no sabe

Es un **ambiente sandbox**: no hay WhatsApp, ni base de datos, ni cuentas de usuario.
Solo el chat, para validar que el bot responde bien.

## Tests

```bash
npm test
```

54 tests sobre el motor de intenciones, el manejo de sesiones y la API HTTP.

---

## Cómo cambiar el negocio

Toda la información vive en un solo archivo: [`src/config/business.json`](src/config/business.json).
No hay que tocar el código.

```json
{
  "name": "Taller Don Pepe",
  "greeting": "¡Hola! ¿En qué te ayudo?",
  "fallback": "No estoy seguro de haber entendido. Puedo ayudarte con:",
  "topics": ["Horarios", "Precios"],
  "intents": [
    {
      "id": "horarios",
      "keywords": ["horario", "abren", "a que hora"],
      "answer": "Atendemos de lunes a viernes de 9:00 a 18:00."
    }
  ]
}
```

Cada intención declara **palabras clave** y **una respuesta**. Reinicia el servidor y listo.

**Consejos para escribir buenas palabras clave:**

- Escríbelas en minúsculas y sin acentos; el bot normaliza lo que escribe el cliente.
- No hace falta poner singular y plural: `horario` ya encuentra `horarios`.
- Las frases de varias palabras (`cuanto cuesta`) valen más que las sueltas, porque son
  más específicas. Úsalas para desempatar entre intenciones parecidas.
- Evita palabras muy genéricas (`hacer`, `tener`): disparan respuestas equivocadas.

---

## Cómo funciona

```
Cliente → Sandbox web (public/) → POST /api/chat → Motor de intenciones → Respuesta
                                       │
                                  Sesiones en memoria (historial)
```

1. El texto del cliente se **normaliza**: minúsculas, sin acentos, sin `¿ ? ! ,`
   (la `ñ` se conserva, porque `año` no es `ano`).
2. Cada intención de `business.json` se **puntúa** según cuántas palabras clave aparecen.
   Las frases y las palabras largas pesan más.
3. Gana la intención de mayor puntaje, siempre que supere el **umbral de confianza**.
   Si ninguna lo supera, responde el **fallback** con la lista de temas que sí cubre.
4. La **sesión** guarda el historial de la conversación en memoria del servidor.

Sin LLM, sin base de datos, sin dependencias externas más allá de Express. Es determinista,
gratis y se testea con facilidad. La capa de LLM se evalúa en el Módulo 2, una vez que la
base de conocimiento esté bien estructurada.

## API

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId?, message }` → `{ sessionId, reply, intent, matched, score }` |
| `POST` | `/api/reset` | `{ sessionId }` → vacía el historial de esa conversación |
| `GET` | `/api/business` | Nombre, saludo y temas sugeridos (lo que pinta el sandbox) |
| `GET` | `/health` | Estado del servidor y sesiones activas |

`POST /api/chat` es el **único punto de entrada del núcleo**. Cuando llegue WhatsApp
(Módulo 5) será un adaptador que traduce el webhook a esta misma llamada; el motor no cambia.

## Estructura

```
src/
  server.js            API HTTP + sandbox estático
  bot/
    text.js            Normalización de español
    engine.js          Motor de intenciones
    sessions.js        Memoria de conversación
  config/
    business.json      La información del negocio
public/                Sandbox web (HTML/CSS/JS plano)
tests/                 54 tests con el runner nativo de Node
docs/ROADMAP.md        Plan modular completo
```

## Requisitos

Node.js 18 o superior. Sin base de datos, sin claves de API, sin Docker.
