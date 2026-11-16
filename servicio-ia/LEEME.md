# Servicio de IA de la guía por voz

> Hecho con ayuda de IA (Claude Code). Lo que sigue son los pasos para publicarlo; léelos enteros una vez antes de empezar.

Este servicio es un **intermediario**: la web le manda una frase y el estado de la página, él le pregunta a un modelo de IA (Gemini, de Google) y devuelve a la web qué hacer y qué decir.

Existe por una sola razón: **la clave de Gemini no puede estar en la web**. Todo lo que está en una página web lo puede leer cualquiera. Aquí la clave se guarda como **secreto** del servicio y nadie más la ve.

```
web (tu navegador)  ──►  este servicio (Cloudflare)  ──►  Gemini (Google)
   sin clave              con la clave, como secreto
```

## Antes de empezar: la regla que no se rompe

**La clave nunca se pega en un archivo.** Ni en `wrangler.toml`, ni en `guia-voz-config.js`, ni en un `.txt`, ni en un chat. Solo se pega una vez, en la terminal, cuando el paso 5 te la pide. Si alguna vez acaba en un archivo o en GitHub, ve a «Si la clave se filtra» al final.

## Qué necesitas

- Una cuenta de Google (para la clave de Gemini). Gratis.
- Una cuenta de Cloudflare (para publicar el servicio). Gratis y sin tarjeta.
- Node.js instalado. Para comprobarlo, abre una terminal y escribe `node --version`. Si sale un número, ya está.

Todos los comandos se escriben en una terminal **dentro de la carpeta `servicio-ia`**:

```bash
cd servicio-ia
```

## Paso 1. Crea la clave de Gemini

1. Entra a <https://aistudio.google.com> con tu cuenta de Google.
2. Busca **Get API key** (o «Obtener clave de API») y pulsa **Create API key**.
3. Copia la clave. Empieza por `AIza`. **No la pegues en ningún sitio todavía.** Deja esa pestaña abierta.
4. Abre <https://aistudio.google.com/rate-limit> y anota los límites gratuitos del modelo **gemini-3.8-flash**: peticiones por minuto (RPM) y por día (RPD). Los vas a usar en el paso 3.

## Paso 2. Crea la cuenta de Cloudflare y conéctala

1. Crea la cuenta en <https://dash.cloudflare.com/sign-up> y confirma el correo.
2. En la terminal:

   ```bash
   npx wrangler login
   ```

   La primera vez pregunta si instala `wrangler`: responde `y`. Se abre el navegador: pulsa **Allow**. La terminal dirá que el inicio de sesión fue correcto.

## Paso 3. Ajusta dos cosas en `wrangler.toml`

Abre `servicio-ia/wrangler.toml`. Ahí **no va la clave**; solo estos valores, que son públicos:

1. **`ORIGENES_PERMITIDOS`**: las páginas que pueden usar el servicio, separadas por comas y sin barra al final. Ya está puesto `misaelvayas-ui`, el usuario de GitHub donde se publica la web; cámbialo si se publica en otra parte. Deja los `localhost` para poder probar en tu computadora.

   ```toml
   ORIGENES_PERMITIDOS = "http://localhost:8000,http://localhost:8001,https://misaelvayas-ui.github.io"
   ```

   Ojo: es solo el principio de la dirección (`https://usuario.github.io`), sin el nombre del repositorio.

2. **Los límites**: pon `MAX_POR_MINUTO_GLOBAL` y `MAX_POR_DIA` **por debajo** de los números que anotaste en el paso 1. Los que vienen (8 por minuto y 200 por día) son prudentes; si tu cuenta permite menos, bájalos.

## Paso 4. Publica el servicio

```bash
npx wrangler deploy
```

La primera vez puede pedirte elegir un nombre para tu dirección `workers.dev`: escribe uno y sigue. Al terminar muestra la dirección del servicio, parecida a esta:

```
https://rocola-guia-ia.TU-CUENTA.workers.dev
```

Cópiala: es la **dirección del servicio**. No es secreta.

## Paso 5. Guarda la clave como secreto

```bash
npx wrangler secret put GEMINI_API_KEY
```

La terminal pregunta por el valor. **Pega ahí la clave** (no se ve mientras la pegas; es normal) y pulsa Enter. Listo: queda guardada cifrada en Cloudflare.

Para comprobar que está (solo muestra el nombre, nunca el valor):

```bash
npx wrangler secret list
```

Ya puedes cerrar la pestaña de AI Studio. No guardes la clave en ningún otro lado: si la pierdes, creas otra.

## Paso 6. Prueba el servicio antes de conectarlo

Primero, sin gastar nada: abre la dirección del servicio en el navegador. Debe salir:

```json
{"servicio":"rocola-guia-ia","estado":"encendido"}
```

Después, con una frase de ejemplo (gasta **una** petición de tu cupo):

```bash
node probar.mjs https://rocola-guia-ia.TU-CUENTA.workers.dev
```

Si todo va bien, termina con **TODO BIEN** y muestra algo como:

```json
{
  "accion": "ninguna",
  "parametros": {},
  "respuesta": "Porque la temperatura media sube con los años, y un valor más alto suena más agudo."
}
```

Puedes probar otra frase: `node probar.mjs https://… "llévame al año 1991"`.

Si no va bien, el propio programa dice qué hacer. Los casos:

| Dice | Qué pasa | Qué hacer |
|---|---|---|
| `origen` (403) | La página que llama no está en la lista | Revisa `ORIGENES_PERMITIDOS` (paso 3) y repite el paso 4 |
| `sin_clave` (503) | El servicio no tiene la clave | Repite el paso 5 |
| `limite` (429) | Se llegó a un límite | Espera un minuto. Si se repite, baja los límites (paso 3) |
| `modelo` (502) | Gemini devolvió un error | La clave no vale o el modelo cambió de nombre. Mira el detalle con `npx wrangler tail` y prueba de nuevo |
| `tiempo` (504) | Gemini no respondió dentro del presupuesto (8 segundos en total) | Prueba otra vez; mira «Si Gemini está saturado» |

`npx wrangler tail` muestra en vivo lo que le pasa al servicio. Se cierra con `Ctrl + C`.

## Paso 7. Conéctalo a la web

Abre `web/guia-voz-config.js` y pon la dirección del servicio entre las comillas:

```js
window.GUIA_VOZ_CONFIG = {
  servicioIA: "https://rocola-guia-ia.TU-CUENTA.workers.dev",
};
```

Ese archivo es público y **solo lleva la dirección**, nunca la clave.

Prueba en tu computadora: en la carpeta `web`, `python -m http.server 8001`, abre <http://localhost:8001>, pulsa la esfera «Háblame» y elige la frase «¿Qué estoy escuchando?» (o pregunta algo libre, como «¿qué pasó con la temperatura después de 1980?»). Debe aparecer la etiqueta «Respuesta generada por IA».

Con `servicioIA: ""` (vacío) la IA queda apagada y la guía funciona solo con comandos, como antes.

## Qué recibe el modelo (y qué no decide)

La web manda la frase y el estado de la página. Desde la ronda 34 el estado incluye `calculado`: el momento actual, el **máximo**, el **mínimo**, el **mayor cambio** entre dos momentos seguidos y la **tendencia** de la pista, ya calculados por la página. Las instrucciones del modelo (`PROMPT_SISTEMA` en `src/nucleo.js`) le piden usar esas cifras tal cual y no hacer cuentas ni estimar otras; con «explícame lo que oigo» debe explicar el momento actual solo con esos datos.

Lo que **no** pasa por el modelo, aunque la IA esté encendida:

- «Llévame al año más cálido» (o más frío): lo resuelve la página con sus datos.
- «Dame un recorrido»: es un guion fijo que ejecuta la página.
- Los comandos cortos («pausa», «año 1990», «pista dos»).

Si el modelo pide una acción que no está en la lista de trece, el servicio la rechaza y, por si acaso, la web la vuelve a comprobar: se descarta y responde el intérprete de comandos.

Desde la ronda 35 el estado lleva además:

- `idioma` (`"es"` o `"en"`): el idioma elegido en la guía. El modelo responde en ese idioma; el contexto va en español y, si responde en inglés, lo traduce él sin cambiar cifras.
- `web`: los textos fijos de la página (qué es, cómo funciona, por qué, accesibilidad, equipo, pistas y créditos), recortados. El modelo contesta dudas sobre la web **solo** con eso y, si no está, dice que no lo sabe.
- `reformular` (solo cuando la persona dice «no entendí», «repite», «más simple» u «otra vez»): la última respuesta de la guía. El modelo la vuelve a decir con palabras más simples, sin datos nuevos y sin ejecutar nada.

Por los textos de la web, el tamaño máximo del estado subió de 6000 a **9000** caracteres (`MAX_CONTEXTO`).

**Si ya habías publicado el servicio antes de la ronda 35, hay que publicarlo otra vez** (`npx wrangler deploy`, dentro de `servicio-ia/`). No hace falta tocar la clave. Con un servicio antiguo, la web nueva manda un estado más grande que su límite de 6000: el servicio lo rechaza y la guía responde con sus comandos, sin avisar.

**Señalar.** Además de las acciones de siempre, el modelo puede usar `senalar` con `parametros.lugar`, que debe ser uno de los 14 lugares de la lista fija (`LUGARES` en `src/nucleo.js`: `pistas`, `reproductor`, `reproducir`, `cambiar`, `volumen`, `avance`, `grafico`, `lectura`, `descripcion`, `leyenda`, `como_funciona`, `por_que`, `accesibilidad`, `equipo`). El esquema JSON ya lo limita con un `enum`, las instrucciones le piden señalar el lugar cuando explica algo, y `limpiarSalida()` descarta la respuesta entera (502 `respuesta_invalida`, la web sigue con sus comandos) si el lugar no está en la lista. La web vuelve a comprobarlo por su cuenta.

## Si la frase de prueba responde 502 `{"error":"modelo"}`

Quiere decir que Google rechazó la petición o respondió algo que no sirve. A la web no viaja el detalle, pero el servicio lo deja en su registro. Para verlo, abre dos terminales en `servicio-ia/`:

```
npx wrangler tail
```

y, en la otra, repite la prueba (`node probar.mjs https://TU-SERVICIO.workers.dev`). En la primera aparece una línea como:

```
Gemini respondió con error: http=400 codigo=400 estado=INVALID_ARGUMENT mensaje=...
```

Causas ya vistas:

- **`thinking_level` / `thinkingLevel` no admitido.** `gemini-3.8-flash` admite `low`, `medium` y `high`, pero no `minimal`. Desde la ronda 36 el servicio envía `LOW` (se cambia con `GEMINI_THINKING`). Los modelos anteriores a Gemini 3 no reciben ese campo, porque lo rechazan.
- **`estado=incomplete`.** El modelo se quedó sin tokens de salida: `max_output_tokens` incluye los de razonamiento. Sube `MAX_TOKENS_SALIDA` (1200 por defecto) o baja `GEMINI_THINKING`.
- **`http=400` o `403` con un mensaje sobre la clave.** Repite el paso 5 con una clave válida.
- **`http=404`.** El nombre del modelo ya no existe: revisa `GEMINI_MODELOS` contra <https://aistudio.google.com/docs/models>. El servicio pasa al siguiente modelo de la lista.

Si la prueba responde 504 `{"error":"tiempo"}`, ningún modelo respondió dentro del presupuesto total (`ESPERA_MODELO_MS`, 8 segundos). La web espera 9 segundos en total.

### Si Gemini está saturado (503 «high demand»)

El 15-nov-2026 `gemini-3.8-flash` respondió `503 UNAVAILABLE` («This model is currently experiencing high demand») y la API de Interacciones no respondía nada en 40 s. Por eso el servicio ahora:

- usa el endpoint clásico `generateContent` (no la API de Interacciones);
- prueba una **lista de modelos** (`GEMINI_MODELOS` en `wrangler.toml`, separados por comas, en orden de preferencia). Si el actual da 503, 429, otro error 5xx o 404, o no responde en `ESPERA_INTENTO_MS` (3,5 s), pasa al siguiente. Un 400 o un 403 (petición o clave mal) no se reintenta con otro modelo;
- reparte un presupuesto total de `ESPERA_MODELO_MS` (8 s) entre todos los intentos; al último modelo le queda todo lo que sobre. Con un solo modelo, ese modelo usa los 8 s;
- si todos fallan, devuelve el error de siempre y la web sigue con los comandos.

Por defecto (en el código y en `wrangler.toml`) la lista es `gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.6-flash`, el orden que respondió bien el 15-nov-2026. Para revisarlo, corre `node probar-gemini.mjs` y mira qué modelos responden bien.

Para ver qué modelos responden bien **ahora**, corre dentro de `servicio-ia`:

```
node probar-gemini.mjs
```

Pide la clave con entrada oculta (nunca por argumento, no se imprime ni se guarda) y dice cuántos caracteres recibió (solo el número). Luego lista los modelos de tu cuenta (nombre y métodos), elige hasta 6 de las familias Flash y Flash-Lite que admiten `generateContent` (sin imagen, voz, embeddings ni live) y prueba con cada uno «Di hola» y la tarea real del servicio, con tope de 15 s. Imprime una tabla modelo / prueba / HTTP / ms / resultado y, al final, prueba `callLLM()` completo. Gasta unas 13 peticiones del cupo gratuito.

## Voz humana (ruta `/voz`), opcional

`POST /voz` con `{ "texto": "…" }` devuelve un audio (`audio/wav`) con la frase dicha por un modelo de texto a voz de Gemini. La web lo usa solo para las respuestas de la IA y solo si la persona enciende «Voz humana de Gemini» en las opciones de la guía.

- **Documentación consultada el 15-nov-2026** (<https://aistudio.google.com/docs/speech-generation>): modelos `gemini-3.8-flash-tts` (el de más calidad), `gemini-3.8-flash-lite-tts` y `gemini-3.1-flash-tts-preview`. La voz solo está documentada por la **API de Interacciones** (`POST /v1beta/interactions` con `response_format: { type: "audio" }` y `generation_config.speech_config: [{ voice }]`); responde un WAV de 24 kHz en base64. El idioma se detecta del texto: no hay parámetro de idioma.
- **Voz:** `GEMINI_VOZ = "Sulafat"` (descrita como cálida). Otras: `Achird` (amable), `Vindemiatrix` (suave), `Kore` (firme).
- **Modelos:** `GEMINI_VOZ_MODELOS = "gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview"`. Pasa al segundo con 404 o 5xx; con 429 no prueba otro, para no gastar más cupo.
- **Límites propios, aparte de los de la conversación** (otra instancia del contador): `VOZ_POR_MINUTO_VISITANTE = 4`, `VOZ_POR_MINUTO_GLOBAL = 6`, `VOZ_POR_DIA = 60`, frases de hasta 600 caracteres. La documentación no da los límites gratuitos de los modelos de voz: míralos en <https://aistudio.google.com/rate-limit> y deja estos por debajo. Si Google responde 429, la voz se pausa 10 minutos.
- **Tiempo:** `ESPERA_VOZ_MS = 3500`. La web espera 3 s; si no llega, habla con la voz del navegador.
- **Apagarla del todo:** `VOZ_GEMINI = "no"` y publicar.
- **Probarla:** `node probar.mjs https://TU-SERVICIO.workers.dev` ahora hace un tercer paso que pide una frase a `/voz` y dice el estado, el tamaño y cuánto tardó.

**Riesgo conocido, sin probar.** No se hizo ninguna llamada real a los modelos de voz. Usan la API de Interacciones, la misma que el 15-nov-2026 no respondía en 40 s para el texto. Si pasa lo mismo, el paso 3 de `probar.mjs` dará 504 y la web seguirá con la voz del navegador sin que nadie note más que una espera; en ese caso deja el interruptor apagado (así viene) o pon `VOZ_GEMINI = "no"`.

## Qué protege al servicio

| Protección | Valor inicial | Dónde se cambia |
|---|---|---|
| Solo ciertas páginas pueden llamarlo | las de `ORIGENES_PERMITIDOS` | `wrangler.toml` |
| Peticiones por minuto por visitante | 6 | `MAX_POR_MINUTO_VISITANTE` |
| Peticiones por minuto entre todos | 8 | `MAX_POR_MINUTO_GLOBAL` |
| Tope por día entre todos | 200 | `MAX_POR_DIA` |
| Largo máximo de la frase | 300 caracteres | `MAX_TEXTO` |
| Largo máximo del estado de la página | 9000 caracteres | `MAX_CONTEXTO` |
| Si Gemini dice «límite» (429) | el servicio deja de insistir 60 segundos | fijo |

Después de cambiar algo en `wrangler.toml`, publica otra vez con `npx wrangler deploy`.

Cuando se llega a un límite, o si Gemini falla, la web **no muestra ningún error**: la guía responde con sus comandos de siempre.

Dos cosas que conviene saber:

- La lista de orígenes frena a otras páginas web, pero un programa (no un navegador) puede mentir sobre su origen. Por eso los límites de arriba son la protección de verdad: lo peor que puede pasar es que alguien gaste el cupo gratuito del día, y entonces la guía sigue con comandos.
- El día del tope diario cambia a medianoche UTC (19:00 en Ecuador).

## Privacidad

- La web avisa: «Tus frases se envían a un servicio de IA para responderte», y la persona puede apagarlo.
- El servicio no guarda las frases ni las escribe en sus registros. Si Google responde con un error, en el registro queda **solo** el código HTTP, el código o estado del error y su mensaje (cortado a 300 caracteres y sin la clave); nunca la frase de la persona ni el estado de la página.
- En la **capa gratuita** de Gemini, Google usa lo que se envía para mejorar sus productos (lo dice su página de precios, consultada el 14 de noviembre de 2026). No es un servicio para datos personales. La web lo advierte en las opciones de la guía.

## Cambiar de modelo

- Otros modelos de Gemini: cambia `GEMINI_MODELOS` (lista separada por comas) en `wrangler.toml` y publica. Los nombres vigentes se comprueban en <https://aistudio.google.com/docs/models> o con `node probar-gemini.mjs`.
- Otro proveedor: cambia **solo** la función `callLLM()` de `src/nucleo.js`. Recibe las instrucciones, el mensaje y el esquema, y debe devolver un objeto `{ accion, parametros, respuesta }`.

## Si la clave se filtra

1. En <https://aistudio.google.com>, borra esa clave. Deja de funcionar al instante.
2. Crea una nueva (paso 1) y guárdala (paso 5). No hay que tocar nada más.

## Apagar o borrar el servicio

- Apagar la IA en la web: `servicioIA: ""` en `web/guia-voz-config.js`.
- Borrar el servicio de Cloudflare: `npx wrangler delete`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/nucleo.js` | toda la lógica: instrucciones del modelo, límites, validación y `callLLM()` |
| `src/index.js` | lo propio de Cloudflare: el Worker y el contador de los límites |
| `wrangler.toml` | nombre, orígenes permitidos, modelo y límites (sin secretos) |
| `probar.mjs` | prueba el servicio publicado con una frase de ejemplo y, al final, la voz humana |
| `probar-gemini.mjs` | mide qué modelos de Gemini responden ahora (tabla modelo / HTTP / ms) para elegir el orden de `GEMINI_MODELOS` |
| `pruebas/servicio.test.js` | pruebas con un modelo de mentira: `node --test pruebas/servicio.test.js` |

## Lo que está probado y lo que no

- **Probado** (sin gastar saldo, con un modelo y una red de mentira): entradas malas, orígenes, los cuatro límites, respuestas manipuladas del modelo, texto malicioso, errores y tiempos de espera, y la forma exacta de la petición a Gemini según su documentación.
- **No probado**: la publicación real en Cloudflare y una llamada real a Gemini. Quien escribió esto no tenía cuenta ni clave. Por eso el paso 6 es obligatorio: es la primera prueba de verdad. Si falla ahí, lo más probable es un detalle del formato de Gemini, y se corrige en `callLLM()`.
