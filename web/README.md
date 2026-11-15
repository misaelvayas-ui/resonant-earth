# Escucha la Tierra · web de Resonant Earth

> Esta parte del proyecto (la carpeta `web/`) se hizo con ayuda de IA (Claude Code). No usa el logotipo de la NASA ni el logo del equipo generado con IA.

Página única para presentar el proyecto al jurado del NASA Space Apps Challenge 2026 (Quito). Muestra solo las dos pistas reales del pipeline: **GISTEMP** (temperatura del planeta, 1880–2023) y **SST/ECCO2** (temperatura y corrientes del mar, 2007–2008). Es HTML, CSS y JavaScript puro con módulos ES: no hay compilación.

## Probarla

```bash
cd web
python -m http.server 8001
```

Abre <http://localhost:8001>. Con doble clic (`file://`) no carga: necesita un servidor.

## Qué tiene

- **Hero:** globo 3D (Three.js, texturas Blue Marble y Black Marble de NASA) con un anillo de sonido que se deforma con el audio real, órbitas y una atmósfera que brilla con la amplitud.
- **La rocola:** dos tarjetas de pista y un reproductor con visualizador (Web Audio, `AnalyserNode`), gráfico con cursor, lectura en vivo («1976: +0,02 °C respecto al promedio…») y la descripción accesible de cada pista.
- **Cómo funciona, El porqué, Accesibilidad, Equipo y pie.**
- Animaciones con GSAP + ScrollTrigger; con `prefers-reduced-motion` el globo no gira y solo hay fundidos.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html`, `estilos.css` | estructura, textos fijos, tokens de diseño y componentes |
| `pistas.json` | las 2 pistas: textos, rutas, plantilla de la lectura en vivo, resumen del gráfico |
| `equipo.json` | los 5 integrantes (nombres de ejemplo: edítalos) |
| `js/principal.js` | arranque y bucle único de animación |
| `js/audio.js` | cargar, reproducir, volumen, amplitud y espectro |
| `js/rocola.js`, `js/lectura.js`, `js/grafico.js`, `js/visualizador.js` | reproductor y sus partes |
| `js/globo.js`, `js/animaciones.js`, `js/tarjetas.js` | globo 3D, GSAP y brillo del cursor |
| `vendor/` | three, GSAP y ScrollTrigger (ver `vendor/LICENCIAS.md`) |
| `texturas/`, `fotogramas/` | texturas del globo (2048x1024) y fotogramas de las tarjetas |
| `assets/` | mp4 con el audio mezclado, `_rasgos.json`, `_mapeo.json`, `_esperado.json`, `_procedencia.json`, fuentes e íconos |
| `pruebas/verificar.cjs` | pruebas con Playwright y axe |
| `guia-voz.js`, `guia-voz.css` | guía por voz: intérprete de comandos, micrófono, respuestas y su panel |
| `guia-voz-adaptador.js` | único punto de contacto de la guía con la web (usa `window.__web` y los textos de la página) |
| `guia-voz-ia.js`, `guia-voz-config.js` | conversación con IA (opcional) y la dirección del servicio; **sin claves** |
| `pruebas/guia-voz.test.js`, `pruebas/guia-voz-ia.test.js` | pruebas de la guía con Node |
| `hacer_icono.py` | dibuja los íconos de la pestaña |

## Regenerar los medios desde el pipeline

Los mp4 y los rasgos de `assets/` salen del pipeline, con la misma salida que el demo y con una comprobación de que el audio del mp4 es el de `rocola.wav`:

```bash
python -m herramientas.exportar_web      # mp4, _rasgos.json y _procedencia.json
python -m herramientas.exportar_mapeo    # _mapeo.json y _esperado.json
```

## Cambiar textos

Los textos de cada pista están en `pistas.json`. La frase de la lectura en vivo sale de `lectura.plantilla` con estos marcadores: `{fecha}`, `{valor}`, `{valor_signo}` (con + o −), `{dif_ref_signo}` (diferencia con la referencia) y `{area}` (porcentaje). Los textos fijos de la página están en `index.html`.

## Publicar

- **GitHub Pages:** en el repositorio, Settings → Pages → Source «GitHub Actions». Luego Actions → «Publicar la web» → Run workflow. Queda en <https://misaelvayas-ui.github.io/rocola_practica/>. El flujo solo corre a mano.
- **Vercel:** importa el repositorio, Root Directory `web`, sin comando de compilación.

## Pruebas

Necesitan Node 18 y Playwright, fuera del repositorio:

```bash
mkdir /tmp/verif && cd /tmp/verif && npm init -y && npm i playwright @axe-core/playwright && npx playwright install chromium
cd web && python -m http.server 8137 &
NODE_PATH=/tmp/verif/node_modules node web/pruebas/verificar.cjs http://localhost:8137/ /tmp/capturas
```

El Chromium de Playwright no trae H.264 ni AAC. Para que reproduzca las pistas, convierte los mp4 a webm y pasa `WEBM_DIR` (ver la cabecera de `verificar.cjs`). Lighthouse se corre con `--preset=desktop`.

## Guía por voz

> Hecha con ayuda de IA (Claude Code). Sin el servicio de IA configurado, las respuestas de la guía salen de reglas fijas, no de una IA.

Una esfera luminosa fija abajo a la derecha, **«Háblame»** (o la tecla `H`). Funciona **por voz primero**, como una persona que atiende en la web: al abrirla saluda en una frase («Hola, soy la guía de Resonant Earth. ¿Qué quieres escuchar?») y escucha. Está en **español e inglés**; la web de Misael no se traduce.

**La tarjeta es mínima.** Encima de la esfera solo hay:

- un **subtítulo** con lo último que dijo la guía, siempre visible (para personas sordas, con ruido o sin voz disponible);
- el botón **«Escribir»**, que despliega el campo de texto y, dentro, las frases sugeridas;
- el bloque plegado **«Ayuda y opciones»**, con todo lo demás: ejemplos de lo que se puede decir, idioma, lector de pantalla, tecla H, seguir escuchando, voz, velocidad y la nota del micrófono.

No se ven «Entendí», las frases sugeridas ni la lista de comandos. Las frases sugeridas aparecen solas únicamente si el navegador no tiene voz o no tiene reconocimiento de voz. La ayuda con ejemplos solo se dice y se muestra cuando la persona la pide («ayuda», «qué puedes hacer», «help»).

**La esfera** es un `<button>` de verdad: se llega con `Tab` o con el enlace «Saltar a la guía por voz». Gira despacio en reposo, **palpita** cuando escucha y **brilla** cuando responde; con `prefers-reduced-motion` no se mueve y el estado se ve en el anillo y el texto. Atajos: **`H`** para hablar (se puede apagar) y `Esc` para cerrar el micrófono, detener el recorrido o cerrar la tarjeta. **No hay atajo con la barra espaciadora.**

**Conversación seguida.** Después de cada respuesta dicha por voz, la guía vuelve a escuchar **una vez, hasta 6 segundos**, con un indicador visible («Sigo escuchando unos segundos…» y una barra que se vacía). Si nadie habla, se cierra sin decir nada. Si la persona habla, se le responde y vuelve a escuchar. Una frase que no se entiende en esa escucha no abre otra. Se apaga en opciones («Seguir escuchando unos segundos después de cada respuesta»). **El micrófono nunca se abre sin una acción previa de la persona**: al cargar la página no pasa nada.

**Dos idiomas (solo la guía).** El idioma inicial es el del navegador (inglés si empieza por `en`; si no, español) y se cambia con el selector «Español / English» de «Ayuda y opciones» o diciendo «habla en inglés» / «español». En los dos idiomas están los comandos (`interpretarES` e `interpretarEN` devuelven los mismos tipos de acción), los textos de la tarjeta, el recorrido y las respuestas fijas. El reconocimiento usa `es-EC` (y `es-ES` si el navegador no lo admite) o `en-US`. Lo que la guía dice en inglés sobre la página (títulos de pista, la lectura de «Ahora», la leyenda) está en `guia-voz-adaptador.js`, calculado con los mismos datos. Con IA, el idioma elegido viaja en el contexto y el modelo responde en ese idioma.

**Voz serena.** `elegirVozDe()` escoge sola una voz masculina según el idioma: en inglés, primero británicas (George, Ryan, Google UK English Male, Daniel…); en español, Pablo, Raúl, Jorge u otra masculina. Si no hay ninguna, usa otra del idioma. Velocidad 0,95 y tono 0,85 (algo más grave). El selector de voces y la velocidad siguen en opciones.

**Qué entiende** (sin importar tildes, signos ni si el número viene en cifras o en palabras):

| Para… | Español | Inglés |
|---|---|---|
| reproducir y pausar | «reproduce», «pausa», «detente» | “play”, “pause”, “stop” |
| cambiar de pista | «siguiente pista», «pista dos», «pon el mar», «qué pistas hay» | “next track”, “track two”, “play the ocean”, “what tracks are there” |
| ir a una fecha o momento | «año 1990», «noviembre de 2007», «segundo diez», «avanza diez segundos» | “year 1990”, “November 2007”, “second ten”, “forward ten seconds” |
| entender lo que suena | «qué estoy escuchando», «por qué sube el tono», «qué pasa ahora», «lee la leyenda» | “what am I hearing”, “why does the pitch rise”, “what's happening”, “read the legend” |
| explorar | «llévame al año más cálido», «dame un recorrido» | “take me to the warmest year”, “give me a tour” |
| repetir | «no entendí», «repite», «más simple», «otra vez» | “I didn't understand”, “repeat”, “simpler”, “again” |
| sobre la web | «qué es este proyecto», «cómo funciona», «quiénes son» | “what is this project”, “how does it work”, “who made this” |
| la guía | «ayuda», «silencio», «volumen 50», «habla en inglés», «uso lector de pantalla» | “help”, “quiet”, “volume 50”, “español”, “I use a screen reader” |

**«No entendí», «repite», «más simple», «otra vez».** Con IA, la guía manda su última respuesta al modelo y este la vuelve a decir con palabras más simples (no ejecuta ninguna acción). Sin IA, o si la IA falla, repite lo mismo más despacio (velocidad × 0,8).

**Preguntas sobre la web.** Con IA, el contexto lleva los textos fijos de la página (`textosWeb()` del adaptador: qué es, cómo funciona, por qué, accesibilidad, equipo, pistas y créditos, leídos de la propia página y recortados; unos 3000 caracteres) y el modelo contesta solo con eso; si no está, dice que no lo sabe. Sin IA, cinco textos cortos fijos responden a qué es el proyecto, cómo funciona, por qué, accesibilidad y equipo.

**Datos ya calculados.** `resumenSerie()` saca de cada pista el máximo, el mínimo, el mayor cambio entre dos momentos seguidos y la tendencia. Los comandos usan esas cifras y viajan a la IA en `contexto.calculado` con la orden de no calcular otras. En la pista del mar se dice «índice», nunca grados.

**Recorrido guiado.** Guion fijo (`guionRecorrido()`), sin modelo, en los dos idiomas: presenta la web, pone GISTEMP, salta unos segundos antes del punto más alto (2023) y lo explica, cambia al mar y cierra. Se detiene con «Detener el recorrido», `Esc`, «pausa», «silencio» o «detén el recorrido»; otra frase lo corta y se responde a esa frase.

**Lector de pantalla: sin voces dobles.** La guía habla por defecto. Con «Uso lector de pantalla» marcado (en opciones, o diciendo «uso lector de pantalla»), **nunca** usa su voz: escribe en una región `aria-live`, no repite lo que la página ya anuncia y **no abre el micrófono sola** (oiría al lector). El botón de la esfera lleva una descripción, que solo lee el lector de pantalla, que explica cómo activar ese modo. *Cambio respecto a la ronda 34: ya no hay pregunta inicial; antes la guía no hablaba hasta que se respondía.*

**Cómo se conecta con la web.** `guia-voz-adaptador.js` es el único archivo que conoce la página. Usa `window.__web` (lo crea `js/principal.js`), el botón `#btn-reproducir` y los textos que la página ya pinta. **No se cambió ningún módulo de `js/`**; en `index.html` solo están las cuatro líneas `<script>` de la guía.

**Conversación con IA (opcional).** Viene **apagada**: `guia-voz-config.js` trae la dirección del servicio vacía. Para encenderla se publica `servicio-ia/` (pasos en `servicio-ia/LEEME.md`) y se pone su dirección ahí. **En la web nunca hay una clave.**

- Los comandos cortos, «llévame al año más cálido», el recorrido y los cambios de idioma no pasan por el modelo.
- Lo que devuelve la IA se comprueba contra trece acciones permitidas y los rangos de la pista; lo que no cuadra se descarta y responde el intérprete.
- Sin dirección, sin internet, con error, con límite (429) o si tarda más de 9 segundos, la guía responde con sus comandos y no muestra errores.
- Mientras espera a la IA, la esfera pasa a «pensando» y, si pasan 1,5 s, la guía dice «Un momento.» («One moment.») una sola vez; con lector de pantalla no habla, basta el texto.
- Mientras la IA está encendida se ve el aviso «Tus frases se envían a un servicio de IA para responderte» y cada respuesta de la IA lleva la etiqueta «Respuesta generada por IA» (en inglés, sus equivalentes).

**Pruebas de la guía**

```bash
node --test web/pruebas/guia-voz.test.js web/pruebas/guia-voz-ia.test.js   # 23 pruebas: intérprete (112 frases en español, 55 en inglés), voz, recorrido, contexto de la IA
cd servicio-ia && node --test pruebas/servicio.test.js                      # 12 pruebas del servicio, con un modelo de mentira
```

En navegador (Chrome sin ventana, con micrófono, voz y servicio de IA **de mentira**; el guion de prueba no está en el repositorio), 128 comprobaciones, todas pasan:

- axe con 0 violaciones en escritorio (1440 px) y móvil (390 px), en español y en inglés: cerrada, escuchando y con todo desplegado. Sin desborde horizontal.
- Voz primero: al cargar no se abre el micrófono; `H` abre, saluda y escucha; la barra espaciadora no hace nada; tarjeta mínima; la ayuda solo aparece al pedirla.
- Escucha de seguimiento: se abre tras responder, se cierra sola a los 6 s sin decir nada, no encadena, y se apaga en opciones.
- Sin IA: 20 comandos y frases de punta a punta, «no entendí» repite más despacio, preguntas sobre la web con texto fijo, y no sale ninguna petición.
- Inglés: idioma por defecto según el navegador, saludo, voz británica masculina, reconocimiento `en-US`, 12 comandos, recorrido, selector y cambio por voz; la web sigue en español.
- Lector de pantalla: 0 frases por voz en 14 comandos y en el recorrido; la guía y la página nunca dicen lo mismo a la vez; sin escucha de seguimiento.
- Recorrido completo y cuatro maneras de detenerlo; movimiento reducido; navegador sin voz o sin reconocimiento (aparecen el campo y las frases sugeridas).
- IA de mentira: idioma y textos de la web en el contexto (unos 6000 de 9000 caracteres), reformular, 7 respuestas manipuladas o caídas descartadas sin avisos, y HTML como texto.

`pruebas/verificar.cjs` (V1 a V14) sigue pasando con la guía puesta.

**No probado:** micrófono real, las voces reales de cada navegador (la elección de voz se probó con listas de nombres de Windows, Edge, Chrome y macOS), lectores de pantalla reales, Firefox, Safari, teléfonos reales, ni una llamada real a Gemini.

**Detalles conocidos**

- El subtítulo muestra la respuesta completa aunque pase de dos líneas, para que quien no oye no pierda nada.
- La tarjeta conserva un botón pequeño para cerrarla y, con la IA encendida, el aviso de que las frases se envían.
- El texto que la guía lee tal cual de la página en español (por ejemplo, la lectura de «Ahora») no se traduce en la web; en inglés la guía dice su propia versión con los mismos datos.
- La esfera es fija y, con la página arriba del todo en pantallas de unos 1440 px, tapa una esquina del botón «Cómo funciona» del inicio.
- La web tiene unos 146 textos solo en español: 95 en `index.html`, 20 en `pistas.json`, 11 en `equipo.json` y unos 20 en los módulos de `js/`.

**Créditos de ideas:** de `voice-guide.js` (Roberth): voz y velocidad a elegir y texto equivalente visible. De `voz.js` (rama `mejora/auditoria-clean-code`): el «turno» que descarta frases canceladas, bajar la música al hablar y la casilla para el atajo de una tecla.

## Accesibilidad

- Todo se usa con teclado, con foco visible y un enlace «Saltar a la rocola».
- La lectura en vivo (fecha y frase) se actualiza mientras suena y se anuncia en una región `aria-live` como mucho cada 4 s; una casilla la apaga.
- Cada pista trae «Qué se ve y qué se oye» y «Colores del mapa»; el gráfico lleva un resumen en texto.
- Contraste AA o mejor en el peor caso (texto sobre una zona blanca del globo).
- `prefers-reduced-motion` y alto contraste forzado de Windows están contemplados.

## Créditos y licencias

three.js (MIT), GSAP y ScrollTrigger (licencia estándar gratuita de GreenSock, no MIT), texturas Blue Marble y Black Marble de NASA Earth Observatory (dominio público), fuentes Unbounded, Plus Jakarta Sans y Space Mono (SIL OFL), datos de NASA SVS 5207 y 3912. Hecho con ayuda de IA (Claude). No es un sitio oficial de la NASA.
