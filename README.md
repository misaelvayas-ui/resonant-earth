# Rocola de la Tierra

Convierte una visualización científica en video en sonido: lee los colores de cada fotograma, los traduce a valores con la barra de colores y los toca como una melodía estéreo.

Prototipo para NASA Space Apps (reto 9), probado con el video **NASA SVS 5207 — Anomalías de temperatura global 1880–2023 (GISTEMP)**.

## Qué se oye

| Dato del mapa | Sonido |
|---|---|
| valor medio (`media`) | **altura** de la voz principal (escala pentatónica, 3 octavas) |
| zona caliente (`area`) | **volumen** de la voz (−6 a 0 dB, entre el área mínima y la máxima de la pista) |
| posición de lo caliente (`centroide_x` o `centroide_y`, según `paneo`) | **paneo** izquierda ↔ derecha (con `"paneo": "y"`: sur ↔ norte; GISTEMP y SST lo usan); con `area` < 0,01 el sonido va al centro |
| cambio de nota | **golpe** (pluck) |
| valor de referencia (p. ej. 0 °C) | **dron** (pad) fijo una octava por debajo de la nota que la melodía toca con ese valor: se oye si el presente está por encima o por debajo |
| anomalía alta | **más notas por fotograma** (1, 2 o 4, en arpegio ascendente; en lo más alto de la escala, descendente desde la nota base) |

Con el video real, la media extraída sigue la curva oficial de GISTEMP con una correlación de **0,99** (58 años muestreados).

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
brew install ffmpeg fluid-synth
export ROCOLA_SF2=/ruta/a/FluidR3_GM.sf2         # descarga una SoundFont General MIDI (.sf2)
```

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
python evaluar.py                                  # 43 pruebas PASA/FALLA en ~50 s (no toca salidas/)
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

`sintesis.py` es el motor de audio (osciladores, ADSR, escalas, paneo). Los ejercicios de síntesis básica (`01`–`03`) están en `archivo/`.

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

Ojo: esto reemplaza `salidas/rasgos.json` y `salidas/rocola.wav`. Para volver al ejemplo sintético, ejecuta de nuevo 04 → 07.

## Configuración de 05

Obligatorias: `video`, `mapa` y `barra` (rectángulos `[x0, y0, x1, y1]` en píxeles del video original), `vmin`, `vmax`, `umbral`, `fps_muestreo`, `barra_vertical`, `barra_arriba_es_max`.

| Clave opcional | Por defecto | Para qué |
|---|---|---|
| `barra_imagen` | — | leer la barra de un PNG aparte |
| `escala` | 1.0 | reducir el mapa antes de procesar (0.25 para 4096×2048) |
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
| `ligar`, `suavizado`, `densidad`, `regolpe_ligado`, `regolpe_vel`, `umbral_evento`, `octava`, `humanizar`, `dron_nivel`, `dron_programa`, `instrumento_melodia`, `reverb` | ver cabecera de 06 | musicalidad de 06 (por defecto: ligar, suavizado 3, densidad, octava +1, humanizar, re-golpe de notas ligadas cada 2 fotogramas, ataque fuerte si la media cruda cambia más de 1/12 del rango de sonido (0,15 en GISTEMP; clave `umbral_evento`), dron pad 89, marimba 13); `ligar: false, suavizado: 0, densidad: false, octava: 0, humanizar: false` = sonido simple |
| `validos_min` | 0.5 (0.1 con `matiz`) | aviso si la mediana de `validos` queda por debajo |
| `dist_max` | 8.0 | distancia de color (Lab) máxima para aceptar un píxel |
| `mascara_estatica`, `umbral_estatico`, `frac_estatico` | true, 3.0, 0.7 | descartar tierra, costas y logos que no cambian |
| `mascara_imagen` | — | máscara a mano (PNG, negro = descartar) |

## Contrato de datos (`rasgos.json`)

```json
{"t": 20.0, "fecha": 1981, "media": 0.26, "area": 0.12, "centroide_x": 0.49, "centroide_y": 0.55, "cambio": 0.26, "validos": 0.84}
```

`validos` es la fracción de píxeles reconocidos en la paleta; si baja de 0,8, revisa el recorte. Otros módulos pueden **añadir** campos (p. ej. `"evento": "huracan"`) sin romper el motor de sonido.

## Uso en el hackathon

Con el video ya descargado en `datos/` (ver "Video real"), en este orden:

```bash
python -m herramientas.calibrar --vmin -2 --vmax 2 --fechas datos/time.txt --salida config/config_eic.json   # 1. calibrar
python 05_video_a_rasgos.py config/config_eic.json   # 2. video → salidas/rasgos.json
python 06_rasgos_a_audio.py                          # 3. rasgos → salidas/rocola.wav
python 08_video_con_audio.py datos/2023GISTEMP_Map_SOS.mp4 salidas/rocola.wav salidas/demo_gistemp.mp4   # 4. video + audio
```

Después de **cada cambio** de código o de config: `python evaluar.py` (debe dar todo PASA).

## Estructura

```
sintesis.py  rutas.py  fechas.py  04…08_*.py  evaluar.py    código (raíz)
config/        configuraciones de 05
datos/         videos y barras descargados (ignorado por git)
salidas/       todo lo generado (WAV, MP4, PNG, JSON); salidas_sst/ = el de ECCO2 (ROCOLA_SALIDAS=salidas_sst)
herramientas/  calibrar.py   →  python -m herramientas.calibrar (barra vertical u horizontal; --mapa, --modo-color)
               exportar_mapeo.py → python -m herramientas.exportar_mapeo (mapeo rasgo→sonido para el modo en vivo; ver docs/ESPEC_MODO_EN_VIVO.md)
web/           rocola web accesible (la mantiene Juan; ver web/README.md)
docs/          CAMBIOS.txt (historial de cambios), AUDITORIA.md y AUDITORIA_2.md (auditorías)
archivo/       ejercicios 01–03, verificar_01/graficar_01, PLAN.md y sus salidas (nada se borró;
               también está en el tag git "practica-completa")
```

Variables de entorno: `ROCOLA_SALIDAS` y `ROCOLA_CONFIG` redirigen las carpetas; con `ROCOLA_SIN_AUDIO=1` no se reproduce sonido.

## Limitaciones conocidas

- Segundo video, SVS 3912 (ECCO2, `config/config_sst.json`): `python 05_video_a_rasgos.py config/config_sst.json` con `ROCOLA_SALIDAS=salidas_sst`. Solo ~26 % del mapa es válido (líneas brillantes) y la media sale unos °C más alta que la real (sesgo hacia lo cálido); sirve para la forma estacional, no para el valor absoluto.
- El rango de °C de la barra se lee a ojo en `calibracion.png` (no hay OCR).
- El mapa del video SVS 5207 es más pálido que su barra, por eso `dist_max` es 17 en ese config.
- Cada fotograma muestreado dura 0,5 s de audio (`SEG_POR_FOTOGRAMA` en 06): con `fps_muestreo` distinto de 2, el video de 08 se estira o se comprime para igualar el audio (el ejemplo sintético, a 4, se ve a mitad de velocidad).
- `demo_rocola.mp4`: el video empieza 0,1 s después del audio. Es la configuración que no se entrecorta en VLC.

El detalle de cada cambio y de cada medición está en [docs/CAMBIOS.txt](docs/CAMBIOS.txt).
