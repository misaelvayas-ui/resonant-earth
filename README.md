# Resonant Earth: la rocola de la Tierra

**English version: [README_EN.md](README_EN.md)**

Convierte visualizaciones científicas de la NASA en sonido: lee los colores de cada fotograma, los mapea a valores físicos usando la propia barra de colores del video y genera una melodía estéreo en tiempo real.

Proyecto del equipo Resonant Earth para el **NASA Space Apps Challenge 2026** (reto *The Earth Information Jukebox*). Trabaja con dos conjuntos de datos de la NASA: **SVS 5207** (anomalías de temperatura global 1880–2023, GISTEMP) y **SVS 3912** (corrientes y temperatura superficial del mar 2007–2008, ECCO2). La interfaz web se llama **Escucha la Tierra**.

## Guía de 5 minutos para el jurado

1. **Abre la aplicación:** entra a <https://misaelvayas-ui.github.io/resonant-earth/> (puedes cambiar a inglés desde el botón **EN** en la cabecera o con `?lang=en`). Si prefieres ejecutarla en local sin internet, corre `cd web && python -m http.server 8001` y abre <http://localhost:8001>.
2. **Escucha la temperatura global:** selecciona **Temperatura del planeta** y déjala correr unos 30 segundos, idealmente con auriculares. La melodía se mantiene en registros graves durante casi un siglo y sube de tono en las últimas cuatro décadas; el dron grave de fondo marca la referencia del promedio 1951–1980.
3. **Compara extremos:** pulsa **Antes y después** para oír 5 segundos del inicio de la serie (1881–1903) seguidos inmediatamente por el tramo final (2011–2023).
4. **Explora el mapa:** activa **Explorar el mapa** y mueve el cursor o las flechas del teclado sobre el mapa. Cada punto calcula su valor a partir del color del fotograma actual, emite su nota y anuncia latitud, longitud y temperatura.
5. **Aísla cada capa sonora:** cambia a **Sonido en vivo** y activa o desactiva las casillas de melodía, volumen, paneo y dron para comprobar cómo cada variable del mapa altera el audio.
6. **Verifica la precisión científica:** los valores extraídos directamente de los píxeles del video tienen una **correlación de 0,99** frente a la serie oficial GISTEMP de la NASA (58 años muestreados). Puedes reproducir esta validación con `python -m herramientas.validar_gistemp`.
7. **Revisa las pruebas automatizadas:** el repositorio incluye 47 pruebas del pipeline en Python (`python evaluar.py`) y 34 comprobaciones de interfaz y accesibilidad con Playwright y axe (`web/pruebas/verificar.cjs`).

## Cómo respondemos al reto «The Earth Information Jukebox»

| Lo que pide el enunciado | Cómo lo resolvemos |
|---|---|
| Una «rocola» donde elegir visualizaciones del EIC y oír su paisaje sonoro | La interfaz web (`web/`) integra dos pistas completas con video, audio y lectura sincronizada; SVS 3912 forma parte de los recursos oficiales del reto |
| Sonificaciones **generadas en tiempo real** a partir de los fotogramas | En **Sonido en vivo**, el navegador sintetiza el audio con Web Audio mientras avanza el video; en **Explorar el mapa**, lee el píxel bajo el cursor y lo convierte en nota al instante |
| Análisis de fotogramas por visión por computador (color → sonido) | `05_video_a_rasgos.py` calibra los colores del mapa contra la barra del propio video; `web/js/explorar.js` replica ese mapeo en el navegador usando `<id>_paleta.json` |
| Equilibrio entre rigor de datos y musicalidad | Escala pentatónica de 3 octavas, dron de referencia y arpegios por intensidad; tanto `evaluar.py` (I1) como `07_validar.py` verifican que cada nota corresponda al dato real |
| Traducción exploratoria e interactiva | Control independiente por capas (melodía, volumen, paneo, dron), gráfico temporal navegable, comparación «Antes y después» y exploración punto a punto |
| Accesibilidad para personas ciegas o con baja visión | Navegación completa por teclado, regiones en vivo para lectores de pantalla, descripciones textuales por pista, exploración por flechas con lectura de coordenadas/valor y respuesta háptica al cambiar de nota en móviles compatibles |
| Trazabilidad y justificación de decisiones | Sección «El porqué» dentro de la web, historial técnico con mediciones en `docs/CAMBIOS.txt` y especificación del motor en tiempo real en `docs/ESPEC_MODO_EN_VIVO.md` |

## Web

La aplicación web (`web/`) es bilingüe (español e inglés mediante los botones ES / EN o `?lang=en`) e incluye las dos pistas reales (GISTEMP y SST/ECCO2). Sus recursos multimedia y mapas de parámetros se regeneran desde el pipeline con `python -m herramientas.exportar_web` y `python -m herramientas.exportar_mapeo`. Más detalles en [web/README.md](web/README.md).

## Qué se oye

| Dato extraído del mapa | Parámetro sonoro |
|---|---|
| Valor medio (`media`) | **Altura** de la voz principal en una escala pentatónica de 3 octavas |
| Zona caliente (`area`) | **Volumen** de la voz (−6 a 0 dB, escalado entre el área mínima y máxima de la pista) |
| Posición del calor (`centroide_x` o `centroide_y`, según `paneo`) | **Paneo** estéreo izquierda ↔ derecha (con `"paneo": "y"`, sur ↔ norte, usado en GISTEMP y SST); si `area < 0,01`, el sonido se centra |
| Cambio de nota | **Ataque** (pluck) para marcar transiciones de registro |
| Valor de referencia (p. ej. 0 °C) | **Dron** continuo (pad sostenido, GM 90) una octava por debajo de la nota de referencia, permitiendo oír si el presente está por encima o por debajo de la línea base |
| Anomalía alta | **Densidad rítmica**: 1, 2 o 4 notas por fotograma en arpegio ascendente (o descendente al alcanzar el techo de la escala) |

Sobre el video real de GISTEMP, la serie extraída sigue la curva oficial de la NASA con una correlación de **0,99** (58 años muestreados, con un sesgo de −0,09 °C). Esto se comprueba con `python -m herramientas.validar_gistemp` y en la prueba M1 de `evaluar.py`; los datos de referencia están en `docs/datos_oficiales/`.

## Instalación

**Ubuntu / Debian**
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
sudo apt install ffmpeg                          # 08 (unión de video y audio)
sudo apt install fluidsynth fluid-soundfont-gm   # 06: instrumentos reales (opcional; sin esto usa respaldo numpy)
```

**macOS**
```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
brew install ffmpeg fluid-synth                  # fluid-synth es opcional
export ROCOLA_SF2=/ruta/a/FluidR3_GM.sf2         # ruta a una SoundFont General MIDI (.sf2)
```
*Nota para macOS:* el paquete `opencv-python-headless` de pip no incluye soporte de escritura `mp4v` y el `ffmpeg` de Homebrew no trae `drawtext`; tanto `video_io.py` como `08_video_con_audio.py` detectan estas limitaciones y usan alternativas automáticas con ffmpeg y Pillow.

**Windows (PowerShell)** *(no probado en esta entrega; los nombres de paquete pueden variar)*
```powershell
py -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt
winget install Gyan.FFmpeg                       # 08 (reinicia la terminal para actualizar el PATH)
winget install FluidSynth.FluidSynth             # opcional
$env:ROCOLA_SF2 = "C:\ruta\FluidR3_GM.sf2"      # SoundFont GM (.sf2) para FluidSynth
```

Sin FluidSynth o sin una SoundFont configurada, `06_rasgos_a_audio.py` sigue funcionando mediante síntesis aditiva en NumPy (mismas notas y tiempos, distinto timbre). Sin `ffmpeg` únicamente falla el paso `08`. Todos los comandos deben ejecutarse **desde la raíz del repositorio**.

## Uso rápido

```bash
python evaluar.py                                  # 47 pruebas automatizadas (1-2 min, no modifica salidas/)
python -m herramientas.validar_gistemp             # validación contra la serie oficial GISTEMP (r = 0,99)
python 04_video_sintetico.py && python 05_video_a_rasgos.py && python 06_rasgos_a_audio.py && python 07_validar.py
python 08_video_con_audio.py                       # genera salidas/demo_rocola.mp4
```

## Pipeline

| Script | Entrada → Salida |
|---|---|
| `04_video_sintetico.py [seg]` | Genera un video sintético con valores conocidos → `salidas/04_video_sintetico.mp4`, `config/config_video.json` |
| `05_video_a_rasgos.py [config]` | Extrae métricas por fotograma desde el video → `salidas/rasgos.json` |
| `06_rasgos_a_audio.py [rasgos] [--sintetico]` | Convierte rasgos en MIDI y audio estéreo (marimba + dron pad vía FluidSynth, o respaldo NumPy con `--sintetico`) → `salidas/rocola.mid`, `salidas/rocola.wav`, `salidas/control.json` |
| `07_validar.py` | Verifica afinación, notas, tendencia y paneo en el WAV generado → `salidas/validacion.png` |
| `08_video_con_audio.py [video] [wav] [mp4]` | Sincroniza y combina el video original con la pista de audio → `salidas/demo_rocola.mp4` |

`sintesis.py` concentra el motor de audio (osciladores, envolventes ADSR, escalas y paneo). Los ejercicios iniciales de síntesis (`01`–`03`) se conservan en el tag `practica-completa`.

## Procesamiento de datos reales (NASA SVS 5207)

1. Descarga en `datos/` (carpeta excluida de Git) desde <https://svs.gsfc.nasa.gov/5207/>: `2023GISTEMP_Map_SOS.mp4`, `giss_navy_anomaly_Vertical-both.png` y `time.txt`.
2. Calibra los recortes del mapa y la barra de colores (genera `salidas/calibracion.png` para inspección visual):
   ```bash
   python -m herramientas.calibrar
   python -m herramientas.calibrar --vmin -2 --vmax 2 --fechas datos/time.txt --salida config/config_eic.json
   ```
3. Extrae los rasgos y sintetiza el audio (≈25 s para 60 fotogramas):
   ```bash
   python 05_video_a_rasgos.py config/config_eic.json
   python 06_rasgos_a_audio.py
   ```
4. Genera el video final con audio sincronizado:
   ```bash
   python 08_video_con_audio.py datos/2023GISTEMP_Map_SOS.mp4 salidas/rocola.wav salidas/demo_gistemp.mp4
   ```

Este flujo sobrescribe `salidas/rasgos.json` y `salidas/rocola.wav`. Para volver al caso de prueba sintético, ejecuta nuevamente la secuencia `04` → `07`.

## Configuración de 05

Cada visualización tiene su archivo de configuración en `config/`. Las claves principales son:

| Clave | Descripción |
|---|---|
| `mapa`, `barra` | Coordenadas `[x0, y0, x1, y1]` del área del mapa y de la barra de colores en píxeles originales |
| `vmin`, `vmax` | Valores físicos en los extremos de la barra (verificados en `salidas/calibracion.png`) |
| `fps_muestreo` | Fotogramas por segundo muestreados (cada fotograma equivale a 0,5 s de audio) |
| `dist_max` | Tolerancia máxima de distancia de color para aceptar un píxel (8 por defecto; 17 en GISTEMP) |
| `referencia` | Valor base en el que suena el dron (0 °C de anomalía en GISTEMP) |
| `paneo` | Eje espacial (`"x"` o `"y"`) mapeado al panorama estéreo izquierda–derecha |

La referencia completa de parámetros y valores por defecto está en [docs/CONFIG.md](docs/CONFIG.md).

## Contrato de datos (`rasgos.json`)

```json
{"t": 20.0, "fecha": 1981, "media": 0.26, "area": 0.12, "centroide_x": 0.49, "centroide_y": 0.55, "cambio": 0.26, "validos": 0.84}
```

`validos` indica la fracción de píxeles reconocidos dentro de la paleta calibrada (si cae por debajo de `0,8`, conviene revisar las coordenadas de recorte). El motor de audio ignora claves adicionales, por lo que otros módulos pueden enriquecer cada registro (por ejemplo, añadiendo `"evento"`) sin romper compatibilidad.

## Estructura del repositorio

```text
sintesis.py  rutas.py  fechas.py  video_io.py  04…08_*.py  evaluar.py    pipeline principal (raíz)
config/        archivos de configuración por visualización (GISTEMP, ECCO2, sintético)
datos/         videos y barras descargados de la NASA (ignorado por Git)
salidas/       artefactos generados (WAV, MP4, PNG, JSON); salidas_sst/ guarda ECCO2 (ROCOLA_SALIDAS=salidas_sst)
herramientas/  calibrar.py         → detección de recortes y barra de colores (--mapa, --modo-color)
               exportar_mapeo.py   → genera parámetros para el sintetizador en vivo del navegador
               validar_gistemp.py  → compara la serie extraída con GISTEMP v4 oficial
               exportar_paleta.py  → exporta la tabla de colores para «Explorar el mapa»
               exportar_web.py     → empaqueta video y rasgos hacia web/assets/ verificando el audio
web/           aplicación web bilingüe con globo 3D y rocola accesible (ver web/README.md)
docs/          CAMBIOS.txt (bitácora técnica), CONFIG.md (parámetros), ESPEC_MODO_EN_VIVO.md y datos_oficiales/
```

Variables de entorno útiles: `ROCOLA_SALIDAS` y `ROCOLA_CONFIG` permiten redirigir carpetas de trabajo; `ROCOLA_SIN_AUDIO=1` desactiva la reproducción automática por altavoces al ejecutar `06`.

## Limitaciones conocidas

- **Sesgo en GISTEMP (SVS 5207):** la media extraída sigue la tendencia oficial con correlación `r = 0,99`, pero presenta un desplazamiento sistemático de −0,09 °C respecto a GISTEMP v4 debido al suavizado de color del video.
- **Pista del océano (SVS 3912 / ECCO2):** se procesa con `config/config_sst.json` y `ROCOLA_SALIDAS=salidas_sst`. Solo el 26 % del mapa corresponde a trazos válidos de corriente (los píxeles brillantes), por lo que la media calculada queda unos grados por encima de la temperatura superficial real. Sirve para seguir la oscilación estacional, no como lectura absoluta (la interfaz web lo advierte).
- **Calibración manual del rango:** los límites `vmin` y `vmax` se leen visualmente sobre `salidas/calibracion.png` (no se aplica OCR sobre las etiquetas del video).
- **Tolerancia de color en SVS 5207:** el mapa tiene tonos ligeramente más lavados que su barra de referencia, motivo por el cual `config_eic.json` eleva `dist_max` a `17`.
- **Duración y sincronización:** cada fotograma muestreado dura 0,5 s de audio (`SEG_POR_FOTOGRAMA` en `06`). Si `fps_muestreo` es distinto de 2, `08` estira o comprime la velocidad del video para ajustar la duración. En `demo_rocola.mp4` el video inicia 0,1 s después del audio para evitar cortes de reproducción en VLC.
- **Cobertura de navegadores:** probado a fondo en Chromium (escritorio y móvil) y con lectores de pantalla en español; falta validación completa en Safari, Firefox y lectores de pantalla en inglés.

El registro detallado de cada iteración y sus mediciones está en [docs/CAMBIOS.txt](docs/CAMBIOS.txt).

## Uso de IA

En cumplimiento con las normas de transparencia del NASA Space Apps Challenge, detallamos el alcance de la inteligencia artificial en este proyecto:

- **Qué diseñó y validó el equipo:** la arquitectura del pipeline de visión por computador, las reglas matemáticas de mapeo entre variables climáticas y parámetros musicales, la calibración contra los conjuntos de datos de la NASA (GISTEMP v4 y ECCO2), el diseño de accesibilidad y toda la batería de pruebas científicas y de interfaz.
- **Dónde usamos IA:** empleamos **Claude (Anthropic)** a través de Claude Code como asistente de programación para acelerar la escritura de código en Python y JavaScript, redactar borradores de documentación y generar la traducción al inglés. Todo el código fue auditado, ejecutado y ajustado por el equipo.
- **Qué no involucra IA:** la generación sonora (determinista a partir de reglas fijas y los píxeles del video), los textos dinámicos de narración (plantillas basadas en los datos extraídos), los recursos visuales (texturas de la NASA, capturas propias e ícono generado por código en `web/hacer_icono.py`) y los datos científicos.

## Referencias

**Datos y visualizaciones (NASA)**

- NASA Scientific Visualization Studio, **SVS 5207**: *Global Temperature Anomalies from 1880 to 2023* (visualización de GISTEMP). <https://svs.gsfc.nasa.gov/5207/>
- NASA Scientific Visualization Studio, **SVS 3912**: corrientes y temperatura de la superficie del mar (modelo ECCO2), 2007–2008. <https://svs.gsfc.nasa.gov/3912/>
- **GISTEMP v4**, NASA Goddard Institute for Space Studies: serie oficial de anomalías de temperatura usada para validación (`docs/datos_oficiales/`). <https://data.giss.nasa.gov/gistemp/>
- **ECCO2** (*Estimating the Circulation and Climate of the Ocean, Phase II*), NASA/JPL: modelo oceánico detrás de SVS 3912. <https://ecco.jpl.nasa.gov/>
- Texturas del globo 3D: *Blue Marble Next Generation* y *Black Marble*, NASA Earth Observatory (dominio público).

**Audio y tipografías**

- **SoundFont FluidR3_GM** (Frank Wen, licencia MIT): banco de instrumentos utilizado por FluidSynth en `06` (opcional; cuenta con respaldo en NumPy).
- **FluidSynth** (LGPL-2.1+) y **ffmpeg**: herramientas externas opcionales para síntesis MIDI y empaquetado multimedia.
- Tipografías web (`web/assets/fonts/`, licencia SIL OFL 1.1): *Unbounded*, *Plus Jakarta Sans* y *Space Mono*.

**Bibliotecas y pruebas**

- Python (`requirements.txt`): `numpy`, `scipy`, `opencv-python-headless`, `matplotlib`, `sounddevice`, `mido`.
- Web (`web/vendor/`, ver `LICENCIAS.md`): `three.js` (MIT), `GSAP` y `ScrollTrigger` (licencia estándar gratuita de GreenSock).
- Pruebas: `Playwright` y `axe-core`.

Este proyecto no está avalado oficialmente por la NASA.