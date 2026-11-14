# Especificación del modo en vivo (Web Audio) = `06_rasgos_a_audio.py`

Para quien integra `audio.js` en `web/`. El modo en vivo debe sonar como el audio que genera el pipeline (`06_rasgos_a_audio.py`), con las mismas notas, el mismo dron y el mismo paneo. Aquí está el mapeo real rasgo → sonido, cada regla con su archivo:línea, listo para pasar a JavaScript.

**Regla de oro: el JS no inventa ningún número.** Todo parámetro sale de `web/assets/<id>_mapeo.json` (lo genera `python -m herramientas.exportar_mapeo`). Para comprobar el JS, `web/assets/<id>_esperado.json` trae, por fotograma, las notas, el dron, el pan y la ganancia que debe dar.

Pistas: `gistemp_1880_2023` (60 fotogramas) y `sst_ecco2_2007_2008` (61 fotogramas).

Referencias: `06` = `06_rasgos_a_audio.py`, `sin` = `sintesis.py`. Las fórmulas en Python sin numpy están en `herramientas/exportar_mapeo.py` (`construir_mapeo`, `aplicar_mapeo`); `evaluar.py` (prueba I1) comprueba que reproducen `control.json`.

---

## 1. Tiempo

| Regla | Fuente |
|---|---|
| Cada fotograma de `rasgos.json` dura **0,5 s** de audio: `t_inicio[i] = i * 0.5` | `06:61` |
| Tempo MIDI 120 BPM, 480 ticks por negra (1 s = 960 ticks; 1 fotograma = 480 ticks) | `06:63-64` |
| El `t` de `rasgos.json` es del video original; el audio **no** lo usa (la web usa `t_video`) | `06:61` |

## 2. Lo esencial: lo que el modo en vivo DEBE replicar

### 2.1 Valor → nota de la melodía

```
// datos: rasgos[i].media (si falta o es NaN: el último valor válido; al inicio, mapeo.relleno_media)
mediaS[i] = mediaMovil(media, mapeo.suavizado_fotogramas)         // 3; ventana centrada, acortada en los bordes
x   = clamp((mediaS[i] - vmin_sonido) / (vmax_sonido - vmin_sonido + 1e-12), 0, 1)
idx = redondearPar(x * (notas_base.length - 1))                   // notas_base.length = 16  ->  x * 15
nota[i] = notas_base[idx] + 12 * octava                           // octava = 1
```

| Regla | Valor | Fuente |
|---|---|---|
| Escala: pentatónica mayor `[0,2,4,7,9]`, tónica MIDI 48 (Do3), 3 octavas, más la tónica 3 octavas arriba: 16 notas `48,50,52,55,57,60,62,64,67,69,72,74,76,79,81,84` | `mapeo.escala.notas_base` | `06:108`, `sin:73,77-80` |
| Cuantización: índice = `round(x * 15)`, `x` en 0..1 con `clip` | | `sin:83-87` |
| **Redondeo al par en empates** (`np.round`): `0.5 → 0`, `1.5 → 2`, `2.5 → 2`. `Math.round` de JS redondea hacia arriba y no coincide en los empates | | `sin:86` |
| Rango de sonido propio (NO `vmin`/`vmax` de la paleta): `vmin_sonido`, `vmax_sonido` (si faltan, `vmin`/`vmax`) | `mapeo.vmin_sonido/vmax_sonido` | `06:109` |
| Suavizado: media móvil centrada de 3 fotogramas sobre `media` (con `suavizado` ≤ 1, sin suavizar) | `mapeo.suavizado_fotogramas` | `06:105`, `06:96-99` |
| Desplazamiento de octava: `+12` semitonos a la melodía (clip a 0..127) | `mapeo.escala.octava` | `06:113`, `06:211` |
| Rango resultante: MIDI 60 a 96 (Do4 a Do7) | `mapeo.escala.nota_min/nota_max` | |

```
mediaMovil(x, n):  h = (n | 1) >> 1;  out[i] = promedio(x[max(0, i-h) .. min(len-1, i+h)])
redondearPar(v):   r = Math.round(v);  return (Math.abs(v % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r      // v >= 0
```

### 2.2 Dron

```
// mapeo.dron.nota_midi ya viene calculado; esta es la regla por si cambia la referencia
idxRef   = redondearPar(clamp((referencia - vmin_sonido) / (vmax_sonido - vmin_sonido + 1e-12), 0, 1) * 15)
notaRef  = notas_base[idxRef]                        // sin referencia: la nota del primer fotograma (sin octava)
dron     = clamp(notaRef + 12*octava - 12 + 12*dron_octava, 0, 127)
hz       = 440 * 2 ** ((dron - 69) / 12)
```

| Regla | Fuente |
|---|---|
| El dron es la nota que la **melodía** toca con el valor `referencia`, una octava abajo, **constante** en toda la pista (no depende de ningún rasgo) | `06:114-118` |
| `dron_octava` (por defecto 0) lo desplaza más octavas | `06:118`, `06:68` |
| Nivel: velocidad MIDI `round(45 * dron_nivel / 0.08)` = 27 con `dron_nivel` 0,048 (≈ 21 % de la escala de velocidad) | `06:141`, `06:69` |
| Suena desde el tick 0 hasta el final, canal 2, programa GM 89 | `06:224-225` |

Valores por pista (los trae el `_mapeo.json`):

| | referencia | vmin_sonido..vmax_sonido | nota de la referencia | **dron** | Hz |
|---|---|---|---|---|---|
| GISTEMP | 0,0 | −0,6 … 1,2 | 60 (Do4) | **60** | 261,63 |
| SST | 21,97 | 21,47 … 22,45 | 67 (Sol4) | **67** | 392,00 |

### 2.3 Área → volumen

```
rango = area_max - area_min                                  // mapeo.volumen.area_min / area_max (de la serie completa)
areaN[i]   = rango >= 1e-6 ? clamp((area[i] - area_min) / rango, 0, 1)    // entre el mínimo y el máximo de la pista
                           : (area_max >= 1e-6 ? 1 : 0)                   // sin variación: 0 dB si hay zona caliente, −6 dB si no
ganancia[i] = 10 ** ((-6 + 6 * areaN[i]) / 20)                // 0,501 (−6 dB) … 1,0 (0 dB)
velocidad[i] = redondearPar(127 * ganancia[i])                // velocidad MIDI nominal 64 … 127
```

| Regla | Fuente |
|---|---|
| `area` → velocidad MIDI del golpe de la melodía: −6 dB (el área mínima de la pista) a 0 dB (el área máxima) | `06:122-125` |
| `area` se normaliza **entre su mínimo y su máximo** (ronda 27; antes, por el máximo: SST solo recorría 0,8 dB) | `06:122-125` |
| En el respaldo numpy, la ganancia es la misma curva interpolada linealmente entre centros de fotograma y suavizada 80 ms | `06:308` |
| Un evento fuerte (sección 2.5) sube la velocidad a `max(v, 100)` | `06:174,180-181` |

Valores por pista: GISTEMP `area_min` 0,0 y `area_max` 0,5708; SST `area_min` 0,4282 y `area_max` 0,4939. Las dos recorren ahora de 0,501 (−6 dB) a 1,0 (0 dB), es decir, velocidades MIDI de 64 a 127. (Con la regla anterior SST solo iba de 0,912 a 1,0.)

### 2.4 Paneo

```
campo   = (mapeo.paneo.campo)                              // "centroide_x" o "centroide_y" según la pista
cSuave  = mediaMovil(rellenar(rasgos.map(r => r[campo]), 0.5), 3)
// p5, p95, centro vienen en el mapeo (percentiles de cSuave con interpolación lineal)
si (p95 - p5 >= 0.1):                                      // rama amplia
    cPan = clamp((cSuave[i] - p5) / (p95 - p5), 0, 1)
si no:                                                     // rama estrecha: no se estira
    cPan = clamp(0.5 + (cSuave[i] - centro) / 0.1, 0, 1)   // centro = (p5 + p95) / 2
si (area[i] < area_centro) cPan = 0.5                      // sin zona caliente apreciable: al centro (area_centro = 0,01)
pan[i] = 2 * cPan - 1                                      // -1 (izquierda) .. +1 (derecha)
```

| Regla | Fuente |
|---|---|
| Eje: `"x"` (izquierda-derecha del mapa, `centroide_x`) o `"y"` (sur = izquierda, norte = derecha, `centroide_y`); viene en `rasgos.json["paneo"]`, por defecto `"x"`. **GISTEMP y SST usan `"y"`.** Si falta `centroide_y`, 06 vuelve a `"x"` | `06:129-133`, `06:70` |
| Suavizado: media móvil de 3 fotogramas | `06:134` |
| Normalización con percentiles 5 y 95 de la serie suavizada (interpolación lineal como `numpy.percentile`) | `06:135-136` |
| **Rama estrecha**: si el recorrido p95 − p5 es menor que 0,1, no se estira; se mide contra el punto medio con ancho 0,1 | `06:136-137` |
| **Sin zona caliente (ronda 27):** con `area < area_centro` (0,01) el centroide no significa nada y `cPan = 0,5` (pan 0); `area` es la cruda (no la normalizada), y la interpolación y el suavizado de 0,15 s siguientes no cambian | `06:62`, `06:138-139` |
| `pan = 2 * cPan - 1`; el MIDI guarda `CC10 = round(64 + 63 * pan)` por fotograma | `06:140`, `06:220`, `06:339` |
| En el WAV: el pan por fotograma se interpola linealmente entre los **centros** de fotograma (`(i + 0.5) * 0.5 s`) y se suaviza con un polo de 0,15 s | `06:289` |
| Ley de potencia constante: `th = (pan + 1) * π/4`, `L = cos(th)`, `R = sin(th)` (en Web Audio, `StereoPannerNode` usa la misma ley) | `sin:117-120` |
| Solo se panea la **melodía** (mezclada a mono y multiplicada por √2); el **dron queda con su imagen propia, sin paneo** | `06:292` |

Valores por pista: GISTEMP rama **amplia** (p5 0,359; p95 0,855; pan de −1,0 a +1,0; 16 de los 60 fotogramas tienen `area < 0,01` y van al centro). SST rama **estrecha** (p5 0,4889; p95 0,5381; centro 0,5135): el pan solo recorre **−0,525 a +0,495**, y su cero es la posición media de la zona caliente durante los 344 días, no el ecuador.

### 2.5 Articulación (qué se toca cuándo)

```
// Densidad: notas por fotograma según la media suavizada
k[i]   = !densidad ? 1 : (mediaS[i] < u1 ? 1 : (mediaS[i] <= u2 ? 2 : 4))
paso   = (idx + k <= 16) ? 1 : -1                          // 16 = notas_base.length; sin sitio hacia arriba, baja
arp[i] = [0..k-1].map(j => notas_base[idx + paso * j] + 12*octava)   // desde la nota base
// cada nota j dura 1/k del fotograma (inicio j*0.5/k s) y suena el 95 % de ese tramo

// Evento fuerte: sobre la media CRUDA (sin suavizar)
fuerte[i] = i > 0 && Math.abs(media[i] - media[i-1]) > umbral_evento
```

| Regla | Fuente |
|---|---|
| Umbrales de densidad `[u1, u2]`: `densidad_umbrales` del config; si faltan, `vmin_sonido + 0.5*rango` y `vmin_sonido + 13/18*rango` | `06:151` |
| Notas por fotograma: 1 si `mediaS < u1`; 2 si `u1 ≤ mediaS ≤ u2`; 4 si `> u2` | `06:154-155` |
| Arpegio por la escala desde la nota del fotograma: **ascendente** si caben las `k` notas (`idx + k ≤ 16`); si no (lo más alto de la escala), **descendente** desde la nota base. La primera nota es siempre la base (ronda 27; antes se repetía la nota más alta y el ligado se comía golpes) | `06:162-165` |
| Cada nota dura el 95 % de su tramo | `06:167-170` |
| `umbral_evento`: del config; si falta, `(vmax_sonido − vmin_sonido) / 12` (GISTEMP y SST: 0,15) | `06:111-112`, `06:70` |
| Evento fuerte = ataque aunque la nota no cambie, con velocidad ≥ 100 (solo la primera nota del fotograma) | `06:173-181` |
| **Ligar**: si la nota es igual a la del ataque anterior y no es evento fuerte, no se vuelve a atacar; la nota se extiende | `06:182-190`, `06:68` |
| **Re-golpe**: una nota ligada se vuelve a tocar suave (`velocidad × 0,4`) cada 2 fotogramas | `06:183-187`, `06:70` |

Valores por pista: GISTEMP `densidad_umbrales` [0,3; 0,7] (45 fotogramas con 1 nota, 8 con 2, 7 con 4; 19 eventos fuertes). SST usa los de defecto [21,96; 22,18] (25 con 1 nota, 22 con 2, 14 con 4; 7 eventos fuertes).

## 3. Lo opcional (mejora el parecido, no cambia notas ni pan)

| Regla | Valor | Fuente |
|---|---|---|
| Melodía = GM 13 (marimba); dron = GM 89 (pad). Con muestras de SoundFont; Web Audio no las tiene (ver §6) | `instrumento_melodia` 13, `dron_programa` 89 | `06:143`, `06:68-69` |
| Reverb: CC91 = 50 (≈ 39 % de envío) en los dos canales | `reverb` 50 | `06:142`, `06:215-218` |
| Humanizar: ±10 ms en el inicio y ±10 % en la velocidad, con `numpy.random.default_rng(12345)` | `humanizar` true | `06:202-210` |
| Fundido final de 50 ms y limitador `tanh(1,5·x)` normalizado a pico 0,85 | | `06:293-294`, `sin:123-126` |
| Respaldo numpy (el timbre reproducible con osciladores): melodía = oscilador `suave` (seno + 0,35·2.º + 0,15·3.er armónico, ÷1,5) con glide de 10 ms, `0.5 * ganancia`; golpe = triangular de 0,35 s con ADSR (a 3 ms, d 120 ms, s 0, r 50 ms), `0.35 * vel/90`; dron = seno | | `06:307-319`, `sin:31-41,53-67` |

## 4. Valores por pista (resumen; la fuente es `_mapeo.json`)

| | GISTEMP `gistemp_1880_2023` | SST `sst_ecco2_2007_2008` |
|---|---|---|
| Fotogramas | 60 (≈ 30 s) | 61 (30,5 s) |
| Eje de paneo (`paneo`) | `y` (`centroide_y`), rama amplia | `y` (`centroide_y`), rama estrecha |
| p5 / p95 / centro | 0,3590 / 0,8548 / 0,6069 | 0,4889 / 0,5381 / 0,5135 |
| vmin_sonido … vmax_sonido | −0,6 … 1,2 | 21,47 … 22,45 |
| referencia → dron | 0,0 → MIDI 60 | 21,97 → MIDI 67 |
| `area_min` / `area_max` (para el volumen) | 0,0 / 0,5708 | 0,4282 / 0,4939 |
| `densidad_umbrales` | [0,3; 0,7] (config_eic.json:32-35) | defecto: [21,96; 22,178] |
| `umbral_evento` | 0,15 (config_eic.json:37) | 0,15 (config_sst.json:33) |
| Notas de la melodía | 60 a 96 | 60 a 96 |
| Instrumento / reverb | 13 / 50 (config_eic.json:30-31) | defecto (13 / 50) |

Valores del config citados: `config_eic.json:26-28` (referencia, vmin/vmax_sonido), `:36` (paneo); `config_sst.json:29-32` (paneo, referencia, vmin/vmax_sonido).

## 5. Diferencias con el `audio.js` actual (según la descripción del equipo; el archivo aún no está en el repo)

| # | `audio.js` actual | Lo correcto (06) |
|---|---|---|
| 1 | Panea con `centroide_x` | Eje según la pista: `paneo` = `"y"` en GISTEMP y SST (`centroide_y`); ver §2.4 |
| 2 | Pan = `centroide_x` normalizado directamente | Media móvil de 3 → percentiles 5-95 → rama amplia o estrecha (§2.4) |
| 3 | Normaliza la media con `vmin`/`vmax` (−2…+2) | Con `vmin_sonido`/`vmax_sonido` (GISTEMP −0,6…1,2; SST 21,47…22,45) y media suavizada de 3 fotogramas |
| 4 | Otra escala | Pentatónica mayor de 16 notas desde Do3 (48), más 1 octava = MIDI 60 a 96, con redondeo al par (§2.1) |
| 5 | Dron fijo en 174,61 Hz (Fa3, MIDI 53) | Dron calculado: la nota de la referencia − 12 (+ octava): **60 = 261,63 Hz en GISTEMP, 67 = 392,00 Hz en SST** (§2.2) |
| 6 | (por confirmar) volumen | Velocidad/ganancia desde `(area − area_min)/(area_max − area_min)` entre −6 y 0 dB (§2.3), no `area` cruda |
| 7 | (por confirmar) densidad y eventos | 1/2/4 notas por fotograma y ataque fuerte con `umbral_evento` (§2.5) |

## 6. Reglas difíciles de replicar en Web Audio

- **Instrumentos reales (marimba y pad de la SoundFont):** Web Audio no trae SoundFont. Se aproxima con el respaldo numpy de §3 (osciladores + ADSR); suena distinto pero con las mismas notas.
- **Reverb:** necesita una respuesta al impulso (`ConvolverNode`) que no está en el repo; es opcional. CC91 = 50 es solo la cantidad de envío.
- **Humanizar:** usa el generador `numpy.random.default_rng(12345)`; reproducirlo exacto en JS no es sencillo y no cambia notas ni pan. Se puede omitir.
- **Curva de velocidad de FluidSynth:** en el WAV real, el sintetizador aplica su propia curva de velocidad → volumen (más pronunciada que la lineal). Las velocidades nominales (64-127) sí son las de este documento; el nivel exacto en dB que se oye en el WAV no se midió. La ganancia de §2.3 es la nominal (−6 a 0 dB), igual a la del respaldo numpy.
- **Limitador y normalización:** `limitar` normaliza al pico de **toda** la pista (0,85); en vivo no se conoce de antemano. Usar un `DynamicsCompressorNode` o un `tanh` con ganancia fija.
- **Percentiles de paneo:** necesitan la serie completa; con `rasgos.json` cargado entero es directo (y el `_mapeo.json` ya trae `p5`, `p95` y `centro`).
- **Empates del redondeo:** hay que implementar el redondeo al par (§2.1); con `Math.round` alguna nota puede salir un escalón de la escala por encima.
- **Precisión numérica:** las sumas de `numpy` y de JS pueden diferir en el último decimal; solo importa en empates exactos del redondeo. La prueba de aceptación usa notas exactas y pan con tolerancia 0,02.

## 7. Prueba de aceptación

Por pista, para cada fotograma `i` del `_esperado.json`:
- `nota` (melodía) y `notas` (arpegio) **idénticas** a las que calcula el JS,
- `dron` idéntico,
- `|pan − pan_js| ≤ 0,02`,
- `|ganancia − ganancia_js| ≤ 1e-4`.

El equivalente en Python corre en `evaluar.py` (prueba I1) y también contra tres series sintéticas generadas por el 06 real (eje x amplia, eje y estrecha, eje y amplia sin densidad).

## 8. Cómo regenerar los archivos

```bash
# pistas (carpetas de salida de 05 + 06)
ROCOLA_SALIDAS=salidas_gistemp python 05_video_a_rasgos.py config/config_eic.json && ROCOLA_SALIDAS=salidas_gistemp python 06_rasgos_a_audio.py
ROCOLA_SALIDAS=salidas_sst     python 05_video_a_rasgos.py config/config_sst.json && ROCOLA_SALIDAS=salidas_sst     python 06_rasgos_a_audio.py
python -m herramientas.exportar_mapeo        # escribe web/assets/<id>_mapeo.json y <id>_esperado.json
```

Si el mapeo no reproduce `control.json` ni el `.mid`, la exportación aborta sin escribir nada.
