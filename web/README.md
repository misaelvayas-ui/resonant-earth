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

Un panel encima de la rocola, con un botón grande **«Hablar con la guía»** (o la tecla `H`). Dices lo que quieres y la guía lo hace y te responde. También se puede escribir lo mismo en un campo de texto, para quien no puede o no quiere hablar.

**Qué entiende** (en español; no importan las tildes, los signos ni si el número viene en cifras o en palabras):

| Para… | Ejemplos |
|---|---|
| reproducir y pausar | «reproduce», «dale play», «continúa», «pausa», «para», «detente» |
| cambiar de pista | «siguiente pista», «pista dos», «la primera», «pon el mar», «qué pistas hay» |
| ir a una fecha | «año 1990», «año mil novecientos noventa», «noviembre de 2007». Si no hay dato de esa fecha, va a la más cercana y lo dice |
| ir a un momento | «segundo diez», «avanza diez segundos», «retrocede», «al inicio» |
| oír lo que pasa | «qué pasa ahora» (lee la frase de «Ahora»), «lee la leyenda», «dónde estoy», «repite» |
| volumen y la guía | «sube el volumen», «baja el volumen», «volumen 50», «silencio», «ayuda» |

**Lector de pantalla: sin voces dobles.** La primera vez la guía pregunta «¿usas un lector de pantalla?». Una página no puede saberlo sola, por eso lo pregunta.

- Si dices que **sí**, la guía **nunca** usa su propia voz: escribe la respuesta en una región `aria-live` y la lee tu lector. Y si la página ya anuncia eso mismo (al pausar o elegir pista, en `#estado-rocola`; al saltar, en la lectura en vivo si su casilla está marcada), la guía no lo repite.
- Si dices que **no**, la guía responde con la voz del navegador y no escribe nada en regiones `aria-live`.
- Mientras no respondes, se comporta como si fuera «sí» (no habla). Se cambia después en «Opciones de la guía».

La música baja mientras el micrófono está abierto y mientras la guía habla.

**Cómo se conecta con la web.** `guia-voz-adaptador.js` es el único archivo que conoce la página. Usa `window.__web` (lo crea `js/principal.js`: `audio.estado()`, `audio.reproducir()`, `audio.buscar()`, `audio.fijarVolumen()`, `rocola.elegir()`, `rocola.pistaActual()`), el botón `#btn-reproducir` para pausar, y los textos que la página ya pinta (`#ahora-texto`, `#leyenda-pista`, «Qué vas a oír»). Las fechas y la serie de datos las lee de `pistas.json` y de los `_rasgos.json`. **No se cambió ningún módulo de `js/`**; en `index.html` solo se agregaron las cuatro líneas `<script>` de la guía. Si se quitan, la página queda igual.

**Si algo falta** (Firefox sin reconocimiento de voz, permiso del micrófono denegado, sin micrófono, sin voz en español), la guía lo dice con una frase clara y siempre queda el campo para escribir.

**Conversación con IA (opcional).** Viene **apagada**: `guia-voz-config.js` trae la dirección del servicio vacía. Para encenderla se publica el servicio de `servicio-ia/` (pasos en `servicio-ia/LEEME.md`) y se pone su dirección ahí. **En la web nunca hay una clave**: la clave de Gemini vive solo en el servicio, como secreto.

- La página manda la frase y el estado (pista, momento, lectura, leyenda y serie de datos); el servicio devuelve `{ accion, parametros, respuesta }`.
- Los comandos cortos («pausa», «año 1990») no pasan por la IA: se hacen al instante.
- Lo que devuelve la IA se comprueba contra una lista de trece acciones permitidas y los rangos de la pista. Lo que no cuadra se descarta y responde el intérprete de comandos.
- Sin dirección, sin internet, con error, con límite (429) o si tarda más de 6 segundos, la guía responde con sus comandos y no muestra errores.
- La persona ve el aviso «Tus frases se envían a un servicio de IA para responderte», la etiqueta «Respuesta generada por IA» y una casilla para apagarla.

**Pruebas de la guía**

```bash
node --test web/pruebas/guia-voz.test.js web/pruebas/guia-voz-ia.test.js   # intérprete y cliente de IA
cd servicio-ia && node --test pruebas/servicio.test.js                      # servicio, con un modelo de mentira
```

En navegador (Chrome sin ventana, con micrófono, voz y servicio de IA de mentira; el guion de prueba no está en el repositorio): axe con 0 violaciones en escritorio y móvil con la pregunta, el panel abierto y escuchando; 18 comandos de punta a punta; con lector de pantalla, 0 frases por voz y la guía y la página nunca dicen lo mismo a la vez; sin IA configurada no sale ninguna petición; con IA, 9 respuestas manipuladas o caídas se descartan sin avisos. `pruebas/verificar.cjs` (V1 a V14) sigue pasando con la guía puesta.

**No probado:** micrófono real, lectores de pantalla reales (NVDA, VoiceOver, TalkBack), Firefox, Safari, teléfonos reales, ni una llamada real a Gemini. La guía solo entiende y habla español.

**Créditos de ideas:** de `voice-guide.js` (Roberth): voz y velocidad a elegir, voz de Ecuador primero, texto equivalente visible. De `voz.js` (rama `mejora/auditoria-clean-code`): el «turno» que descarta frases canceladas, bajar la música al hablar y la casilla para el atajo de una tecla.

## Accesibilidad

- Todo se usa con teclado, con foco visible y un enlace «Saltar a la rocola».
- La lectura en vivo (fecha y frase) se actualiza mientras suena y se anuncia en una región `aria-live` como mucho cada 4 s; una casilla la apaga.
- Cada pista trae «Qué se ve y qué se oye» y «Colores del mapa»; el gráfico lleva un resumen en texto.
- Contraste AA o mejor en el peor caso (texto sobre una zona blanca del globo).
- `prefers-reduced-motion` y alto contraste forzado de Windows están contemplados.

## Créditos y licencias

three.js (MIT), GSAP y ScrollTrigger (licencia estándar gratuita de GreenSock, no MIT), texturas Blue Marble y Black Marble de NASA Earth Observatory (dominio público), fuentes Unbounded, Plus Jakarta Sans y Space Mono (SIL OFL), datos de NASA SVS 5207 y 3912. Hecho con ayuda de IA (Claude). No es un sitio oficial de la NASA.
