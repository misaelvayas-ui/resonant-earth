# PLAN — reorganización y `evaluar.py` (resonant-earth)

Para el modelo ejecutor. No refactorizar funciones: solo rutas, 3 parámetros y archivos nuevos.
Ya verificado (CAMBIOS.txt, rondas 1–4): no volver a auditar 01, 04–08 ni `sintesis.py`.

## 1. Estructura propuesta

```
rocola_practica/
├── sintesis.py              motor (se queda en raíz: `from sintesis import …` no cambia)
├── rutas.py                 NUEVO: único lugar que conoce las carpetas
├── 01_… 08_*.py             pipeline (se quedan en raíz, mismo comando de siempre)
├── evaluar.py               NUEVO: mini evaluaciones PASA/FALLA
├── herramientas/            verificar_01.py, graficar_01.py
├── config/                  config_video.json (lo genera 04), config_eic.json (a mano)
├── salidas/                 TODO lo generado: *.wav, *.mp4, *.png, rasgos.json, control.json
├── docs/                    CAMBIOS.txt, PLAN.md
├── README.md, requirements.txt
```

Cómo siguen funcionando los imports: scripts y `sintesis.py` no se mueven. Los de
`herramientas/` se ejecutan desde la raíz con `python -m herramientas.verificar_01`
(el cwd entra en `sys.path`; no hace falta `__init__.py` ni tocar sus imports).

`rutas.py` (≈12 líneas, solo `os`):
- `SALIDAS = os.environ.get("ROCOLA_SALIDAS", "salidas")`, `CONFIG = os.environ.get("ROCOLA_CONFIG", "config")`.
- `sal(nombre) -> str` y `cfg_ruta(nombre) -> str`: hacen `os.makedirs(..., exist_ok=True)` y devuelven `os.path.join(...)`.
- Devuelven `str` (cv2 y `wavfile` no aceptan `Path` en todas las versiones).

Supuesto: `salidas/` plana (sin subcarpetas por tipo) para tocar menos líneas.
Supuesto: CAMBIOS.txt pasa a `docs/`; las rondas futuras se añaden ahí.
Supuesto: no hay git; si se inicializa, ignorar `salidas/`, `.venv/`, `__pycache__/`.

## 2. Movimientos y ediciones, en orden

0. Línea base: `md5sum rocola.wav control.json 0*.wav > /tmp/base.md5`; copiar `rasgos.json` a `/tmp/`.
1. Crear `rutas.py`, `config/`, `salidas/`, `herramientas/`, `docs/`.
2. Mover: `*.wav *.mp4 *.png rasgos.json control.json` → `salidas/`; `config_video.json` → `config/`;
   `verificar_01.py graficar_01.py` → `herramientas/`; `CAMBIOS.txt PLAN.md` → `docs/`; borrar `__pycache__/`.
3. `sintesis.py`, función `reproducir`: primera línea nueva `if os.environ.get("ROCOLA_SIN_AUDIO"): return` (+ `import os`). Nada más.
4. En cada script añadir `from rutas import sal` (04 y 05 también `cfg_ruta`) y envolver los literales
   (números de línea aproximados, confirmar con grep):
   - 01:13, 02:19–20, 03:40 → `guardar_wav(sal("…wav"), …)`.
   - 04:17 → `DUR = int(sys.argv[1]) if len(sys.argv) > 1 else 10` (+ `import sys`);
     04:38 y 04:59 → `sal("04_video_sintetico.mp4")`; 04:63 → `cfg_ruta("config_video.json")`; 04:65 mensaje.
   - 05:34 defecto → `cfg_ruta("config_video.json")`; 05:118 → `sal("fotograma_ref.png")`; 05:148 → `sal("rasgos.json")`.
   - 06:22 defecto → `sal("rasgos.json")`; 06:76 → `sal("rocola.wav")`; 06:79 → `sal("control.json")`.
   - 07:17, 19, 20, 63 → `sal(...)`; además terminar con `sys.exit(0 if all(checks.values()) else 1)`.
   - 08:76 y 79 → `sal("rasgos.json")`; 08:106–108 defectos → `sal(...)` para los tres.
   - herramientas/verificar_01.py:13 y graficar_01.py:158 → `sal(...)`.
5. Actualizar docstrings "Uso:" y README (tabla de scripts, rutas de `config_eic.json`, comando `evaluar.py`).
6. Ejecutar la verificación de la sección 4 y añadir "RONDA 5" en `docs/CAMBIOS.txt`.

## 3. Diseño de `evaluar.py`

Uso: `python evaluar.py` (opción `--rapido`: solo grupo A). Sale con código 1 si algo falla.
Grupo A importa `sintesis` en el mismo proceso. Grupos B–D lanzan los scripts con `subprocess`
(`sys.executable`) y entorno `ROCOLA_SALIDAS=<tmp>`, `ROCOLA_CONFIG=<tmp>`, `ROCOLA_SIN_AUDIO=1`
dentro de un `tempfile.TemporaryDirectory()`: nunca toca `salidas/`. Cada evaluación es una función
que devuelve `(ok, medido)`; una excepción cuenta como FALLA. Tabla final: nombre | medido | umbral | PASA/FALLA/OMITIDA + tiempo total.

| # | Nombre | Qué y cómo | Umbral |
|---|---|---|---|
| A1 | fase inicial | `tono(440, 1.0)[0]` | \|x\| < 1e-12 |
| A2 | frecuencia | pico FFT de `tono(440, 1.0)` | 440 ± 1 Hz |
| A3 | fase continua | `oscilador` con barrido 200→800 Hz: máx \|Δx\| | ≤ 2π·800/FS·1,01 |
| A4 | ADSR | `adsr(n, .02, .1, .7, .2)` para n = 441, 4410, 44100: longitud, último valor, máximo | len = n, fin = 0, máx ≤ 1 |
| A5 | MIDI↔Hz | `midi_a_hz(69)`, `midi_a_hz(81)`, `hz_a_midi(midi_a_hz(60))` | 440, 880, 60 (± 1e-9) |
| A6 | cuantización | `valor_a_nota(linspace(-1, 2, 300), 0, 1, escala())` | todas ∈ escala; extremos = primera/última nota |
| A7 | paneo | `paneo(x, p)`: L²+R² = x²; p = −1 → R = 0 | error < 1e-9 |
| A8 | limitador y WAV | `limitar(3x)`; `guardar_wav` mono y estéreo en tmp y releer | pico ≤ 0,9; int16; forma y FS correctos |
| B1 | pipeline corto | `04 2` (40 fotogramas) → 05 → 06 → 07 | los 4 códigos de salida = 0 |
| B2 | rasgos | leer `rasgos.json` de B1 | 8 fotogramas; media y centroide_x crecientes; validos ≥ 0,99; sin NaN |
| B3 | audio | leer `rocola.wav` de B1 | estéreo, 44100 Hz, 4,0 s ± 0,01; pico < 1,0 |
| B4 | validación | salida de 07 | 4 líneas `[PASA]`, ninguna `[FALLA]` |
| C1 | tierra gris | video generado por `evaluar.py` (320×180, 40 fotogramas, `RdBu_r`, bloque gris 240 fijo ≈ 11 %, costa negra) → 05 | máx \|media − verdad\| < 0,01; mediana de `validos` = fracción real ± 0,05 |
| C2 | fotograma sin datos | mismo video con un fotograma muestreado todo gris 128 → 05 → 06 | 05 y 06 salen 0; ese fotograma: validos = 0 y media = la anterior; sin NaN |
| D1 | sincronía 08 | si existe 08 y hay `ffmpeg`: 08 sobre video y WAV de B1 | código 0, `[PASA]`; primer pts de video y audio < 0,05 s (ffprobe). Si falta ffmpeg: OMITIDA |

Presupuesto: A < 1 s; B ≈ 8 s; C ≈ 5 s; D ≈ 3 s (total < 30 s). C1 y C2 comparten un solo video.
Supuesto: umbrales de C1 tomados de la ronda 2 (640×360: error 0,0018; validos 0,864 vs 0,887);
a 320×180 el ejecutor mide una vez y, si no caben, sube la resolución antes que aflojar el umbral.
La "verdad" de C1 es la media del campo sin compresión, excluyendo la tierra, calculada en `evaluar.py`.

## 4. Riesgos y verificación

- Rutas relativas al cwd: todo asume ejecución desde la raíz. Documentarlo; no usar `__file__`.
- `config_video.json` guarda la ruta del video: tras el cambio será `salidas/04_video_sintetico.mp4`
  (08 compara por `basename`, sigue valiendo). El `config_eic.json` del README debe usar rutas desde la raíz.
- Salidas viejas en la raíz que un script lea por error: tras el paso 2 no debe quedar ninguna
  (`ls *.wav *.mp4 *.json *.png` en la raíz → vacío).
- `herramientas/` ejecutado como archivo (`python herramientas/x.py`) falla el import: usar `-m`.
- Variables `ROCOLA_*` exportadas en la terminal desviarían las salidas: `evaluar.py` las pasa solo al subproceso.
- 07 hoy no devuelve código de error (se corrige en el paso 4); 06 reproduce audio y bloquea (por eso `ROCOLA_SIN_AUDIO`).

Verificación de que nada se rompió:
1. `grep -nE '"[^"/]+\.(wav|mp4|png|json)"' *.py herramientas/*.py | grep -v "sal(\|cfg_ruta("` → solo docstrings y mensajes.
2. Ejecutar 01 → 08 desde la raíz: todos con código 0 y 07 con 4 × PASA.
3. Comparar con la línea base: md5 idéntico de `rocola.wav`, `control.json` y los WAV de 01–03;
   `rasgos.json` idéntico salvo el campo `"fuente"`.
4. `python -m herramientas.verificar_01` y `python -m herramientas.graficar_01` terminan con código 0.
5. `python evaluar.py`: todo PASA en < 30 s y `salidas/` sin cambios (comparar `ls -l` antes y después).

## 5. Tres mejoras de mayor impacto para el hackathon

1. Correr el pipeline con el video real de NASA (SVS 5207, GISTEMP) y comprobar que `media` sigue la curva oficial: la demo debe ser con datos reales, no sintéticos.
2. Hacer el mapeo entendible sin explicación: dron en el valor 0 de anomalía, y en el MP4 una leyenda fija más un cursor de tono y paneo sincronizados.
3. Un solo comando `rocola.py video config` → MP4 de demo (05 → 06 → 08), para sonificar en vivo cualquier visualización que pida el jurado.
