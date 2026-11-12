# Rocola de la Tierra — práctica (miércoles + jueves comprimidos)

Meta de hoy: llegar al viernes con un prototipo que convierta **video → sonido** de punta a punta, validado.

## Instalación
```bash
pip install numpy scipy opencv-python matplotlib sounddevice
```
(Si `sounddevice` falla, no pasa nada: todo se guarda en WAV.)
Ejecuta todo **desde la raíz del proyecto** (donde está `sintesis.py`), en orden; si no, el script avisa.

### Estructura
```
sintesis.py, rutas.py, 01_…08_*.py, evaluar.py   código (en la raíz)
config/       config_video.json (lo genera 04), config_eic.json (a mano)
salidas/      todo lo generado: *.wav, *.mp4, *.png, rasgos.json, control.json
herramientas/ verificar_01.py, graficar_01.py     →  python -m herramientas.verificar_01
docs/         CAMBIOS.txt (registro de rondas), PLAN.md
```
Comprobación rápida de todo el proyecto (< 30 s, no toca `salidas/`): `python evaluar.py`
(`--rapido` = solo el motor de síntesis). Con `ROCOLA_SIN_AUDIO=1` los scripts no reproducen sonido.

## Bloque A — síntesis (≈1,5 h)
| Script | Qué aprendes | Comprueba |
|---|---|---|
| `01_tono_prueba.py` | oscilador + ADSR | el 1er tono hace "clic", el 2º no |
| `02_clics_y_fase.py` | por qué se integra la frecuencia | `02a_mal.wav` termina una octava más arriba de lo debido |
| `03_datos_a_melodia.py` | MIDI→Hz, pentatónica, dron de referencia | se oye subir la serie y cruzar el dron |

Lee `sintesis.py` de arriba abajo: es el motor que reutilizan los demás.

## Bloque B — prototipo de punta a punta (≈2,5 h)
```
04_video_sintetico.py  -> salidas/04_video_sintetico.mp4 + config/config_video.json   (verdad conocida; `python 04_video_sintetico.py 2` = video de 2 s)
05_video_a_rasgos.py   -> salidas/rasgos.json + salidas/fotograma_ref.png   (inversión de paleta)
06_rasgos_a_audio.py   -> salidas/rocola.wav + salidas/control.json         (mapeo sonoro)
07_validar.py          -> salidas/validacion.png + PASA/FALLA               (prueba objetiva)
08_video_con_audio.py  -> salidas/demo_rocola.mp4                            (video + audio sincronizados; requiere ffmpeg)
```
Resultado esperado: 4 × PASA, el tono sube en escalera y el balance va de izquierda a derecha.

### El contrato JSON (lo que acuerdas con el equipo el viernes)
```json
{"t": 4.5, "media": 0.35, "area": 0.012, "centroide_x": 0.47, "cambio": 0.013, "validos": 1.0}
```
Visión por computador (tus compañeros) puede **añadir** campos, p. ej. `"evento": "huracan"`, y el motor de sonido los convierte en golpes o timbres.

## Reto final de hoy: un video real del EIC
Candidata principal: **SVS 5207 — Global Temperature Anomalies 1880–2023** (GISTEMP v4).
1. Descarga `2023GISTEMP_Map_SOS.mp4` (equirectangular: x = longitud, ideal para el paneo) y la barra `giss_navy_anomaly_Vertical-both.png`.
2. Corre `05` una vez con el config sintético cambiando solo `"video"` para obtener `salidas/fotograma_ref.png`; ábrelo y mide en píxeles el rectángulo del mapa.
3. Abre la barra PNG, mide el rectángulo del degradado (sin los números) y lee el rango en °C.
4. Edita un `config/config_eic.json` (las rutas se escriben desde la raíz):
   ```json
   {"video": "2023GISTEMP_Map_SOS.mp4", "mapa": [x0,y0,x1,y1],
    "barra_imagen": "giss_navy_anomaly_Vertical-both.png", "barra": [x0,y0,x1,y1],
    "barra_vertical": true, "barra_arriba_es_max": true,
    "vmin": -2.0, "vmax": 2.0, "umbral": 1.0, "fps_muestreo": 2}
   ```
   (vmin/vmax/umbral: pon los valores que leas en la barra).
5. `python 05_video_a_rasgos.py config/config_eic.json` → `python 06_rasgos_a_audio.py`.
6. **Chequeo de cordura:** la `media` debería parecerse a la curva oficial de GISTEMP (sube fuerte desde ~1980). Si no, revisa el rectángulo de la barra y el campo `validos` (fracción de píxeles reconocidos; si es < 0,8, el recorte incluye texto o tierra).

Ojo: la paleta es divergente (azul–blanco–rojo). El blanco = 0 °C de anomalía, así que el dron de referencia debería ir en el valor 0, no en el primer fotograma (ejercicio: cámbialo en `06`).
