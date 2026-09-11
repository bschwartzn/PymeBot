# PymeBot 🤖

Chatbot para pequeñas empresas. Responde las preguntas frecuentes de los clientes
(horarios, precios, servicios, ubicación) con la información que el propio negocio
configura.

> **Estado:** núcleo conversacional, base de conocimiento editable, panel del dueño con
> cuentas y **canal público para el cliente final** (link, QR y widget).
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

Abre **http://localhost:3000** para el chat y **http://localhost:3000/panel.html** para el
panel del dueño. Esta es la vía real del producto: es la única que permite *editar* la
información del negocio, y la que expone `POST /api/chat`, el punto de entrada que
reutilizarán WhatsApp y el resto de los canales.

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

138 tests sobre el motor, las sesiones, la API HTTP, la validación de negocios, el
repositorio, la autenticación y autorización, el canal público, la precisión y el sandbox.

---

## Cómo llega un cliente al bot

Cada negocio tiene una dirección propia:

```
https://tu-servidor/c/mi-negocio
```

El cliente la abre y conversa. **No instala nada ni necesita cuenta.** Está pensada para el
teléfono, que es de donde va a llegar casi todo el tráfico.

Desde la pestaña **Compartir** del panel tienes las cuatro formas de distribuirla:

| Forma | Para quién |
|---|---|
| **El link** | Estado de WhatsApp, bio de Instagram, ficha de Google, respuesta automática fuera de horario |
| **Código QR** | Negocios con local: impreso en el mesón, la vitrina o la mesa |
| **Widget** | Negocios que ya tienen página web: una línea y aparece una burbuja de chat |
| **Enlace de WhatsApp** | Para reenviar el link a un cliente en un toque |

El widget se instala así:

```html
<script src="https://tu-servidor/widget.js" data-negocio="mi-negocio" defer></script>
```

### ¿Y WhatsApp?

Es donde están los clientes, pero **no es donde puedes probar esta semana**. La API de
WhatsApp Business exige verificar la empresa con Meta, un número dedicado, un proveedor y
aprobación de plantillas: días o semanas antes de que un solo cliente escriba.

El link se distribuye igual *por* WhatsApp y funciona hoy. Cuando haya evidencia de que los
clientes usan el bot, WhatsApp pasa a ser una inversión justificada — y será un adaptador
sobre el mismo `POST /api/chat`, no una reescritura.

### Enseñar el panel sin contratar hosting

```bash
npm run build:demo
```

Genera `dist/demo.html`: **el panel del dueño funcionando en un solo archivo.** Sirve para
sentarse con un dueño de pyme y ver si entiende cómo configurar su bot — que es la reacción
más valiosa que se puede recoger, y la que no se obtiene enseñando solo el chat.

No es una maqueta: usa el HTML, el CSS y el JavaScript reales del panel, la validación real
(`src/knowledge/schema.js`) y el motor real (`src/bot/`). Lo único sustituido es el servidor,
por una implementación que guarda en el navegador. Como el demo *es* el producto, no puede
desviarse de él.

Incluye una vista previa lateral que muestra el chat del cliente **con los cambios sin
guardar**, así se ve el efecto de editar una respuesta al momento.

Lo que no hace: el acceso no comprueba la contraseña (no hay dónde guardar un hash con
seguridad en el navegador, y fingirlo daría una impresión equivocada), los cambios quedan
solo en ese navegador, y el QR es de muestra. El propio demo lo dice en pantalla.

### Probar el chat sin contratar hosting

```bash
npm run build:chat -- mi-negocio
```

Genera `dist/chat-mi-negocio.html`: la página del cliente en un solo archivo, sin servidor.
Se abre con doble clic o se sube a cualquier alojamiento estático. Sirve para una primera
prueba con gente real. Lo que pierdes: no se puede editar desde el panel (hay que regenerar
el archivo) y no queda registro de las conversaciones.

## El panel del dueño

Con el servidor corriendo, abre **http://localhost:3000/panel.html**. Crea una cuenta con tu
correo y una contraseña, y desde ahí configuras tu bot. **Lo que guardas aplica en la
siguiente pregunta del chat, sin reiniciar nada.**

Si no quieres empezar en blanco, copia uno de los ejemplos que vienen con PymeBot a tu cuenta
y edítalo.

El panel tiene cuatro secciones:

| Sección | Qué configuras |
|---|---|
| **Identidad** | Nombre, descripción y los temas sugeridos que aparecen como botones en el chat |
| **Preguntas** | Cada pregunta de tus clientes: sus **palabras clave** y la **respuesta** |
| **Mensajes** | Saludo, qué dice cuando no entiende, y cómo derivar a una persona |
| **Comportamiento** | Encender o pausar el bot, y qué tan exigente es antes de responder |

### Comportamiento: los dos ajustes que importan

- **Bot activo.** Si lo apagas, el bot deja de intentar entender y responde solo el mensaje
  que tú escribas. Útil en vacaciones o mientras cargas la información.
- **Nivel de exigencia.** Cuánta seguridad necesita el bot antes de responder. Más exigente
  responde menos, pero se equivoca menos; menos exigente responde casi siempre, arriesgando
  contestar un tema por otro. **Si ves que confunde preguntas, súbelo.**

### Errores y advertencias al guardar

- **Errores** — impiden guardar y dicen exactamente qué falta (*"La pregunta «horarios» no
  tiene respuesta."*).
- **Advertencias** — dejan guardar, pero avisan de lo que suele hacer que el bot responda
  mal: dos preguntas peleando por la misma palabra clave, o una palabra vacía como `de`, que
  haría que esa pregunta gane en casi cualquier frase.

### Quién puede ver qué

- **El chat es público.** Tus clientes conversan con tu bot sin cuenta ni contraseña.
- **El panel es privado.** Cada dueño ve y edita solo sus propios negocios.
- Los ejemplos que trae PymeBot no tienen dueño: se pueden copiar, no editar.

> ⚠️ **Antes de publicarlo en internet**, ten presente que todavía no hay verificación de
> correo ni recuperación de contraseña, y que usuarios y sesiones se guardan en archivos
> JSON. Está pensado para uso local y pruebas. El detalle está en
> [`docs/ROADMAP.md`](docs/ROADMAP.md).

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
| `GET` | `/api/directory` | Los negocios con los que se puede conversar |
| `GET` | `/c/:slug` | La página de chat del cliente final |
| `GET` | `/widget.js` | La burbuja de chat para el sitio web del negocio |
| `GET` | `/api/businesses/:slug/qr.svg` | El QR del chat, para imprimir |

**Cuentas** — el acceso al panel.

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/auth/signup` | Crea la cuenta, abre sesión y opcionalmente el primer negocio |
| `POST` | `/api/auth/login` | Inicia sesión |
| `POST` | `/api/auth/logout` | Cierra la sesión e invalida el token en el servidor |
| `GET` | `/api/auth/me` | Quién está conectado |

**Base de conocimiento** — privado: exige sesión, y solo alcanza a los negocios propios.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/businesses` | Mis negocios |
| `GET` | `/api/businesses/:slug` | Uno de mis negocios |
| `POST` | `/api/businesses` | Crea uno nuevo |
| `PUT` | `/api/businesses/:slug` | Guarda los cambios |
| `DELETE` | `/api/businesses/:slug` | Lo elimina |
| `GET` | `/api/examples` | Los ejemplos que trae PymeBot |
| `POST` | `/api/examples/:slug/copy` | Copia un ejemplo a mi cuenta |
| `GET` | `/api/businesses/:slug/share` | Link, QR, código del widget y enlace de WhatsApp |

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
  auth/                ── Panel: cuentas de dueño
    passwords.js       Hash con scrypt
    users.js           Cuentas
    sessions.js        Sesiones y cookie
data/businesses/       La información de cada negocio
data/evals/            Preguntas de prueba para medir la precisión
public/
  chat.*               La página que ve el cliente (/c/<negocio>)
  widget.js            Burbuja para el sitio web del negocio
  panel.*              Panel del dueño
  index.*              Sandbox interno de pruebas
scripts/               Generadores de páginas sin servidor y medidor de precisión
dist/                  Páginas en un solo archivo, sin servidor (generadas)
tests/                 138 tests con el runner nativo de Node
docs/ROADMAP.md        Plan modular completo
```

## Ponerlo en internet

Es una aplicación Node normal, pero hay cuatro cosas que importan:

1. **Disco persistente.** Todo vive en `data/`: negocios, cuentas y sesiones. Si el host
   borra el disco en cada despliegue, se pierde todo. Render, Railway y Fly.io ofrecen discos
   persistentes; Vercel y Netlify **no sirven** para esto.
2. **HTTPS obligatorio.** Sin él la cookie de sesión viaja en claro y `NODE_ENV=production`
   la marca como `secure`, así que dejaría de funcionar.
3. **`PYMEBOT_PUBLIC_URL`.** Sin esta variable, el link y el QR se generan desde las
   cabeceras de la petición. Detrás de un proxy raro eso puede apuntar a `localhost` y el QR
   impreso quedaría inservible. Defínela y te ahorras el problema:

   ```bash
   PYMEBOT_PUBLIC_URL=https://chat.tupyme.cl
   NODE_ENV=production
   PORT=3000
   ```

4. **Un límite de peticiones por IP en `POST /api/chat`.** La página del cliente es pública
   y hoy no lo tiene. Ponlo antes de difundir el link ampliamente.

## Requisitos

Node.js 18 o superior. Sin base de datos, sin claves de API, sin Docker.
