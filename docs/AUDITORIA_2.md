# Auditoría 2: pipeline completo tras las rondas 16–21 (2026-11-14)

Pregunta: ¿qué está mal, qué puede fallar con un video nuevo y qué quedó desactualizado desde la auditoría del 13?

Alcance: `04`–`08`, `sintesis.py`, `rutas.py`, `herramientas/calibrar.py`, `evaluar.py`, `config/`, README y
CONTRIBUTING. `web/` queda fuera (es de Juan); solo se anotan dos cosas que le afectan (hallazgo 14).
No se cambió código del repositorio.

Cómo se comprobó: cada hallazgo marcado **Confirmado** se reprodujo hoy en una carpeta temporal
(`ROCOLA_SALIDAS` aparte, sin tocar `salidas/`). Las correcciones 1–6 y 10 se aplicaron en una **copia** del
proyecto: `evaluar.py` dio 29 PASA, 0 FALLA, y con GISTEMP `rocola.mid` y `rocola.wav` salieron idénticos
byte a byte a los actuales. Entorno: Python 3.12.3, numpy 2.5.4, opencv 5.0.0, ffmpeg 6.1.1, FluidSynth 2.3.4.

## Lo que está bien (verificado hoy)

- **Reproducible:** 05 + 06 sobre GISTEMP generan `rasgos.json`, `rocola.mid` y `rocola.wav` idénticos (`cmp`) a los de `salidas/`.
- **Ciencia:** la media extraída y la serie oficial GISTEMP (`GLB.Ts+dSST.csv`, columna J-D) tienen r = 0,992 en 60 años; sesgo medio −0,094 °C.
- **Pruebas:** `evaluar.py` 29 PASA, 0 FALLA en 36,5 s. 07 con GISTEMP: 3 PASA + 2 NO APLICA, error de tono máx. 2,6 cents.
- **Recursos:** 05 con GISTEMP (4096×2048, escala 0,25): 37,7 s y 0,99 GB de memoria máxima. 06: 2,1 s.
- **Auditoría del 13:** los hallazgos 1–9 siguen corregidos. Del 10 queda pendiente la barra horizontal en `calibrar`.

## Resumen

| # | Hallazgo | Tipo | Cambia el audio de GISTEMP |
|---|---|---|---|
| 1 | `cruce_dron` da 1881 en vez de 1976 (regresión de la ronda 19) | Error | No |
| 2 | `umbral_evento` está en °C: no sirve con otras unidades | Error con videos nuevos | No |
| 3 | `calibrar` elige un `umbral` pensado solo para GISTEMP | Error con videos nuevos | No |
| 4 | El paneo convierte ruido de 0,2 % del mapa en izquierda–derecha total | Error con videos nuevos | No |
| 5 | 07 marca FALLA si la media de un video real baja | Error | No |
| 6 | Sin FluidSynth, 07 falla en tono con el video real | Error | No (solo el respaldo) |
| 7 | 05: errores crípticos de configuración | Robustez | No |
| 8 | 06 ignora en silencio `ROCOLA_SF2` inexistente y banderas mal escritas | Robustez | No |
| 9 | `calibrar` usa la barra de GISTEMP si se olvida `--barra` | Robustez | No |
| 10 | `centroide_y` salta a 0,5 sin zona caliente (`cy_previo` no se usa) | Inconsistencia | No |
| 11 | En GISTEMP el paneo lo decide menos del 1 % del mapa en 16 de 60 fotogramas | **Decisión** | Sí |
| 12 | README, CONTRIBUTING y cabecera de `evaluar.py` desactualizados | Documentación | No |
| 13 | Sin licencia; dependencias sin versión | **Decisión** | No |
| 14 | Avisos para Juan (web) | Coordinación | No |

Orden sugerido: 1–6 (errores), 7–10 (robustez), 12 (documentos). 11 y 13 esperan una decisión de Misael.

---

## 1. `cruce_dron` da 1881 en vez de 1976 — Error (regresión de la ronda 19)

**Dónde:** `06_rasgos_a_audio.py:312`.

**Escenario (Confirmado):** `cruce_dron` es el año desde el que la melodía ya no baja de la nota de referencia
(0 °C). Se calcula con `voz >= nota_dron`. Desde la ronda 19 el dron suena 12 semitonos bajo esa nota, así que
la condición se cumple siempre y sale el primer fotograma: `control.json` dice 1881; antes de la ronda 19 decía 1976.

**Corrección:** comparar con la nota de la melodía en la referencia, no con el dron:
```python
tras = [i for i in range(n_f) if (voz[i:] >= nota_ref + 12 * octava).all()]
```
Cambiar también el texto del `print` final: "cruce del dron" → "cruce de la referencia". La clave de
`control.json` se sigue llamando `cruce_dron`.

**Verificación:** GISTEMP → `cruce_dron` = 1976 y `rocola.mid` idéntico. Prueba nueva **G4** en `evaluar.py`:
rasgos con `referencia` en mitad del rango y media creciente; `cruce_dron` debe ser el primer fotograma cuya
nota base alcanza la de la referencia (no el fotograma 0).

## 2. `umbral_evento` está en °C — Error con videos nuevos

**Dónde:** `06_rasgos_a_audio.py:66` (valor por defecto 0,15) y `:155`.

**Escenario (Confirmado):** es el mismo problema que el hallazgo 3 de la auditoría anterior, introducido después
(ronda 17). Con la serie de GISTEMP reescalada a 270–310 K, 56 de 60 fotogramas son "evento fuerte" (GISTEMP: 19);
reescalada a 0–1, ninguno. En el primer caso casi todos los golpes van a velocidad ≥ 100 y el volumen deja de
seguir al área.

**Corrección:** valor por defecto relativo al rango de sonido (1/12 del rango = 0,15 con −0,6..1,2):
- `:66` → `"umbral_evento": None` en `DEFECTOS`.
- Después de calcular `v0, v1` (`:102`): `if cfg["umbral_evento"] is None: cfg["umbral_evento"] = (v1 - v0) / 12`.
- `config/config_eic.json`: añadir `"umbral_evento": 0.15` para dejarlo explícito.
- Actualizar la cabecera de 06 (`:28`) y la tabla del README.

**Verificación:** GISTEMP → `rocola.mid` idéntico (`cmp`). Prueba nueva **F5**: la misma serie en 270–310 y en
0–1 da el mismo número de eventos fuertes, ni 0 ni todos.

## 3. `calibrar` elige un `umbral` pensado solo para GISTEMP — Error con videos nuevos

**Dónde:** `herramientas/calibrar.py:171`.

**Escenario (Confirmado):** `umbral = 1.0 if vmax >= 2 else 0.5 * vmax`. Con 270..310 sale 1,0 (todo el mapa es
"caliente": `area` = 1 fija, volumen constante); con −80..−10 sale −5.

**Corrección:** `round(vmin + 0.75 * (vmax - vmin), 3)`. Con −2..2 da 1,0, igual que hoy.

**Verificación:** `calibrar --vmin -2 --vmax 2` sigue escribiendo `"umbral": 1.0` (comprobado en la copia);
con `--vmin 270 --vmax 310` escribe 300.

## 4. El paneo convierte ruido en izquierda–derecha total — Error con videos nuevos

**Dónde:** `06_rasgos_a_audio.py:121-122`.

**Escenario (Confirmado):** el centroide se normaliza con sus percentiles 5–95 siempre que difieran en más de
0,000001. Un centroide que oscila entre 0,498 y 0,502 produce paneo de −1,00 a +1,00. Ocurre de verdad: el
video sintético con `"paneo": "y"` (centroide_y 0,496–0,508, la tormenta no se mueve en vertical) recorre −1..+1.

**Corrección:** recorrido mínimo de 0,1 (10 % del mapa); por debajo, el paneo se reduce en proporción:
```python
c_pan = (np.clip((c_suave - p5) / (p95 - p5), 0, 1) if p95 - p5 >= 0.1
         else np.clip(0.5 + (c_suave - (p5 + p95) / 2) / 0.1, 0, 1))
```
Con recorrido ≥ 0,1 la fórmula es la de hoy. Documentar el 0,1 en la cabecera de 06 (clave `paneo`).

**Verificación:** GISTEMP → `rocola.mid` y `rocola.wav` idénticos. Prueba nueva **G5**: centroide 0,5 ± 0,002
→ |pan| < 0,05. G3 sigue en PASA.

## 5. 07 marca FALLA si la media de un video real baja — Error

**Dónde:** `07_validar.py:86`.

**Escenario (Confirmado):** "media de rasgos crece" solo tiene sentido con el video sintético, igual que las dos
comprobaciones que la ronda 19 pasó a NO APLICA. Con la serie de GISTEMP invertida (cualquier video cuyo dato
baje, p. ej. hielo marino) 07 termina con código 1.

**Corrección:** añadir `if sintetico else None` a esa comprobación.

**Verificación:** con el video sintético siguen saliendo 5 PASA (B4); con GISTEMP, 2 PASA + 3 NO APLICA.
Actualizar el número en el README si se menciona.

## 6. Sin FluidSynth, 07 falla en tono con el video real — Error

**Dónde:** `06_rasgos_a_audio.py:286` (glide de 40 ms) y `:292` (golpe una octava arriba).

**Escenario (Confirmado):** con `--sintetico` (lo que usa un portátil sin fluidsynth) y GISTEMP, 07 da FALLA en
tono: hasta 112 cents en los fotogramas 54–59, los de 4 notas. La voz aún viene deslizándose desde la última nota
del arpegio anterior cuando se mide. Con la serie invertida aparece además un error de 1200 cents: gana el golpe,
que suena una octava arriba. `evaluar.py` (E3) no lo ve porque el video de 2 s no llega a 4 notas por fotograma.

**Corrección:** `:286` → glide de 0,01 s; `:292` → `midi_a_hz(nota)` (golpe en la misma octava). Solo cambia el
timbre del respaldo.

**Verificación (hecha en la copia):** GISTEMP con `--sintetico` → 8,2 cents; invertido → 6,1 cents; con
FluidSynth nada cambia. Prueba nueva **E5**: rasgos con media que recorre todo el rango (llega a 4 notas),
06 `--sintetico` + 07 → el tono PASA.

## 7. 05: errores crípticos de configuración — Robustez

**Dónde:** `05_video_a_rasgos.py:55`, `:73-76`, `:182-184`, `:235`; `07_validar.py:21-24`.

**Escenario (Confirmado):**
- Config inexistente → `FileNotFoundError` con traza. Falta una clave obligatoria → `KeyError: 'umbral'`.
- Con `barra_imagen`, un rectángulo `barra` fuera del PNG → `cv2.error ... !_src.empty() in function 'cvtColor'`.
- `time.txt` con menos líneas que fotogramas: la última fecha se repite sin aviso (2 líneas → 1900, 1901, 1901, 1901…).
- 07 sin `rocola.wav`/`control.json`/`rasgos.json` → traza.

**Corrección:**
- `:55`: si el archivo no existe o no es JSON válido, `sys.exit` con la ruta. Después, comprobar las claves
  `video, mapa, barra, vmin, vmax, umbral, fps_muestreo, barra_vertical` (y `barra_arriba_es_max` si la barra es
  vertical); si falta alguna, `sys.exit` nombrándolas.
- `:73-76`: tras leer el PNG, comprobar que `barra` cabe en él; si no, `sys.exit` con el tamaño real del PNG.
- Tras el bucle: si hay `FECHAS` y el último fotograma leído no tiene línea propia, imprimir un AVISO con las dos cifras.
- 07: si falta alguno de los tres archivos, `sys.exit("Ejecuta antes 05 y 06 ...")`.

**Verificación:** ampliar **F3** con dos casos (config sin `umbral`; `barra` fuera del PNG): código ≠ 0, mensaje
que nombra el problema y sin "Traceback" en stderr.

## 8. 06 ignora en silencio `ROCOLA_SF2` inexistente y banderas mal escritas — Robustez

**Dónde:** `06_rasgos_a_audio.py:61-62`, `:68`, `:302`.

**Escenario (Confirmado):** con `ROCOLA_SF2=/no/existe.sf2` y `--sintetco` (errata), 06 termina con código 0,
usa la SoundFont del sistema y FluidSynth, y no avisa de ninguna de las dos cosas.

**Corrección:** AVISO si `ROCOLA_SF2` está definida y no existe; `sys.exit` si hay una bandera `--…` distinta de
`--sintetico`.

**Verificación:** ese mismo comando → mensaje sobre la bandera y código ≠ 0; solo con la variable → AVISO y sigue.

## 9. `calibrar` usa la barra de GISTEMP si se olvida `--barra` — Robustez

**Dónde:** `herramientas/calibrar.py:135-136`.

**Escenario (por lectura):** `--video` y `--barra` valen por defecto los archivos de GISTEMP. Con
`--video otro.mp4` y sin `--barra`, se calibra el video nuevo contra la paleta de GISTEMP.

**Corrección:** `--barra` con `default=None`; si no se pasa, usar la de GISTEMP solo cuando `--video` es el de
GISTEMP; en otro caso, `sys.exit("Indica --barra <PNG de la barra de ese video>")`.

**Verificación:** los comandos del README (sin `--video` ni `--barra`) funcionan igual; `--video salidas/04_video_sintetico.mp4`
sin `--barra` → mensaje.

## 10. `centroide_y` salta a 0,5 sin zona caliente — Inconsistencia

**Dónde:** `05_video_a_rasgos.py:202`, `:220`, `:243`.

**Escenario (por lectura):** `cy_previo` se declara y no se usa. Sin píxeles sobre el umbral, `centroide_x`
repite el valor anterior y `centroide_y` salta a 0,5. En GISTEMP no ocurre en ningún fotograma.

**Corrección:** `:220` → `cy = cy_previo`; `:243` → `previo, cx_previo, cy_previo = media, cx, cy`. Ajustar el
comentario de `:213-214` ("0,5 si no hay nada" → "el anterior si no hay nada; 0,5 al inicio").

**Verificación:** `rasgos.json` de GISTEMP idéntico (`cmp`); G2 en PASA.

## 11. En GISTEMP el paneo lo decide menos del 1 % del mapa — Decisión de Misael

**Dónde:** `05_video_a_rasgos.py:215-218` (definición de `centroide_y`), `06_rasgos_a_audio.py:119-123`.

**Escenario (Confirmado):** `centroide_y` es la latitud media de los píxeles por encima de 1 °C. En 16 de los 60
fotogramas esos píxeles son menos del 1 % del mapa, y en 7 de ellos el paneo queda por encima de 0,7 en valor
absoluto. Ejemplo: en los años 60–70 el centroide pasa de 0,09 a 0,48 y vuelve a 0,11 de un fotograma a otro, y
el sonido se va del todo a la izquierda. Es un dato real (anomalías antárticas), pero lo cuenta una zona mínima.

**Opciones:**
- **A. Dejarlo.** No cambia la demo. Conviene decir en el pitch que el paneo sigue a "lo más caliente", aunque sea poco.
- **B. Atenuar el paneo cuando el área es pequeña** (p. ej. `pan *= min(1, area / 0.02)`). El paneo se queda
  cerca del centro hasta ~1980 y se abre cuando hay calor de verdad. Cambia el audio de la demo.

Recomendación: B si hay tiempo de volver a escuchar la demo; si no, A. No ejecutar sin decisión.

## 12. README, CONTRIBUTING y cabecera de `evaluar.py` desactualizados — Documentación

- `README.md:54` dice "18 pruebas PASA/FALLA en ~10 s": son 29 y tardan ~37 s. `CONTRIBUTING.md:11` dice "~10 s";
  la cabecera de `evaluar.py` dice "< 30 s".
- Tabla "Qué se oye": el dron ya no está "en esa nota" sino una octava por debajo; el glide solo existe en el
  respaldo numpy; el paneo puede ser `x` o `y` (GISTEMP usa `y` = sur–norte).
- Tabla de configuración: faltan `paneo`, `vmin_sonido`/`vmax_sonido`, `densidad_umbrales` y `dron_octava`.
- Contrato de `rasgos.json`: falta `centroide_y`.
- "Estructura": faltan `web/` y `docs/AUDITORIA*.md`.
- "Limitaciones": añadir que cada fotograma muestreado dura 0,5 s de audio, así que con `fps_muestreo` distinto
  de 2 el video se estira (el ejemplo sintético, a 4, se ve a mitad de velocidad); y que 07 con un video real solo
  comprueba tono y notas.

## 13. Sin licencia; dependencias sin versión — Decisión de Misael

- No hay archivo `LICENSE`. Space Apps pide que el proyecto sea de código abierto: falta elegir licencia (MIT es
  la habitual) y acordarlo con el equipo.
- `requirements.txt` no fija versiones. Hoy funciona con numpy 2.5.4, scipy 1.18.1, opencv 5.0.0, matplotlib
  3.11.2, mido 1.3.3. Opción barata: añadir esas versiones como mínimos (`numpy>=2.0`, etc.).

## 14. Avisos para Juan (web) — Coordinación

- `web/describir.js` describe "izquierda/derecha del mapa" con `centroide_x`, pero el audio de GISTEMP panea por
  latitud (`"paneo": "y"`): el texto y el sonido no cuentan lo mismo.
- `web/preparar_datos.py` repite `SEG_POR_FOTOGRAMA = 0.5` de 06; si cambia en 06, hay que cambiarlo ahí.
- El arreglo de 08 para ffmpeg ≥ 7 (ronda 21, rama `misael/ffmpeg7`) aún no se probó con un ffmpeg nuevo real.

---

## Plan de ejecución (para quien aplique los cambios)

1. Rama nueva desde `master` con `misael/ffmpeg7` ya fusionada (o desde `misael/ffmpeg7`).
2. Antes de tocar nada, guardar la referencia de GISTEMP en una carpeta temporal:
   `ROCOLA_SALIDAS=<tmp> ROCOLA_SIN_AUDIO=1 python 05_video_a_rasgos.py config/config_eic.json && … python 06_rasgos_a_audio.py`.
3. Aplicar 1–6, luego 7–10, cada grupo con sus pruebas nuevas en `evaluar.py` (G4, F5, G5, E5, F3 ampliada).
   Comprobar que cada prueba nueva FALLA con el código anterior y PASA con el nuevo.
4. Tras cada grupo: `python evaluar.py` sin FALLA y, con GISTEMP, `cmp` de `rasgos.json`, `rocola.mid` y
   `rocola.wav` contra la referencia del paso 2: deben ser idénticos (ningún hallazgo de 1–10 cambia el audio).
5. Hallazgo 12 (documentos). Los hallazgos 11 y 13 no se tocan sin decisión.
6. Bloque "RONDA N" en `docs/CAMBIOS.txt` con los números antes/después. No tocar `web/`.
