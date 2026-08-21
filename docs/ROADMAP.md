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
| **1** | **Núcleo conversacional + sandbox** | No existe un lugar donde probar el bot ni un ciclo pregunta→respuesta funcionando | ✅ **En desarrollo (actual)** |
| **2** | **Base de conocimiento configurable** | Cada negocio tiene información distinta y hoy está escrita en el código | ⬜ Pendiente |
| **3** | **Comprensión y gestión de conversación** | El bot falla con preguntas mal escritas, ambiguas o encadenadas | ⬜ Pendiente |
| **4** | **Captura de clientes (leads)** | Las conversaciones no generan valor comercial medible | ⬜ Pendiente |
| **5** | **Canales / integraciones (WhatsApp)** | El cliente final no está en nuestra web, está en WhatsApp | ⬜ Pendiente |
| **6** | **Agendamiento** | Muchas consultas terminan en "quiero una cita" y hoy no se puede cerrar | ⬜ Pendiente |
| **7** | **Panel, métricas y automatizaciones** | El dueño del negocio no puede administrar ni medir el bot | ⬜ Pendiente |

### Módulo 1 — Núcleo conversacional + sandbox ⬅️ **empezamos aquí**

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

- **Problema:** hoy la información vive en un JSON escrito a mano por un desarrollador.
- **Funcionalidad mínima:** esquema de negocio validado, carga de varios negocios,
  formulario web simple para editar la información, recarga en caliente.
- **Se evalúa aquí (no antes):** añadir un LLM (Claude) como capa de redacción sobre la
  información recuperada — *retrieval primero, generación después*. El LLM se activa por
  variable de entorno y el motor de palabras clave queda como respaldo si falla la API.
- **Fuera:** vectores/embeddings, RAG sobre PDFs, multi-idioma.

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
- 54 tests automáticos (`npm test`) + validación manual en navegador con Chromium.

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
