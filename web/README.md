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

Una esfera azul cielo fija abajo a la derecha, **«Háblame»** (o la tecla `H`). La guía se llama **Eco** y funciona **por voz primero**, como una persona que atiende en la web: al abrirla saluda en una frase («Hola, soy Eco, la guía de Resonant Earth. ¿Qué quieres escuchar?») y escucha. Está en **español e inglés**; la web de Misael no se traduce.

**Bienvenida y recorrido guiado al entrar.** Los navegadores no dejan sonar nada hasta que la persona hace clic, así que al cargar la página aparece, abajo a la derecha, una tarjeta breve de Eco («Hola, soy Eco. En menos de un minuto te enseño cómo suena el clima de la Tierra.») con dos botones: **«Empezar el recorrido guiado»** y **«Explorar yo solo»** (en inglés, “Start the guided tour” y “Explore on my own”). No es modal ni tapa la web, y no roba el foco al cargar: el primer `Tab` sigue llevando a «Saltar al contenido», y el enlace «Saltar a la guía por voz» lleva al botón «Empezar» mientras la tarjeta está abierta. `Esc` o la `×` la cierran. «Empezar» cierra la tarjeta, Eco se presenta en una frase, presenta la web en otra, invita al recorrido en una tercera, y el recorrido arranca solo; el foco va a «Detener el recorrido». «Explorar yo solo» cierra la tarjeta y deja la esfera. Pulsar la esfera o la tecla `H` también la cierra. Sale una vez por sesión (`sessionStorage`, dentro de `try/catch`). Con lector de pantalla no hay voz automática: la tarjeta es texto y, al pulsar «Empezar», todo va por escrito. Con «menos movimiento» aparece sin animación.

**«Oye Eco» / “Hey Eco” (opcional, apagado por defecto).** En «Ayuda y opciones» hay una casilla «Activar con «Oye Eco»», con un aviso: mientras está activo el micrófono queda abierto en la página y, en Chrome y Edge, el audio va al servicio de voz del navegador. Encendido, un reconocimiento continuo escucha solo la palabra de activación, y solo cuando la guía está libre (no habla, no escucha, no piensa, sin recorrido) y la página se ve; así no se oye a sí misma y hay un único micrófono a la vez. Tolera variantes («oye eco», «oye ecco», «hey eco», «ok eco», “hey echo”…). Con la palabra sola, abre la guía y escucha la orden; si la frase ya trae la orden («oye eco, qué pistas hay»), la ejecuta. Mientras está encendido se ve, encima de la esfera, «Micrófono abierto: di «Oye Eco».» con un punto que late y un botón para apagarlo de un clic. Si el navegador corta el reconocimiento, se reinicia solo (con un respiro si se corta muchas veces seguidas). Se apaga solo tras 10 minutos sin usarse y lo dice. No se recuerda entre visitas: cada visita empieza apagado. **Nunca** funciona con lector de pantalla: la casilla queda deshabilitada y marcar el lector lo apaga al momento. Fuera de este modo sigue la regla de siempre: el micrófono solo se abre por una acción de la persona (y encender «Oye Eco» es esa acción).

**Un apartado propio, con poco texto.** La guía usa la misma paleta que la web (el azul cielo `--acento` de `estilos.css`), pero se ve como un panel aparte: avatar, cabecera, borde superior de luz y brillo propios. Todos los textos cumplen contraste AA (10:1 o más el acento, 4,5:1 o más los bordes). Su panel, encima de la esfera, solo tiene:

- una **cabecera** con el avatar (la misma esfera en pequeño), el nombre «Eco · Guía por voz» y el botón de cerrar;
- un **subtítulo** con lo último que dijo la guía, siempre visible (para personas sordas, con ruido o sin voz disponible);
- una **línea de estado** que dice con palabras lo que muestra la esfera: «Lista.», «Te escucho.», «Un momento…» o «Hablando…»;
- el botón **«Escribir»**, que despliega el campo de texto y los **atajos** (frases rápidas): se ven como una lista de enlaces discretos con una flecha, no como botones de la web;
- el bloque plegado **«Ayuda y opciones»**, en grupos cortos: cuatro ejemplos de qué decir, idioma, voz y velocidad, lector de pantalla, escuchar de nuevo y tecla H, y una nota de una línea sobre el micrófono.

La opción del lector de pantalla dice: «Uso un lector de pantalla (NVDA, JAWS, VoiceOver, TalkBack). La guía responderá solo por escrito, para que no se mezclen dos voces.» La tecla H se puede apagar porque así lo pide WCAG 2.1.4 para los atajos de una sola tecla. Los atajos aparecen solos únicamente si el navegador no tiene voz o no entiende la voz. La ayuda con ejemplos solo se dice cuando la persona la pide («ayuda», «qué puedes hacer», «help»).

**La esfera** es un `<button>` de verdad: se llega con `Tab` o con el enlace «Saltar a la guía por voz». Gira despacio en reposo, **palpita** cuando escucha y **brilla** cuando responde; con `prefers-reduced-motion` no se mueve y el estado se ve en el anillo y el texto. Atajos: **`H`** para hablar (se puede apagar) y `Esc` para cerrar el micrófono, detener el recorrido o cerrar la tarjeta. **No hay atajo con la barra espaciadora.**

**Conversación seguida, sin cortar a la persona.** Después de cada respuesta dicha por voz, la guía vuelve a escuchar **una vez** y espera **hasta 10 segundos** a que la persona empiece a hablar, con un indicador visible («Sigo escuchando…» y una barra que se vacía). En cuanto la persona habla (inicio de voz o resultados parciales del reconocimiento), el temporizador **se detiene y se oculta**, y la frase solo se da por terminada tras **2,5 s de silencio** después de su última palabra, con un máximo de 30 s. Lo mismo al pulsar la esfera: una pausa corta ya no corta la frase. Si nadie habla, se cierra sin decir nada. Una frase que no se entiende en esa escucha no abre otra. Se apaga en «Ayuda y opciones». El micrófono **nunca** se abre sin una acción previa de la persona.

**Dos idiomas (solo la guía).** El idioma inicial es el del navegador (inglés si empieza por `en`; si no, español) y se cambia con el selector «Español / English» de «Ayuda y opciones» o diciendo «habla en inglés» / «español». En los dos idiomas están los comandos (`interpretarES` e `interpretarEN` devuelven los mismos tipos de acción), los textos de la tarjeta, el recorrido y las respuestas fijas. El reconocimiento usa `es-EC` (y `es-ES` si el navegador no lo admite) o `en-US`. Lo que la guía dice en inglés sobre la página (títulos de pista, la lectura de «Ahora», la leyenda) está en `guia-voz-adaptador.js`, calculado con los mismos datos. Con IA, el idioma elegido viaja en el contexto y el modelo responde en ese idioma.

**Voz natural.** `elegirVozDe()` escoge sola la voz que suena más natural, por su nombre: primero las que incluyen «Natural» u «Online» (las neuronales de Edge), luego las de Google (Chrome) y al final las instaladas en el sistema; las voces de adorno de macOS no se eligen nunca solas. Dentro de cada grupo manda el país: en español Ecuador, México y España; en inglés Estados Unidos y Reino Unido. Valen igual masculinas y femeninas. Velocidad 1 y tono 1 (se quitó el tono grave). El selector de voz sigue en las opciones: su primera entrada dice «La más natural: (nombre de la voz elegida)» y la lista va ordenada de más a menos natural; la velocidad también se puede cambiar. Antes de hablar, `prepararParaVoz()` arregla el texto (el subtítulo no cambia): «°C» se dice «grados», «−» y «+» se dicen «menos» y «más», «%» es «por ciento», «1951–1980» es «1951 a 1980», «mar 2007» es «marzo de 2007», no se leen comillas, asteriscos, flechas ni emojis, y los paréntesis y las rayas se vuelven pausas. Los años y los decimales se dejan tal cual para que la voz los lea de forma natural.

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

**La guía señala.** Hay una lista fija de 14 lugares de la web que la guía puede mostrar: la lista de pistas, el reproductor, el botón de reproducir, el de cambiar de pista, el volumen, la línea de tiempo, el gráfico, la lectura en vivo, la descripción, la leyenda y las secciones «Cómo funciona», «El porqué», «Accesibilidad» y «Equipo» (`LUGARES` en `guia-voz.js`; el adaptador dice dónde está cada uno con `lugar(nombre)`). Cuando la guía explica algo, la página se desplaza con suavidad hasta ese lugar y lo rodea un **anillo de luz** azul que se quita solo a los 4,5 s: «lee la leyenda» señala la leyenda, «por qué sube el tono» el gráfico, «qué pistas hay» la lista, «cómo funciona» su sección. También se puede pedir: «¿dónde está el volumen?», «señala la leyenda», “where is the volume”. Con `prefers-reduced-motion` hay resalte sin animación y el desplazamiento es inmediato. Con lector de pantalla, la guía **mueve el foco** a ese lugar y lo anuncia por texto («Te llevé al volumen.»). El anillo y el puntero no reciben clics y están ocultos para el lector (`aria-hidden`).

**Recorrido guiado.** Guion fijo (`guionRecorrido()`), sin modelo, en los dos idiomas, de 40 a 60 segundos, con **las dos pistas sonando de verdad**. Ocho pasos: presenta la web; el puntero pulsa la tarjeta de la primera pista (GISTEMP) y suena; muestra el botón de reproducir; salta unos segundos antes del máximo (2023) y lo explica señalando el gráfico; pulsa «Cambiar de pista» y presenta el mar; pulsa reproducir si hace falta («Escucha cómo suena el mar»), así que la pista 2 se oye; salta unos segundos antes de su punto más bajo (nov 2007) y lo explica señalando la lectura en vivo; y cierra invitando a explorar. Cada paso **señala el lugar del que habla** y un **puntero visible** pulsa los controles de la página (el botón de reproducir solo se pulsa si la pista no suena ya, para no pausarla). La voz va sincronizada: cada explicación empieza cuando el control ya se pulsó, y entre pasos la música se oye a volumen normal. Se detiene en cualquier momento con «Detener el recorrido», `Esc`, «pausa», «silencio» o «detén el recorrido»; otra frase lo corta y se atiende. Con lector de pantalla no hay puntero: los controles se pulsan igual, el foco va a cada lugar y cada paso se anuncia por texto.

**Lector de pantalla: sin voces dobles.** La guía habla por defecto. Con «Uso lector de pantalla» marcado (en opciones, o diciendo «uso lector de pantalla»), **nunca** usa su voz: escribe en una región `aria-live`, no repite lo que la página ya anuncia y **no abre el micrófono sola** (oiría al lector). El botón de la esfera lleva una descripción, que solo lee el lector de pantalla, que explica cómo activar ese modo. *Cambio respecto a la ronda 34: ya no hay pregunta inicial; antes la guía no hablaba hasta que se respondía.*

**Cómo se conecta con la web.** `guia-voz-adaptador.js` es el único archivo que conoce la página. Usa `window.__web` (lo crea `js/principal.js`), el botón `#btn-reproducir` y los textos que la página ya pinta. **No se cambió ningún módulo de `js/`**; en `index.html` solo están las cuatro líneas `<script>` de la guía.

**Conversación con IA.** `guia-voz-config.js` trae la dirección del servicio publicado (`servicio-ia/`, pasos en `servicio-ia/LEEME.md`). Con la dirección vacía (`""`) la guía funciona solo con comandos y no envía nada. **En la web nunca hay una clave.**

- Los comandos cortos, «llévame al año más cálido», el recorrido y los cambios de idioma no pasan por el modelo.
- Lo que devuelve la IA se comprueba contra catorce acciones permitidas y los rangos de la pista; lo que no cuadra se descarta y responde el intérprete.
- La IA también puede **señalar**: la acción `senalar` lleva `parametros.lugar` con uno de los 14 lugares de la lista fija. El servicio y la web lo comprueban por separado; un lugar fuera de la lista (un selector, HTML, otro texto) hace que se descarte la respuesta entera.
- Sin dirección, sin internet, con error, con límite (429) o si tarda más de 9 segundos, la guía responde con sus comandos y no muestra errores.
- Mientras espera a la IA, la esfera pasa a «pensando» y, si pasan 1,5 s, la guía dice «Un momento.» («One moment.») una sola vez; con lector de pantalla no habla, basta el texto.
- Mientras la IA está encendida se ve el aviso «Tus frases se envían a un servicio de IA» y cada respuesta de la IA lleva la etiqueta «Respuesta generada por IA» (en inglés, sus equivalentes).

**Voz humana de Gemini (opcional, apagada por defecto).** En «Ayuda y opciones» hay un interruptor «Voz humana de Gemini para las respuestas de la IA». Encendido, cada respuesta de la IA se manda (solo la frase, ya preparada para hablar) a la ruta `/voz` del servicio, que devuelve un audio con una voz cálida de Gemini en el idioma de la frase. Si el audio no llega en unos **3 segundos**, da error o se acabó el cupo, la guía habla **enseguida con la voz del navegador** y deja de pedir la voz humana 5 minutos (30 si fue por cupo). Las respuestas que no son de la IA, el recorrido y el saludo siempre usan la voz del navegador, para no gastar cupo. Con lector de pantalla no se pide ninguna voz. Viene apagada porque gasta cupo del modelo de voz y porque, si ese modelo va lento, cada respuesta esperaría hasta 3 s. **No está probada con Gemini de verdad** (ver `servicio-ia/LEEME.md`).

**Pruebas de la guía**

```bash
node --test web/pruebas/guia-voz.test.js web/pruebas/guia-voz-ia.test.js   # 28 pruebas: intérprete (112 frases en español, 55 en inglés), voz, recorrido, contexto de la IA
cd servicio-ia && node --test pruebas/servicio.test.js                      # 15 pruebas del servicio, con un modelo de mentira
```

En navegador (Chrome sin ventana, con micrófono, voz y servicio de IA **de mentira**; el guion de prueba no está en el repositorio), 171 comprobaciones, todas pasan:

- axe con 0 violaciones en escritorio (1440 px) y móvil (390 px), en español y en inglés: cerrada, escuchando y con todo desplegado. Sin desborde horizontal.
- «Oye Eco»: apagado al cargar; la casilla y su aviso; al encender, indicador y escucha continua; la palabra sola abre y escucha; con la orden en la misma frase la ejecuta (3 variantes); sin la palabra no hace nada; se reinicia si el navegador la corta; se apaga con un clic y solo tras el tiempo sin uso; deshabilitado con lector; axe en 0; «menos movimiento» sin latido.
- Bienvenida: se ve al cargar en escritorio y móvil, en español e inglés, con axe en 0; no es modal ni roba el foco; teclado y `Esc`; una vez por sesión; «Explorar yo solo»; «Empezar» presenta y arranca el recorrido; lector sin voz; «menos movimiento» sin animación.
- Voz primero: al cargar no se abre el micrófono; `H` abre, saluda y escucha; la barra espaciadora no hace nada; tarjeta mínima; la ayuda solo aparece al pedirla.
- Escucha de seguimiento: se abre tras responder y se cierra sola a los 10 s sin decir nada; si la persona habla, el temporizador se oculta, no se le corta aunque pasen los 10 s, y responde tras 2,5 s de silencio juntando los trozos; no encadena y se apaga en opciones.
- Sin IA: 20 comandos y frases de punta a punta, «no entendí» repite más despacio, preguntas sobre la web con texto fijo, y no sale ninguna petición.
- Inglés: idioma por defecto según el navegador, saludo, la voz más natural (Online Natural), reconocimiento `en-US`, 12 comandos, recorrido, selector y cambio por voz; la web sigue en español.
- Lector de pantalla: 0 frases por voz en 14 comandos y en el recorrido; la guía y la página nunca dicen lo mismo a la vez; sin escucha de seguimiento.
- Señalar: anillo sobre el lugar correcto y a la vista, se quita solo, lista fija, «menos movimiento» sin animación, con lector el foco se mueve y se anuncia una vez, la IA señala y 5 respuestas manipuladas se descartan.
- Recorrido completo (cada paso señala su lugar; el puntero se mueve y hace clic de verdad en la tarjeta de la pista y en «Cambiar de pista») y cuatro maneras de detenerlo; movimiento reducido; navegador sin voz o sin reconocimiento (aparecen el campo y las frases sugeridas).
- IA de mentira: idioma y textos de la web en el contexto (unos 6000 de 9000 caracteres), reformular, 7 respuestas manipuladas o caídas descartadas sin avisos, y HTML como texto.

- Voz humana (de mentira): apagada por defecto; encendida suena el audio y calla la voz del navegador; si tarda, a los ~3 s habla el navegador; con 429 o error el respaldo es inmediato y no insiste; con lector no se pide.

`pruebas/verificar.cjs` (V1 a V14) pasa con la guía puesta. V11 (tras «Pausar», la amplitud baja a tiempo) falla a veces en esta máquina: falló en varias corridas, también con el código anterior a la ronda 38, y pasó en la última; no es de la guía.

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
