# Resonant Earth: la rocola de la Tierra

**English version: [README_EN.md](README_EN.md)**

Convierte una visualización científica en video en sonido: lee los colores de cada fotograma, los traduce a valores con la barra de colores y los toca como una melodía estéreo.

Prototipo del equipo Resonant Earth para NASA Space Apps 2026 (reto 9, «The Earth Information Jukebox»). Datos de la NASA: **SVS 5207 — Anomalías de temperatura global 1880–2023 (GISTEMP)** y **SVS 3912 — Corrientes y temperatura de la superficie del mar (ECCO2), 2007–2008**. La web se llama «Escucha la Tierra».

## Guía de 5 minutos para el jurado

1. Abre la web: <https://misaelvayas-ui.github.io/resonant-earth/> (en inglés con los botones ES / EN de la cabecera o con `?lang=en`; o, sin internet, `cd web && python -m http.server 8001` y <http://localhost:8001>).
2. Pulsa **Temperatura del planeta** y escucha 30 segundos con auriculares. La melodía se queda abajo un siglo y sube en los últimos cuarenta años. La nota grave fija es el promedio de 1951–1980.
3. Pulsa **Antes y después**: suenan los primeros 5 segundos (1881–1903) y enseguida los últimos (2011–2023).
4. Pulsa **Explorar el mapa** y mueve el cursor (o las flechas): cada punto suena y dice su latitud, longitud y temperatura, calculadas en ese instante desde el color del fotograma.
5. Cambia a **Sonido en vivo** y apaga casillas (melodía, volumen, paneo, dron) para oír qué aporta cada capa.
6. La cifra clave: lo que leemos del video coincide con la serie oficial GISTEMP de la NASA con una **correlación de 0,99** (58 años). Se repite con un comando: `python -m herramientas.validar_gistemp`.
7. Límites que declaramos: nuestra lectura queda 0,09 °C por debajo de la serie oficial; la pista del mar es un índice relativo, no grados exactos; el paneo de GISTEMP lo decide una zona pequeña del mapa.
8. Todo está probado: `python evaluar.py` (47 pruebas) y `web/pruebas/verificar.cjs` (34 comprobaciones con Playwright y axe).

## Cómo respondemos al reto «The Earth Information Jukebox»

| Lo que pide el enunciado | Dónde está |
|---|---|
| Una «rocola» donde se elige una visualización del EIC y se oye su paisaje sonoro | La web (`web/`): dos pistas con su video, su sonido y su lectura. SVS 3912 (corrientes y temperatura del mar) está en la lista de recursos del reto |
| Sonificaciones **generadas en tiempo real** a partir de los fotogramas | «Sonido en vivo»: el navegador genera el audio mientras corre el video. «Explorar el mapa»: lee el color del píxel bajo el cursor en el fotograma y lo toca en ese instante |
| Analizar los fotogramas (visión por computador: color → sonido) | `05_video_a_rasgos.py` lee la barra de colores del propio video y convierte cada píxel en valor; `web/js/explorar.js` hace lo mismo en el navegador con `<id>_paleta.json` |
| Equilibrio entre dato y música | Escala pentatónica, dron de referencia, arpegios; y pruebas que exigen que cada nota coincida con el dato (`evaluar.py`, 07, I1) |
| Traducción exploratoria e interactiva | Casillas para apagar melodía, volumen, paneo o dron; gráfico navegable; «Antes y después»; «Explorar el mapa» |
| Accesibilidad para personas ciegas o con baja visión: lector de pantalla, respuesta táctil, texto descriptivo | Todo con teclado; lectura en vivo para el lector de pantalla; descripción de cada pista; mapa explorable con flechas que dice latitud, longitud y valor; vibración al cambiar de nota (teléfonos que la permiten) |
| Contar el porqué de las decisiones | Sección «El porqué» de la web, `docs/CAMBIOS.txt` (registro de cada ronda de cambios, con sus mediciones) y `docs/ESPEC_MODO_EN_VIVO.md` |

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

Obligatorias: `video`, `mapa` y `barra` (rectángulos `[x0, y0, x1, y1]` en píxeles del video original), `vmin`, `vmax`, `umbral`, `fps_muestreo`, `barra_vertical`, `barra_arriba_es_max`.

| Clave opcional | Por defecto | Para qué |
|---|---|---|
| `barra_imagen` | — | leer la barra de un PNG aparte |
| `escala` | 1.0 | reducir el mapa antes de procesar (0.25 para 4096×2048); los rectángulos siguen en píxeles del video original |
| `ponderar_latitud` | false | media ponderada por cos(latitud) en mapas equirectangulares completos |
| `fechas` | — | `time.txt` (un año por línea) o un archivo `ID  AAAA-MM-DDTHH:MMZ` (2.ª columna) → añade `fecha` a cada rasgo |
| `fechas_formato` | `"anio"` | `"mes"` → `"mar 2007"` (solo con fechas ISO; con `time.txt` siempre es el año) |
| `modo_color` | `"lab"` | `"matiz"`: compara solo el matiz (HSV) con la barra; para videos cuyo color pierde brillo (líneas de flujo de ECCO2). `dist_max` pasa a unidades de matiz (0-179) |
| `brillo_min`, `saturacion_min` | 60, 60 | solo con `modo_color: "matiz"`: V y S mínimos para que un píxel cuente (la media sube al subir `brillo_min`) |
| `referencia` | primer fotograma | valor en el que suena el dron (0 = sin anomalía) |
| `vmin_sonido`, `vmax_sonido` | `vmin`, `vmax` | rango de la media que se reparte entre las notas (GISTEMP: −0,6 a 1,2) |
| `densidad_umbrales` | 50 % y 72 % del rango de sonido | `[u1, u2]`: media bajo u1 → 1 nota; hasta u2 → 2; más → 4 |
| `paneo` | `"x"` | eje del paneo: `"x"` izquierda–derecha del mapa, `"y"` sur–norte (si el centroide recorre menos del 10 % del mapa, el paneo se reduce) |
| `dron_octava` | 0 | octavas extra del dron (0 = una octava bajo la melodía) |
| `rasgo_tono` | `"media"` | rasgo que 06 convierte en nota (p. ej. `"dif_hemisferios"`); entonces `vmin_sonido`/`vmax_sonido` son obligatorios y, con `referencia`, `densidad_umbrales` y `umbral_evento`, van en las unidades de ese rasgo |
| `hemisferios` | false | añade `media_norte`, `media_sur` y `dif_hemisferios` a cada rasgo (supone un mapa de +90 a −90) |
| `ligar` | true | misma nota que la anterior → se extiende en vez de volver a atacar |
| `suavizado` | 3 | media móvil centrada de N fotogramas sobre la media (0 o 1 = sin suavizar) |
| `densidad` | true | false = una nota por fotograma |
| `regolpe_ligado`, `regolpe_vel` | 1, 0.7 | una nota ligada se vuelve a tocar cada N fotogramas (0 = nunca), a esa fracción de su velocidad |
| `umbral_evento` | 1/12 del rango de sonido | si la media cruda cambia más que esto entre fotogramas, ataque fuerte (velocidad ≥ 100) aunque la nota no cambie |
| `octava` | 1 | desplaza melodía y dron (+1 = una octava arriba) |
| `humanizar` | true | velocidad ±10 % y tiempo ±10 ms, con semilla fija |
| `instrumento_melodia`, `dron_programa` | 13, 90 | programas GM numerados desde 1 (marimba y pad; el pad 89 se apaga en ~6 s en FluidR3) |
| `dron_nivel` | 0.048 | volumen del dron (con FluidSynth queda ~7 dB bajo la marimba) |
| `reverb` | 50 | CC91, 0–127 |
| `validos_min` | 0.5 (0.1 con `matiz`) | aviso si la mediana de `validos` queda por debajo |
| `dist_max` | 8.0 | distancia de color (Lab) máxima para aceptar un píxel |
| `mascara_estatica`, `umbral_estatico`, `frac_estatico` | true, 3.0, 0.7 | descartar tierra, costas y logos: un píxel es estático si en el 70 % de los fotogramas queda a ≤ 3 niveles de su mediana |
| `mascara_imagen` | — | máscara a mano (PNG, negro = descartar) |
| `borde_px` | 1 | píxeles descartados alrededor de lo no válido (antialias de costas y texto; 0 con líneas finas) |

Para el sonido sin adornos: `ligar: false, suavizado: 0, densidad: false, octava: 0, humanizar: false`.

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
docs/          CAMBIOS.txt (historial de cambios), ESPEC_MODO_EN_VIVO.md (reglas del modo en vivo), datos_oficiales/
```

Variables de entorno: `ROCOLA_SALIDAS` y `ROCOLA_CONFIG` redirigen las carpetas; con `ROCOLA_SIN_AUDIO=1` no se reproduce sonido.

## Limitaciones conocidas

- Segundo video, SVS 3912 (ECCO2): se procesa con `python 05_video_a_rasgos.py config/config_sst.json` y `ROCOLA_SALIDAS=salidas_sst`. Solo el 26 % del mapa es válido (las líneas brillantes) y la media sale unos °C más alta que la real, así que sirve para la forma estacional y no para el valor absoluto; la web lo indica.
- El rango de °C de la barra se lee a ojo en `calibracion.png` (no hay OCR).
- El mapa del video SVS 5207 es más pálido que su barra, por eso `dist_max` es 17 en ese config.
- Cada fotograma muestreado dura 0,5 s de audio (`SEG_POR_FOTOGRAMA` en 06): con `fps_muestreo` distinto de 2, el video de 08 se estira o se comprime para igualar el audio (el ejemplo sintético, a 4, se ve a mitad de velocidad).
- `demo_rocola.mp4`: el video empieza 0,1 s después del audio. Es la configuración que no se entrecorta en VLC.
- Los textos en inglés de la web los escribió una IA y no los ha revisado una persona nativa; tampoco se han probado con un lector de pantalla en inglés.
- Sin probar por el equipo: Safari (macOS e iOS), Firefox, una pestaña oculta 10 segundos y auriculares reales.
- `web/equipo.json` tiene los aportes de cada integrante vacíos; la web no muestra nada en su lugar.

El detalle de cada cambio y de cada medición está en [docs/CAMBIOS.txt](docs/CAMBIOS.txt).

## Uso de IA

Las reglas del NASA Space Apps Challenge permiten usar IA si se declara. Esto es lo que se hizo con ayuda de IA y qué no:

- **Herramienta:** Claude (Anthropic), usado desde Claude Code.
- **Código:** buena parte del programa en Python (`04`–`08`, `sintesis.py`, `evaluar.py`, `herramientas/`) y toda la web (`web/`, incluido el modo de sonido en vivo con Web Audio) se escribieron con ayuda de Claude.
- **Documentación:** este README, `web/README.md`, `docs/` y los textos de la web se redactaron con ayuda de Claude.
- **Revisión del equipo:** el equipo revisó, ejecutó y validó todo lo que la IA escribió: las pruebas (`evaluar.py`, `web/pruebas/`) y la comparación con la serie oficial GISTEMP y la accesibilidad (axe, teclado). Cada ronda hecha con IA está anotada como tal en [docs/CAMBIOS.txt](docs/CAMBIOS.txt).
- **Lo que NO es IA:** el sonido y las descripciones. La música sale de reglas fijas sobre los números leídos del video (ver «Qué se oye»), y las frases de «Qué pasa ahora» se arman con plantillas a partir de los mismos números. Con los mismos datos, el resultado es siempre el mismo.
- **Imágenes:** la web no usa imágenes generadas con IA. El ícono se dibuja por código (`web/hacer_icono.py`), las texturas del globo son de la NASA y `web/assets/compartir.jpg` es una captura de la propia web.
- **Datos:** no hay datos generados con IA. Los videos son de la NASA (Scientific Visualization Studio).

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
