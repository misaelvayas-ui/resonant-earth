# Configuración de 05 y 06

`05_video_a_rasgos.py` lee un JSON de `config/`. Copia a `rasgos.json` las claves de sonido para que `06_rasgos_a_audio.py` las use. Los ejemplos reales son `config/config_eic.json` (GISTEMP) y `config/config_sst.json` (ECCO2).

## Obligatorias

`video`, `mapa` y `barra` (rectángulos `[x0, y0, x1, y1]` en píxeles del video original), `vmin`, `vmax`, `umbral`, `fps_muestreo`, `barra_vertical`, `barra_arriba_es_max`.

## Lectura del video (05)

| Clave | Por defecto | Para qué |
|---|---|---|
| `barra_imagen` | — | leer la barra de un PNG aparte |
| `escala` | 1.0 | reducir el mapa antes de procesar (0.25 para 4096×2048); los rectángulos siguen en píxeles del video original |
| `ponderar_latitud` | false | media ponderada por cos(latitud) en mapas equirectangulares completos |
| `fechas` | — | `time.txt` (un año por línea) o un archivo `ID  AAAA-MM-DDTHH:MMZ` (2.ª columna); añade `fecha` a cada rasgo |
| `fechas_formato` | `"anio"` | `"mes"` da `"mar 2007"` (solo con fechas ISO; con `time.txt` siempre es el año) |
| `modo_color` | `"lab"` | `"matiz"` compara solo el matiz (HSV) con la barra. Sirve para videos cuyo color pierde brillo, como las líneas de flujo de ECCO2. `dist_max` pasa a unidades de matiz (0-179) |
| `brillo_min`, `saturacion_min` | 60, 60 | solo con `modo_color: "matiz"`: V y S mínimos para que un píxel cuente (la media sube al subir `brillo_min`) |
| `hemisferios` | false | añade `media_norte`, `media_sur` y `dif_hemisferios` a cada rasgo (supone un mapa de +90 a −90) |
| `validos_min` | 0.5 (0.1 con `matiz`) | aviso si la mediana de `validos` queda por debajo |
| `dist_max` | 8.0 | distancia de color (Lab) máxima para aceptar un píxel |
| `mascara_estatica`, `umbral_estatico`, `frac_estatico` | true, 3.0, 0.7 | descartar tierra, costas y logos: un píxel es estático si en el 70 % de los fotogramas queda a ≤ 3 niveles de su mediana |
| `mascara_imagen` | — | máscara a mano (PNG, negro = descartar) |
| `borde_px` | 1 | píxeles descartados alrededor de lo no válido (antialias de costas y texto; 0 con líneas finas) |

## Sonido (06)

| Clave | Por defecto | Para qué |
|---|---|---|
| `referencia` | primer fotograma | valor en el que suena el dron (0 = sin anomalía) |
| `vmin_sonido`, `vmax_sonido` | `vmin`, `vmax` | rango de la media que se reparte entre las notas (GISTEMP: −0,6 a 1,2) |
| `densidad_umbrales` | 50 % y 72 % del rango de sonido | `[u1, u2]`: media bajo u1, 1 nota; hasta u2, 2; por encima, 4 |
| `paneo` | `"x"` | eje del paneo: `"x"` izquierda–derecha del mapa, `"y"` sur–norte. Si el centroide recorre menos del 10 % del mapa, el paneo se reduce |
| `dron_octava` | 0 | octavas extra del dron (0 = una octava bajo la melodía) |
| `rasgo_tono` | `"media"` | rasgo que 06 convierte en nota (p. ej. `"dif_hemisferios"`). Con otro rasgo, `vmin_sonido`/`vmax_sonido` son obligatorios y, con `referencia`, `densidad_umbrales` y `umbral_evento`, van en las unidades de ese rasgo |
| `ligar` | true | misma nota que la anterior: se extiende en vez de volver a atacar |
| `suavizado` | 3 | media móvil centrada de N fotogramas sobre la media (0 o 1 = sin suavizar) |
| `densidad` | true | false = una nota por fotograma |
| `regolpe_ligado`, `regolpe_vel` | 1, 0.7 | una nota ligada se vuelve a tocar cada N fotogramas (0 = nunca), a esa fracción de su velocidad |
| `umbral_evento` | 1/12 del rango de sonido | si la media cruda cambia más que esto entre fotogramas, ataque fuerte (velocidad ≥ 100) aunque la nota no cambie |
| `octava` | 1 | desplaza melodía y dron (+1 = una octava arriba) |
| `humanizar` | true | velocidad ±10 % y tiempo ±10 ms, con semilla fija |
| `instrumento_melodia`, `dron_programa` | 13, 90 | programas GM numerados desde 1 (marimba y pad). El pad 89 se apaga a los ~6 s en FluidR3, por eso el 90 |
| `dron_nivel` | 0.048 | volumen del dron (con FluidSynth queda ~7 dB bajo la marimba) |
| `reverb` | 50 | CC91, 0–127 |

Para oír el mapeo sin adornos: `ligar: false, suavizado: 0, densidad: false, octava: 0, humanizar: false`.
