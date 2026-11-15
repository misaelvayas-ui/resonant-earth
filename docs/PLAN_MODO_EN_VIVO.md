# Plan: modo de sonido en vivo (Web Audio) en la web

Rama `misael/en-vivo` (sale de `master` con los PR #12 y #13 ya fusionados). Este documento es el único archivo de la fase de planificación. Quien lo ejecute no tiene que decidir nada: las decisiones están tomadas aquí y las que le corresponden a Misael están en la sección 8.

## 0. Qué se construye

La web publicada es la carpeta `web/` (`.github/workflows/pages.yml`, `path: web`). Hoy la rocola reproduce el audio del MP4. Se añade un segundo modo, **Sonido en vivo**, que genera el audio en el navegador a partir de `<id>_rasgos.json` y `<id>_mapeo.json`, con las mismas notas, dron, volumen y paneo que `06_rasgos_a_audio.py`. El modo por defecto sigue siendo **Pista original**.

No se toca: ningún `0x_*.py`, `sintesis.py`, `herramientas/`, `web/assets/*` ni `web/equipo.json`. `evaluar.py` solo recibe una prueba nueva (L1, paso 5b) que lanza la prueba de Node.

### Comprobado durante la planificación (prototipo desechable, fuera del repo)

| Comprobación | Resultado |
|---|---|
| Las fórmulas de la sección 3 en JS frente a `_esperado.json` | GISTEMP y SST: 0 notas distintas, 0 arpegios distintos, dron igual, error máximo de pan 0, error máximo de ganancia 0,00001 dB, velocidad y evento fuerte iguales |
| Golpes tras ligar y re-golpe | 89 en GISTEMP y 125 en SST (los que cita «Cómo funciona») y `ataque` por fotograma igual al de `_esperado.json` |
| Usar `centroide_x` | error de pan 1,59 (GISTEMP) y 1,52 (SST): la prueba lo detecta |
| Usar `vmin`/`vmax` de la paleta | 54 y 51 notas distintas: la prueba lo detecta |
| Quitar la media móvil de 3 | 32 notas distintas en cada pista: la prueba lo detecta |
| Node 18.19 importa `web/js/*.js` como módulo ES | sí, con `web/js/package.json` = `{"type":"module"}` |
| Nivel del dron con la fórmula de 3.5 | amplitud 0,1067 (GISTEMP) y 0,1284 (SST); el dron queda 7,15 y 7,04 dB bajo la melodía simulada |

### El prototipo externo (`/tmp/earthsound_v4`, solo lectura)

Sirve de referencia para la forma del motor (un `AudioContext`, oscilador sostenido, `setTargetAtTime`, un golpe por cambio de nota) y para la idea de avisar por texto al cambiar de modo. **No se copia**: su mapeo es incorrecto (panea con `centroide_x`, normaliza con −2…+2, dron fijo en 174,61 Hz, otra escala, `Math.round`, volumen con `area` cruda) y actualiza el sonido por fotograma de video en vez de programarlo en el reloj de audio. `voice-guide.js` (síntesis de voz) no se usa: la web ya anuncia por `aria-live`.

## 1. Decisiones cerradas

1. **El video es el reloj.** En vivo, el `<video>` sigue reproduciéndose con su audio a ganancia 0 y el motor programa los sonidos según `medio.currentTime`. Así reproducir, pausar, buscar, velocidad y final salen de los mismos eventos que ya usa la web, y el gráfico, la fecha y la lectura no cambian.
2. **El JS no inventa números del mapeo.** Todo sale de `<id>_mapeo.json`. Las únicas constantes escritas en el código son de timbre, tomadas del respaldo numpy (ESPEC §3, `06:293-305`), y están en la tabla de 3.6.
3. **Timbre = respaldo numpy:** voz sostenida «suave» + golpe triangular + dron seno. No hay SoundFont en Web Audio (ESPEC §6).
4. **Dron continuo, seno, 7 dB bajo la melodía**, con la amplitud calculada al cargar (3.5). Nunca una nota con envolvente que decae.
5. **Cálculo y síntesis separados.** `web/js/mapeo.js` es puro (sin DOM ni Web Audio) y es lo que prueba Node. `web/js/vivo.js` solo convierte ese resultado en nodos.
6. **Casillas de rasgos = «este rasgo modula el sonido».** Apagar un rasgo lo deja en un valor fijo, no en silencio (tabla en 3.7). Con melodía, volumen y paneo apagados a la vez, la voz de la melodía se calla y queda el dron.
7. **El modo se recuerda por pista durante la sesión** (un `Map` en memoria, sin `localStorage`). Al cargar la página, todas en «Pista original».
8. **El AudioContext se crea o reanuda solo dentro de un gesto**, de forma síncrona, antes de cualquier `await`.

## 1b. Decisiones de Misael (cierran las dudas de la sección 8)

1. **Sin selector de velocidad.** El motor solo responde a `ratechange` (la web no ofrece ese control). El paso 15 queda **descartado**.
2. **Timbre:** respaldo numpy, voz sostenida + golpe (como está en 3.6).
3. **Casillas:** apagar tono, volumen o paneo los deja fijos (nota de la referencia, 0 dB, centro); apagar el dron lo silencia (3.7).
4. **Dron** a unos 7 dB bajo la melodía (3.5).
5. **`web/js/package.json`** con `{"type": "module"}`.
6. **`evaluar.py` lanza la prueba de Node** si encuentra `node` (≥ 18); si no, la prueba sale OMITIDA. Es el paso 5b; `evaluar.py` pasa de 45 a **46** pruebas (L1).
7. **Safari e iOS** los prueba otra persona del equipo: el punto 10 de la lista manual (5.4) se entrega sin probar y se copia a la descripción del PR.

Orden de ejecución: primero el mínimo viable (sección 7: pasos 1 a 5b, 6 a 11 y 13 sin las casillas, con T0 a T5 y V24, V25), con `evaluar.py` y la prueba de Node en verde y un push; después el resto. Un commit por paso, con su número.

## 2. Arquitectura

### 2.1 Archivos

| Archivo | Estado | Contenido |
|---|---|---|
| `web/js/package.json` | nuevo | `{"type": "module"}`: deja que Node importe `web/js/*.js`. El navegador lo ignora |
| `web/js/mapeo.js` | nuevo | Cálculo puro: `limitar`, `redondearPar`, `rellenar`, `mediaMovil`, `percentil`, `calcularSerie`, `aislar`, `eventos`, `nivelDron`, `valorEn`, `primerEvento`. Sin imports |
| `web/js/vivo.js` | nuevo | Motor Web Audio: nodos, planificador, sincronía. Importa `mapeo.js` |
| `web/js/audio.js` | modificado | Grafo con dos buses (original y vivo), `desbloquear()`, `fijarModo()`, `contexto()`, `entradaVivo()`, `medio()` |
| `web/js/datos.js` | modificado | `cargarMapeo(pista)` con memoria, como `cargarRasgos` |
| `web/js/rocola.js` | modificado | Selector de modo, casillas, mensajes de estado, llamadas a `vivo` |
| `web/js/principal.js` | modificado | Inicia `vivo` y lo expone en `window.__web.vivo` para las pruebas |
| `web/index.html`, `web/estilos.css` | modificado | Dos `fieldset` en el escenario y un párrafo en «Cómo funciona» y otro en «Accesibilidad» |
| `web/pistas.json` | modificado | Clave nueva `"mapeo": "assets/<id>_mapeo.json"` en cada pista (no es un asset de audio ni de video) |
| `web/pruebas/motor.test.mjs` | nuevo | Prueba en Node (`node:test`) del cálculo |
| `web/pruebas/verificar.cjs` | modificado | V24 a V28 |
| `web/README.md`, `docs/CAMBIOS.txt` | modificado | Documentación y ronda 37 |

### 2.2 Grafo de audio

```
<video> ── MediaElementSource ── busOriginal (Gain 1 | 0) ──┐
                                                           ├── ganancia (volumen) ── analizador ── destino
motor en vivo ── limitador (WaveShaper) ── busVivo (0 | 1) ─┘

motor en vivo:
  voz (Oscillator con PeriodicWave «suave») ── gVoz ──┐
  golpes (Oscillator triangular ── Gain envolvente) ──┼── gMelodia ── paneador (StereoPanner) ──┐
  dron (Oscillator seno) ── gDron ────────────────────────────────────────────────────────────┼── puerta (Gain 0 | 1) ── limitador
```

- `ganancia` y `analizador` son los que ya existen: el volumen, el visualizador y el anillo del globo funcionan igual en los dos modos.
- `busOriginal` y `busVivo` cambian con `setTargetAtTime(valor, ahora, 0.015)` (fundido cruzado sin clic).
- `puerta` está en 1 solo mientras el video suena; en 0 en pausa, al buscar y al terminar.
- El dron no pasa por el paneador (ESPEC §2.4: solo se panea la melodía).

### 2.3 Cómo se conecta con el reproductor actual

- `rocola.js › elegir(id)`: además de `cargarRasgos`, llama a `cargarMapeo`. Cuando hay rasgos y mapeo, `vivo.cargar(mapeo, doc.rasgos)` y se habilita el selector. Si el mapeo no llega, el selector queda deshabilitado con el texto de 5.2.
- `audio.js › iniciar(elemento)`: registra además `seeking`, `ratechange`, `playing` y `stalled` y los reenvía con `avisar()` (ya reenvía `play`, `pause`, `ended`, `seeked`, `waiting`). `vivo.js` se suscribe con `audio.alCambiar` y lee el `<video>` con `audio.medio()`.
- `principal.js`: sin cambios en el bucle de `gsap.ticker`. El planificador de `vivo` usa su propio `setInterval` (el ticker se detiene con la pestaña oculta).
- Los atajos de teclado no cambian: los controles nuevos son `input`, que `atajos()` ya ignora.

## 3. Fórmulas (pseudocódigo que debe coincidir con la ESPEC)

`m` = contenido de `<id>_mapeo.json`; `R` = `rasgos` de `<id>_rasgos.json`; `T = m.seg_por_fotograma`.

### 3.1 Utilidades

```
limitar(v, a, b)      = min(b, max(a, v))
redondearPar(v)       = r = Math.round(v); (abs(v % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r      // v >= 0; 0.5→0, 1.5→2, 2.5→2
rellenar(v, defecto)  = cada null/undefined/NaN se sustituye por el último valor válido; antes del primero, por defecto
mediaMovil(x, n)      = h = (n | 1) >> 1; salida[i] = promedio de x[max(0, i-h) .. min(len-1, i+h)]
percentil(v, q)       = s = orden ascendente; pos = (len-1)*q/100; lo = floor(pos); hi = min(lo+1, len-1); s[lo] + (s[hi]-s[lo])*(pos-lo)
```

### 3.2 `calcularSerie(m, R)` → un objeto por fotograma (ESPEC §2.1 a §2.5)

```
esc = m.escala.notas_base;  oct = 12 * m.escala.octava;  v0 = m.vmin_sonido;  v1 = m.vmax_sonido
campoTono = m.rasgo_tono || "media"
media  = rellenar(R.map(r => r[campoTono]), m.relleno_media)
area   = rellenar(R.map(r => r.area), 0)
cEje   = rellenar(R.map(r => r[m.paneo.campo]), 0.5)                 // el campo SIEMPRE sale del mapeo
mediaS = m.suavizado_fotogramas > 1 ? mediaMovil(media, m.suavizado_fotogramas) : media
cS     = mediaMovil(cEje, m.paneo.suavizado_fotogramas)
[u1, u2] = m.densidad.umbrales;  v = m.volumen;  p = m.paneo;  rango = v.area_max - v.area_min

para cada i:
  idx   = redondearPar(limitar((mediaS[i] - v0) / (v1 - v0 + 1e-12), 0, 1) * (esc.length - 1))
  k     = m.densidad.activa ? (mediaS[i] < u1 ? 1 : (mediaS[i] <= u2 ? 2 : 4)) : 1
  paso  = (idx + k <= esc.length) ? 1 : -1
  notas = [0 .. k-1].map(j => esc[idx + paso*j] + oct)
  cPan  = p.rama === "amplia" ? limitar((cS[i] - p.p5) / (p.p95 - p.p5), 0, 1)
                              : limitar(0.5 + (cS[i] - p.centro) / p.ancho_rama_estrecha, 0, 1)
  si area[i] < p.area_centro: cPan = 0.5                             // area cruda, no normalizada
  aN    = rango >= v.rango_minimo ? limitar((area[i] - v.area_min) / rango, 0, 1) : (v.area_max >= v.rango_minimo ? 1 : 0)
  ganancia = 10 ** ((v.db_min + (v.db_max - v.db_min) * aN) / 20)
  → { nota: esc[idx] + oct, notas, dron: m.dron.nota_midi, pan: 2*cPan - 1, ganancia,
      velocidad: redondearPar(v.velocidad_max * ganancia),
      evento_fuerte: i > 0 && abs(media[i] - media[i-1]) > m.articulacion.umbral_evento }     // media CRUDA
```

`p5`, `p95`, `centro` y `rama` se leen del mapeo. `percentil` existe para que la prueba compruebe que el mapeo es coherente con los rasgos (5.1, T2).

### 3.3 `eventos(m, serie)` → lista de golpes (ESPEC §2.5; `06:137-175`, sin humanizar)

```
a = m.articulacion;  salida = [];  ultF = -1
para cada fotograma i (f = serie[i]), para cada j en 0 .. k-1 (k = f.notas.length):
  t       = i*T + j*T/k
  fin     = t + (T/k) * a.duracion_nota
  forzado = f.evento_fuerte && j === 0
  vel     = forzado ? max(f.velocidad, m.volumen.velocidad_fuerte) : f.velocidad
  prev    = último de salida
  si a.ligar && prev && f.notas[j] === prev.nota && !forzado:
      si a.regolpe_ligado > 0 && j === 0 && i - ultF >= a.regolpe_ligado:
          salida.push({ t, fin, nota: f.notas[j], vel: max(1, redondearPar(vel * a.regolpe_vel)), tipo: "regolpe", i });  ultF = i
      si no: prev.fin = fin                                           // la nota se alarga, sin golpe
      continuar
  salida.push({ t, fin, nota: f.notas[j], vel, tipo: forzado ? "fuerte" : "ataque", i });  ultF = i
```

### 3.4 Valores continuos: `valorEn(serie, campo, pos, T)` (ESPEC §2.3 y §2.4; `06:269`, `06:294`)

Interpolación lineal entre los **centros** de fotograma, constante fuera de ellos:

```
u = pos / T - 0.5
si u <= 0: serie[0][campo];   si u >= n-1: serie[n-1][campo]
i = floor(u);  serie[i][campo] + (serie[i+1][campo] - serie[i][campo]) * (u - i)
```

El suavizado posterior lo hace Web Audio: `setTargetAtTime(valor, ahora, tau)` es el mismo filtro de un polo que `sintesis.suavizar`, con `tau = m.paneo.suavizado_s` (0,15 s) para el pan y 0,08 s para la ganancia.

### 3.5 `nivelDron(m, serie, ev)` → amplitud del seno del dron

El dron debe quedar `DRON_DB = 7` dB por debajo del RMS de la melodía (ESPEC §2.2). El RMS de la melodía se estima al cargar, con las constantes de timbre de 3.6:

```
D      = serie.length * T
eVoz   = NIVEL_VOZ² * promedio(serie.map(f => f.ganancia²)) * ((1 + 0.35² + 0.15²) / 2 / 1.5²)
eGolpe = suma(ev.map(e => (NIVEL_GOLPE * e.vel / VEL_REF)²)) * ((GOLPE_A + GOLPE_D) / 3) * (1/3) / D
amplitud = √2 * 10 ** (-DRON_DB / 20) * √(eVoz + eGolpe)
```

Siempre se calcula con la serie y los eventos **completos** (sin aislar): el dron no cambia de nivel al marcar casillas. Valores esperados: 0,1067 en GISTEMP y 0,1284 en SST.

### 3.6 Constantes de timbre (las únicas escritas en `vivo.js`; fuente `06:293-305`, `sin:32-42`, `sin:111-114`)

| Constante | Valor | Qué es |
|---|---|---|
| `ARMONICOS` | `[1, 0.35, 0.15]` ÷ 1,5 | forma «suave»: `PeriodicWave` con `imag = [0, 1/1.5, 0.35/1.5, 0.15/1.5]`, `real` en ceros y `{ disableNormalization: true }` |
| `NIVEL_VOZ` | 0,5 | `gVoz = NIVEL_VOZ × ganancia` |
| `TAU_NOTA` | 0,01 s | glide de la frecuencia de la voz |
| `TAU_GANANCIA` | 0,08 s | suavizado de la ganancia |
| `NIVEL_GOLPE`, `VEL_REF` | 0,35 y 90 | pico del golpe = `NIVEL_GOLPE × vel / VEL_REF` |
| `GOLPE_A`, `GOLPE_D` | 0,003 s y 0,12 s | ataque y caída lineales del golpe (sostenido 0) |
| `DRON_DB` | 7 | dB del dron bajo la melodía |
| `LIMITADOR` | `0.85 × tanh(1.5 × x)` | curva del `WaveShaperNode` (2049 puntos, `oversample = "2x"`) |
| `FUNDIDO_FINAL` | 0,05 s | fundido al terminar la pista |
| `TICK`, `HORIZONTE` | 25 ms y 0,2 s (1,2 s con la pestaña oculta) | planificador |

`NIVEL_VOZ`, `NIVEL_GOLPE`, `VEL_REF`, `GOLPE_A`, `GOLPE_D` y `DRON_DB` se exportan desde `mapeo.js` (los usa `nivelDron`); `vivo.js` los importa.

### 3.7 `aislar(m, serie, rasgos)` (rasgos = `{tono, volumen, paneo, dron}`, todos `true` por defecto)

| Casilla apagada | Efecto en la serie (función pura) | Efecto en el motor |
|---|---|---|
| Melodía (tono) | `nota = m.nota_referencia_base + 12*octava`, `notas = [nota]`, `evento_fuerte = false` | ninguno más (queda un pulso por fotograma en la nota de la referencia) |
| Volumen | `ganancia = m.volumen.ganancia_max`, `velocidad = m.volumen.velocidad_max` | ninguno más |
| Paneo | `pan = 0` | ninguno más |
| Dron | ninguno | `gDron` a 0 |
| Las tres primeras a la vez | | `gMelodia` a 0 |

Los golpes se recalculan con `eventos(m, aislar(...))` cada vez que cambia una casilla, y el motor se resincroniza.

### 3.8 Planificador (`vivo.js`)

```
reloj(): posición de la pista estimada sin los saltos de medio.currentTime
  est = ancla.pos + (ctx.currentTime - ancla.ctx) * medio.playbackRate
  si abs(medio.currentTime - est) > 0.06: ancla = { pos: medio.currentTime, ctx: ctx.currentTime };  est = ancla.pos
  devolver est

tick():                                             // cada TICK ms mientras suena en modo vivo
  si !activo || medio.paused || medio.seeking || medio.readyState < 3: salir
  pos = reloj();  vel = medio.playbackRate;  ahora = ctx.currentTime
  mientras sig < ev.length && ev[sig].t < pos + HORIZONTE * vel:
      e = ev[sig++]
      si e.t < pos - 0.05: continuar                // quedó atrás
      golpe(e, ahora + max(0, (e.t - pos) / vel))
  gVoz.gain.setTargetAtTime(NIVEL_VOZ * valorEn(serieActiva, "ganancia", pos, T), ahora, TAU_GANANCIA)
  paneador.pan.setTargetAtTime(valorEn(serieActiva, "pan", pos, T), ahora, m.paneo.suavizado_s)

golpe(e, cuando):
  voz.frequency.setTargetAtTime(hz(e.nota), cuando, TAU_NOTA)
  o = Oscillator triangular a hz(e.nota);  g = Gain
  g.gain.setValueAtTime(0, cuando)
  g.gain.linearRampToValueAtTime(NIVEL_GOLPE * e.vel / VEL_REF, cuando + GOLPE_A)
  g.gain.linearRampToValueAtTime(0, cuando + GOLPE_A + GOLPE_D)
  o.start(cuando);  o.stop(cuando + GOLPE_A + GOLPE_D + 0.02);  al terminar: desconectar y quitar de `pendientes`
  hz(n) = 440 * 2 ** ((n - 69) / 12)

resincronizar():                                    // play, playing, seeked, ratechange, cambio de casillas, cambio a modo vivo
  parar y desconectar los golpes de `pendientes` cuyo inicio > ahora
  voz.frequency.cancelScheduledValues(ahora)
  ancla = { pos: medio.currentTime, ctx: ctx.currentTime }
  sig = primerEvento(ev, ancla.pos)                 // búsqueda binaria: primer índice con t >= pos - 1e-6
  nota vigente = la del último evento con t <= pos (o ev[0]) → voz.frequency.setTargetAtTime(hz, ahora, TAU_NOTA)
```

| Evento del `<video>` | Acción del motor (solo en modo vivo) |
|---|---|
| `play`, `playing` | `resincronizar()`, `puerta` a 1 (τ 0,015), arrancar el `setInterval` |
| `pause`, `waiting`, `stalled`, `seeking` | `puerta` a 0 (τ 0,015), cancelar golpes futuros, parar el `setInterval` |
| `seeked` | si no está en pausa: como `play` |
| `ratechange` | `resincronizar()` (las notas no cambian de altura; cambia el tempo) |
| `ended` | `puerta` a 0 con rampa lineal de `FUNDIDO_FINAL`, parar el `setInterval` |
| `visibilitychange` | `HORIZONTE` pasa a 1,2 s si `document.hidden`, y a 0,2 s si no |

## 4. Pasos

Cada paso termina con su criterio cumplido y con `node --test web/pruebas/motor.test.mjs` en verde (desde el paso 2). No se pasa al siguiente con un criterio en rojo. Tiempos pensados para un modelo ejecutor con este plan delante.

### Fase A: cálculo puro y su prueba

| # | Paso | Criterio de aceptación | Tiempo |
|---|---|---|---|
| 1 | Crear `web/js/package.json` con `{"type": "module"}` | `node -e "import('./web/js/lectura.js').then(m => console.log(typeof m.indiceEn))"` imprime `function` | 5 min |
| 2 | Crear `web/js/mapeo.js` con las utilidades de 3.1 y `web/pruebas/motor.test.mjs` con el grupo T0 (5.1) | T0 pasa | 20 min |
| 3 | Añadir `calcularSerie` (3.2) y los grupos T1, T2 y T3 | T1 a T3 pasan en las dos pistas | 35 min |
| 4 | Añadir `eventos` (3.3), `valorEn` (3.4), `primerEvento` y el grupo T4 | T4 pasa: 89 y 125 golpes | 30 min |
| 5 | Añadir las constantes de 3.6 que usa el cálculo, `nivelDron` (3.5), `aislar` (3.7) y los grupos T5, T6 y T7 | T5 a T7 pasan | 30 min |
| 5b | `evaluar.py`: prueba **L1** «web: motor del modo en vivo (Node)», que ejecuta `node --test web/pruebas/motor.test.mjs` y lee el resumen (`# pass` / `# fail`). Sin `node` (o menor que 18) devuelve OMITIDA. Añadirla a `EVALUACIONES` y subir a 46 el recuento del README | `python evaluar.py`: 46 PASA, 0 FALLA; con `PATH` sin `node`, L1 sale OMITIDA y el resto igual | 15 min |

### Fase B: datos y grafo

| # | Paso | Criterio de aceptación | Tiempo |
|---|---|---|---|
| 6 | `pistas.json`: clave `"mapeo"` en las dos pistas. `datos.js`: `cargarMapeo(pista)` devuelve el JSON o `null` (sin clave, 404 o JSON inválido), con memoria por `pista.id`. No añadir `mapeo` a `CLAVES_PISTA` (una pista sin mapeo solo pierde el modo en vivo) | En la consola del navegador, `cargarMapeo` de cada pista devuelve un objeto con `paneo.campo === "centroide_y"`; V1 a V23 siguen en PASA | 15 min |
| 7 | `audio.js`: en `crearGrafo()` insertar `busOriginal` entre la fuente y `ganancia`, y crear `busVivo` (ganancia 0) conectado a `ganancia`. Exportar `desbloquear()` (crea el grafo y llama a `ctx.resume()` sin `await`), `contexto()`, `entradaVivo()` (devuelve `busVivo`), `medio()`, `fijarModo("original" \| "vivo")` y `modo()`. Registrar `seeking`, `ratechange`, `playing` y `stalled` en `iniciar()`. Si no hay `AudioContext`, `fijarModo("vivo")` devuelve `false` y no cambia nada | V1 a V23 en PASA sin cambios de texto ni de audio. `__web.audio.modo()` devuelve `"original"`. Tras `fijarModo("vivo")` con una pista sonando, `amplitud()` cae por debajo de 0,02 en 1 s (el original calla y todavía no hay motor) | 40 min |
| 8 | Llamar a `audio.desbloquear()` como **primera línea síncrona** de: el clic de cada tarjeta de pista, `alternar()`, el clic de `#btn-muestra` y el `change` del selector de modo (paso 12) | Con un punto de parada o `console.assert`, `audio.contexto().state` es `"running"` antes del primer `await` en esos cuatro manejadores | 15 min |

### Fase C: motor

| # | Paso | Criterio de aceptación | Tiempo |
|---|---|---|---|
| 9 | `vivo.js`: `iniciar()` (se suscribe a `audio.alCambiar`), `cargar(mapeo, rasgos)` (calcula serie, eventos y amplitud del dron; no crea nodos), `crearNodos()` perezoso (primer uso con contexto disponible: voz, `gVoz`, `gMelodia`, paneador, dron, `gDron`, `puerta`, limitador → `audio.entradaVivo()`), `activar(si)` y `estado()` para pruebas (`{ listo, activo, sonando, programados, ultimo: {t, cuando}, rasgos, ampDron }`). Exponerlo en `window.__web.vivo` | En modo vivo y reproduciendo, se oye el dron continuo a la nota de `mapeo.dron.hz`; en pausa calla en menos de 0,1 s. `estado().ampDron` = 0,1067 ± 0,001 (GISTEMP) | 45 min |
| 10 | Planificador de 3.8: `reloj()`, `tick()`, `golpe()`, y `gVoz`/paneador por tick | Reproduciendo GISTEMP en vivo 5 s: `estado().programados` entre 8 y 14, y `abs(estado().ultimo.t - medio.currentTime) < 0,3` | 60 min |
| 11 | Tabla de eventos de 3.8: `resincronizar()` y la reacción a `pause`, `waiting`, `stalled`, `seeking`, `seeked`, `ratechange`, `ended`, `visibilitychange` | (a) Pausa: `amplitud()` < 0,02 en 1 s y `programados` no crece. (b) `buscar(20)` sonando: el siguiente `ultimo.t` está entre 20,0 y 20,6. (c) `playbackRate = 2`: en 2 s reales se programan los golpes de 4 s de pista (± 2). (d) Al terminar: `sonando` es `false` y el estado de la rocola dice «Terminó: …» | 50 min |
| 12 | `fijarRasgos({tono, volumen, paneo, dron})`: recalcula `serieActiva` y `ev` con `aislar`, aplica `gDron` y `gMelodia` (τ 0,015) y llama a `resincronizar()` | Con solo «Dron»: `amplitud()` > 0 y `programados` no crece. Con «Dron» apagado y lo demás encendido: suena la melodía y, entre golpes de una nota ligada, el nivel baja (no hay dron) | 25 min |

### Fase D: interfaz

| # | Paso | Criterio de aceptación | Tiempo |
|---|---|---|---|
| 13 | `index.html` y `estilos.css`: los dos `fieldset` de 5.2 dentro de `#escenario`, entre `.controles` y la barra de avance. `rocola.js`: `change` del selector → `desbloquear()`, `audio.fijarModo`, `vivo.activar`, guardar el modo en el `Map` por pista y `decir()` el mensaje; `elegir()` restaura el modo guardado de esa pista (por defecto original) y habilita o deshabilita según 5.2; `change` de las casillas → `vivo.fijarRasgos` y `decir()` | Flujo completo con teclado: Tab hasta el selector, flechas para cambiar, Espacio en las casillas. Al cambiar de pista vuelve el modo guardado de esa pista. Sin mapeo o sin Web Audio, el selector está deshabilitado y se lee el motivo. Los atajos Espacio y ← → siguen funcionando fuera de los controles | 60 min |
| 14 | Textos: un párrafo en «Cómo funciona» y un punto en «Accesibilidad» (5.2) | Los dos textos están en la página y `V2` (axe) sigue en 0 violaciones | 15 min |
| 15 | ~~Selector de velocidad~~ **Descartado** (decisión 1): sin selector; el motor responde a `ratechange` (paso 11) | — | — |

### Fase E: pruebas y cierre

| # | Paso | Criterio de aceptación | Tiempo |
|---|---|---|---|
| 16 | `verificar.cjs`: V24 a V27 (5.3) | V1 a V27 en PASA | 60 min |
| 17 | *(recortable)* `vivo.js`: `renderizar(mapeo, rasgos, rasgosActivos)` con `OfflineAudioContext` (programa todos los golpes de una vez, sin video) y V28 | V28 en PASA: dron entre 5,5 y 8,5 dB bajo la melodía; ninguna ventana de 0,5 s de la mezcla por debajo de −40 dB ni caída de más de 12 dB entre ventanas contiguas (ESPEC §6) | 45 min |
| 18 | Lista manual de 5.4 en Chrome y Firefox de escritorio; `python evaluar.py`; `web/README.md` (archivos, pruebas, accesibilidad) y `docs/CAMBIOS.txt` (ronda 37) | Lista manual sin fallos (salvo el punto 10, que prueba otra persona); `evaluar.py` da 46 PASA, 0 FALLA; `git diff --stat master` no lista ningún `.py` salvo `evaluar.py` ni nada de `web/assets/` | 40 min |

Total: unas 9 h 30 min con todo (sin el paso 15); unas 8 h 30 min sin el paso 17.

## 5. Plan de pruebas

### 5.1 Node: `node --test web/pruebas/motor.test.mjs`

Lee `web/assets/<id>_mapeo.json`, `<id>_rasgos.json` y `<id>_esperado.json` de las dos pistas. No usa Web Audio.

| Grupo | Qué exige |
|---|---|
| T0 utilidades | `redondearPar`: 0,5→0, 1,5→2, 2,5→2, 3,5→4, 2,4→2, 2,6→3. `mediaMovil([1,2,3,4], 3)` = `[1.5, 2, 3, 3.5]`. `rellenar([null, 2, NaN, 3], 9)` = `[9, 2, 2, 3]`. `percentil([1,2,3,4], 50)` = 2,5 |
| T1 esperado | Por pista y por fotograma: `nota` y `notas` idénticas, `dron` idéntico, `abs(pan - esperado) <= 0.02`, `abs(20*log10(ganancia/esperada)) <= 0.5` dB, `velocidad` y `evento_fuerte` idénticos. Número de fotogramas = `m.n_fotogramas` |
| T2 coherencia | `percentil` de la serie de paneo suavizada (5 y 95) = `m.paneo.p5` y `p95` (± 1e-9); `m.paneo.rama` coincide con `p95 - p5 >= m.paneo.umbral_rama` |
| T3 mutaciones (la prueba debe distinguir los errores del prototipo) | Con `paneo.campo = "centroide_x"`, la comparación de T1 **falla** por pan en las dos pistas. Con `vmin_sonido`/`vmax_sonido` = `vmin`/`vmax` del `rasgos.json`, **falla** por notas en las dos pistas. Con `suavizado_fotogramas = 1`, **falla** por notas en las dos (32 notas distintas en cada una) |
| T4 eventos | 89 golpes en GISTEMP y 125 en SST; ordenados por `t`; `t` dentro de la pista; por fotograma, «hay un golpe que no es re-golpe en `t = i*T`» = `esperado.ataque` |
| T5 dron | `nivelDron` = 0,1067 ± 0,001 (GISTEMP) y 0,1284 ± 0,001 (SST); `m.dron.hz` = `440 * 2 ** ((m.dron.nota_midi - 69) / 12)` (± 1e-6) |
| T6 aislar | Tono apagado: todas las `nota` iguales a `nota_referencia_base + 12*octava`. Volumen apagado: `ganancia` = 1. Paneo apagado: `pan` = 0. Todo encendido: la serie no cambia |
| T7 sin números a mano | El texto de `web/js/mapeo.js` y `web/js/vivo.js` no contiene `centroide_`, `174.61`, `vmin"` ni `.vmin `/`.vmax ` (el campo y el rango salen del mapeo) |

### 5.2 Textos e interfaz (fijos)

```html
<fieldset id="modo-sonido" class="grupo-sonido" disabled>
  <legend>Sonido</legend>
  <label><input type="radio" name="modo-sonido" value="original" checked> Pista original</label>
  <label><input type="radio" name="modo-sonido" value="vivo"> Sonido en vivo</label>
  <p id="modo-ayuda" class="nota">Elige una pista para activar el sonido en vivo.</p>
</fieldset>
<fieldset id="rasgos-vivo" class="grupo-sonido" disabled>
  <legend>Qué rasgos suenan (solo en vivo)</legend>
  <label><input type="checkbox" id="rasgo-tono" checked> Melodía (tono)</label>
  <label><input type="checkbox" id="rasgo-volumen" checked> Volumen</label>
  <label><input type="checkbox" id="rasgo-paneo" checked> Paneo</label>
  <label><input type="checkbox" id="rasgo-dron" checked> Dron</label>
</fieldset>
```

| Situación | `#modo-sonido` | `#rasgos-vivo` | `#modo-ayuda` |
|---|---|---|---|
| Sin pista | deshabilitado | deshabilitado | «Elige una pista para activar el sonido en vivo.» |
| Pista en modo original | habilitado | deshabilitado | «Pista original: el audio del video, hecho con nuestro programa en Python.» |
| Pista en modo vivo | habilitado | habilitado | «Sonido en vivo: tu navegador lo genera ahora mismo a partir de los datos. Mismas notas, otro timbre.» |
| Sin `mapeo` | deshabilitado | deshabilitado | «Esta pista no tiene sonido en vivo.» |
| Sin Web Audio | deshabilitado | deshabilitado | «Tu navegador no permite generar el sonido en vivo.» |

Mensajes de `decir()` (región `role="status"` que ya existe): al cambiar de modo, el mismo texto de `#modo-ayuda`; al cambiar casillas, «Suenan: » + los rasgos marcados separados por comas (o «No suena ningún rasgo.»). La región `aria-live` de la lectura no cambia.

- «Cómo funciona», tras los cuatro pasos: «En la rocola puedes elegir Sonido en vivo: el navegador aplica el mismo mapeo a los datos y genera el audio al momento. Con las casillas se oye cada rasgo por separado: la melodía, el volumen, el paneo o la nota grave fija.»
- «Accesibilidad», punto nuevo: «En Sonido en vivo puedes dejar un solo rasgo para aprender a reconocerlo: melodía, volumen, lado o nota grave.»

CSS: `.grupo-sonido` sin borde de `fieldset` por defecto (borde `var(--linea)`, radio `var(--r-control)`, relleno `var(--e-3)`), etiquetas en fila con salto de línea, `min-height: 44px` por etiqueta, y `fieldset:disabled` con opacidad 0,55.

### 5.3 Navegador automático: `verificar.cjs` (Chromium + axe, con `WEBM_DIR`)

| ID | Qué comprueba |
|---|---|
| V24 | Al elegir una pista: «Pista original» marcado, `#rasgos-vivo` deshabilitado, `__web.audio.modo() === "original"`. Antes de elegir, los dos `fieldset` están deshabilitados |
| V25 | Cambiar a «Sonido en vivo» con el teclado y reproducir: `amplitud()` > 0,02 en al menos 5 de 20 lecturas; `vivo.estado().programados` crece; `abs(ultimo.t - tiempo) < 0,3`. Pausa: amplitud < 0,02 en 1 s. `buscar(20)`: siguiente `ultimo.t` entre 20,0 y 20,6. `playbackRate = 2`: golpes de 4 s de pista en 2 s (± 2). Final: «Terminó: …» y `sonando === false` |
| V26 | Casillas: solo «Dron» → amplitud > 0 y `programados` constante; «Dron» apagado → `estado().rasgos.dron === false`; el estado dice «Suenan: …» |
| V27 | Memoria por pista: GISTEMP en vivo, cambiar a SST (original por defecto), volver a GISTEMP (vivo). axe con una pista elegida y los controles habilitados: 0 violaciones a 1440 y 390 px. Sin desborde horizontal a 390 px |
| V28 *(paso 17)* | Render sin conexión: dron 5,5 a 8,5 dB bajo la melodía; sin ventanas de 0,5 s por debajo de −40 dB; caída máxima 12 dB |

Además, V1 a V23 deben seguir en PASA sin tocar sus condiciones.

### 5.4 Manual en el navegador (Chrome y Firefox de escritorio; Safari de macOS e iOS si hay equipo)

1. Cargar la página y **no tocar nada** 10 s: no hay avisos de autoplay en la consola ni `AudioContext` creado.
2. Elegir GISTEMP, pasar a «Sonido en vivo» y reproducir: la melodía sube a lo largo de la pista y la nota grave no se interrumpe nunca.
3. Con auriculares, en GISTEMP: el sonido se inclina a la derecha hacia 1918–1953 (el calor más al norte de lo habitual) y vuelve hacia el centro en 1993–2023; igual que en la pista original. (Corregido: antes decía «derecha hacia 2000–2023», que no es lo que dan los datos.)
4. Alternar original y vivo mientras suena: no hay clics, el tiempo no salta y la nota que suena es la misma altura en los dos modos.
5. Pausar, reanudar, arrastrar la barra, clic en el gráfico, ← →, Espacio: el sonido en vivo sigue al video en menos de medio segundo.
6. Dejar terminar la pista: el sonido se apaga, el estado dice «Terminó» y Reproducir vuelve a empezar con sonido.
7. Cada casilla por separado: solo melodía (tono cambia, sin lado ni volumen), solo volumen (pulso en una nota, más fuerte al final de GISTEMP), solo paneo (pulso que cambia de lado), solo dron (nota fija).
8. Cambiar de pestaña 10 s y volver: sigue sincronizado.
9. Con lector de pantalla (Orca o NVDA): el selector se anuncia como grupo «Sonido» con dos opciones; las casillas con su nombre y estado; al cambiar se lee el mensaje de estado.
10. iOS: con el interruptor de silencio activado y desactivado, y tras bloquear y desbloquear el teléfono.

### 5.5 Regresión

- `python evaluar.py`: 46 PASA, 0 FALLA (las 45 de siempre más L1).
- `git diff --stat master -- '*.py' web/assets web/equipo.json` solo lista `evaluar.py`.
- `node --test web/pruebas/motor.test.mjs` y `verificar.cjs` completos.

## 6. Riesgos

| Riesgo | Qué puede pasar | Qué se hace |
|---|---|---|
| Safari de iOS | El interruptor de silencio calla Web Audio; el contexto pasa a `interrupted` al bloquear el teléfono; el gesto se pierde si hay un `await` antes de `resume()` | `desbloquear()` síncrono (paso 8). En `ctx.onstatechange`, si no está `running` en modo vivo: pausar y `decir("El navegador pausó el sonido. Pulsa Reproducir.")`. No se puede probar en esta máquina: queda como punto 10 de la lista manual |
| `currentTime` del video avanza a saltos (Firefox, Safari) | Golpes con hasta 40 ms de error | `reloj()` con ancla (3.8): entre anclas el tiempo lo da el reloj de audio |
| Pestaña oculta | Los temporizadores bajan a 1 por segundo y faltan golpes | `HORIZONTE` de 1,2 s con `document.hidden` |
| Volumen distinto entre original y vivo | Salto de nivel al alternar | Punto 4 de la lista manual. Si molesta, una sola constante `NIVEL_VIVO` en `busVivo` (por defecto 1); no se ajusta a oído sin medir |
| Timbre distinto del MP4 | El MP4 suena a marimba (SoundFont) y el vivo a oscilador | Se dice en el texto de ayuda («Mismas notas, otro timbre»). No hay SoundFont en el navegador |
| Chromium de las pruebas sin dispositivo de audio | V25 a V28 dependen del analizador | Las pruebas V7 y V11 actuales ya miden el analizador en el mismo entorno |
| Muchos nodos por golpes | Hasta 8 golpes por segundo a velocidad 2× | Cada golpe se detiene y desconecta a los 0,14 s; a velocidad 2× hay unos 3 vivos a la vez |

## 7. Qué recortar si falta tiempo

Lo mínimo viable es **tono, dron, volumen y paneo con el selector**: pasos 1 a 4, 6 a 11 y 13 (sin el segundo `fieldset`), más T0 a T4 y V24, V25. Orden de recorte, del primero que se quita al último:

1. Paso 17 (render sin conexión y V28).
2. (El selector de velocidad ya se descartó.)
3. Paso 12 y el `fieldset` de rasgos (requisito 3). Se quitan también T6, V26 y los dos textos de 5.2.
4. El limitador (`busVivo` directo): solo si da problemas en Safari.
5. Dentro del motor, la voz sostenida (queda golpe + dron). `nivelDron` pasa a usar solo `eGolpe`.

No se recorta nunca: `mapeo.js` completo con T1 a T3, el dron continuo, la sincronía con pausa y búsqueda, y el `desbloquear()` dentro del gesto.

## 8. Dudas: resueltas

Las siete dudas de la primera versión de este plan se cerraron en la sección 1b.

## 9. Desviaciones durante la ejecución

(Se añaden aquí, con el número de paso, las diferencias entre lo escrito y lo hecho.)
- **Paso 7:** el accesor del `<video>` se llama `audio.elementoMedio()` (no `medio()`) y el del modo `audio.modo()`, porque `medio` y `modo` ya son variables del módulo. `estado()` incluye además `modo`.
- **Paso 9:** `vivo.js` escucha directamente los eventos del `<video>` (`audio.elementoMedio()`) en vez de pasar por `audio.alCambiar`, porque necesita saber QUÉ evento ocurrió (`pause` y `ended` no se tratan igual). `audio.js` sigue reenviando los eventos nuevos a `avisar()` para la interfaz.
- **Paso 10:** el campo `ultimo` de `vivo.estado()` guarda `{ t, cuando }` del último golpe programado; con GISTEMP, 5 s de reproducción programan 11 golpes (el criterio decía 8 a 14). La pista del mar programa 41 (tiene 40 golpes en esos 5 s): el rango 8 a 14 solo vale para GISTEMP.
- **Paso 11:** `playing` solo vuelve a arrancar el planificador si no estaba en marcha (tras `play` ya lo está); sin esto se reprogramaban los golpes dos veces. Al terminar la pista, la puerta se cierra con una rampa lineal de 50 ms.
- **Paso 13 (parte 1):** el texto de ayuda (`#modo-ayuda`) queda FUERA del `fieldset` (el `fieldset:disabled` le bajaría el contraste) y se enlaza con `aria-describedby`. El aviso «Suena: …» de la región de estado ahora solo se escribe cuando la pista pasa de no sonar a sonar, para no pisar los mensajes del selector.
- **Paso 16 (parte 1):** V24 comprueba que el `AudioContext` no existe antes del primer gesto (en Chromium con `--autoplay-policy=no-user-gesture-required`, que usa `verificar.cjs`, no se puede comprobar el rechazo de `resume()`; eso queda en la lista manual).
- **Paso 12:** con las tres casillas de la melodía apagadas (solo dron) el planificador ya no programa golpes (`programados` no crece), como pide el criterio; la voz y los golpes se silencian además con `gMelodia` a 0.
- **Paso 13 (parte 2) y 14:** el segundo `fieldset` lleva su propio párrafo de ayuda (`#rasgos-ayuda`, fuera del `fieldset`) y la región de estado dice «Suenan: Melodía, Volumen.» o «No suena ningún rasgo.». El texto de «Cómo funciona» va en un párrafo `entrada` tras los cuatro pasos.
- **Paso 15:** descartado (decisión 1); no hay commit.
- **Paso 17 (cambia el diseño de 2.2 y 3.6):** el render sin conexión mostró que con lo escrito en el plan el dron quedaba a 3,7 dB de la melodía y no a 7. Dos causas, las dos corregidas: (1) el limitador `0,85·tanh(1,5·x)` subía el dron 2 dB y bajaba la melodía 1,3 dB; ahora es un limitador de rodilla (lineal hasta 0,8 y compresión suave hacia 0,95, constantes `RODILLA` y `TECHO` de `vivo.js`); (2) el dron iba directo a los dos canales (+3 dB de potencia total frente a 06, que lo centra con `paneo(dron, 0.0)` = 0,707 por canal); ahora pasa por un `StereoPannerNode` fijo en 0. Tras el cambio: 6,97 y 6,96 dB (GISTEMP y SST). El nivel de V28 se mide como potencia TOTAL de los dos canales.
