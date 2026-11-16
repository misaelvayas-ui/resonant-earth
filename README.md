# Resonant Earth: la rocola de la Tierra

**English version: [README_EN.md](README_EN.md)**

Convierte una visualización científica en video en sonido: lee los colores de cada fotograma, los traduce a valores con la barra de colores y los toca como una melodía estéreo.

Prototipo del equipo Resonant Earth para NASA Space Apps 2026 (reto 9, «The Earth Information Jukebox»). Datos de la NASA: **SVS 5207 — Anomalías de temperatura global 1880–2023 (GISTEMP)** y **SVS 3912 — Corrientes y temperatura de la superficie del mar (ECCO2), 2007–2008**. La web se llama «Escucha la Tierra».

## Guía de 5 minutos para el jurado

1. Abre <https://misaelvayas-ui.github.io/resonant-earth/>. El botón EN de la cabecera (o `?lang=en`) la pone en inglés. Sin internet: `cd web && python -m http.server 8001` y <http://localhost:8001>.
2. Elige **Temperatura del planeta** y escucha medio minuto, mejor con auriculares. La melodía pasa un siglo abajo y sube en los últimos cuarenta años; la nota grave que no cambia es el promedio de 1951–1980.
3. **Antes y después** toca 1881–1903 y, sin pausa, 2011–2023. Son 5 segundos de cada extremo.
4. En **Explorar el mapa**, mueve el cursor o usa las flechas. Cada punto suena y se describe (latitud, longitud, temperatura) a partir del color del fotograma en ese instante.
5. Pasa a **Sonido en vivo** y desmarca melodía, volumen, paneo o dron para oír cada capa por separado.
6. ¿Cuánto se parece al dato real? La media que leemos del video y la serie oficial GISTEMP tienen una correlación de **0,99** en 58 años. `python -m herramientas.validar_gistemp` lo recalcula.
7. Lo que no hace bien: lee 0,09 °C por debajo de la serie oficial, la pista del mar es un índice relativo y no grados, y en GISTEMP el paneo depende de una zona pequeña del mapa.
8. Pruebas: `python evaluar.py` (47) y `web/pruebas/verificar.cjs` (34 comprobaciones con Playwright y axe).

## Cómo respondemos al reto «The Earth Information Jukebox»

| Lo que pide el enunciado | Dónde está |
|---|---|
| Una «rocola» de visualizaciones del EIC con su paisaje sonoro | La web (`web/`), con dos pistas. SVS 3912 viene de la lista de recursos del reto |
| Sonificación **en tiempo real** a partir de los fotogramas | «Sonido en vivo» genera el audio en el navegador mientras corre el video. «Explorar el mapa» toca el píxel que está bajo el cursor |
| Visión por computador: color → sonido | `05_video_a_rasgos.py` calibra con la barra de colores del propio video; `web/js/explorar.js` usa la misma barra (`<id>_paleta.json`) |
| Equilibrio entre dato y música | Escala pentatónica, dron de referencia y arpegios. `evaluar.py` (I1) y 07 fallan si una nota no corresponde al dato |
| Exploración interactiva | Casillas por capa, gráfico navegable, «Antes y después», «Explorar el mapa» |
| Accesibilidad para personas ciegas o con baja visión | Teclado completo y lectura en vivo para lector de pantalla. Cada pista tiene su descripción, y el mapa se recorre con flechas. En los teléfonos que lo permiten, vibra al cambiar de nota |
| Explicar las decisiones | Sección «El porqué» de la web; mediciones de cada cambio en `docs/CAMBIOS.txt`; reglas del modo en vivo en `docs/ESPEC_MODO_EN_VIVO.md` |

## Web

La web (`web/`) es bilingüe (español e inglés: botones ES / EN en la cabecera o `?lang=en`) y tiene las dos pistas reales (GISTEMP y SST/ECCO2). Sus medios se regeneran desde el pipeline con `python -m herramientas.exportar_web` y `python -m herramientas.exportar_mapeo`. Detalles en [web/README.md](web/README.md).

## Qué se oye

| Dato del mapa | Sonido |
|---|---|
| valor medio (`media`) | **altura** de la voz principal (escala pentatónica, 3 octavas) |
| zona caliente (`area`) | **volumen** de la voz (−6 a 0 dB, entre el área mínima y la máxima de la pista) |
| posición de lo caliente (`centroide_x` o `centroide_y`, según `paneo`) | **paneo** izquierda ↔ derecha (con `"paneo": "y"`: sur ↔ norte; GISTEMP y SST lo usan); con `area` < 0,01 el sonido va al centro |
| cambio de nota | **golpe** (pluck) |
| valor de referencia (p. ej. 0 °C) | **dron** (pad sostenido, GM 90) continuo toda la pista, una octava por debajo de la nota que la melodía toca con ese valor: se oye si el presente está por encima o por debajo |
| anomalía alta | **más notas por fotograma** (1, 2 o 4, en arpegio ascendente; en lo más alto de la escala, descendente desde la nota base) |

Con el video real, la media extraída sigue la curva oficial de GISTEMP con una correlación de **0,99** (58 años muestreados;
sesgo −0,09 °C). Se comprueba con `python -m herramientas.validar_gistemp` y con la prueba M1 de `evaluar.py`; la tabla oficial
está en `docs/datos_oficiales/`.

## Instalación

**Ubuntu / Debian**
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
sudo apt install ffmpeg                          # 08 (video + audio)
sudo apt install fluidsynth fluid-soundfont-gm   # 06: instrumentos reales (sin esto, 06 usa un respaldo numpy)
```

**macOS**
```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
brew install ffmpeg fluid-synth                  # fluid-synth es opcional (sin él, 06 usa el respaldo numpy)
export ROCOLA_SF2=/ruta/a/FluidR3_GM.sf2         # descarga una SoundFont General MIDI (.sf2)
```
Probado en macOS (Intel, Python 3.13, ffmpeg 8 de Homebrew): `evaluar.py` da 46 PASA y 1 OMITIDA (K1, sin FluidSynth).
En macOS el OpenCV de pip no escribe `mp4v`: `video_io.py` lo detecta y escribe los videos de prueba con ffmpeg (mismo
códec MPEG-4). El ffmpeg de Homebrew no trae el filtro `drawtext`: 08 lo detecta y dibuja el año con Pillow.

**Windows (PowerShell)** — no probado en este proyecto; los nombres de paquete pueden variar
```powershell
py -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt
winget install Gyan.FFmpeg                       # 08 (reinicia la terminal para que lo vea el PATH)
winget install FluidSynth.FluidSynth             # opcional
$env:ROCOLA_SF2 = "C:\ruta\FluidR3_GM.sf2"      # SoundFont GM (.sf2) para FluidSynth
```

Sin fluidsynth o sin SoundFont, **06 sigue funcionando** con un respaldo numpy (mismas notas, otro timbre) y
lo avisa. Sin ffmpeg solo falla 08 (el video con audio). `ROCOLA_SF2` apunta a otra SoundFont en cualquier
sistema; `ROCOLA_SIN_AUDIO=1` evita que 06 reproduzca el resultado por los altavoces.

Todos los comandos se ejecutan **desde la raíz del proyecto**; si no, el script lo avisa.

## Uso rápido

```bash
python evaluar.py                                  # 47 pruebas PASA/FALLA en 1-2 min (no toca salidas/)
python -m herramientas.validar_gistemp             # la pista frente a la serie oficial GISTEMP: r = 0,99
python 04_video_sintetico.py && python 05_video_a_rasgos.py && python 06_rasgos_a_audio.py && python 07_validar.py
python 08_video_con_audio.py                       # salidas/demo_rocola.mp4
```

## Pipeline

| Script | Entrada → salida |
|---|---|
| `04_video_sintetico.py [seg]` | genera un video de prueba con verdad conocida → `salidas/04_video_sintetico.mp4`, `config/config_video.json` |
| `05_video_a_rasgos.py [config]` | video → `salidas/rasgos.json` (un registro por fotograma muestreado) |
| `06_rasgos_a_audio.py [rasgos] [--sintetico]` | rasgos → `salidas/rocola.mid` → `salidas/rocola.wav` (estéreo, marimba + dron pad con FluidSynth) + `salidas/control.json`. `--sintetico` (o falta de fluidsynth) usa el respaldo numpy con las mismas notas |
| `07_validar.py` | comprueba tono y notas del WAV (con el video sintético, también tendencia de tono y paneo; con uno real esas quedan NO APLICA) → `salidas/validacion.png` + PASA/FALLA |
| `08_video_con_audio.py [video] [wav] [mp4]` | une video y audio sincronizados → `salidas/demo_rocola.mp4` |

`sintesis.py` es el motor de audio (osciladores, ADSR, escalas, paneo). Los ejercicios de síntesis básica (`01`–`03`) están en el tag git `practica-completa`.

## Video real (NASA SVS 5207)

1. Descarga en `datos/` (no se versiona), desde <https://svs.gsfc.nasa.gov/5207/>: `2023GISTEMP_Map_SOS.mp4`, `giss_navy_anomaly_Vertical-both.png` y `time.txt`.
2. Calibra: detecta el mapa y el degradado de la barra y guarda `salidas/calibracion.png` para revisarlos.
   ```bash
   python -m herramientas.calibrar                     # muestra la imagen y pide el rango
   python -m herramientas.calibrar --vmin -2 --vmax 2 --fechas datos/time.txt --salida config/config_eic.json   # rango leído en la barra
   ```
3. Procesa (≈25 s para 60 fotogramas):
   ```bash
   python 05_video_a_rasgos.py config/config_eic.json
   python 06_rasgos_a_audio.py
   ```
4. Une el video original y el audio:
   ```bash
   python 08_video_con_audio.py datos/2023GISTEMP_Map_SOS.mp4 salidas/rocola.wav salidas/demo_gistemp.mp4
   ```

Esto reemplaza `salidas/rasgos.json` y `salidas/rocola.wav`. Para volver al ejemplo sintético, ejecuta de nuevo 04 → 07. Después de cada cambio de código o de config, `python evaluar.py` debe dar todo PASA.

## Configuración de 05

Cada video tiene su JSON en `config/`. Las claves que más se tocan:

| Clave | Para qué |
|---|---|
| `mapa`, `barra` | rectángulos `[x0, y0, x1, y1]` del mapa y de la barra de colores, en píxeles del video original |
| `vmin`, `vmax` | valores en los extremos de la barra (se leen a ojo en `calibracion.png`) |
| `fps_muestreo` | fotogramas por segundo que se leen; cada uno dura 0,5 s de audio |
| `dist_max` | distancia de color máxima para aceptar un píxel (8 por defecto; 17 en GISTEMP) |
| `referencia` | valor en el que suena el dron (0 °C de anomalía en GISTEMP) |
| `paneo` | `"x"` o `"y"`: eje del mapa que mueve el sonido de izquierda a derecha |

La lista completa, con los valores por defecto, está en [docs/CONFIG.md](docs/CONFIG.md).

## Contrato de datos (`rasgos.json`)

```json
{"t": 20.0, "fecha": 1981, "media": 0.26, "area": 0.12, "centroide_x": 0.49, "centroide_y": 0.55, "cambio": 0.26, "validos": 0.84}
```

`validos` es la fracción de píxeles reconocidos en la paleta; si baja de 0,8, revisa el recorte. Otros módulos pueden **añadir** campos (p. ej. `"evento": "huracan"`) sin romper el motor de sonido.

## Estructura

```
sintesis.py  rutas.py  fechas.py  video_io.py  04…08_*.py  evaluar.py    código (raíz)
config/        configuraciones de 05
datos/         videos y barras descargados (ignorado por git)
salidas/       todo lo generado (WAV, MP4, PNG, JSON); salidas_sst/ = el de ECCO2 (ROCOLA_SALIDAS=salidas_sst)
herramientas/  calibrar.py   →  python -m herramientas.calibrar (barra vertical u horizontal; --mapa, --modo-color)
               exportar_mapeo.py → python -m herramientas.exportar_mapeo (mapeo rasgo→sonido para el modo en vivo; ver docs/ESPEC_MODO_EN_VIVO.md)
               validar_gistemp.py → python -m herramientas.validar_gistemp (correlación con la serie oficial GISTEMP v4)
               exportar_paleta.py → python -m herramientas.exportar_paleta (barra de colores de cada pista para «Explorar el mapa»)
               exportar_web.py   → python -m herramientas.exportar_web (MP4 y rasgos de web/assets desde la MISMA salida que el demo; comprueba el audio)
web/           web del proyecto: GISTEMP y SST con globo 3D y rocola accesible (ver web/README.md)
docs/          CAMBIOS.txt (historial de cambios), CONFIG.md (claves de 05 y 06), ESPEC_MODO_EN_VIVO.md (reglas del modo en vivo), datos_oficiales/
```

Variables de entorno: `ROCOLA_SALIDAS` y `ROCOLA_CONFIG` redirigen las carpetas; con `ROCOLA_SIN_AUDIO=1` no se reproduce sonido.

## Limitaciones conocidas

- Segundo video, SVS 3912 (ECCO2): se procesa con `python 05_video_a_rasgos.py config/config_sst.json` y `ROCOLA_SALIDAS=salidas_sst`. Solo el 26 % del mapa es válido (las líneas brillantes) y la media sale unos °C más alta que la real, así que sirve para la forma estacional y no para el valor absoluto; la web lo indica.
- El rango de °C de la barra se lee a ojo en `calibracion.png` (no hay OCR).
- El mapa del video SVS 5207 es más pálido que su barra, por eso `dist_max` es 17 en ese config.
- Cada fotograma muestreado dura 0,5 s de audio (`SEG_POR_FOTOGRAMA` en 06): con `fps_muestreo` distinto de 2, el video de 08 se estira o se comprime para igualar el audio (el ejemplo sintético, a 4, se ve a mitad de velocidad).
- `demo_rocola.mp4`: el video empieza 0,1 s después del audio. Es la configuración que no se entrecorta en VLC.
- Sin probar por el equipo: Safari (macOS e iOS), Firefox, una pestaña oculta 10 segundos y auriculares reales.

El detalle de cada cambio y de cada medición está en [docs/CAMBIOS.txt](docs/CAMBIOS.txt).

## Uso de IA

Las reglas del NASA Space Apps Challenge permiten usar IA si se declara.

El equipo diseñó el sistema: cómo se lee un video del SVS, qué rasgos se extraen, las reglas que convierten cada rasgo en sonido (escala, dron de referencia, paneo, densidad de notas), la calibración de GISTEMP y ECCO2 y la validación contra la serie oficial GISTEMP v4. También decidió qué entraba en la web y cómo debía funcionar para una persona ciega.

Para escribir el código y los textos usamos Claude (Anthropic) desde Claude Code. Con su ayuda se escribió buena parte del programa en Python (`04`–`08`, `sintesis.py`, `evaluar.py`, `herramientas/`), la web completa (`web/`, con el modo en vivo en Web Audio), las pruebas y los borradores de la documentación y de los textos de la web, incluida la traducción al inglés. Todo pasó por el equipo: lo ejecutamos, lo comparamos con los datos de la NASA, lo probamos con teclado y axe, y corregimos lo que no cuadraba.

Lo que no sale de una IA:

- El sonido. La música sale de reglas fijas aplicadas a los números leídos del video (ver «Qué se oye»). Con los mismos datos el resultado es siempre el mismo.
- Las frases de «Qué pasa ahora», que se arman con plantillas a partir de esos números.
- Las imágenes. El ícono se dibuja por código (`web/hacer_icono.py`), las texturas del globo son de la NASA y `web/assets/compartir.jpg` es una captura de la propia web.
- Los datos. Los videos son del NASA Scientific Visualization Studio.

## Referencias

**Datos y visualizaciones (NASA)**

- NASA Scientific Visualization Studio, **SVS 5207**: «Global Temperature Anomalies from 1880 to 2023» (visualización de GISTEMP). <https://svs.gsfc.nasa.gov/5207/>
- NASA Scientific Visualization Studio, **SVS 3912**: corrientes y temperatura de la superficie del mar (modelo ECCO2), 2007–2008. <https://svs.gsfc.nasa.gov/3912/>
- **GISTEMP v4**, NASA Goddard Institute for Space Studies: serie oficial de anomalías de temperatura que usamos para validar la lectura (`docs/datos_oficiales/`). <https://data.giss.nasa.gov/gistemp/>
- **ECCO2** (Estimating the Circulation and Climate of the Ocean, Phase II), NASA/JPL: modelo de océano detrás de SVS 3912. <https://ecco.jpl.nasa.gov/>
- Texturas del globo: Blue Marble Next Generation y Black Marble, NASA Earth Observatory (dominio público).

**Sonido**

- **SoundFont FluidR3_GM** (Frank Wen), licencia MIT: instrumentos reales que usa FluidSynth en `06`. Es opcional: sin ella `06` usa un respaldo con numpy.
- **FluidSynth** (LGPL-2.1+) y **ffmpeg**: opcionales.

**Tipografías de la web** (licencia SIL OFL 1.1, textos en `web/assets/fonts/`): Unbounded, Plus Jakarta Sans y Space Mono.

**Bibliotecas**

- Python (`requirements.txt`): numpy, scipy, opencv-python-headless, matplotlib, sounddevice, mido.
- Web (`web/vendor/`, ver `LICENCIAS.md`): three.js (MIT), GSAP y ScrollTrigger (licencia estándar gratuita de GreenSock).
- Pruebas: Playwright y axe-core.

Este proyecto no está avalado por la NASA.
