# Rocola de la Tierra

Convierte una visualización científica en video en sonido: lee los colores de cada fotograma, los traduce a valores con la barra de colores y los toca como una melodía estéreo.

Prototipo para NASA Space Apps (reto 9), probado con el video **NASA SVS 5207 — Anomalías de temperatura global 1880–2023 (GISTEMP)**.

## Qué se oye

| Dato del mapa | Sonido |
|---|---|
| valor medio (`media`) | **altura** de la voz principal (pentatónica, con glide) |
| zona caliente (`area`) | **volumen** de la voz (−6 a 0 dB) |
| posición de lo caliente (`centroide_x`) | **paneo** izquierda ↔ derecha |
| cambio de nota | **golpe** (pluck) |
| valor de referencia (p. ej. 0 °C) | **dron** grave fijo: se oye si el presente está por encima o por debajo |

Con el video real, la media extraída sigue la curva oficial de GISTEMP con una correlación de **0,99** (58 años muestreados).

## Instalación

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
sudo apt install ffmpeg        # solo para 08 (video + audio)
```

Todos los comandos se ejecutan **desde la raíz del proyecto**; si no, el script lo avisa.

## Uso rápido

```bash
python evaluar.py                                  # 18 pruebas PASA/FALLA en ~10 s (no toca salidas/)
python 04_video_sintetico.py && python 05_video_a_rasgos.py && python 06_rasgos_a_audio.py && python 07_validar.py
python 08_video_con_audio.py                       # salidas/demo_rocola.mp4
```

## Pipeline

| Script | Entrada → salida |
|---|---|
| `04_video_sintetico.py [seg]` | genera un video de prueba con verdad conocida → `salidas/04_video_sintetico.mp4`, `config/config_video.json` |
| `05_video_a_rasgos.py [config]` | video → `salidas/rasgos.json` (un registro por fotograma muestreado) |
| `06_rasgos_a_audio.py [rasgos]` | rasgos → `salidas/rocola.wav` (estéreo) + `salidas/control.json` |
| `07_validar.py` | comprueba tono y paneo del WAV → `salidas/validacion.png` + PASA/FALLA |
| `08_video_con_audio.py [video] [wav] [mp4]` | une video y audio sincronizados → `salidas/demo_rocola.mp4` |

`sintesis.py` es el motor de audio (osciladores, ADSR, escalas, paneo). Los scripts `01`–`03` son ejercicios de síntesis básica.

## Video real (NASA SVS 5207)

1. Descarga en `datos/` (no se versiona), desde <https://svs.gsfc.nasa.gov/5207/>: `2023GISTEMP_Map_SOS.mp4`, `giss_navy_anomaly_Vertical-both.png` y `time.txt`.
2. Calibra: detecta el mapa y el degradado de la barra y guarda `salidas/calibracion.png` para revisarlos.
   ```bash
   python -m herramientas.calibrar                     # muestra la imagen y pide el rango
   python -m herramientas.calibrar --vmin -2 --vmax 2  # rango leído en la barra → config/config_eic.json
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
| `fechas` | — | `time.txt` → añade `fecha` a cada rasgo |
| `referencia` | primer fotograma | valor en el que suena el dron (0 = sin anomalía) |
| `dist_max` | 8.0 | distancia de color (Lab) máxima para aceptar un píxel |
| `mascara_estatica`, `umbral_estatico`, `frac_estatico` | true, 3.0, 0.7 | descartar tierra, costas y logos que no cambian |
| `mascara_imagen` | — | máscara a mano (PNG, negro = descartar) |

## Contrato de datos (`rasgos.json`)

```json
{"t": 20.0, "fecha": 1981, "media": 0.26, "area": 0.12, "centroide_x": 0.49, "cambio": 0.26, "validos": 0.84}
```

`validos` es la fracción de píxeles reconocidos en la paleta; si baja de 0,8, revisa el recorte. Otros módulos pueden **añadir** campos (p. ej. `"evento": "huracan"`) sin romper el motor de sonido.

## Estructura

```
sintesis.py  rutas.py  01…08_*.py  evaluar.py    código (raíz)
config/        configuraciones de 05
datos/         videos y barras descargados (ignorado por git)
salidas/       todo lo generado (WAV, MP4, PNG, JSON)
herramientas/  calibrar.py, verificar_01.py, graficar_01.py   →  python -m herramientas.<nombre>
docs/          CAMBIOS.txt (historial de cambios y verificaciones), PLAN.md
```

Variables de entorno: `ROCOLA_SALIDAS` y `ROCOLA_CONFIG` redirigen las carpetas; con `ROCOLA_SIN_AUDIO=1` no se reproduce sonido.

## Limitaciones conocidas

- El rango de °C de la barra se lee a ojo en `calibracion.png` (no hay OCR).
- El mapa del video SVS 5207 es más pálido que su barra, por eso `dist_max` es 17 en ese config.
- `demo_rocola.mp4`: el video empieza 0,1 s después del audio. Es la configuración que no se entrecorta en VLC.

El detalle de cada cambio y de cada medición está en [docs/CAMBIOS.txt](docs/CAMBIOS.txt).
