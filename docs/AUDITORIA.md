# Auditoría previa al hackathon (2026-11-13)

Pregunta: ¿qué puede fallar o confundir mañana con videos nuevos y laptops nuevas, y cómo se corrige?

Alcance: `05`, `06`, `08`, `herramientas/calibrar.py`, `evaluar.py`, README e instalación. No se cambió código.
Lo que ya está verificado en `docs/CAMBIOS.txt` (rondas 1–15) no se volvió a auditar.

Cómo se comprobó: los hallazgos marcados **Confirmado** se reprodujeron hoy con videos sintéticos de 640×360
(paleta plasma, barra horizontal, primeros fotogramas negros, rango 270–310) en una carpeta temporal.
Los marcados **Por cálculo** o **No probado** no se ejecutaron.

Supuestos:
- Los videos del EIC de mañana serán sobre todo 1920×1080, con la barra dentro del video o sin PNG aparte.
- Trabajarán 3–4 personas sobre el mismo repositorio, alguna con Windows.
- No hay Windows en esta máquina: todo lo dicho sobre Windows está **No probado**.

| # | Hallazgo | Cuándo |
|---|---|---|
| 1 | GitHub está 6 commits atrás | ARREGLAR HOY |
| 2 | `calibrar` pisa el config y hereda datos de GISTEMP | ARREGLAR HOY |
| 3 | Los umbrales de densidad de 06 solo valen para GISTEMP | ARREGLAR HOY |
| 4 | 05 lee la barra del primer fotograma | ARREGLAR HOY |
| 5 | Video inexistente o rectángulo fuera del fotograma: errores crípticos | ARREGLAR HOY |
| 6 | 08 falla con videos de más de ~3,5 min | ARREGLAR HOY |
| 7 | 05 puede agotar la memoria con video 1080p | ARREGLAR HOY |
| 8 | Instalación: solo hay instrucciones para Ubuntu | ARREGLAR HOY |
| 9 | Archivos generados versionados: conflictos entre compañeros | ARREGLAR HOY |
| 10 | `calibrar` no admite barra horizontal; huecos de `evaluar.py` y README | PUEDE ESPERAR |

---

## 1. GitHub está 6 commits atrás — [ARREGLAR HOY]

**Dónde:** repositorio (`git status -sb` → `master...origin/master [adelante 6]`).

**Escenario:** `origin/master` está en la ronda 10. Quien clone mañana recibe un 06 sin MIDI ni FluidSynth,
sin `rocola.mid`, con el 07 antiguo y sin las rondas 11–15. Además aún no hay colaboradores invitados.

**Corrección:**
```bash
git push origin master        # el dueño puede saltarse la regla de PR
```
Después, invitar a cada compañero (Settings → Collaborators) con su usuario de GitHub.

**Verificación:** `git status -sb` ya no dice `[adelante N]`; un `git clone` nuevo + `python evaluar.py` da 21 PASA.

---

## 2. `calibrar` pisa el config y hereda datos de GISTEMP — [ARREGLAR HOY]

**Dónde:** `herramientas/calibrar.py:134-136` (valores por defecto) y `:168-185` (escritura).

**Escenario (por lectura del código):**
- El README (paso 1 de "Uso en el hackathon") manda ejecutar `calibrar`. Eso reescribe
  `config/config_eic.json` desde cero y borra `vmin_sonido`, `vmax_sonido`, `dron_octava`,
  `instrumento_melodia` y `reverb`. La melodía vuelve a repartirse sobre ±2 °C y cambia sin aviso.
- Con un video nuevo, `--fechas` vale por defecto `datos/time.txt`. Ese archivo existe (es el de GISTEMP),
  así que se adjunta al video nuevo y 08 muestra años 1881–2023 que no le corresponden.
- Todos los videos escriben el mismo `config_eic.json`: el segundo video pisa al primero.

**Corrección:**
- `:136` → `ap.add_argument("--fechas", default=None)` y, en `:174-178`, añadir `fechas` solo si se pasó.
- `:183` → nombre por video:
  `ruta = a.salida or cfg_ruta("config_" + os.path.splitext(os.path.basename(a.video))[0] + ".json")` (+ `import os`).
- Antes de escribir (`:184`): si `ruta` ya existe, leerla y conservar las claves que `calibrar` no calcula
  (`vmin_sonido`, `vmax_sonido`, `dron_*`, `instrumento_melodia`, `reverb`, `ligar`, `suavizado`, `densidad`,
  `octava`, `humanizar`, `densidad_umbrales`).
- README: en los pasos de GISTEMP, pasar `--fechas datos/time.txt` explícito.

**Verificación:** ejecutar `calibrar` dos veces sobre GISTEMP y comprobar con `git diff config/` que
`vmin_sonido` sigue en −0,6; ejecutarlo con otro video y ver que el config nuevo no tiene `"fechas"`.

---

## 3. Los umbrales de densidad de 06 solo valen para GISTEMP — [ARREGLAR HOY]

**Dónde:** `06_rasgos_a_audio.py:109-110` (`n_notas`: `< 0.3`, `<= 0.7`) y `:92` (rango de notas).

**Escenario (Confirmado):** los umbrales están en °C de anomalía. Con un video de temperatura absoluta
(rango 270–310) todos los fotogramas superan 0,7: 64 ataques de 64, siempre 4 notas, y la densidad deja de
informar. Con datos en 0–0,25 (p. ej. NDVI bajo) ocurriría lo contrario: siempre 1 nota.

Relacionado: si el config no trae `vmin_sonido`/`vmax_sonido`, 06 reparte las notas sobre todo `vmin..vmax`.
La media global suele ocupar una franja estrecha de ese rango y la melodía se queda en 2–3 notas.

**Corrección:**
- En `:109-110`, umbrales relativos al rango de sonido, con clave opcional:
  ```python
  u1, u2 = d.get("densidad_umbrales") or (v0 + 0.5 * (v1 - v0), v0 + 13 / 18 * (v1 - v0))
  def n_notas(m):
      return 1 if m < u1 else (2 if m <= u2 else 4)
  ```
  (`0.5` y `13/18` reproducen 0,3 y 0,7 con el rango −0,6..1,2 de GISTEMP.)
- Añadir `"densidad_umbrales"` a la lista que 05 copia (`05:216-218`) y poner
  `"densidad_umbrales": [0.3, 0.7]` en `config_eic.json`, para que GISTEMP salga idéntico.
- Al final de 05 (`:223`), imprimir el mínimo y el máximo de `media` con la sugerencia
  "pon vmin_sonido/vmax_sonido cerca de estos valores".

**Verificación:** GISTEMP: `rocola.mid` idéntico al actual (`cmp`), 46 ataques. Video 270–310: el número de
ataques por fotograma ya no es siempre 4. `evaluar.py` E2 sigue en PASA.

---

## 4. 05 lee la barra del primer fotograma — [ARREGLAR HOY]

**Dónde:** `05_video_a_rasgos.py:182-184`.

**Escenario (Confirmado):** si el video abre con negro, título o fundido (habitual en videos de divulgación),
la tabla color → valor sale de una barra negra. Resultado: `validos = 0.0` y `media = 0.0` en todos los
fotogramas, 06 genera una sola nota (60) durante todo el audio y el código de salida es 0. Solo hay un
"Aviso" por fotograma, fácil de pasar por alto.

**Corrección:**
- Antes del bucle de `:181`, elegir el fotograma de la barra: recorrer `fotogramas_muestreados` y quedarse con
  el primero cuya tira de barra tenga contraste (`np.ptp(perfil, axis=0).max() > 30`); construir `arbol, vals`
  con ese. Si ninguno cumple, `sys.exit("La barra no tiene degradado en ningún fotograma: revisa 'barra'")`.
- No aplica si hay `barra_imagen`.
- Tras el bucle: si la mediana de `validos` es < 0,5, imprimir un aviso en mayúsculas con el valor.

**Verificación:** video con los 5 primeros fotogramas en negro → `validos` ≈ 1,0 en el resto y la nota base sube;
prueba nueva en `evaluar.py` (ver hallazgo 10).

---

## 5. Video inexistente o rectángulo fuera del fotograma: errores crípticos — [ARREGLAR HOY]

**Dónde:** `05_video_a_rasgos.py:155`, `:107-108`, `:221`; `06_rasgos_a_audio.py:63`.

**Escenario (Confirmado):**
- Ruta de video mal escrita: 05 imprime "0 fotogramas analizados", termina con código 0 y **sobrescribe**
  `salidas/rasgos.json` con una lista vacía. Luego 06 muere con `IndexError: index 0 is out of bounds`.
- `mapa` o `barra` medidos sobre otra resolución (se salen del fotograma): 05 muere con
  `ValueError: operands could not be broadcast together with shapes (380,680) (340,620)`.

**Corrección:**
- Tras `:155`: abrir con `cap = cv2.VideoCapture(cfg["video"])`; si `not cap.isOpened()` →
  `sys.exit(f"No se pudo abrir el video '{cfg['video']}'. Ejecuta desde la raíz y revisa la ruta.")`.
- Leer ancho y alto del video y comprobar `0 <= x0 < x1 <= ancho` y `0 <= y0 < y1 <= alto` para `mapa`
  (y para `barra` si no hay `barra_imagen`); si no, `sys.exit` indicando el tamaño real del video.
- Antes de `:221`: `if not rasgos: sys.exit("El video no dio ningún fotograma; rasgos.json no se modificó.")`.
- En 06 tras `:63`: `if not R: sys.exit("rasgos.json no tiene fotogramas: vuelve a ejecutar 05.")`.

**Verificación:** config con `"video": "no_existe.mp4"` → mensaje claro, código ≠ 0 y `rasgos.json` intacto;
config con `"mapa": [20, 20, 700, 400]` sobre 640×360 → mensaje con "640x360".

---

## 6. 08 falla con videos de más de ~3,5 min — [ARREGLAR HOY]

**Dónde:** `08_video_con_audio.py:102-110` (un `drawtext` por rasgo) y `:140` (todo en un solo argumento).

**Escenario:**
- **Confirmado (Linux):** con 400 rasgos funciona; con 600 (5 min a 2 fps) termina en
  `OSError: [Errno 7] Argument list too long: 'ffmpeg'`. El límite es de ~128 KB por argumento.
- **No probado (Windows):** el límite de la línea de comandos es de 32 767 caracteres, unos 100 rasgos
  (menos de 1 min de video). Además las rutas `C:\...` llevan `:` y `\`, que `drawtext` interpreta como
  separadores: el texto fallaría aunque el video sea corto.

**Corrección:** en `main()`:
- Copiar la fuente a la carpeta temporal (`shutil.copy(fuente, os.path.join(tmp, "f.ttf"))`) y usar en los
  filtros nombres relativos: `fontfile=f.ttf:textfile=media_0001.txt`.
- Escribir el grafo en `tmp/grafo.txt` y sustituir `"-filter_complex", "..."` por
  `"-filter_complex_script", "grafo.txt"`.
- Ejecutar ffmpeg con `cwd=tmp` y pasar `video`, `audio` y `salida` con `os.path.abspath`.
- No tocar las opciones de codificación.

Comprobado hoy a mano con ffmpeg 6.1.1: 600 `drawtext` con rutas relativas y `-filter_complex_script` → código 0.

**Verificación:** `rasgos.json` con 600 rasgos → 08 termina en `[PASA]`; `evaluar.py` D1 sigue en PASA.

---

## 7. 05 puede agotar la memoria con video 1080p — [ARREGLAR HOY]

**Dónde:** `05_video_a_rasgos.py:135-137`; `herramientas/calibrar.py:172`.

**Escenario (Por cálculo, no medido):** la máscara estática apila hasta 62 fotogramas. `pila - mediana` es
float64: a 1920×1080 son 62 × 1080 × 1920 × 3 × 8 B ≈ **3,1 GB** de una vez (GISTEMP a escala 0,25: 0,78 GB).
`calibrar` solo reduce la escala si el ancho supera 2000 px, así que un 1080p se procesa a tamaño completo:
en una laptop de 8 GB puede dar `MemoryError` o dejarla en swap. A esa escala 05 también es lento
(2 millones de píxeles por fotograma contra el árbol de colores).

**Corrección:**
- `calibrar.py:172` → `round(min(1.0, 1024 / ancho), 3)` (deja el mapa en ~1024 px de ancho para cualquier video).
- `05:136` → `mediana = np.median(pila, axis=0).astype(np.int16)` para que la resta siga en int16 (4× menos memoria).
- En configs hechos a mano: poner `"escala": 0.5` para 1080p.

**Verificación:** `/usr/bin/time -v python 05_video_a_rasgos.py <config 1080p>` → "Maximum resident set size"
por debajo de 1,5 GB; `evaluar.py` C1–C5 siguen en PASA (la media no debe cambiar más de 0,01).

---

## 8. Instalación: solo hay instrucciones para Ubuntu — [ARREGLAR HOY]

**Dónde:** `README.md:20-27`; `06_rasgos_a_audio.py:53-55` y `:210`; `08_video_con_audio.py:123`; `06:276`.

**Escenario (por lectura; Windows No probado):**
- Windows: `source .venv/bin/activate` y `sudo apt` no existen. Sin ffmpeg, 08 no corre y no tiene respaldo.
- 06 solo busca la SoundFont en `/usr/share/sounds/sf2/`. En Windows o macOS, aunque fluidsynth esté
  instalado, cae al respaldo numpy; el aviso solo sugiere `sudo apt ...` y no menciona `ROCOLA_SF2`.
- `06:276` reproduce el audio completo y bloquea la terminal lo que dure (30 s o más) en cada ejecución.

**Corrección:**
- README, sección Instalación: añadir Windows (`.venv\Scripts\activate`, `winget install Gyan.FFmpeg`,
  `winget install FluidSynth.FluidSynth`, descargar `FluidR3_GM.sf2` y `set ROCOLA_SF2=C:\ruta\FluidR3_GM.sf2`)
  y macOS (`brew install ffmpeg fluid-synth` + `ROCOLA_SF2`). Decir que sin fluidsynth el proyecto funciona igual
  con el respaldo, y que `ROCOLA_SIN_AUDIO=1` evita la reproducción.
- `06:210` y `08:123`: añadir al mensaje "(Windows/macOS: ver README; SoundFont propia: variable ROCOLA_SF2)".

Supuesto: los nombres de paquete de winget no se verificaron; comprobarlos en una laptop con Windows antes de escribirlos.

**Verificación:** en una laptop limpia, seguir el README de principio a fin y ejecutar `python evaluar.py`:
sin ffmpeg D1 debe salir OMITIDA (no FALLA) y sin fluidsynth E1 debe decir `modo sintetico`.

---

## 9. Archivos generados versionados: conflictos entre compañeros — [ARREGLAR HOY]

**Dónde:** `git ls-files salidas` → `rasgos.json`, `control.json`, `rocola.mid`, `validacion.png`,
`calibracion.png`; `.gitignore`.

**Escenario:** cada ejecución de 05/06/07 modifica esos archivos. Ya pasó hoy: `salidas/` quedó con la corrida
sintética y se versionó así (ronda 15). Con varias personas, cada `git pull` chocará en `rasgos.json` y `rocola.mid`.

**Corrección:**
```bash
git rm -r --cached salidas
echo "salidas/" >> .gitignore
git commit -m "salidas/ deja de versionarse"
```
Supuesto: la demo final (MP4) se comparte por otro medio; ya está ignorada por `*.mp4`.

**Verificación:** ejecutar 04 → 07 y comprobar que `git status` queda limpio.

---

## 10. `calibrar` no admite barra horizontal; huecos de `evaluar.py` y README — [PUEDE ESPERAR]

**Dónde:** `herramientas/calibrar.py:34-61` y `:168-169`; `evaluar.py` (lista `EVALUACIONES`); `README.md:34`, `:46`.

**Escenario:**
- **Confirmado:** `calibrar` con una barra PNG horizontal termina en "No encontré un degradado en la barra".
  Tampoco sirve si la barra está dentro del video (exige `--barra` PNG) y siempre escribe `barra_vertical: true`.
- **Confirmado:** 05 sí funciona con barra horizontal y otra paleta si el config se escribe a mano
  (`"barra_vertical": false`; el valor crece de izquierda a derecha y no hay opción para invertirlo).
- `evaluar.py` no cubre nada de los hallazgos 3–6: no hay prueba de barra horizontal, de primer fotograma
  negro, de video inexistente, de 08 con cientos de rasgos ni del texto de año (`fecha`) en 08.
- README: `:34` dice "18 pruebas" (son 21); `:46` no avisa de que 07 solo es válido para el video sintético
  (con un video real dará FALLA en "el tono no baja" y "paneo de izquierda a derecha", y no es un error).

**Corrección para mañana (sin código):** con barra horizontal o dentro del video, copiar
`config/config_video.json`, abrir `salidas/fotograma_ref.png`, medir `mapa` y `barra` a mano y poner
`"barra_vertical": false`. Añadir esa receta al README junto con las dos correcciones de texto.

**Corrección posterior:** una prueba por cada hallazgo 3–6 en `evaluar.py` (los videos y configs de esta
auditoría sirven de base) y `--barra-horizontal` / `--barra-en-video x0 y0 x1 y1` en `calibrar`.

**Verificación:** `python evaluar.py` muestra las pruebas nuevas en PASA y falla si se revierte cada corrección.
