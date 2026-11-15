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
| `equipo.json` | integrantes: nombre, carrera y aporte (si `aporte` está vacío, no se muestra) |
| `js/principal.js` | arranque y bucle único de animación |
| `js/audio.js` | cargar, reproducir, volumen, amplitud y espectro; dos buses (audio del mp4 y sonido en vivo) y `desbloquear()` |
| `js/mapeo.js` | cálculo puro del sonido en vivo (notas, dron, volumen, paneo, golpes) a partir de `_mapeo.json`; sin DOM ni Web Audio |
| `js/vivo.js` | motor Web Audio del sonido en vivo: nodos, planificador y sincronía con el video; `renderizar()` sin conexión |
| `js/package.json` | `{"type": "module"}`: deja que Node importe `js/*.js` para la prueba; el navegador lo ignora |
| `js/rocola.js`, `js/lectura.js`, `js/grafico.js`, `js/visualizador.js` | reproductor y sus partes |
| `js/globo.js`, `js/animaciones.js`, `js/tarjetas.js` | globo 3D, GSAP y brillo del cursor |
| `vendor/` | three, GSAP y ScrollTrigger (ver `vendor/LICENCIAS.md`) |
| `texturas/`, `fotogramas/` | texturas del globo (2048x1024) y fotogramas de las tarjetas |
| `assets/` | mp4 con el audio mezclado, `_rasgos.json`, `_mapeo.json`, `_esperado.json`, `_procedencia.json`, fuentes e íconos |
| `pruebas/verificar.cjs` | pruebas con Playwright y axe (V1 a V28) |
| `pruebas/motor.test.mjs` | pruebas de Node del cálculo del sonido en vivo contra `_esperado.json` (`node --test web/pruebas/motor.test.mjs`; también las lanza `evaluar.py`, prueba L1) |
| `hacer_icono.py` | dibuja los íconos de la pestaña |

## Regenerar los medios desde el pipeline

Los mp4 y los rasgos de `assets/` salen del pipeline, con la misma salida que el demo y con una comprobación de que el audio del mp4 es el de `rocola.wav`:

```bash
python -m herramientas.exportar_web      # mp4, _rasgos.json y _procedencia.json
python -m herramientas.exportar_mapeo    # _mapeo.json y _esperado.json
python -m herramientas.exportar_paleta   # _paleta.json (barra de colores, para «Explorar el mapa»)
```

## Sonido en vivo

Cada pista tiene un selector **Pista original / Sonido en vivo** (por defecto, la original). En vivo, el navegador genera el audio con Web Audio a partir de `assets/<id>_rasgos.json` y `assets/<id>_mapeo.json`, con el mismo mapeo que `06_rasgos_a_audio.py` (especificación: `docs/ESPEC_MODO_EN_VIVO.md`; plan y decisiones: `docs/PLAN_MODO_EN_VIVO.md`). El `<video>` sigue sonando con ganancia 0 y hace de reloj: reproducir, pausar, buscar, velocidad (`ratechange`) y final se siguen solos. El timbre es el del respaldo numpy (voz sostenida más un golpe), no la marimba del mp4; las notas, el dron, el volumen y el paneo son los mismos.

- **Sin números a mano:** el motor lee todo de `_mapeo.json` (escala, `vmin_sonido`/`vmax_sonido`, eje de paneo `centroide_y`, percentiles, umbrales). Las únicas constantes del código son de timbre (`mapeo.js` y `vivo.js`).
- **Casillas de rasgos:** melodía, volumen y paneo desmarcados quedan fijos (nota de la referencia, 0 dB, centro); el dron desmarcado se silencia. Sirve para oír cada rasgo por separado.
- **Autoplay:** el `AudioContext` se crea y reanuda solo dentro de un gesto del usuario (`audio.desbloquear()` es la primera línea síncrona de cada manejador).
- **Dron:** seno continuo, ~7 dB bajo la melodía (medido con `vivo.renderizar()` en la prueba V28), centrado como en 06.
- **Sin Web Audio o sin `_mapeo.json`:** el selector queda deshabilitado con el motivo.

## Cambiar textos

Los textos de cada pista están en `pistas.json`. La frase de la lectura en vivo sale de `lectura.plantilla` con estos marcadores: `{fecha}`, `{valor}`, `{valor_signo}` (con + o −), `{dif_ref_signo}` (diferencia con la referencia) y `{area}` (porcentaje). Los textos fijos de la página están en `index.html`.

## Publicar

- **GitHub Pages:** en el repositorio, Settings → Pages → Source «GitHub Actions». Luego Actions → «Publicar la web» → Run workflow. Queda en <https://misaelvayas-ui.github.io/rocola_practica/>. El flujo solo corre a mano.
- **Vercel:** importa el repositorio, Root Directory `web`, sin comando de compilación.

## Pruebas

Necesitan Node 18 o más. Las dependencias están fijadas en `web/pruebas/package.json`:

```bash
cd web/pruebas && npm install && npx playwright install chromium && cd ../..
mkdir -p /tmp/webm && for id in gistemp_1880_2023 sst_ecco2_2007_2008; do ffmpeg -y -v error -i web/assets/$id.mp4 -c:v libvpx -b:v 400k -c:a libopus /tmp/webm/$id.webm; done
(cd web && python -m http.server 8137 &)
WEBM_DIR=/tmp/webm node web/pruebas/verificar.cjs http://localhost:8137/ /tmp/capturas
```

El Chromium de Playwright no trae H.264 ni AAC: por eso las pruebas usan copias webm (`WEBM_DIR`). Son 31 comprobaciones (V1 a V31).
Una captura que falla es un `[AVISO]` y no corta el informe. V29 falla si `equipo.json` tiene textos de relleno o si la cifra de
pruebas de la portada no coincide con `evaluar.py`. V30 prueba el botón «Antes y después» y V31 «Explorar el mapa». Lighthouse se corre con `--preset=desktop`.

## Accesibilidad

- Todo se usa con teclado, con foco visible y un enlace «Saltar a la rocola». Atajos fuera de los campos de texto: Espacio reproduce o pausa; ← y → mueven ±5 s.
- **Sonido en vivo:** el selector y las casillas son controles nativos con etiqueta (`fieldset`/`legend`), se usan con teclado y cada cambio se anuncia en la región de estado.
- El gráfico es un control (`role="slider"`): clic, o ← → y Enter, saltan el video a ese momento. La barra de avance se mueve de 1 s en 1 s.
- La lectura en vivo (fecha y frase) se actualiza mientras suena. A la región `aria-live` va una frase corta ("1956: +0,31 °C", `plantilla_viva` en `pistas.json`), siempre la del fotograma actual, y no se envía otra hasta que el lector pueda haber terminado (≥ 3 s); una casilla la apaga. La fecha sobre el video es solo visual (`aria-hidden`).
- Cada pista trae «Qué se ve y qué se oye» y «Colores del mapa»; el gráfico lleva un resumen en texto.
- En pantallas de hasta 899 px el menú es un botón con `aria-expanded`; se cierra con Esc, al elegir una opción y al pulsar fuera.
- Contraste AA o mejor en el peor caso (texto sobre una zona blanca del globo).
- `prefers-reduced-motion` y alto contraste forzado de Windows están contemplados.

## Créditos y licencias

three.js (MIT), GSAP y ScrollTrigger (licencia estándar gratuita de GreenSock, no MIT), texturas Blue Marble y Black Marble de NASA Earth Observatory (dominio público), fuentes Unbounded, Plus Jakarta Sans y Space Mono (SIL OFL), datos de NASA SVS 5207 y 3912. Hecho con ayuda de IA (Claude). No es un sitio oficial de la NASA.
