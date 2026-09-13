# PymeBot — Plan de desarrollo modular

> Documento vivo. Define **qué** se construye, **en qué orden** y **qué se deja fuera**
> deliberadamente. Regla fundamental del proyecto: **si algo se puede resolver de forma
> simple, se resuelve de forma simple.**

---

## 1. Visión del producto

PymeBot es un chatbot que una pequeña empresa (pyme) puede configurar en minutos para
responder automáticamente las preguntas frecuentes de sus clientes (horarios, precios,
ubicación, servicios) y, más adelante, capturar contactos y agendar citas.

**Cliente objetivo:** peluquerías, talleres, clínicas dentales, gimnasios, restaurantes,
tiendas de barrio. Negocios sin equipo técnico.

**Valor a validar en el MVP:** *"¿Un negocio puede cargar su información y ver que el bot
responde bien a sus clientes?"* Nada más. Todo lo demás es posterior.

---

## 2. División definitiva de módulos

Se ajustó ligeramente la propuesta original: el "Módulo 1 = chatbot" y el
"Módulo 2 = base de conocimiento" originales se solapaban (un chatbot sin información no
responde nada). La división real es por **capa técnica**, no por tema:

| # | Módulo | Problema que resuelve | Estado |
|---|--------|----------------------|--------|
| **1** | **Núcleo conversacional + sandbox** | No existe un lugar donde probar el bot ni un ciclo pregunta→respuesta funcionando | ✅ Completado |
| **2** | **Base de conocimiento configurable** | Cada negocio tiene información distinta y hoy está escrita en el código | ✅ Completado |
| **3** | **Comprensión y gestión de conversación** | El bot falla con preguntas mal escritas, ambiguas o encadenadas | ⬅️ **Siguiente** |
| **4** | **Captura de clientes (leads)** | Las conversaciones no generan valor comercial medible | ⬜ Pendiente |
| **5** | **Canales / integraciones** | El cliente final necesita una forma de llegar al bot | 🟡 Chat web, QR y widget ✅ · núcleo listo para WhatsApp ✅ · adaptador pendiente |
| **6** | **Agendamiento** | Muchas consultas terminan en "quiero una cita" y hoy no se puede cerrar | ⬜ Pendiente |
| **7** | **Panel, métricas y automatizaciones** | El dueño del negocio no puede administrar ni medir el bot | 🟡 Cuentas, panel y métricas ✅ · automatizaciones pendientes |

### Módulo 1 — Núcleo conversacional + sandbox

- **Problema:** no hay forma de probar nada. Sin un ciclo cerrado
  *usuario escribe → el bot entiende → el bot responde → se recuerda el contexto*
  ningún otro módulo se puede validar.
- **Funcionalidad mínima:**
  - Interfaz de chat web (sandbox local, no WhatsApp).
  - API `POST /api/chat` que recibe un mensaje y devuelve una respuesta.
  - Motor de intenciones por palabras clave, tolerante a acentos/mayúsculas/plurales.
  - Un archivo `business.json` con la información de un negocio de ejemplo.
  - Memoria de conversación en memoria del proceso (historial por sesión).
  - Respuesta de fallback útil cuando no entiende.
  - Tests automáticos del motor, las sesiones y la API.
- **Fuera de alcance:** LLM, base de datos, login, multi-negocio, WhatsApp.

### Módulo 2 — Base de conocimiento configurable

- **Problema:** la información vivía en un JSON escrito a mano por un desarrollador, y solo
  cabía un negocio por instancia.
- **Entregado:** esquema validado con mensajes en castellano, varios negocios en
  `data/businesses/`, editor web en `/admin.html`, y recarga en caliente.
- **Fuera:** vectores/embeddings, RAG sobre PDFs, multi-idioma, autenticación.
- **Sobre el LLM:** aquí tocaba decidir si añadir Claude como capa de redacción. **Se
  pospuso.** El problema que resuelve M2 es que nadie podía *cargar* su información, no
  cómo se redacta la respuesta; meter un LLM habría tapado eso en vez de resolverlo. Se
  reevalúa en el Módulo 3, cuando ya haya contenido real cargado y se vea qué preguntas
  falla de verdad.

### Módulo 3 — Comprensión y gestión de conversación

- **Problema:** los clientes escriben mal, hacen preguntas encadenadas ("¿y los sábados?")
  y cambian de tema.
- **Funcionalidad mínima:** tolerancia a errores de tipeo, desambiguación
  ("¿te refieres a precios o a horarios?"), seguimiento de la última intención,
  derivación a humano cuando el bot falla dos veces seguidas.
- **Fuera:** memoria de largo plazo entre sesiones, personalidad configurable.

### Módulo 4 — Captura de clientes (leads)

- **Problema:** las conversaciones no dejan un resultado comercial.
- **Funcionalidad mínima:** detectar intención de compra/contacto, pedir nombre + teléfono,
  guardar el lead, exportar a CSV.
- **Fuera:** CRM, scoring, campañas, email marketing.

### Módulo 5 — Canales / integraciones

- **Problema:** el cliente final está en WhatsApp.
- **Funcionalidad mínima:** un adaptador de canal (`channels/whatsapp.js`) que traduce
  webhooks al mismo `POST /api/chat`. El núcleo **no cambia**.
- **Fuera:** Instagram, Messenger, voz, multi-número.

### Módulo 6 — Agendamiento

- **Funcionalidad mínima:** horarios disponibles definidos por el negocio, reserva de un
  bloque, confirmación y cancelación.
- **Fuera:** Google Calendar, pagos, recordatorios automáticos, recursos múltiples.

### Módulo 7 — Panel, métricas y automatizaciones

- **Funcionalidad mínima:** panel del dueño (conversaciones, preguntas sin respuesta,
  leads), y automatizaciones simples (recordatorios, seguimiento).

---

## 3. Dependencias entre módulos

```
        ┌─────────────────────────────┐
        │ M1 Núcleo + Sandbox         │  ← base de todo
        └──────────────┬──────────────┘
                       │
        ┌──────────────▼──────────────┐
        │ M2 Base de conocimiento     │
        └──────────────┬──────────────┘
                       │
        ┌──────────────▼──────────────┐
        │ M3 Comprensión/conversación │
        └───────┬─────────────┬───────┘
                │             │
      ┌─────────▼──────┐  ┌───▼──────────────┐
      │ M4 Leads       │  │ M5 WhatsApp      │   (paralelizables)
      └─────────┬──────┘  └───┬──────────────┘
                │             │
        ┌───────▼─────────────▼───────┐
        │ M6 Agendamiento             │
        └──────────────┬──────────────┘
                       │
        ┌──────────────▼──────────────┐
        │ M7 Panel y automatizaciones │
        └─────────────────────────────┘
```

- **M2 → M1:** necesita el motor y la API ya funcionando.
- **M3 → M2:** no tiene sentido mejorar la comprensión sin contenido real que entender.
- **M4 y M5 → M3:** ambos dependen de que la conversación sea confiable, pero **entre
  ellos son independientes** y pueden desarrollarse en paralelo.
- **M6 → M4:** agendar necesita saber quién es el cliente (nombre/teléfono).
- **M7 → todos:** mide y administra lo que los demás producen.

---

## 4. Por qué el Módulo 1 va primero

1. Es el único módulo del que **dependen todos los demás**.
2. Es el que permite **ver el producto funcionando hoy** y enseñárselo a un dueño de pyme.
3. Define los **dos contratos** que el resto del sistema reutilizará sin cambios:
   `POST /api/chat` (canal ↔ núcleo) y `business.json` (negocio ↔ motor). Con esos dos
   contratos estables, WhatsApp (M5) es un adaptador y no una reescritura.
4. Es barato de tirar a la basura si la idea no funciona.

---

## 5. Decisiones técnicas (y por qué son simples)

| Decisión | Elección | Motivo |
|---|---|---|
| Lenguaje | Node.js + JavaScript | Sin compilación, sin tipos, arranca en un comando |
| Servidor | Express | Una sola dependencia; los webhooks de M5 la necesitarán igual |
| Frontend | HTML/CSS/JS plano | Sin React, sin bundler, sin build |
| Persistencia | Ninguna (memoria) | El MVP no necesita recordar entre reinicios |
| Motor NLU | Palabras clave normalizadas | Determinista, testeable, cero costo, cero latencia |
| Tests | `node --test` nativo | Sin Jest ni configuración |

### Por qué el MVP **no** usa un LLM todavía

No es una renuncia, es una secuencia. Un motor determinista se puede testear
("esta pregunta debe dar esta respuesta"), no cuesta dinero, no falla por red y obliga a
definir bien la base de conocimiento. Una vez que el contenido esté bien estructurado (M2),
añadir Claude encima es un cambio contenido en un solo archivo, con el motor de palabras
clave como respaldo. Empezar por el LLM habría escondido el problema real, que es el
contenido, no la redacción.

---

## 6. Qué queda explícitamente FUERA de la primera versión

Integración con WhatsApp · agendamiento y reservas · pagos · base de datos · login y
usuarios · multi-negocio · panel de administración · métricas y analítica · LLM ·
embeddings/RAG · multi-idioma · notificaciones · CRM · Docker/Kubernetes · CI/CD ·
tests end-to-end con navegador.

---

## 7. Definición de "módulo terminado"

Un módulo solo se considera cerrado cuando:

1. Hace lo que dice su funcionalidad mínima.
2. Tiene tests automáticos que pasan (`npm test`).
3. Se probó a mano en el sandbox.
4. Los errores encontrados están corregidos (y documentados en el registro de abajo).
5. Está commiteado y pusheado.

---

## 8. Registro de módulos

### Módulo 1 — Núcleo conversacional + sandbox — ✅ COMPLETADO

**Entregado**

- Motor de intenciones (`src/bot/engine.js`) con normalización de español, puntuación
  ponderada y umbral de confianza.
- Gestor de sesiones en memoria (`src/bot/sessions.js`) con expiración e historial acotado.
- API HTTP (`src/server.js`): `POST /api/chat`, `POST /api/reset`, `GET /api/business`, `GET /health`.
- Sandbox web (`public/`) sin frameworks ni build.
- Negocio de ejemplo con 11 intenciones (`src/config/business.json`).
- Sandbox autocontenido en un solo archivo (`dist/sandbox.html`), generado desde el
  código fuente por `scripts/build-sandbox.js`, para probar el bot sin instalar nada.
- 56 tests automáticos (`npm test`) + validación manual en navegador con Chromium
  (tema claro, tema oscuro y móvil).

**Errores detectados durante la validación y corregidos**

| # | Problema | Cómo apareció | Corrección |
|---|----------|---------------|------------|
| 1 | `npm test` fallaba: Node 22 intentaba cargar `tests/` como módulo | Primera ejecución de la suite | El script usa el glob `tests/*.test.js` |
| 2 | La `ñ` se destruía al quitar acentos: `mañana` → `manana`, `año` → `ano` | Test de normalización | Se protege la `ñ` antes de descomponer con NFD y se restaura después |
| 3 | Un mensaje de solo emojis (`🙂`) respondía *"No recibí ningún mensaje"*, aunque el cliente sí había escrito | Conversación manual contra la API | Si el texto queda vacío tras normalizar pero el mensaje traía contenido, se responde el fallback normal |
| 4 | `"quiero cortarme el pelo"` caía en el fallback | Conversación manual | Palabras clave añadidas a la intención de servicios (`cortar`, `pelo`, `cabello`, `mechas`…) |
| 5 | Responder `"no"` u `"ok"` disparaba la lista completa de temas | Conversación manual | Nueva intención `cierre` para cerrar el intercambio con naturalidad |
| 6 | `"no, gracias"` ganaba `agradecimiento`, que contesta *"¿Necesitas algo más?"* → bucle | Conversación manual | La frase `no gracias` pasa a la intención `cierre`, que puntúa más alto |
| 7 | 404 en la consola del navegador por el favicon | Validación en Chromium | Favicon SVG embebido en el HTML |
| 8 | El saludo inicial y la respuesta a `"hola"` repetían la misma lista de temas | Validación en Chromium | Se acortó la respuesta de la intención `saludo` |
| 9 | El sandbox solo corría en `localhost`, así que no se podía probar desde otra máquina | Al intentar abrirlo | Build que empaqueta el mismo motor en un HTML autocontenido, con tests que impiden que se desincronice del código fuente |

**Decisiones de diseño previstas desde el inicio** (no fueron errores, pero sostienen la
calidad del módulo): normalización de acentos, mayúsculas y signos `¿ ¡`; tolerancia al
plural del español; puntaje ponderado por longitud y por frases de varias palabras;
expiración de sesiones a los 30 min; validación de entrada en la API (mensaje obligatorio
y máximo de 1.000 caracteres).

**Limitaciones conocidas que se resuelven en módulos posteriores**

- No tolera errores de tipeo (`graciassss` no matchea) → **Módulo 3**.
- No entiende preguntas encadenadas (`"¿y los sábados?"` sin contexto) → **Módulo 3**.
- La información del negocio se edita a mano en un JSON → **Módulo 2**.
- Un solo negocio por instancia → **Módulo 2**.
- Las conversaciones se pierden al reiniciar el servidor → **Módulo 7**.

**Siguiente paso:** Módulo 2 — Base de conocimiento configurable.

---

### Módulo 2 — Base de conocimiento configurable — ✅ COMPLETADO

**Entregado**

- Validador de negocios (`src/knowledge/schema.js`): distingue **errores** (impiden guardar,
  explicados en castellano y sin jerga) de **advertencias** (dejan guardar, pero avisan de
  lo que hará que el bot responda mal).
- Repositorio en disco (`src/knowledge/repository.js`): un JSON por negocio, escritura
  atómica y validación del identificador para que una ruta no pueda escaparse del
  directorio de datos.
- API de administración: `GET/POST /api/businesses`, `GET/PUT/DELETE /api/businesses/:slug`.
- Editor web en `/admin.html`: identidad, mensajes del bot, temas sugeridos y las preguntas
  con sus palabras clave. Crear, editar, eliminar y saltar al chat a probar.
- Selector de negocio en el sandbox, tanto en el servidor como en el archivo autocontenido.
- Dos negocios de ejemplo de rubros distintos (peluquería y taller mecánico).
- 96 tests (40 nuevos) + validación manual del editor completo en Chromium.

**Recarga en caliente sin mecanismo de recarga en caliente**

El repositorio no tiene caché: cada pregunta lee el archivo del negocio. Para el volumen de
un MVP el costo es irrelevante, y a cambio un cambio guardado en el editor aplica en la
siguiente pregunta sin invalidar nada ni reiniciar el servidor. Es la solución simple, y hay
un test que la verifica de punta a punta.

**Errores detectados durante la validación y corregidos**

| # | Problema | Cómo apareció | Corrección |
|---|----------|---------------|------------|
| 1 | El validador advertía que `"no"` y `"ok"` eran demasiado cortas para coincidir, pero en el Módulo 1 se verificó que **sí** coinciden | Al validar el negocio de ejemplo | El criterio era equivocado: el riesgo no es la longitud sino que una palabra vacía (`de`, `la`, `que`) coincida con todo. Se cambió la advertencia por una lista de palabras vacías que excluye señales útiles como `no` u `ok` |
| 2 | Una palabra clave vacía y además repetida generaba la misma advertencia dos veces | Al probar el validador | Se avisa una sola vez por palabra y por intención |
| 3 | Un test de recorrido de rutas era un placeholder que no probaba nada | Al releer la suite | Reemplazado por una prueba real vía HTTP con rutas codificadas, que además verifica que no se creó ningún archivo fuera del directorio de datos |
| 4 | `GET /health` seguía devolviendo un solo negocio | Al pasar a multi-negocio | Ahora informa cuántos negocios hay cargados |

**Falsos hallazgos** (fallaron mis pruebas, no el producto): edité la intención `saludo`
creyendo que era `horarios` y concluí que la recarga en caliente no funcionaba; y leí el
estado del editor a mitad de un flujo asíncrono. Ambos se volvieron a medir bien y el
comportamiento era correcto.

**Limitaciones conocidas**

- **El editor no pide contraseña.** Es para uso local. No lo expongas en internet tal cual;
  la autenticación llega con el panel del Módulo 7. El propio editor lo advierte en pantalla.
- Los negocios se guardan como archivos: sirve para un MVP, no para cientos de clientes.
- No hay historial de cambios ni forma de deshacer una edición.
- Sigue sin tolerar errores de tipeo ni preguntas encadenadas → **Módulo 3**.

---

### Negocio de referencia y evaluación — ✅ COMPLETADO

Antes de empezar el Módulo 3 hacía falta algo contra qué medirlo. Se construyó un negocio
configurado a fondo y una forma de medir los errores en vez de buscarlos a ojo.

**Negocio de referencia:** `data/businesses/dona-elba.json` — una cocinería chilena con **27
intenciones**, elegida porque un restaurante recibe las preguntas más variadas y coloquiales
de cualquier rubro: alergias, celiaquía, mascotas, accesibilidad, delivery, terraza, eventos,
espera los fines de semana. Es el rubro que más presiona al motor.

**Evaluación:** `data/evals/` + `npm run eval`. Un conjunto de preguntas escritas como las
escribiría un cliente real, con la intención que se espera de cada una. El informe agrupa los
fallos por tipo, porque no todos duelen igual:

| Tipo de fallo | Qué significa | Gravedad |
|---|---|---|
| **no entiende** | Cae en el respaldo teniendo la respuesta configurada | Media: el cliente ve los temas y reintenta |
| **confunde de tema** | Responde con seguridad algo que no se preguntó | Alta: el cliente se lleva información equivocada |
| **responde algo que no sabe** | Inventa cobertura que el negocio no tiene | Alta |

**Resultado**

| | Precisión |
|---|---|
| Medición inicial | 85.3 % (64/75) |
| Tras corregir lo encontrado | **98.7 % (74/75)** |
| Conjunto de regresión (peluquería) | 100 % (19/19) |

El piso de precisión está enganchado a `npm test`: un cambio que lo baje rompe la suite. **El
piso se sube cuando un módulo mejora la comprensión; no se baja para que pase.**

**Errores detectados y corregidos**

| # | Problema | Corrección |
|---|----------|------------|
| 1 | `"hacen cumpleaños?"` no encontraba la palabra clave `"cumpleanos"` — consecuencia directa de preservar la ñ en el Módulo 1 | Se separó **normalizar** de **comparar**: `normalize` conserva la ñ (para mostrar y depurar), y `fold` la pliega solo al comparar. Confundir `año` con `ano` es un riesgo teórico; que no coincidan las palabras clave escritas sin ñ pasa todos los días |
| 2 | La app de delivery estaba escrita `pedidoya` en vez de `pedidosya` | Corregida. La clase de error que un dueño de negocio comete constantemente, y que sin medición no se detecta |
| 3 | Los nombres de los platos no eran palabras clave: `"tienen pastel de choclo?"` caía en el respaldo | Agregados a la carta |
| 4 | Faltaban palabras clave en 5 intenciones más (`trabajan`, `bebe`, `dividir la cuenta`, `caben`, `carne`) | Agregadas |
| 5 | `"tienen carta de vinos"` respondía la carta de comida | La frase `carta de vinos` pasa a bebidas, donde puntúa más alto que la palabra suelta |
| 6 | Los tests de la API del Módulo 1 dependían de cuál fuera el negocio por defecto en `data/` | Ahora traen su propio negocio en un directorio temporal |
| 7 | El sandbox autocontenido tenía un botón `"¿tienen wifi?"` escrito a mano para demostrar el respaldo, pero la cocinería **sí** tiene wifi configurado | Retirado: dependía del negocio y había dejado de demostrar nada |

**Caso de prueba retirado, y por qué.** Uno de los casos esperaba que
`"cual es el wifi del hotel de al lado"` cayera en el respaldo. Entender *"del hotel de al
lado"* exige resolver una referencia, y responder «sí, tenemos wifi» tampoco es absurdo: la
expectativa era injusta. Se reemplazó por una pregunta fuera de tema honesta
(`"hacen clases de cocina?"`). Queda anotado para que no parezca que se borró un caso
incómodo.

**El fallo que queda, y por qué no se arregla aquí**

`"cuanto sale la colacion"` responde **precios** en vez de **menú del día**. Las dos
intenciones coinciden legítimamente: `cuanto sale` es el tipo de pregunta y `colación` es el
tema. Distinguirlas exige entender cuál de las dos manda, y eso es precisamente lo que un
motor de palabras clave no puede hacer. **Es la evidencia concreta que justifica el Módulo 3**,
y el número contra el que ese módulo tendrá que demostrar que mejora algo.

(El cliente no queda mal atendido: la respuesta de precios menciona el menú del día y su
valor. Pero la intención es la equivocada.)

**Qué dice la medición sobre el LLM.** Con el contenido bien cargado, el motor determinista
llega a 98.7 % y el único fallo que queda es de desambiguación. Eso acota el trabajo del
Módulo 3: el problema no es entender el español, es elegir entre dos temas que compiten. Antes
de meter un modelo conviene probar si una regla de desempate lo resuelve — y ahora hay con qué
medirlo.

---

### Panel del dueño y cuentas — ✅ COMPLETADO

Se adelantó del Módulo 7 a petición del usuario, y estaba bien traerlo: **el editor no pedía
contraseña y cualquiera podía editar cualquier negocio.** Era la limitación más seria que
arrastraba el proyecto.

**Entregado**

- Registro e inicio de sesión con correo y contraseña (`src/auth/`).
- Cada negocio tiene dueño. Un dueño solo ve y edita los suyos.
- Panel en `/panel.html` con cuatro secciones: Identidad, Preguntas, Mensajes y
  Comportamiento.
- Copiar un ejemplo a la cuenta propia, para no empezar en blanco.
- 22 tests nuevos (126 en total), la mayoría sobre seguridad.

**Decisiones de seguridad**

| Decisión | Por qué |
|---|---|
| `scrypt` de Node, con sal por usuario y costo guardado dentro del hash | Sin dependencias nativas; el costo se puede subir después sin invalidar las contraseñas viejas |
| Comparación en tiempo constante (`timingSafeEqual`) | Comparar con `===` filtra información por lo que tarda en fallar |
| Token de sesión opaco de 32 bytes, guardado en el servidor | Se puede **revocar de verdad**: cerrar sesión invalida el token, no solo borra la cookie del navegador |
| Cookie `httpOnly`, `sameSite=lax`, `secure` en producción | `httpOnly` impide que un XSS robe la sesión; `sameSite` es la base contra CSRF |
| Un negocio ajeno responde **404**, no 403 | Decir «existe pero no es tuyo» ya le confirma a un desconocido qué negocios hay dados de alta |
| Correo inexistente y contraseña errónea dan el **mismo** mensaje | Mensajes distintos permiten enumerar qué correos están registrados |
| El `ownerId` se toma de la sesión, nunca del cuerpo de la petición | Si no, cualquiera se apropiaría de un negocio ajeno mandando otro `ownerId`. Hay un test que lo intenta |
| Bloqueo tras 10 intentos fallidos en 15 minutos | Freno a la fuerza bruta |
| `data/users.json` y `data/sessions.json` en `.gitignore` | Las cuentas no pueden acabar en el repositorio |

**Configuración del bot: solo lo que cambia el comportamiento**

Se descartó llenar el panel de interruptores decorativos. Cada ajuste hace algo real:

| Ajuste | Qué cambia de verdad |
|---|---|
| **Bot activo / pausado** | Pausado, el motor ni siquiera intenta entender: responde el mensaje que dejó el dueño, con intención `pausado` |
| **Nivel de exigencia** | Es el umbral de confianza, que hasta ahora era una constante del código. Subirlo hace que el bot responda menos pero se equivoque menos |
| **Mensaje con el bot apagado** | Lo que contesta mientras está pausado |
| **Derivar a una persona** | Se muestra junto al mensaje de «no entendí» |

**Errores detectados durante la validación y corregidos**

| # | Problema | Cómo apareció | Corrección |
|---|----------|---------------|------------|
| 1 | **La pantalla de acceso no se ocultaba al entrar**: quedaba encima del panel, y un clic en «Guardar» caía en realidad en el botón «Entrar» | Manejando el panel en Chromium | `.acceso { display: grid }` le ganaba al `[hidden]` del navegador, que viene de su hoja de estilos. Se agregó `[hidden] { display: none !important }` |
| 2 | Los campos de correo y contraseña salían sin ningún estilo | En la captura de la pantalla de acceso | El selector era `input[type="text"]`, que no cubre `email` ni `password`. Se cambió por uno que cubre todos los campos de escritura |
| 3 | El test de recorrido de rutas contaba archivos del directorio antes de registrar al dueño, y el registro crea `users.json` y `sessions.json` ahí mismo | Al pasar los tests del Módulo 2 a usar sesión | La foto se toma después, y compara los nombres, no la cantidad |

**Falsos hallazgos** (fallaron mis pruebas, no el producto): esperé que apareciera un bloque
de preguntas que estaba correctamente oculto porque no era la sección abierta; y afirmé que
el umbral no funcionaba con un mensaje que puntuaba 5.5, por encima de cualquier exigencia.
Ambos se volvieron a medir aislando el caso.

**Limitaciones conocidas**

- **No hay verificación de correo ni recuperación de contraseña.** Quien se registra queda
  dentro de inmediato. Para producción hacen falta ambas.
- **Sin protección CSRF explícita.** Hoy se apoya en `sameSite=lax` y en que la API solo
  acepta JSON, lo que cubre el caso normal. Si en el futuro se aceptan formularios
  tradicionales, hará falta un token.
- Usuarios y sesiones en archivos JSON: sirve para un MVP, no para miles de cuentas.
- No hay roles ni equipos: un negocio, un dueño.
- Sin registro de cambios ni forma de deshacer una edición.

---

### Canal del cliente: link público, QR y widget — ✅ COMPLETADO

**La pregunta era cómo llega el cliente final al bot.** La respuesta corta: un link por
negocio. La larga está abajo.

**Por qué el link y no WhatsApp (todavía)**

WhatsApp es donde están los clientes, pero no es donde se puede probar esta semana. La API
de WhatsApp Business exige verificar la empresa con Meta, un número dedicado, un proveedor
(Twilio, 360dialog o la Cloud API), aprobación de plantillas y costo por conversación. Son
días o semanas de trámite **antes de que un solo cliente escriba**. Para validar la idea eso
es un bloqueo, no un canal.

El link se distribuye igual **por** WhatsApp: el dueño lo pega en su estado, su bio de
Instagram, su ficha de Google o un QR en el mesón. Cero trámites, funciona hoy.

Cuando haya evidencia de que los clientes usan el bot, WhatsApp deja de ser una apuesta y
pasa a ser una inversión justificada. Y el trabajo ya está acotado: `POST /api/chat` sigue
siendo el único punto de entrada, así que WhatsApp será un adaptador que traduce el webhook
a esa misma llamada. El núcleo no cambia.

**Entregado**

- **Página del cliente en `/c/<negocio>`**: una sola página para todos los negocios; el slug
  se lee de la URL. Dar de alta un negocio nuevo no requiere generar ni desplegar nada.
- Diseñada para el teléfono: `100dvh` en vez de `vh` (la barra del navegador móvil cambia de
  alto), campo de texto de 16px exactos (menos que eso hace que Safari en iPhone haga zoom al
  enfocar), y `env(safe-area-inset-*)` para el notch.
- La conversación sobrevive a recargar la página (`sessionStorage`).
- **Código QR** en SVG, para imprimir y dejar en el mesón o la mesa.
- **Widget** para el sitio web del negocio: una línea de `<script>`. Va en un iframe a
  propósito, para que los estilos del sitio y los del chat no se pisen en ninguna dirección,
  y el iframe se carga recién al abrir la burbuja, no al entrar al sitio.
- **Sección "Compartir"** en el panel: el link, el QR descargable, el código para la web, un
  enlace de WhatsApp listo y consejos de dónde ponerlo.
- 12 tests nuevos (138 en total).

**Errores detectados durante la validación y corregidos**

| # | Problema | Cómo apareció | Corrección |
|---|----------|---------------|------------|
| 1 | **Un link roto mostraba el bot de otra empresa.** `/c/no-existe` caía silenciosamente al negocio por defecto | Probando la página del cliente en el navegador | Se separó «no se pidió ninguno» (sandbox: usa el por defecto) de «se pidió uno y no existe» (404). Un QR mal impreso o un negocio dado de baja no puede terminar dando las respuestas de otro negocio |
| 2 | `npm audit` reportaba un DoS por *query string* en `qs`, dependencia de Express — justo la superficie que se iba a exponer | Antes de abrir el servidor al público | Express 4 → 5, más un `override` de `qs` a 6.16.0, que Express todavía no fija. Cero vulnerabilidades |

**Limitaciones conocidas**

- **La página del cliente es pública y no tiene límite de peticiones.** Antes de exponerla a
  internet de verdad conviene poner un límite por IP en `POST /api/chat`.
- El widget no recuerda la conversación entre visitas al sitio.
- El archivo autocontenido (`npm run build:chat`) no permite editar desde el panel: hay que
  regenerarlo. Y no guarda ninguna conversación.

---

### Demo del panel sin servidor — ✅ COMPLETADO

**Para qué.** Para probar con conocidos hacía falta enseñar también **lo que ve el dueño**, no
solo el chat del cliente. Saber si un dueño de pyme entiende el concepto de «palabras clave»
es la reacción más valiosa que se puede recoger en esta etapa, y no se obtiene mostrando el
chat.

**Cómo está hecho.** `dist/demo.html` no es una maqueta: se toman el HTML, el CSS y el
JavaScript **reales** del panel, sin tocarlos, y se sustituye únicamente `fetch` por una
implementación sobre `localStorage`. El panel no se entera de que no hay servidor. La
validación es la de `src/knowledge/schema.js` y el bot de la vista previa es el de
`src/bot/`. **El demo no puede desviarse del producto, porque es el producto.**

Añade una vista previa lateral que renderiza el chat del cliente con los cambios **sin
guardar**, para ver el efecto de editar una respuesta al momento.

**Lo que se simula, y por qué se dice en pantalla**

| Simulado | Por qué |
|---|---|
| La persistencia (queda en el navegador) | No hay servidor |
| El inicio de sesión: no comprueba la contraseña | No hay forma de guardar un hash con seguridad en el navegador. Fingir una comprobación daría una impresión equivocada de cómo funciona el producto |
| El QR | No hay una dirección real que codificar |

**Errores detectados durante la validación y corregidos**

| # | Problema | Cómo apareció | Corrección |
|---|----------|---------------|------------|
| 1 | La vista previa funcionaba la primera vez y fallaba la segunda: `Identifier 'CONFIDENCE_THRESHOLD' has already been declared` | Al abrirla dos veces seguidas | `document.open()` no limpia el ámbito global del iframe, así que al reescribir chocaban las constantes del motor. Ahora cada apertura estrena un iframe |
| 2 | Quitar el botón de descargar el QR dejaba la pestaña Compartir a medio llenar | Error de consola al abrir Compartir | `panel.js` le asigna propiedades y lo encontraba nulo. Se oculta en vez de quitarlo |

**Falso hallazgo:** mi script de prueba buscaba `.msg.error` sin acotar y encontraba los
avisos ocultos de la pantalla de acceso. Es la segunda vez que el mismo descuido me confunde;
los selectores de prueba van acotados a su contenedor.

---

### Corrección: el código QR — ✅

Reportado por el usuario: «el código QR no funciona». Eran **dos fallos distintos**, y el
importante no era el del demo.

**1. En el producto real: un QR que un teléfono nunca podría abrir.**

Corriendo PymeBot en local, el QR codificaba `http://localhost:3000/c/...`. Se genera
correctamente y se ve perfecto, pero es inservible: en el teléfono que lo escanea,
`localhost` es el propio teléfono. Cualquiera que probara el producto en su máquina se
habría encontrado con esto.

Corregido: el panel detecta que la dirección solo existe en el computador del dueño, lo
avisa, y ofrece la dirección del servidor **dentro de la red local** —que un teléfono en la
misma wifi sí puede abrir— con un botón para cambiar el QR a esa dirección.

Al validarlo apareció un segundo fallo dentro del primero: la dirección de red usaba el
puerto de `process.env.PORT` en vez del puerto en que el servidor realmente escucha, así que
sugería `:3000` cuando corría en `:3100`. Ahora sale de la petición.

**2. En el demo: el QR apuntaba a un dominio inventado, sin decirlo.**

Apuntaba a `tu-servidor.cl`, que no existe. Y —error mío— **afirmé que el demo lo advertía
en pantalla; no lo hacía.** Esa advertencia estaba solo en la documentación.

Aquí hay un límite real que conviene dejar escrito: **en el demo es imposible un QR del
negocio que se está editando.** Los negocios del demo viven en el `localStorage` de ese
navegador, así que un teléfono que escaneara un enlace al propio demo abriría uno vacío. Y
meter el negocio dentro del QR tampoco sirve: un negocio configurado pesa ~8 KB y un QR
admite ~1,6 KB.

Corregido de la única forma honesta: el QR del demo apunta a un chat publicado de verdad
—se escanea y abre un bot que funciona— y la tarjeta dice en pantalla que es un ejemplo y
que en PymeBot instalado apunta a la dirección del propio negocio.

**Cómo se verificó.** No bastaba con comprobar que se generara un SVG: eso ya pasaba cuando
el QR estaba mal. Se rasterizaron los tres QR en Chromium y se **decodificaron** con un
lector, como lo haría la cámara de un teléfono. Los tres devuelven la dirección correcta.
Para la suite quedó un test más barato que compara el SVG generado con el de la URL esperada:
al ser determinista, coincidir prueba que codifica esa dirección y no otra.

---

### Página para posibles clientes — ✅ COMPLETADO

`dist/pymebot.html`. Lo que faltaba no era otra herramienta, sino una página que **explique**
el producto a un dueño de pyme, que no es el mismo público que el cliente final ni el mismo
que el dueño ya convencido.

**La decisión de diseño que carga la página:** el héroe no es una captura ni un vídeo, es
**el bot funcionando**, con el motor real y la Cocinería Doña Elba cargada. Un dueño de local
escribe «¿puedo ir con mi perro?» y ve la respuesta antes de leer una línea de venta. Se
generó desde `src/`, como todo lo demás, así que la página no puede prometer un bot distinto
del que existe.

**Lo que deliberadamente NO lleva**

Ni testimonios, ni logos de clientes, ni métricas inventadas, ni «+300 pymes confían en
nosotros». Nada de eso existe y ponerlo sería mentir. En su lugar, la barra dice «en
desarrollo, buscando negocios para probarlo» y el pie dice que **todavía no hay clientes**.
Para vender a un dueño de local, ser el primero es una oferta legítima; fingir que hay
trescientos es un riesgo innecesario.

Lleva además una sección entera de **«lo que todavía no hace»**: que no contesta dentro de
WhatsApp, que no agenda horas, que se equivoca con frases enredadas. Prometer menos de lo que
el producto entrega es lo que evita que el primer cliente se decepcione en la semana dos.

**Pendiente antes de compartirla:** el correo de contacto es un marcador
(`CAMBIA-ESTO@tucorreo.cl`) que hay que reemplazar.

---

### De prototipo a producto desplegable — ✅ COMPLETADO

**Fase 1 — Preparar el despliegue.** Seis huecos que el MVP no tenía cubiertos:

| Hueco | Por qué importaba |
|---|---|
| La ruta de datos estaba fija junto al código | En un hosting, **cada despliegue habría borrado todas las cuentas y negocios**. Ahora se monta un disco en `PYMEBOT_DATA_DIR` |
| Sin `trust proxy` | `req.ip` habría sido la del proxy: todos los visitantes compartiendo un contador y el límite inservible |
| Sin límite de peticiones | El chat público estaba a punto de difundirse sin ninguno |
| Sin cierre ordenado | El hosting manda SIGTERM al desplegar; sin atenderlo, una escritura a medias puede corromper un archivo de negocio |
| Sin cabeceras de seguridad | La decisión que importa: el chat del cliente **sí** puede ir en un iframe ajeno —es el widget— y el panel **no**, porque permitiría montarle una página encima (clickjacking) |
| Un disco nuevo llega vacío | El panel habría aparecido sin nada y el chat daría 503. Se siembran los ejemplos, y **solo la primera vez** |

**Fase 2 — Verificación.** Docker CLI está disponible pero **sin demonio**, así que la
imagen no se pudo construir aquí. Se verificó lo que sí se puede, que es lo que importa: la
aplicación corriendo en modo producción sobre un disco vacío, la siembra, la salud, las
cabeceras correctas por ruta, el límite cortando en el número exacto con `Retry-After`, el
cierre limpio ante SIGTERM, y una instalación con `npm ci --omit=dev` sirviendo chat, QR y
todas las páginas.

**Fases 5 y 6 — El chat y la puerta para WhatsApp.**

Se extrajo `atender()` (`src/chat/atender.js`): el núcleo de la conversación, sin HTTP
dentro. `POST /api/chat` pasó a ser un adaptador delgado del canal web. **Lo único que
distingue un canal de otro es `idExterno`**: en la web, lo que guarda el navegador; en
WhatsApp, el número de teléfono. Documentado en [`docs/CANALES.md`](CANALES.md).

Las conversaciones se anotan en disco (JSONL, una línea por mensaje, añadiendo al final:
barato y resistente a un corte). Sobreviven a los reinicios y alimentan la pestaña
**Conversaciones** del panel.

**La decisión de producto de esta fase:** la métrica principal no es cuántos mensajes
recibió el negocio, sino **qué preguntas su bot no supo responder**. Cada una es una
respuesta que le falta cargar, y viene con un botón que la convierte en pregunta
configurada, con las palabras clave ya rellenadas. El bot falla → el dueño lo ve → lo
arregla en dos minutos. Ese círculo es el que hace que el producto mejore solo con usarlo.

**Errores detectados durante la validación y corregidos**

| # | Problema | Cómo apareció | Corrección |
|---|----------|---------------|------------|
| 1 | Al extraer el núcleo, el corte se llevó por delante las rutas `/c/:slug` y del QR, que vivían entre medio | 7 tests en rojo | Restauradas. Los tests las cazaron de inmediato |
| 2 | Un fallo al anotar la conversación dejaba al cliente **sin respuesta** | Un test mío afirmaba lo contrario de lo que decía su nombre | Anotar va en `try/catch`: perder una línea de estadística es tolerable, dejar a un cliente sin respuesta no |
| 3 | Las palabras clave prellenadas llegaban con signos (`cigarros?`) y el identificador venía vacío, así que chocaba con uno existente y el guardado fallaba | Probando el círculo en el navegador | Se limpian los signos y se propone un identificador que no choque |
| 4 | Las barras de «temas más preguntados» no se dibujaban | En la captura del panel | `.relleno` era un `<span>` dentro de un contenedor no-flex, así que seguía siendo inline y el alto no le aplicaba. Y la pista gris no contrastaba sobre la tarjeta |

**Lo que queda fuera del alcance de este entorno**

El despliegue en sí. No hay credenciales de ningún hosting ni demonio de Docker, así que
crear el servicio es un paso que hace el dueño del proyecto. Todo lo demás —configuración,
planos de despliegue, endurecimiento y verificación— está hecho.

**Siguiente paso:** Módulo 3 — Comprensión y gestión de conversación.
