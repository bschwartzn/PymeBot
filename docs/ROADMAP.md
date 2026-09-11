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
| **5** | **Canales / integraciones (WhatsApp)** | El cliente final no está en nuestra web, está en WhatsApp | ⬜ Pendiente |
| **6** | **Agendamiento** | Muchas consultas terminan en "quiero una cita" y hoy no se puede cerrar | ⬜ Pendiente |
| **7** | **Panel, métricas y automatizaciones** | El dueño del negocio no puede administrar ni medir el bot | ⬜ Pendiente |

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

**Siguiente paso:** Módulo 3 — Comprensión y gestión de conversación.
