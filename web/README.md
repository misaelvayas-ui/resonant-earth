# Escucha la Tierra · web de Resonant Earth

> El código de `web/` se escribió con ayuda de Claude Code y lo revisó el equipo (ver «Uso de IA» en el README principal). No usa el logotipo de la NASA ni imágenes generadas con IA.

Página única para el jurado del NASA Space Apps Challenge 2026 (Quito), en español e inglés. Tiene las dos pistas reales del pipeline: GISTEMP (temperatura del planeta, 1881–2023) y SST/ECCO2 (temperatura y corrientes del mar, 2007–2008). Es HTML, CSS y JavaScript con módulos ES, sin compilación.

## Probarla

```bash
cd web
python -m http.server 8001
```

Abre <http://localhost:8001> (en inglés: <http://localhost:8001/?lang=en>). Con doble clic (`file://`) no carga: necesita un servidor.

## Qué tiene

- **Hero:** globo 3D (Three.js, texturas Blue Marble y Black Marble de NASA) con un anillo que se deforma con el espectro del audio, órbitas y una atmósfera que sigue la amplitud.
- **La rocola:** dos tarjetas de pista y un reproductor con visualizador (Web Audio, `AnalyserNode`), gráfico con cursor, lectura en vivo («1976: +0,02 °C respecto al promedio…») y una descripción accesible de cada pista.
- **Explorar el mapa:** con la pista en pausa, el cursor o las flechas mueven una mira sobre el fotograma; el color de ese punto se convierte en valor con la barra de la pista (`assets/<id>_paleta.json`), suena al instante y se describe en texto (latitud, longitud, fecha y valor). La nota se apaga sola a los 2,5 s de quietud; Esc sale.
- **Antes y después:** suenan los primeros 5 s de la pista y, enseguida, los últimos 5 s.
- **Idioma:** botones ES / EN en la cabecera. La elección se guarda en `localStorage` y `?lang=en` o `?lang=es` la fuerza.
- Secciones «Cómo funciona», «El porqué», «Accesibilidad» y «Equipo», y el pie con créditos.
- Animaciones con GSAP y ScrollTrigger; con `prefers-reduced-motion` el globo no gira y solo hay fundidos.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html`, `estilos.css` | estructura, textos fijos, tokens de diseño y componentes |
| `pistas.json` | las 2 pistas: textos en español y en inglés (campos `_en`), rutas, plantilla de la lectura en vivo, resumen del gráfico |
| `equipo.json` | integrantes: nombre, carrera y aporte (si `aporte` está vacío, no se muestra) |
| `js/principal.js` | arranque y bucle único de animación |
| `js/idioma.js`, `js/textos.js`, `js/textos_en.js` | idioma activo; textos que escribe el código (español e inglés); inglés de los textos fijos de `index.html` (marcados con `data-t` y `data-t-attr`) |
| `js/datos.js`, `js/menu.js` | carga de `pistas.json`, `equipo.json`, rasgos y mapeo; menú móvil |
| `js/audio.js` | cargar, reproducir, volumen, amplitud y espectro; dos buses (audio del mp4 y sonido en vivo) y `desbloquear()` |
| `js/mapeo.js` | cálculo puro del sonido en vivo (notas, dron, volumen, paneo, golpes) a partir de `_mapeo.json`; sin DOM ni Web Audio |
| `js/vivo.js` | motor Web Audio del sonido en vivo: nodos, planificador y sincronía con el video; `renderizar()` sin conexión |
| `js/package.json` | `{"type": "module"}`: deja que Node importe `js/*.js` para la prueba; el navegador lo ignora |
| `js/explorar.js` | «Explorar el mapa»: color del fotograma → valor → nota y texto, en tiempo real |
| `js/rocola.js`, `js/lectura.js`, `js/grafico.js`, `js/visualizador.js` | reproductor y sus partes |
| `js/globo.js`, `js/animaciones.js`, `js/tarjetas.js` | globo 3D, GSAP y brillo del cursor |
| `vendor/` | three, GSAP y ScrollTrigger (ver `vendor/LICENCIAS.md`) |
| `texturas/`, `fotogramas/` | texturas del globo (2048x1024) y fotogramas de las tarjetas |
| `assets/` | mp4 con el audio mezclado, `_rasgos.json`, `_mapeo.json`, `_esperado.json`, `_procedencia.json`, fuentes e íconos |
| `pruebas/verificar.cjs` | pruebas con Playwright y axe (V1 a V33) |
| `pruebas/motor.test.mjs` | pruebas de Node del cálculo del sonido en vivo contra `_esperado.json` (`node --test web/pruebas/motor.test.mjs`; también las lanza `evaluar.py`, prueba L1) |
| `guia-voz.js`, `guia-voz.css` | guía por voz: intérprete de comandos, micrófono, respuestas y su panel |
| `guia-voz-adaptador.js` | único punto de contacto de la guía con la web (usa `window.__web` y los textos de la página) |
| `guia-voz-ia.js`, `guia-voz-config.js` | conversación con IA (opcional) y la dirección del servicio; **sin claves** |
| `pruebas/guia-voz.test.js`, `pruebas/guia-voz-ia.test.js` | pruebas de la guía con Node |
| `hacer_icono.py` | dibuja los íconos de la pestaña |

## Regenerar los medios desde el pipeline

Los mp4 y los rasgos de `assets/` salen del pipeline, con la misma salida que el demo; antes de escribirlos se comprueba que el audio del mp4 es el de `rocola.wav`:

```bash
python -m herramientas.exportar_web      # mp4, _rasgos.json y _procedencia.json
python -m herramientas.exportar_mapeo    # _mapeo.json y _esperado.json
python -m herramientas.exportar_paleta   # _paleta.json (barra de colores, para «Explorar el mapa»)
```

## Sonido en vivo

Cada pista tiene un selector **Pista original / Sonido en vivo** (por defecto, la original). En vivo, el navegador genera el audio con Web Audio a partir de `assets/<id>_rasgos.json` y `assets/<id>_mapeo.json`, con el mismo mapeo que `06_rasgos_a_audio.py` (especificación: `docs/ESPEC_MODO_EN_VIVO.md`; decisiones de diseño en su sección 5). El `<video>` suena con ganancia 0 y hace de reloj: el motor sigue reproducir, pausar, buscar, velocidad (`ratechange`) y final. El timbre es el del respaldo numpy (voz sostenida y golpe), no la marimba del mp4; las notas, el dron, el volumen y el paneo son los mismos.

- **Datos:** el motor lee de `_mapeo.json` la escala, `vmin_sonido` y `vmax_sonido`, el eje de paneo, los percentiles y los umbrales. Las únicas constantes del código son de timbre (`mapeo.js` y `vivo.js`).
- **Casillas de rasgos:** melodía, volumen y paneo desmarcados quedan fijos (nota de la referencia, 0 dB, centro); el dron desmarcado se silencia. Así se oye cada rasgo por separado.
- **Autoplay:** el `AudioContext` se crea y se reanuda solo dentro de un gesto del usuario; `audio.desbloquear()` es la primera línea síncrona de cada manejador.
- **Dron:** seno continuo, unos 7 dB bajo la melodía (se mide con `vivo.renderizar()` en la prueba V28) y centrado como en 06.
- **Sin Web Audio o sin `_mapeo.json`:** el selector queda deshabilitado y la ayuda explica el motivo.

## Cambiar textos

Los textos de cada pista están en `pistas.json` (el inglés, en los campos `_en`). La frase de la lectura en vivo sale de `lectura.plantilla` (y `plantilla_viva` para el lector de pantalla) con estos marcadores: `{fecha}`, `{valor}`, `{valor_signo}` (con + o −), `{dif_ref_signo}` (diferencia con la referencia) y `{area}` (porcentaje). Los textos fijos están en `index.html`; para cambiar uno hay que cambiar también su clave en `js/textos_en.js`, porque la clave es el texto en español. Los textos que escribe el código están en `js/textos.js`. `equipo.json` admite `carrera_en` y `aporte_en`.

## Publicar

- **GitHub Pages:** en el repositorio, Settings → Pages → Source «GitHub Actions». El flujo «Publicar la web» corre en cada push a `master` que cambie `web/**` o el propio flujo, y a mano desde Actions → Run workflow. La web queda en <https://misaelvayas-ui.github.io/resonant-earth/>.
- **Vercel:** importa el repositorio, Root Directory `web`, sin comando de compilación.

## Pruebas

Necesitan Node 18 o más. Las dependencias están fijadas en `web/pruebas/package.json`:

```bash
cd web/pruebas && npm install && npx playwright install chromium && cd ../..
mkdir -p /tmp/webm && for id in gistemp_1880_2023 sst_ecco2_2007_2008; do ffmpeg -y -v error -i web/assets/$id.mp4 -c:v libvpx -b:v 400k -c:a libopus /tmp/webm/$id.webm; done
(cd web && python -m http.server 8137 &)
WEBM_DIR=/tmp/webm node web/pruebas/verificar.cjs http://localhost:8137/ /tmp/capturas
```

El Chromium de Playwright no trae H.264 ni AAC: por eso las pruebas usan copias webm (`WEBM_DIR`). Son 34 comprobaciones (V1 a V33). Una captura que falla es un `[AVISO]` y no corta el informe. V30 prueba «Antes y después», V31 «Explorar el mapa», V32 falla si `equipo.json` tiene textos de relleno o si la cifra de pruebas de la portada no coincide con `evaluar.py`, y V33 comprueba el selector de idioma y el inglés.

## Guía por voz

> Hecha con ayuda de IA (Claude Code). Sin el servicio de IA configurado, las respuestas de la guía salen de reglas fijas, no de una IA.

Una esfera azul cielo fija abajo a la derecha, **«Háblame»** (o la tecla `H`). La guía se llama **Eco** y funciona **por voz primero**, como una persona que atiende en la web: al abrirla saluda en una frase («Hola, soy Eco, la guía de Resonant Earth. ¿Qué quieres escuchar?») y escucha. Está en **español e inglés** y sigue el idioma de la página.

**Bienvenida y recorrido guiado al entrar.** Los navegadores no dejan sonar nada hasta que la persona hace clic, así que al cargar la página aparece, abajo a la derecha, una tarjeta breve de Eco («Hola, soy Eco. En menos de un minuto te enseño cómo suena el clima de la Tierra.») con dos botones: **«Empezar el recorrido guiado»** y **«Explorar yo solo»** (en inglés, “Start the guided tour” y “Explore on my own”). No es modal ni tapa la web, y no roba el foco al cargar: el primer `Tab` sigue llevando a «Saltar al contenido», y el enlace «Saltar a la guía por voz» lleva al botón «Empezar» mientras la tarjeta está abierta. `Esc` o la `×` la cierran. «Empezar» cierra la tarjeta, Eco se presenta en una frase, presenta la web en otra, invita al recorrido en una tercera, y el recorrido arranca solo; el foco va a «Detener el recorrido». «Explorar yo solo» cierra la tarjeta y deja la esfera. Pulsar la esfera o la tecla `H` también la cierra. Sale una vez por sesión (`sessionStorage`, dentro de `try/catch`). Con lector de pantalla no hay voz automática: la tarjeta es texto y, al pulsar «Empezar», todo va por escrito. Con «menos movimiento» aparece sin animación.

**«Oye Eco» / “Hey Eco” (activo por defecto desde el primer clic).** Nunca se enciende al cargar la página: se activa con la primera acción de la persona («Empezar el recorrido guiado» o «Explorar yo solo» de la bienvenida, la esfera, la tecla `H` o escribir). Eco lo dice **una sola vez** con voz («Puedes llamarme en cualquier momento diciendo: Oye Eco»), y encima de la esfera queda un texto corto y discreto, «Micrófono abierto: di «Oye Eco».», con un punto pequeño y un botón para apagarlo; también hay una casilla en «Ayuda y opciones» con el aviso de que, en Chrome y Edge, el audio va al servicio de voz del navegador. La elección se recuerda (`localStorage`, dentro de `try/catch`): si la persona lo apaga, sigue apagado en las visitas siguientes. Un reconocimiento continuo escucha solo la palabra de activación, tolera variantes («oye eco», «oye ecco», «hey eco», «ok eco»…) y, con la palabra sola, abre la guía y escucha la orden; si la frase ya trae la orden, la ejecuta. **Protección contra el eco:** la escucha se pausa mientras Eco habla (y casi un segundo después) y se reanuda al terminar, así no se activa con su propia voz; además nunca hay dos micrófonos abiertos a la vez. Si el navegador corta el reconocimiento, se reinicia solo. Si se deniega el permiso del micrófono, queda apagado sin avisos. Tras 10 minutos sin usarse se pausa y vuelve con la siguiente interacción. **Nunca** funciona con lector de pantalla. Fuera de este modo, el micrófono solo se abre por una acción de la persona.

**Barra de subtítulos: la guía no tapa la web.** Por defecto, y siempre durante el recorrido, de la guía solo se ve una **barra de subtítulos compacta**: abajo y centrada, junto a la esfera, de 3 líneas como mucho con desplazamiento interno, fondo opaco y tres botones pequeños: «Escribir», «Ayuda y opciones» y cerrar. En el teléfono es una tira baja a lo ancho, al lado de la esfera. El **panel completo** (el que se describe abajo) solo se abre cuando la persona lo pide: con «Escribir», con «Ayuda y opciones», con un clic en la barra o diciendo «ayuda»; al cerrarlo, se vuelve a la barra. Cuando la guía **señala** un lugar, comprueba con `getBoundingClientRect` que la barra o el panel no lo tapen; si lo tapan, se van al borde opuesto (arriba) y, si aun así lo tapan, se minimizan hasta que se quita el resalte. El texto de la barra se puede enfocar con `Tab` (por su desplazamiento interno) y la barra se recorre en orden; con «menos movimiento» no se anima.

**Un apartado propio, con poco texto.** La guía usa la misma paleta que la web (el azul cielo `--acento` de `estilos.css`), pero se ve como un panel aparte: avatar, cabecera, borde superior de luz y brillo propios. Todos los textos cumplen contraste AA (10:1 o más el acento, 4,5:1 o más los bordes). Su panel, encima de la esfera, solo tiene:

- una **cabecera** con el avatar (la misma esfera en pequeño), el nombre «Eco · Guía por voz» y el botón de cerrar;
- un **subtítulo** con lo último que dijo la guía, siempre visible (para personas sordas, con ruido o sin voz disponible);
- una **línea de estado** que dice con palabras lo que muestra la esfera: «Lista.», «Te escucho.», «Un momento…» o «Hablando…»;
- el botón **«Escribir»**, que despliega el campo de texto y los **atajos** (frases rápidas): se ven como una lista de enlaces discretos con una flecha, no como botones de la web;
- el bloque plegado **«Ayuda y opciones»**, en grupos cortos: cuatro ejemplos de qué decir, idioma, voz y velocidad, lector de pantalla, escuchar de nuevo y tecla H, y una nota de una línea sobre el micrófono.

La opción del lector de pantalla dice: «Uso un lector de pantalla (NVDA, JAWS, VoiceOver, TalkBack). La guía responderá solo por escrito, para que no se mezclen dos voces.» La tecla H se puede apagar porque así lo pide WCAG 2.1.4 para los atajos de una sola tecla. Los atajos aparecen solos únicamente si el navegador no tiene voz o no entiende la voz. La ayuda con ejemplos solo se dice cuando la persona la pide («ayuda», «qué puedes hacer», «help»).

**La esfera** es un `<button>` de verdad: se llega con `Tab` o con el enlace «Saltar a la guía por voz». Gira despacio en reposo, **palpita** cuando escucha y **brilla** cuando responde; con `prefers-reduced-motion` no se mueve y el estado se ve en el anillo y el texto. Atajos: **`H`** para hablar (se puede apagar) y `Esc` para cerrar el micrófono, detener el recorrido o cerrar la tarjeta. **No hay atajo con la barra espaciadora.**

**Conversación seguida, sin cortar a la persona.** Después de cada respuesta dicha por voz, la guía vuelve a escuchar **una vez** y espera **hasta 10 segundos** a que la persona empiece a hablar, con un indicador visible («Sigo escuchando…» y una barra que se vacía). En cuanto la persona habla (inicio de voz o resultados parciales del reconocimiento), el temporizador **se detiene y se oculta**, y la frase solo se da por terminada tras **2,5 s de silencio** después de su última palabra, con un máximo de 30 s. Lo mismo al pulsar la esfera: una pausa corta ya no corta la frase. Si nadie habla, se cierra sin decir nada. Una frase que no se entiende en esa escucha no abre otra. Se apaga en «Ayuda y opciones». El micrófono **nunca** se abre sin una acción previa de la persona.

**Dos idiomas, los mismos que la página.** La guía usa el idioma de la página (`<html lang>`, que pone `js/idioma.js`) y lo sigue cuando se pulsan los botones ES / EN de la cabecera. Si se cambia desde la guía (selector «Español / English» de «Ayuda y opciones», o diciendo «habla en inglés» / «español»), la guía pulsa el botón de la página y cambian las dos. En los dos idiomas están los comandos (`interpretarES` e `interpretarEN` devuelven los mismos tipos de acción), los textos de la tarjeta, el recorrido y las respuestas fijas. El reconocimiento usa `es-EC` (y `es-ES` si el navegador no lo admite) o `en-US`. Con la página en el mismo idioma, la guía lee la lectura de «Ahora» de la propia página; las versiones en inglés de `guia-voz-adaptador.js` quedan de respaldo. Con IA, el idioma elegido viaja en el contexto y el modelo responde en ese idioma.

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
- Barra de subtítulos: por defecto solo la barra (escritorio abajo y centrada; móvil tira baja), 3 líneas como mucho con scroll y fondo opaco; el panel se abre con un clic, «Escribir» o «Ayuda y opciones»; orden de teclado; al señalar 9 lugares en escritorio y móvil nunca tapa el lugar resaltado y luego vuelve a su sitio; en el recorrido solo la barra; axe en 0.
- «Oye Eco»: el micrófono no se abre al cargar; se activa con el primer clic (los dos botones de la bienvenida y la esfera) y lo dice una vez; pausado mientras Eco habla; indicador discreto; la palabra sola abre y escucha; con la orden en la misma frase la ejecuta (3 variantes); sin la palabra no hace nada; se reinicia si el navegador la corta; se apaga con un clic y se recuerda; se pausa tras el tiempo sin uso y vuelve con la siguiente acción; permiso denegado sin avisos; deshabilitado con lector; axe en 0; «menos movimiento» sin latido.
- Bienvenida: se ve al cargar en escritorio y móvil, en español e inglés, con axe en 0; no es modal ni roba el foco; teclado y `Esc`; una vez por sesión; «Explorar yo solo»; «Empezar» presenta y arranca el recorrido; lector sin voz; «menos movimiento» sin animación.
- Voz primero: al cargar no se abre el micrófono; `H` abre, saluda y escucha; la barra espaciadora no hace nada; tarjeta mínima; la ayuda solo aparece al pedirla.
- Escucha de seguimiento: se abre tras responder y se cierra sola a los 10 s sin decir nada; si la persona habla, el temporizador se oculta, no se le corta aunque pasen los 10 s, y responde tras 2,5 s de silencio juntando los trozos; no encadena y se apaga en opciones.
- Sin IA: 20 comandos y frases de punta a punta, «no entendí» repite más despacio, preguntas sobre la web con texto fijo, y no sale ninguna petición.
- Inglés: idioma por defecto según el navegador, saludo, la voz más natural (Online Natural), reconocimiento `en-US`, 12 comandos, recorrido, selector y cambio por voz.
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
- La esfera es fija y, con la página arriba del todo en pantallas de unos 1440 px, tapa una esquina del botón «Cómo funciona» del inicio.

**Créditos de ideas:** de `voice-guide.js` (Roberth): voz y velocidad a elegir y texto equivalente visible. De `voz.js` (rama `mejora/auditoria-clean-code`): el «turno» que descarta frases canceladas, bajar la música al hablar y la casilla para el atajo de una tecla.

## Accesibilidad

- Todo se usa con teclado, con foco visible y un enlace «Saltar a la rocola». Atajos fuera de los campos de texto: Espacio reproduce o pausa; ← y → mueven ±5 s.
- **Sonido en vivo:** el selector y las casillas son controles nativos con etiqueta (`fieldset`/`legend`), se usan con teclado y cada cambio se anuncia en la región de estado.
- El gráfico es un control (`role="slider"`): clic, o ← → y Enter, saltan el video a ese momento. La barra de avance se mueve de 1 s en 1 s.
- La lectura en vivo (fecha y frase) se actualiza mientras suena. La región `aria-live` recibe una frase corta («1956: +0,31 °C», `plantilla_viva` en `pistas.json`) del fotograma actual, y no recibe otra hasta pasados 3 s como mínimo, tiempo que el lector necesita para terminar. Una casilla apaga el anuncio. La fecha sobre el video es solo visual (`aria-hidden`).
- Cada pista trae «Qué se ve y qué se oye» y «Colores del mapa»; el gráfico lleva un resumen en texto.
- En pantallas de hasta 899 px el menú es un botón con `aria-expanded`; se cierra con Esc, al elegir una opción y al pulsar fuera.
- Contraste AA o mejor, también en el peor caso (texto sobre una zona blanca del globo).
- Se respetan `prefers-reduced-motion` y el alto contraste forzado de Windows.
- Con el idioma activo se actualizan `<html lang>` y todos los textos, y el selector ES / EN es un grupo de dos botones con `aria-pressed`.

## Créditos y licencias

three.js (MIT), GSAP y ScrollTrigger (licencia estándar gratuita de GreenSock, no MIT), texturas Blue Marble y Black Marble de NASA Earth Observatory (dominio público), fuentes Unbounded, Plus Jakarta Sans y Space Mono (SIL OFL), datos de NASA SVS 5207 y 3912. Hecho con ayuda de IA (Claude). No es un sitio oficial de la NASA.
