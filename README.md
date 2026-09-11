# PymeBot 🤖

Chatbot para pequeñas empresas. Responde las preguntas frecuentes de los clientes
(horarios, precios, servicios, ubicación) con la información que el propio negocio
configura.

> **Estado: Módulos 1 y 2 completados** — núcleo conversacional, sandbox y base de
> conocimiento editable desde el navegador.
> El desarrollo es modular y progresivo: cada módulo se construye, se prueba y se corrige
> antes de pasar al siguiente. El plan completo está en [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Probarlo

Hay dos formas, y ambas usan **exactamente el mismo motor**.

### 1. Sin instalar nada

Abre `dist/sandbox.html` con doble clic. Es un único archivo autocontenido: el motor y
todos los negocios configurados van dentro, no necesita servidor ni conexión. Sirve para
probar el bot y para mostrárselo a alguien sin pedirle que instale nada.

Se regenera desde el código fuente con:

```bash
npm run build:sandbox
```

Nunca se edita a mano: `scripts/build-sandbox.js` toma `src/bot/` y `src/config/business.json`
tal cual están y los inyecta en la plantilla, así que el archivo publicado y el servidor
local no se pueden desincronizar. Hay tests que lo verifican.

### 2. Con el servidor local

```bash
npm install
npm start
```

Abre **http://localhost:3000** para el chat y **http://localhost:3000/admin.html** para el
editor. Esta es la vía real del producto: es la única que permite *editar* la información
del negocio, y la que expone `POST /api/chat`, el punto de entrada que reutilizarán
WhatsApp y el resto de los canales.

### Qué preguntarle

- `¿A qué hora abren?`
- `cuanto cuesta un corte`
- `dónde están ubicados`
- `quiero pedir hora`
- `tienen wifi?` ← para ver cómo responde cuando no sabe

Es un **ambiente sandbox**: no hay WhatsApp, ni base de datos, ni cuentas de usuario.
Solo el chat, para validar que el bot responde bien.

## Medir qué tan bien responde

```bash
npm run eval
```

Corre un conjunto de preguntas escritas como las escribiría un cliente real
([`data/evals/`](data/evals/)) y compara la intención detectada contra la esperada. Agrupa
los fallos por tipo: **no entiende** (cae en el respaldo teniendo la respuesta), **confunde
de tema** (responde con seguridad algo que no se preguntó) y **responde algo que no sabe**.

Hoy el negocio de referencia acierta **98.7 %** (74/75). El piso está enganchado a `npm test`,
así que un cambio que lo baje rompe la suite. El piso se sube cuando un módulo mejora la
comprensión; no se baja para que pase.

## Tests

```bash
npm test
```

103 tests sobre el motor de intenciones, las sesiones, la API HTTP, la validación de
negocios, el repositorio en disco, la precisión mínima y la integridad del sandbox.

---

## Cómo cargar la información de un negocio

Con el servidor corriendo, abre **http://localhost:3000/admin.html**. Ahí puedes crear un
negocio, editar sus mensajes y cargar las preguntas que sabe responder. **Lo que guardas
aplica en la siguiente pregunta del chat, sin reiniciar nada.**

Cada pregunta tiene dos partes:

- **Palabras clave**: lo que el bot busca en lo que escribe el cliente.
- **Respuesta**: lo que contesta.

Al guardar, el editor distingue dos cosas:

- **Errores** — impiden guardar y dicen exactamente qué falta (*"La pregunta «horarios» no
  tiene respuesta."*).
- **Advertencias** — dejan guardar, pero avisan de lo que suele hacer que el bot responda
  mal: dos preguntas peleando por la misma palabra clave, o una palabra vacía como `de`,
  que haría que esa pregunta gane en casi cualquier frase.

> ⚠️ **El editor no pide contraseña.** Está pensado para uso local. No lo publiques en
> internet tal como está; la autenticación llega en el Módulo 7.

**Consejos para escribir buenas palabras clave:**

- Escríbelas en minúsculas y sin acentos; el bot normaliza lo que escribe el cliente.
- No hace falta poner singular y plural: `horario` ya encuentra `horarios`.
- Las frases de varias palabras (`cuanto cuesta`) valen más que las sueltas, porque son
  más específicas. Úsalas para desempatar entre preguntas parecidas.
- Evita palabras genéricas (`hacer`, `tener`, `de`): disparan respuestas equivocadas. El
  editor te avisa de las peores.

### Si prefieres editar los archivos a mano

Cada negocio es un JSON en [`data/businesses/`](data/businesses/). El nombre del archivo es
su identificador. Se validan igual al leerlos: si uno queda mal, se ignora y el resto sigue
funcionando.

```json
{
  "name": "Taller Don Pepe",
  "greeting": "¡Hola! ¿En qué te ayudo?",
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

**Conversación** — el núcleo. `POST /api/chat` es el único punto de entrada: cuando llegue
WhatsApp (Módulo 5) será un adaptador que traduce el webhook a esta misma llamada.

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId?, business?, message }` → `{ sessionId, business, reply, intent, matched, score }` |
| `POST` | `/api/reset` | `{ sessionId }` → vacía el historial de esa conversación |
| `GET` | `/api/business?slug=` | Nombre, saludo y temas sugeridos (lo que pinta el sandbox) |

**Base de conocimiento** — lo que usa el editor.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/businesses` | Lista los negocios configurados |
| `GET` | `/api/businesses/:slug` | Devuelve un negocio completo |
| `POST` | `/api/businesses` | Crea uno; el identificador se deriva del nombre |
| `PUT` | `/api/businesses/:slug` | Guarda los cambios |
| `DELETE` | `/api/businesses/:slug` | Lo elimina |
| `GET` | `/health` | Estado del servidor, negocios cargados y sesiones activas |

Guardar información inválida devuelve **422** con la lista de errores explicados. Guardar
algo dudoso devuelve **200** con `warnings`.

## Estructura

```
src/
  server.js            API HTTP + sandbox estático
  bot/                 ── Módulo 1: el núcleo conversacional
    text.js            Normalización de español
    engine.js          Motor de intenciones
    sessions.js        Memoria de conversación
  knowledge/           ── Módulo 2: la base de conocimiento
    schema.js          Validación: errores y advertencias
    repository.js      Un JSON por negocio, en disco
data/businesses/       La información de cada negocio
data/evals/            Preguntas de prueba para medir la precisión
public/                Sandbox (index) y editor (admin)
scripts/               Generador del sandbox y medidor de precisión
dist/sandbox.html      Sandbox en un solo archivo (generado)
tests/                 103 tests con el runner nativo de Node
docs/ROADMAP.md        Plan modular completo
```

## Requisitos

Node.js 18 o superior. Sin base de datos, sin claves de API, sin Docker.
