# Especificación del modo en vivo (Web Audio) = `06_rasgos_a_audio.py`

El modo en vivo (`web/js/mapeo.js` y `web/js/vivo.js`) debe sonar como el audio que genera el pipeline (`06_rasgos_a_audio.py`): las mismas notas, el mismo dron y el mismo paneo. Este documento recoge cada regla del mapeo rasgo → sonido con su fuente en el código.

El JS no inventa ningún número. Todo parámetro sale de `web/assets/<id>_mapeo.json` (lo genera `python -m herramientas.exportar_mapeo`). Para comprobar el JS, `web/assets/<id>_esperado.json` trae, por fotograma, las notas, el dron, el pan y la ganancia que debe dar.

Pistas: `gistemp_1880_2023` (60 fotogramas) y `sst_ecco2_2007_2008` (61 fotogramas).

Fuentes: `06:nombre` es un identificador de `06_rasgos_a_audio.py` y `sintesis:nombre` una función o constante de `sintesis.py`. Las fórmulas en Python sin numpy están en `herramientas/exportar_mapeo.py` (`construir_mapeo`, `aplicar_mapeo`); `evaluar.py` (prueba I1) comprueba que reproducen `control.json`.

---

## 1. Tiempo

| Regla | Fuente |
|---|---|
| Cada fotograma de `rasgos.json` dura **0,5 s** de audio: `t_inicio[i] = i * 0.5` | `06:SEG_POR_FOTOGRAMA` |
| Tempo MIDI 120 BPM, 480 ticks por negra (1 s = 960 ticks; 1 fotograma = 480 ticks) | `06:TPB, BPM, TICKS_F` |
| El `t` de `rasgos.json` es del video original; el audio **no** lo usa (la web usa `t_video`) | `06:SEG_POR_FOTOGRAMA` |

## 2. Lo esencial: lo que el modo en vivo DEBE replicar

### 2.1 Valor → nota de la melodía

```
// datos: el rasgo del tono. campoTono = mapeo.rasgo_tono || "media"   (ver §2.6; GISTEMP y SST no traen la clave: "media")
media[i]  = rasgos[i][campoTono]                                  // si falta, es null o NaN: el último valor válido; al inicio, mapeo.relleno_media
mediaS[i] = mediaMovil(media, mapeo.suavizado_fotogramas)         // 3; ventana centrada, acortada en los bordes
x   = clamp((mediaS[i] - vmin_sonido) / (vmax_sonido - vmin_sonido + 1e-12), 0, 1)
idx = redondearPar(x * (notas_base.length - 1))                   // notas_base.length = 16  ->  x * 15
nota[i] = notas_base[idx] + 12 * octava                           // octava = 1
```

| Regla | Valor | Fuente |
|---|---|---|
| Escala: pentatónica mayor `[0,2,4,7,9]`, tónica MIDI 48 (Do3), 3 octavas, más la tónica 3 octavas arriba: 16 notas `48,50,52,55,57,60,62,64,67,69,72,74,76,79,81,84` | `mapeo.escala.notas_base` | `06:notas`, `sintesis:PENTATONICA_MAYOR, escala` |
| Cuantización: índice = `round(x * 15)`, `x` en 0..1 con `clip` | | `sintesis:valor_a_nota` |
| **Redondeo al par en empates** (`np.round`): `0.5 → 0`, `1.5 → 2`, `2.5 → 2`. `Math.round` de JS redondea hacia arriba y no coincide en los empates | | `sintesis:valor_a_nota` |
| Rango de sonido propio (NO `vmin`/`vmax` de la paleta): `vmin_sonido`, `vmax_sonido` (si faltan, `vmin`/`vmax`) | `mapeo.vmin_sonido/vmax_sonido` | `06:v0, v1` |
| Suavizado: media móvil centrada de 3 fotogramas sobre `media` (con `suavizado` ≤ 1, sin suavizar) | `mapeo.suavizado_fotogramas` | `06:media_s`, `06:media_movil` |
| Desplazamiento de octava: `+12` semitonos a la melodía (clip a 0..127) | `mapeo.escala.octava` | `06:octava`, `06:mel (octava)` |
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
| El dron es la nota que la **melodía** toca con el valor `referencia`, una octava abajo, **constante** en toda la pista (no depende de ningún rasgo) | `06:nota_ref, nota_dron` |
| `dron_octava` (por defecto 0) lo desplaza más octavas | `06:nota_dron`, `06:DEFECTOS` |
| **Dron continuo:** suena sin interrupción desde el tick 0 hasta el final, en el canal 2, con nivel **constante**: el RMS de un seno de amplitud `dron_nivel × factor_fluidsynth` = 0,048 × 0,35 (RMS 0,012, −38,5 dB), unos **7 dB por debajo de la melodía** en el WAV. No puede ser una nota golpeada que decae: el programa GM 89 se apaga en unos 6 s y en las notas ligadas la mezcla quedaba muda | `06:DRON_FLUID`, `06:renderizar_fluidsynth`, `06:ev (dron)` |
| Instrumento: programa GM **90** (Pad 2 warm), que no decae (el 89 sí); en Web Audio basta un seno o un pad sostenido a ese nivel | `06:DEFECTOS`, `06:prog_mel, prog_dron` |
| La velocidad MIDI del dron (`round(45 * dron_nivel / 0.08)` = 27) solo queda en el `.mid`: con FluidSynth se renormaliza el RMS, así que no decide el volumen | `06:vel_dron` |

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
| `area` → velocidad MIDI del golpe de la melodía: −6 dB (el área mínima de la pista) a 0 dB (el área máxima) | `06:area_n, vel` |
| `area` se normaliza **entre su mínimo y su máximo**; normalizada por el máximo, SST solo recorría 0,8 dB | `06:area_n, vel` |
| En el respaldo numpy, la ganancia es la misma curva interpolada linealmente entre centros de fotograma y suavizada 80 ms | `06:sintetizar_numpy` |
| Un evento fuerte (sección 2.5) sube la velocidad a `max(v, 100)` | `06:VEL_FUERTE` |

Valores por pista: GISTEMP `area_min` 0,0 y `area_max` 0,5708; SST `area_min` 0,4282 y `area_max` 0,4939. Las dos recorren de 0,501 (−6 dB) a 1,0 (0 dB), es decir, velocidades MIDI de 64 a 127.

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
| Eje: `"x"` (izquierda-derecha del mapa, `centroide_x`) o `"y"` (sur = izquierda, norte = derecha, `centroide_y`); viene en `rasgos.json["paneo"]`, por defecto `"x"`. **GISTEMP y SST usan `"y"`.** Si falta `centroide_y`, 06 vuelve a `"x"` | `06:eje`, `06:DEFECTOS` |
| Suavizado: media móvil de 3 fotogramas | `06:c_suave` |
| Normalización con percentiles 5 y 95 de la serie suavizada (interpolación lineal como `numpy.percentile`) | `06:p5, p95` |
| **Rama estrecha**: si el recorrido p95 − p5 es menor que 0,1, no se estira; se mide contra el punto medio con ancho 0,1 | `06:c_pan` |
| **Sin zona caliente:** con `area < area_centro` (0,01) el centroide no significa nada y `cPan = 0,5` (pan 0); `area` es la cruda (no la normalizada), y la interpolación y el suavizado de 0,15 s siguientes no cambian | `06:AREA_CENTRO`, `06:c_pan` |
| `pan = 2 * cPan - 1`; el MIDI guarda `CC10 = round(64 + 63 * pan)` por fotograma | `06:pan`, `06:ev (CC10)`, `06:control.json` |
| En el WAV: el pan por fotograma se interpola linealmente entre los **centros** de fotograma (`(i + 0.5) * 0.5 s`) y se suaviza con un polo de 0,15 s | `06:renderizar_fluidsynth` |
| Ley de potencia constante: `th = (pan + 1) * π/4`, `L = cos(th)`, `R = sin(th)` (en Web Audio, `StereoPannerNode` usa la misma ley) | `sintesis:paneo` |
| Solo se panea la **melodía** (mezclada a mono y multiplicada por √2); el **dron queda con su imagen propia, sin paneo** | `06:renderizar_fluidsynth` |

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
| Umbrales de densidad `[u1, u2]`: `densidad_umbrales` del config; si faltan, `vmin_sonido + 0.5*rango` y `vmin_sonido + 13/18*rango` | `06:u1, u2` |
| Notas por fotograma: 1 si `mediaS < u1`; 2 si `u1 ≤ mediaS ≤ u2`; 4 si `> u2` | `06:n_notas` |
| Arpegio por la escala desde la nota del fotograma: **ascendente** si caben las `k` notas (`idx + k ≤ 16`); si no (lo más alto de la escala), **descendente** desde la nota base. La primera nota es siempre la base; si se repitiera la nota más alta, el ligado se comería golpes | `06:arp` |
| Cada nota dura el 95 % de su tramo | `06:mel` |
| `umbral_evento`: del config; si falta, `(vmax_sonido − vmin_sonido) / 12` (GISTEMP y SST: 0,15) | `06:umbral_evento`, `06:DEFECTOS` |
| Evento fuerte = ataque aunque la nota no cambie, con velocidad ≥ 100 (solo la primera nota del fotograma) | `06:fuerte, VEL_FUERTE` |
| **Ligar**: si la nota es igual a la del ataque anterior y no es evento fuerte, no se vuelve a atacar; la nota se extiende | `06:fusion`, `06:DEFECTOS` |
| **Re-golpe**: una nota ligada se vuelve a tocar suave (`velocidad × 0,7`; con 0,4 la marimba casi no se oía) en **cada** fotograma (`regolpe_ligado` 1) | `06:fusion (regolpe)`, `06:DEFECTOS` |

Valores por pista: GISTEMP `densidad_umbrales` [0,3; 0,7] (45 fotogramas con 1 nota, 8 con 2, 7 con 4; 19 eventos fuertes). SST usa los de defecto [21,96; 22,18] (25 con 1 nota, 22 con 2, 14 con 4; 7 eventos fuertes).

### 2.6 Tono con otro rasgo (`rasgo_tono`)

Una pista puede pedir que la nota salga de otro rasgo en vez de `media`. El caso previsto es el mar con `"rasgo_tono": "dif_hemisferios"` (media del hemisferio norte menos la del sur, que 05 calcula con `"hemisferios": true`).

```
campoTono = mapeo.rasgo_tono || "media"
media     = rellenar(rasgos.map(r => r[campoTono]), mapeo.relleno_media)
// a partir de aquí TODO lo que en §2.1, §2.2 y §2.5 dice "media" es esta serie
```

| Regla | Fuente |
|---|---|
| `rasgo_tono` viene en `rasgos.json` y en `_mapeo.json` **solo si no es `"media"`**. Sin la clave, el tono sale de `media` (así los `_mapeo.json` de GISTEMP y SST no cambian) | `06:RASGO_TONO` |
| Ese rasgo sustituye a `media` en la **nota** (§2.1), la **densidad** y el **evento fuerte** (§2.5), y la `referencia` del **dron** (§2.2) va en sus unidades | `06:RASGO_TONO` |
| `vmin_sonido` y `vmax_sonido` son **obligatorios** y van en las unidades del rasgo (en `dif_hemisferios`, °C de diferencia); `vmin`/`vmax` de la paleta no sirven | `06:RASGO_TONO` |
| Dato ausente (`null`, p. ej. un hemisferio sin píxeles válidos): el último valor válido; al inicio, `relleno_media` = `(vmin_sonido + vmax_sonido) / 2` (con `media` es `(vmin + vmax) / 2`) | `06:RASGO_TONO` |
| `densidad_umbrales` y `umbral_evento`, si se dan, van en las unidades del rasgo; si faltan, salen del rango de sonido como siempre | `06:umbral_evento`, `06:u1, u2` |
| **No cambian**: el volumen (sigue saliendo de `area`, §2.3) y el paneo (sigue saliendo del centroide, §2.4) | `06:area`, `06:eje, c_pan, pan` |
| El JS debe leer el rasgo del `<id>_rasgos.json` de la web: `exportar_web` copia todos los campos de cada rasgo, así que `dif_hemisferios`, `media_norte` y `media_sur` llegan si 05 los escribió | |

Hoy ninguna pista del catálogo lo usa. Ejemplo para el mar (decisión pendiente del equipo): `"rasgo_tono": "dif_hemisferios"`, `"vmin_sonido": 1.5`, `"vmax_sonido": 8.3`, `"referencia": 5.08`.

## 3. Lo opcional (mejora el parecido, no cambia notas ni pan)

| Regla | Valor | Fuente |
|---|---|---|
| Melodía = GM 13 (marimba); dron = GM 90 (pad sostenido). Con muestras de SoundFont; Web Audio no las tiene (ver §6) | `instrumento_melodia` 13, `dron_programa` 90 | `06:prog_mel, prog_dron`, `06:DEFECTOS` |
| Reverb: CC91 = 50 (≈ 39 % de envío) en los dos canales | `reverb` 50 | `06:reverb`, `06:ev (program_change, CC91)` |
| Humanizar: ±10 ms en el inicio y ±10 % en la velocidad, con `numpy.random.default_rng(12345)` | `humanizar` true | `06:humanizar` |
| Fundido final de 50 ms y limitador `tanh(1,5·x)` normalizado a pico 0,85 | | `06:renderizar_fluidsynth`, `sintesis:limitar` |
| Respaldo numpy (el timbre reproducible con osciladores): melodía = oscilador `suave` (seno + 0,35·2.º + 0,15·3.er armónico, ÷1,5) con glide de 10 ms, `0.5 * ganancia`; golpe = triangular de 0,35 s con ADSR (a 3 ms, d 120 ms, s 0, r 50 ms), `0.35 * vel/90`; dron = seno | | `06:sintetizar_numpy`, `sintesis:oscilador, adsr` |

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

## 5. Decisiones de diseño de la implementación

1. **El video es el reloj.** En vivo, el `<video>` sigue reproduciéndose con su audio a ganancia 0 y el motor programa los sonidos según `currentTime`. Reproducir, pausar, buscar y el final salen de los mismos eventos que ya usa la web.
2. **Cálculo y síntesis separados.** `web/js/mapeo.js` es puro (sin DOM ni Web Audio) y es lo que prueba `web/pruebas/motor.test.mjs` contra `_esperado.json`. `web/js/vivo.js` solo convierte ese resultado en nodos.
3. **Timbre del respaldo numpy:** voz sostenida «suave», golpe triangular y dron seno. Web Audio no tiene SoundFont (§6).
4. **Dron a unos 7 dB bajo la melodía**, con amplitud calculada al cargar la pista (`nivelDron`). El limitador `0,85·tanh(1,5·x)` de `sintesis.limitar` dejaba el dron a 3,7 dB; por eso `vivo.js` usa un limitador de rodilla (lineal hasta 0,8, compresión hacia 0,95) y centra el dron con un `StereoPannerNode` en 0, como `paneo(dron, 0.0)` en 06. Medido sin conexión con `vivo.renderizar()` (prueba V28): 6,97 dB en GISTEMP y 6,96 dB en SST, como potencia total de los dos canales.
5. **Casillas de rasgos:** apagar tono, volumen o paneo deja ese rasgo fijo (nota de la referencia, 0 dB, centro); apagar el dron lo silencia. Con las tres de la melodía apagadas solo suena el dron y el planificador no programa golpes. El nivel del dron no cambia al marcar casillas.
6. **El modo se recuerda por pista durante la sesión**, en memoria y sin `localStorage`. Al cargar la página, todas las pistas están en «Pista original».
7. **Gesto del usuario:** el `AudioContext` se crea y se reanuda dentro de un gesto, de forma síncrona y antes de cualquier `await` (Safari e iOS no lo permiten de otro modo).
8. **Sin selector de velocidad:** el motor solo responde a `ratechange`, que vuelve a sincronizar sin cambiar las notas.
9. **Planificador:** `play` arranca el planificador y `playing` solo lo arranca si no está en marcha (si no, los golpes se programan dos veces). Al terminar la pista, la puerta de salida se cierra con una rampa lineal de 50 ms. `vivo.js` escucha los eventos del `<video>` directamente, porque `pause` y `ended` no se tratan igual.
10. **Pruebas:** `evaluar.py` lanza la prueba de Node si encuentra `node` 18 o más (prueba L1); si no, queda OMITIDA. Safari de macOS y de iOS, Firefox, una pestaña oculta 10 s, los auriculares y un lector de pantalla real están en la lista manual del PR #15 y siguen sin probarse.

## 6. Reglas difíciles de replicar en Web Audio

- **Instrumentos reales (marimba y pad de la SoundFont):** Web Audio no trae SoundFont. Se aproxima con el respaldo numpy de §3 (osciladores + ADSR); suena distinto pero con las mismas notas.
- **El dron tiene que ser continuo:** con la marimba ligada (misma nota varios fotogramas, hasta 1,5 s sin golpe) el dron es lo único que suena; si el modo en vivo lo implementa como una nota que decae, habrá silencios como los que tenía el WAV (−50 a −70 dB en 14,0–15,0 s, 17,5–19,0 s y 22,5 s de SST). Comprobación: RMS por ventana de 0,5 s sin ventanas por debajo de −40 dB ni caídas de más de 12 dB entre ventanas contiguas (el WAV actual: mínima −25 dB, mayor caída 5,4 dB).
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

El equivalente en Python corre en `evaluar.py` (prueba I1) y también contra cuatro series sintéticas generadas por el 06 real (eje x amplia, eje y estrecha, eje y amplia sin densidad, y tono por `dif_hemisferios` con datos ausentes).

## 8. Cómo regenerar los archivos

```bash
# pistas (carpetas de salida de 05 + 06)
ROCOLA_SALIDAS=salidas_gistemp python 05_video_a_rasgos.py config/config_eic.json && ROCOLA_SALIDAS=salidas_gistemp python 06_rasgos_a_audio.py
ROCOLA_SALIDAS=salidas_sst     python 05_video_a_rasgos.py config/config_sst.json && ROCOLA_SALIDAS=salidas_sst     python 06_rasgos_a_audio.py
python -m herramientas.exportar_mapeo        # escribe web/assets/<id>_mapeo.json y <id>_esperado.json
```

Si el mapeo no reproduce `control.json` ni el `.mid`, la exportación aborta sin escribir nada.
