# PymeBot 🤖

Chatbot para pequeñas empresas. Responde las preguntas frecuentes de los clientes
(horarios, precios, servicios, ubicación) con la información que el propio negocio
configura.

> **Estado:** listo para desplegar. Núcleo conversacional, base de conocimiento editable,
> panel del dueño con cuentas, canal público (link, QR y widget) y **medición de
> conversaciones**.
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

## Qué preguntaron tus clientes

Cada conversación queda anotada en `data/conversations/<negocio>.jsonl`, una línea por
mensaje. Sobrevive a los reinicios y alimenta la pestaña **Conversaciones** del panel, que
muestra cuántas conversaciones hubo, qué porcentaje supo responder el bot, y —lo más útil—
**la lista de preguntas que no supo contestar**.

Cada una de esas preguntas trae un botón **«Responder esto»** que crea la pregunta ya
rellenada con las palabras clave del cliente. Es el círculo completo: el bot falla, lo ves,
y lo arreglas en dos minutos sin salir de la pantalla.

Más abajo, **todas las conversaciones completas**: quién escribió qué y qué contestó el bot,
con las respuestas fallidas marcadas. Las cifras dicen que algo va mal; leer la conversación
dice por qué — que la respuesta era correcta pero sonaba seca, o que la persona preguntó
tres veces lo mismo de distinta forma. Son datos de los clientes del negocio, así que solo
las ve su dueño.

## Medir qué tan bien responde

```bash
npm run eval
```

Corre un conjunto de preguntas escritas como las escribiría un cliente real
([`data/evals/`](data/evals/)) y compara la intención detectada contra la esperada. Agrupa
los fallos por tipo: **no entiende** (cae en el respaldo teniendo la respuesta), **confunde
de tema** (responde con seguridad algo que no se preguntó) y **responde algo que no sabe**.

Hoy el negocio de referencia acierta **98.7 %** (74/75), y Boracay Spa **100 %** (197/197). El piso está enganchado a `npm test`,
así que un cambio que lo baje rompe la suite. El piso se sube cuando un módulo mejora la
comprensión; no se baja para que pase.

## Tests

```bash
npm test
```

200 tests sobre el motor, las sesiones, la API HTTP, la validación de negocios, el
repositorio, la autenticación y autorización, el canal público, las conversaciones y sus
métricas, el endurecimiento de producción y la precisión del bot.

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

> **El QR se escanea con un teléfono**, así que la dirección tiene que ser alcanzable desde
> uno. Si corres PymeBot en tu computador, el QR apuntará a `localhost` y **no funcionará**:
> en el teléfono, `localhost` es el propio teléfono. El panel te avisa y te ofrece la
> dirección de tu red local, que sí sirve para probar desde el celular conectado a la misma
> wifi. Para algo definitivo, despliega con `PYMEBOT_PUBLIC_URL`.

### ¿Y WhatsApp?

Es donde están los clientes, pero **no es donde puedes probar esta semana**. La API de
WhatsApp Business exige verificar la empresa con Meta, un número dedicado, un proveedor y
aprobación de plantillas: días o semanas antes de que un solo cliente escriba.

El link se distribuye igual *por* WhatsApp y funciona hoy. Cuando haya evidencia de que los
clientes usan el bot, WhatsApp pasa a ser una inversión justificada — y será un adaptador
sobre el mismo `POST /api/chat`, no una reescritura.

### Enseñarle el producto a un posible cliente

```bash
npm run build:landing
```

Genera `dist/pymebot.html`: la página para mostrarle PymeBot a un dueño de pyme. Lleva **el
bot funcionando dentro** —motor real, negocio real del repositorio— porque a un dueño de
local no lo convence una captura: lo convence escribir «¿a qué hora abren?» y ver la
respuesta.

Antes de compartirla hay que cambiar dos cosas:

1. **El correo de contacto.** Busca `CAMBIA-ESTO@tucorreo.cl` en `scripts/landing-template.html`.
2. **Los links a los demos**, si los publicas en otra parte:

   ```bash
   npm run build:landing -- dona-elba https://url-del-panel https://url-del-chat
   ```

La página incluye una sección de **lo que todavía no hace**. Está ahí a propósito: promete
menos de lo que el producto entrega y evita que el primer cliente se decepcione en la semana
dos.

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

### El enlace del sitio estático lleva el negocio dentro

En el sitio estático no hay servidor, así que un enlace compartido solo puede funcionar si
transporta la información del negocio. Eso es exactamente lo que hace: el botón
**Compartir** genera una dirección real que abre el chat de ese negocio en cualquier
teléfono. Va después del `#` a propósito — esa parte de la URL el navegador nunca la envía
a ningún servidor, así que los datos del negocio no quedan en registros ajenos.

Sus límites, que conviene conocer antes de usarlo con clientes:

- **El enlace es largo**, porque lleva el negocio dentro. Se manda por WhatsApp sin
  problema. El **código QR se genera de verdad** desde ese enlace y abre el chat al
  escanearlo, pero como un QR admite unos 2.900 caracteres, un bot con muchos temas se
  pasa y el panel lo dice en vez de mostrar un QR que no sirve. Cuando cabe, el panel
  también indica **de qué tamaño imprimirlo**: cuantos más temas, más puntitos tiene y más
  grande hay que imprimirlo para que una cámara lo lea.
- **Si editas el bot, hay que volver a compartirlo.** La información viaja dentro del
  enlace, así que el que ya enviaste sigue con la versión anterior.
- **Las conversaciones de esos enlaces no vuelven.** Sin servidor no hay dónde anotarlas,
  así que no aparecen en la pestaña Conversaciones.

Las tres desaparecen al instalar PymeBot en un servidor: el enlace pasa a ser corto
(`tuservidor.cl/c/tu-negocio`), refleja siempre la última versión, y las conversaciones
llegan al panel.

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

> ⚠️ Usuarios y sesiones se guardan en archivos JSON, y no hay correo de recuperación: la
> contraseña se recupera desde el hosting (ver «El bot de un cliente»). Alcanza para un
> negocio; para muchos habría que pasar a una base de datos. El detalle está en
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
  chat/                ── El chat, sin saber de canales
    atender.js         El núcleo: la frontera que hará posible WhatsApp
    conversaciones.js  Registro en disco, una línea por mensaje
    metricas.js        Qué preguntan y qué no supo responder
  http/                Límite de peticiones y cabeceras de seguridad
  config.js            Toda la configuración de entorno, en un lugar
  arranque.js          Punto de arranque: siembra, escucha y cierra ordenadamente
data/businesses/       La información de cada negocio
data/evals/            Preguntas de prueba para medir la precisión
public/
  chat.*               La página que ve el cliente (/c/<negocio>)
  widget.js            Burbuja para el sitio web del negocio
  panel.*              Panel del dueño
  index.*              Sandbox interno de pruebas
scripts/               Generadores de páginas sin servidor y medidor de precisión
dist/                  Páginas en un solo archivo, sin servidor (generadas)
tests/                 200 tests con el runner nativo de Node
docs/ROADMAP.md        Plan modular completo
docs/CANALES.md        Cómo añadir WhatsApp u otro canal
```

## Mostrar las dos caras: el cliente y el dueño

Para enseñar el producto en dos dispositivos —el chat de **Boracay Spa** en un teléfono y
el panel del dueño en otro— hace falta la versión con servidor. El sitio de la presentación
(rama `main`, GitHub Pages) guarda todo en el navegador, así que un teléfono y un computador
nunca ven las mismas conversaciones.

Al desplegar en Render (abajo), define dos variables:

| Variable | Qué pones |
|---|---|
| `PYMEBOT_DUENO_EMAIL` | El correo con el que entra el dueño |
| `PYMEBOT_DUENO_PASSWORD` | Su contraseña |

Al arrancar, el servidor crea esa cuenta y le deja **Boracay Spa** cargado
(`data/demo/boracay-spa.json`). Si ya existen no toca nada, así que lo que edites desde el
panel se conserva. Después:

- **Dispositivo del cliente:** `https://tu-servidor/c/boracay-spa` (o el QR de la pestaña
  Compartir del panel).
- **Dispositivo del dueño:** `https://tu-servidor/panel.html`, con ese correo y contraseña,
  pestaña **Conversaciones**. Lo que escriba el cliente aparece solo en unos segundos.

Esta rama **no publica en GitHub Pages**: si lo hiciera, reemplazaría el sitio de la
presentación.

## El bot de un cliente

Con `PYMEBOT_DUENO_EMAIL` y `PYMEBOT_DUENO_PASSWORD` definidas, el servidor deja de ser una
plataforma de pruebas y pasa a ser **el bot de ese negocio**:

| | Plataforma (sin esas variables) | Bot de un cliente |
|---|---|---|
| Crear cuentas | Abierto en desarrollo | **Cerrado**: nadie más puede publicar un chat en tu dirección |
| Negocios de ejemplo | Se siembran | **No hay**, y los que hubiera se quitan al arrancar |
| Portada `/` | Sandbox interno, con el motor por dentro | **Abre el chat** del negocio |
| `/api/directory` | Lista los negocios | No disponible |

`PYMEBOT_REGISTRO=abierto` o `cerrado` fuerza el registro en cualquiera de los dos modos.

### Las pruebas de la dueña no cuentan

Si la dueña abre su chat en el mismo navegador donde tiene el panel abierto, el chat se lo
avisa y **esas conversaciones no se guardan**: no ensucian las cifras ni la lista de
«no supo responder». Para el resto, la pestaña **Conversaciones** tiene **Borrar todas las
conversaciones**, para empezar de cero antes de abrir el bot al público.

### Contraseña

- **Cambiarla:** botón **Cambiar contraseña** en el panel. Pide la actual y cierra las
  sesiones en los demás dispositivos.
- **Recuperarla:** cambia `PYMEBOT_DUENO_PASSWORD` en el hosting y vuelve a desplegar. La
  nueva se aplica una vez y cierra todas las sesiones; si después se cambia desde el panel,
  los reinicios no la pisan.

### Seguridad

- **Registro cerrado** en el bot de un cliente (arriba).
- **Fuerza bruta:** límite por IP en el acceso, y bloqueo por correo **e IP** tras 10
  intentos fallidos: quien prueba contraseñas se bloquea a sí mismo, no a la dueña.
- **Contraseñas** con scrypt; el login tarda lo mismo exista o no el correo, para no delatar
  qué correos tienen cuenta.
- **Sesiones** en cookie `httpOnly`, `sameSite=lax` y `secure` en producción; además, toda
  petición que modifica algo y llega desde otro sitio se rechaza (CSRF).
- **Cabeceras:** CSP sin scripts en línea, `X-Frame-Options` en el panel (solo el chat se
  puede incrustar, para el widget), HSTS en producción.
- **Datos de clientes:** las conversaciones solo las ve la dueña. El registro tiene un techo
  de unos 10 MB por negocio, para que nadie pueda llenar el disco a fuerza de mensajes.
- **Errores:** nunca devuelven detalles internos; `/health` solo dice si el servidor está vivo.

### Qué tan bien responde

El motor entiende faltas de ortografía («presios», «masjae»), letras alargadas («holaaa»),
plurales y verbos en plural dentro de frases («¿cuánto duran?»). «Hola», «gracias», «ok» o
«no» solo se contestan como cortesía cuando el mensaje es solo eso: «¿no tienen
estacionamiento?» no es un cierre de conversación. Quien pide hablar con una persona recibe
el contacto del negocio.

Boracay se mide con 197 preguntas en [`data/evals/boracay-spa.json`](data/evals/boracay-spa.json).
Antes de ajustar con ellas, sobre 40 preguntas que el bot nunca había visto acertó 33 (82,5 %):
esa es la cifra honesta para preguntas nuevas. Lo que no sabe —estacionamiento, formas de
pago— lo deriva al WhatsApp en vez de inventar, y aparece en el panel como pendiente.

## Ponerlo en internet

El proyecto viene preparado para desplegarse. Es una aplicación Node normal con **una sola
condición que no se puede saltar: necesita un disco persistente.** Todo vive en archivos
—negocios, cuentas, sesiones, conversaciones— así que sin disco, cada despliegue borra
todo. Eso descarta Vercel y Netlify.

### Opción recomendada: Render

El repositorio trae [`render.yaml`](render.yaml), así que no hay que configurar nada a mano:

1. En Render: **New → Blueprint**, y conecta este repositorio.
2. Render lee `render.yaml` y crea el servicio con su disco de 1 GB montado en `/var/data`.
3. Define **`PYMEBOT_PUBLIC_URL`** con la dirección que te asignó (por ejemplo
   `https://pymebot.onrender.com`). Es la única variable que queda por poner a mano, y sin
   ella el QR y los links compartidos salen mal.

Cuesta unos 7 USD al mes: **el plan gratuito de Render no admite discos**, y sin disco se
perderían todas las cuentas en cada despliegue.

### Alternativa: Fly.io

Trae [`fly.toml`](fly.toml) y [`Dockerfile`](Dockerfile):

```bash
fly launch --no-deploy
fly volumes create pymebot_datos --size 1
fly secrets set PYMEBOT_PUBLIC_URL=https://TU-APP.fly.dev
fly deploy
```

### Variables de entorno

Están todas documentadas en [`.env.example`](.env.example). Las que importan:

| Variable | Para qué |
|---|---|
| `PYMEBOT_PUBLIC_URL` | La dirección pública. Sin ella, el QR puede apuntar a `localhost` |
| `NODE_ENV=production` | Activa las cookies `secure` y las cabeceras de HTTPS |
| `PYMEBOT_DATA_DIR` | Dónde se monta el disco persistente |
| `PYMEBOT_TRUST_PROXY` | Cuántos proxies hay delante (1 en Render, Fly y Railway) |

### Actualizar después

`git push` a la rama conectada. Render y Fly redespliegan solos. El disco **no** se toca:
las cuentas, los negocios y las conversaciones siguen ahí. Al primer arranque con un disco
vacío se copian los negocios de ejemplo; en los siguientes, no se toca nada.

### Una sola instancia

Las sesiones viven en memoria y los datos en disco, así que dos instancias se pisarían.
Para escalar habría que mover ambas cosas a algo compartido — no hace falta hasta tener
bastantes negocios reales.

## Requisitos

Node.js 18 o superior. Sin base de datos, sin claves de API, sin Docker.
