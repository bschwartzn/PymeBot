# Añadir un canal nuevo (por ejemplo, WhatsApp)

El chat web y WhatsApp no son dos productos: son dos **puertas** al mismo bot. Este
documento explica dónde está la frontera y qué hay que escribir para abrir otra puerta.

## La frontera

```
  Canal (adaptador)                 Núcleo (no sabe de canales)
  ─────────────────                 ───────────────────────────
  POST /api/chat        ─┐
  (navegador)            │
                         ├──────►   atender({ texto, negocio, slug, canal, idExterno })
  POST /webhooks/wa     ─┘               │
  (WhatsApp, futuro)                     ├─► motor de intenciones   (src/bot/)
                                         ├─► memoria de la sesión   (src/bot/sessions.js)
                                         └─► registro y métricas    (src/chat/)
```

Todo lo que hay a la derecha ya está escrito y probado. Un canal nuevo **no toca nada de
eso**: traduce su formato de entrada, llama a `atender`, y devuelve el `reply` por donde
corresponda.

## Lo único que cambia entre un canal y otro

`idExterno`: **cómo se reconoce una conversación en ese canal**.

| Canal | `idExterno` | De dónde sale |
|---|---|---|
| Web | El identificador de sesión | Lo guarda el navegador y lo reenvía en cada mensaje |
| WhatsApp | El número de teléfono | Viene en el webhook del proveedor |
| Instagram | El id del hilo | Viene en el webhook |

Esa sola diferencia es todo. El resto del comportamiento —entender, responder, recordar el
contexto, anotar la conversación, medirla— ya es idéntico.

## Qué habría que escribir para WhatsApp

Un archivo, `src/channels/whatsapp.js`, con tres responsabilidades:

1. **Verificar la firma del webhook.** El proveedor firma cada petición; sin comprobarla,
   cualquiera podría hacer hablar al bot en nombre de un cliente.
2. **Traducir y llamar al núcleo:**

   ```js
   const resultado = atender({
     texto: mensaje.text.body,
     negocio,
     slug,
     canal: 'whatsapp',
     idExterno: mensaje.from,   // el número de teléfono
   });
   ```

3. **Devolver la respuesta** por la API del proveedor (`resultado.reply`).

Y una decisión de producto: **qué negocio atiende cada número.** Un negocio por número de
WhatsApp es lo simple; hoy `data/businesses/<slug>.json` no guarda ningún número, así que
habría que añadir un campo `whatsappNumber` al esquema y buscar por él.

## Lo que el núcleo ya resuelve y no hay que repetir

- Reconocer la conversación y recordar el contexto (incluido no repetir el saludo).
- El bot pausado y el nivel de exigencia que configuró el dueño.
- Anotar cada intercambio con su canal, de modo que las métricas del panel mostrarán
  WhatsApp y web por separado sin tocar nada.
- Rechazar mensajes vacíos o desmedidos (`MensajeInvalido`).

## Por qué WhatsApp todavía no está

No es un problema técnico sino de trámite: la API de WhatsApp Business exige verificar la
empresa con Meta, un número dedicado, un proveedor y aprobación de plantillas. Son días o
semanas antes de que un solo cliente escriba. Con el chat web se puede probar mañana, y
cuando haya evidencia de uso, abrir esta puerta es el trabajo acotado que describe este
documento.
