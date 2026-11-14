# Auditoría 3: segunda pista (SST/ECCO2), modo en vivo y entrega web, tras las rondas 22–26 (2026-11-14)

Estado: **aplicada en la ronda 28** (rama `misael/auditoria3`): hallazgos 1–4 y 12a (parche, ya integrado y sin archivo aparte), 5, 6 y 13. Ronda 29: dron continuo, `regolpe_vel` 0,7 y `exportar_web` (el hallazgo 5 de la ronda 28 no explicaba los silencios: eran el dron GM 89, que decae). El 7 solo cambió la descripción de SST; el 8, 9 (salvo la protección de `preparar_datos.py`), 10, 11 y 14 siguen abiertos.

Pregunta: ¿qué está mal, qué puede fallar con otro video o en otra máquina, y qué choca con el trabajo del equipo
desde la auditoría 2?

Alcance: lo nuevo desde la auditoría 2 (`05` modo matiz, `fechas.py`, `calibrar` horizontal, `config_sst.json`,
`exportar_mapeo.py`, `docs/ESPEC_MODO_EN_VIVO.md`, las pruebas H1–H3 e I1, los archivos de `web/assets/`,
`docs/catalogo_propuesto.json`, README, licencia y versiones), más `06`–`08` vistos con la pista nueva. De `web/`
(es de Juan) solo se anota lo que afecta a las pistas (hallazgos 9 y 11). Estado auditado: `origin/master` en
`0505d9d` (ya incluye los PR #3, #4 y #5).

No se cambió ningún archivo versionado. Esta auditoría son dos archivos nuevos sin commit:
`docs/AUDITORIA_3.md` y el parche de la auditoría (aplicado en la ronda 28).

Cómo se comprobó: cada hallazgo marcado **Confirmado** se reprodujo hoy en una copia de `origin/master` fuera
del repositorio. Las correcciones 1, 2, 3, 4 y 12a se aplicaron en esa copia (el parche de la auditoría (aplicado en la ronda 28), que
`git apply --check` acepta sobre `master`): `evaluar.py` dio 37 PASA, 0 FALLA, y `rasgos.json` de GISTEMP y de
SST salieron idénticos (`cmp`) a los actuales. Entorno: Linux, Python 3.12.3, numpy 2.5.4, opencv 5.0.0,
ffmpeg 6.1.1, FluidSynth 2.3.4.

## Lo que está bien (verificado hoy)

- **Pruebas:** `evaluar.py` sobre `origin/master` limpio: 37 PASA, 0 FALLA en 31 s. I1 comprueba las dos pistas
  reales usando solo archivos versionados (`web/assets/`).
- **Reproducible:** 05 + 06 generan `rasgos.json`, `control.json`, `rocola.mid` y `rocola.wav` idénticos (`cmp`)
  a los de `salidas_gistemp/` y `salidas_sst/`.
- **La señal de SST es real, no un artefacto.** Un estimador independiente (media por celdas fijas de 11,25°,
  solo las 328 celdas que tienen líneas en los 61 fotogramas) da la misma forma que 05: r = 0,886, máximo en
  marzo de 2007 y mínimo en noviembre de 2007. Por hemisferios también es físico: el norte tiene su máximo en
  agosto–septiembre y su mínimo en febrero; el sur, al revés.
- **Exportación del modo en vivo:** `exportar_mapeo` reproduce `control.json` y el `.mid` en las dos pistas. I1
  detecta la corrupción: con los rasgos de GISTEMP pisados (hallazgo 9) da FALLA con 41 discrepancias.
- **Auditoría 2:** los hallazgos 1–10, 12 y 13 siguen corregidos (sus pruebas G4, F5, G5, E5 y F3 pasan). El 11
  sigue pendiente (hallazgo 13 de esta auditoría).

## Resumen

| # | Hallazgo | Tipo | Cambia el audio actual |
|---|---|---|---|
| 1 | `calibrar --modo-color matiz` escribe un config que da resultados falsos | Error con videos nuevos | No |
| 2 | 05 avisa mal en modo matiz: alarma falsa con SST y silencio en los casos malos | Robustez | No |
| 3 | El rango de sonido de `config_sst.json` solo vale para este archivo y estos parámetros | Error con videos nuevos | No |
| 4 | `fechas.py`: fechas con segundos, mes imposible o dos columnas sin ISO | Robustez | No |
| 5 | En lo más alto de la escala el arpegio pierde notas: los años más calientes suenan con menos golpes | **Decisión** | Sí (GISTEMP y SST) |
| 6 | En SST el volumen no se oye: varía 0,8 dB | **Decisión** | Sí (solo SST) |
| 7 | La media de SST sale 2,2 °C alta y con el ciclo exagerado 1,7 veces | **Decisión** | Sí (solo SST) |
| 8 | El PR #6 (`juan/tono-hemisferios`) choca con `master` y con la especificación del modo en vivo | Coordinación | No |
| 9 | `web/preparar_datos.py` pisa la pista de GISTEMP con el audio de otra corrida | Error (web) | No |
| 10 | `salidas/` compartida: una corrida pisa a otra sin aviso | Robustez / proceso | No |
| 11 | Lo que falta para publicar las dos pistas en la web sin textos falsos | Coordinación | No |
| 12 | Documentación y detalles desactualizados | Documentación | No |
| 13 | Pendiente de la auditoría 2: el paneo de GISTEMP lo decide menos del 1 % del mapa | **Decisión** | Sí |
| 14 | En Windows `evaluar.py` da 3 FALLA (dato de Juan, sin reproducir) | Sin confirmar | No |

Orden sugerido: 1–4 (el parche ya probado), 12, 10; después 8 (al fusionar el PR #6) y los avisos 9 y 11 para
Juan. Los hallazgos 5, 6, 7 y 13 esperan una decisión de Misael; 14 necesita la máquina de Juan.

---

## 1. `calibrar --modo-color matiz` escribe un config que da resultados falsos — Error con videos nuevos

**Dónde:** `herramientas/calibrar.py:209`, `:234-239`, `:249-258`, `:262`.

**Escenario (Confirmado):** `config_sst.json` funciona porque lleva a mano `borde_px: 0`,
`mascara_estatica: false` y `dist_max: 4`. `calibrar` no escribe ninguna de las tres:
- Config nuevo con `--modo-color matiz` → 05 da `validos` 0,067 y media 25,2 °C (con `config_sst.json`: 0,26 y
  21,97 °C). El borde de 1 píxel por defecto borra las líneas finas.
- Calibrar primero en Lab y después con `--modo-color matiz` sobre el mismo archivo: se conserva `dist_max: 20`
  (distancia Lab) y 05 lo lee como 20 unidades de matiz (40°). El mensaje final dice "dist_max=20".
- Al revés (config matiz, se vuelve a calibrar sin la opción): queda `modo_color: "matiz"` con `dist_max: 20`.

**Corrección (en el parche de la auditoría (aplicado en la ronda 28)):** el modo efectivo es el de `--modo-color` o, si no se pasa, el del
config que ya exista. En modo matiz se escriben `dist_max: 4.0`, `borde_px: 0` y `mascara_estatica: false`
(si el config ya era matiz se respetan los suyos). Al volver a Lab no se heredan `modo_color`, `borde_px`,
`mascara_estatica`, `brillo_min` ni `saturacion_min`. El mensaje final imprime el `dist_max` que se guardó.

**Verificación (hecha en la copia):** GISTEMP → config y `calibracion.png` idénticos a los de hoy. SST desde
cero → 05 da media 21,478–22,443, igual que `config_sst.json`. Secuencia Lab → matiz → sin opción → Lab:
`dist_max` 20 → 4 → 4 → 20 y `modo_color` ausente → matiz → matiz → lab. Prueba nueva **H4** en `evaluar.py`:
con `video_matiz()` y una barra PNG del mismo matiz, `calibrar --mapa … --modo-color matiz` escribe las tres
claves; repetido tras una calibración en Lab, `dist_max` es 4 y no el de Lab.

## 2. 05 avisa mal en modo matiz — Robustez

**Dónde:** `05_video_a_rasgos.py:311-314` (aviso de `validos`), `:133-135` (tabla de matiz).

**Escenario (Confirmado):**
- Con `config_sst.json` (el caso bueno) sale siempre "AVISO: la mediana de 'validos' es 0.26 (< 0,5): casi ningún
  píxel del mapa coincide con la barra". Es una alarma falsa: en este video solo las líneas brillantes son dato.
- El mensaje manda a mirar `salidas/fotograma_ref.png` aunque `ROCOLA_SALIDAS` sea otra carpeta.
- GISTEMP en modo matiz no avisa de nada, y el 9 % de su barra (54 de 602 filas, el blanco del centro) tiene
  saturación menor que `saturacion_min`: los valores cerca de 0 °C no se pueden leer (media mínima −0,757 frente
  a −0,609 en Lab).

**Corrección (en el parche):** umbral del aviso = `validos_min` del config; por defecto 0,1 en matiz y 0,5 en
Lab. El mensaje usa `sal('fotograma_ref.png')` y en matiz añade "revisa borde_px, brillo_min y saturacion_min".
Aviso nuevo al leer la barra en matiz si más del 2 % tiene saturación o brillo por debajo de los mínimos.
Documentar `validos_min` en la cabecera de 05 y en la tabla del README.

**Verificación (hecha en la copia):** `config_sst.json` → 0 avisos y `rasgos.json` idéntico; el config del
hallazgo 1 sin corregir (validos 0,067) sigue avisando; GISTEMP en matiz → "el 9% de la barra…"; GISTEMP en Lab
→ 0 avisos y `rasgos.json` idéntico.

## 3. El rango de sonido de `config_sst.json` solo vale para este archivo — Error con videos nuevos

**Dónde:** `config/config_sst.json:30-32` (`referencia`, `vmin_sonido`, `vmax_sonido`); falta un aviso en
`05_video_a_rasgos.py` (junto a `:311`).

**Escenario (Confirmado):** el rango de sonido mide 0,98 °C y la media depende de parámetros que no parecen
musicales. Solo con cambiar `escala`:

| `escala` | media | fotogramas fuera de 21,47–22,45 | melodía |
|---|---|---|---|
| 0,5 (actual) | 21,48–22,44 | 0 de 61 | usa la escala |
| 0,25 | 21,96–23,00 | 39 de 61 | 41 fotogramas pegados a la nota más alta (96) |
| 1,0 | 21,14–22,01 | 19 de 61 | 21 fotogramas pegados a la más baja (60) |

`brillo_min` mueve la media aún más (30 / 60 / 100 → 20,6 / 22,0 / 23,6 °C). Juan lo encontró con otra copia del
mismo SVS 3912 (PR #6): 44 de 63 fotogramas en la nota más alta. Ni 05 ni 06 avisan.

**Corrección (en el parche):** al final de 05, si el config trae `vmin_sonido` y `vmax_sonido` y más del 20 % de
las medias cae fuera, imprimir un AVISO con las cifras. En el parche la condición lleva `not cfg.get("rasgo_tono")`
para convivir con el PR #6; cuando se fusione, comprobar el rasgo que indique `rasgo_tono` (ver hallazgo 8).

**Verificación (hecha en la copia):** `escala` 0,25 → "AVISO: 39 de 61 fotogramas tienen la media fuera de
vmin_sonido..vmax_sonido"; `config_sst.json` y `config_eic.json` → sin aviso. Prueba nueva **H5**: `video_matiz()`
con `vmin_sonido: 40, vmax_sonido: 50` → AVISO en la salida; con 0 y 32 → sin AVISO.

## 4. `fechas.py`: formatos de fecha no previstos — Robustez

**Dónde:** `fechas.py:16` (`_ISO`), `:26` (segunda columna), `:38-39` (`raise`).

**Escenario (Confirmado):**
- `2007-03-25T12:00:00Z` (con segundos) no casa: el video mostraría ese texto crudo en vez de "mar 2007".
  Tampoco casa `2007-3-25T12:00Z`.
- `2007-13-01T00:00Z` lanza `ValueError` y 05 termina con una traza.
- Un archivo de dos columnas sin fecha ISO (`1881 enero`) devuelve "enero".

**Corrección (en el parche):** `_ISO` acepta mes, día y hora de 1 o 2 cifras, segundos opcionales y zona
(`Z` o `+00:00`). Un mes imposible devuelve el texto tal cual, sin excepción. `leer_fechas` usa la segunda columna
solo si es una fecha ISO; si no, la primera.

**Verificación (hecha en la copia):** los tres formatos dan "mar 2007" con `"mes"` y 2007 por defecto; mes 13 →
texto crudo sin traza; `1881 enero` → "1881"; `time.txt` igual que antes. Ampliar **H3** con esos cuatro casos.

## 5. En lo más alto de la escala el arpegio pierde notas — Decisión de Misael

**Dónde:** `06_rasgos_a_audio.py:153`. La misma fórmula está en `herramientas/exportar_mapeo.py:163`,
`evaluar.py:431` (`esperados_e2`) y `docs/ESPEC_MODO_EN_VIVO.md` §2.5.

**Escenario (Confirmado):** con densidad 4, el arpegio sube por la escala desde la nota base; si no hay sitio,
repite la nota más alta (`min(base + j, 15)`) y el ligado funde las repetidas. Resultado: cuanto más caliente,
menos golpes. En GISTEMP es el final de la demo:

| fotograma (año) | notas | golpes que suenan |
|---|---|---|
| 54–55 (2016, 2018) | 88, 91, 93, 96 | 4 |
| 56–57 (2021, 2023) | 91, 93, 96, 96 | 3 |
| 58–59 (2023) | 93, 96, 96, 96 | 2 |

En SST pasa en 5 de los 14 fotogramas de 4 notas, incluidos los 4 primeros (marzo de 2007, el máximo).

**Opciones:**
- **A. Dejarlo.** No cambia nada.
- **B. Si no hay sitio hacia arriba, el arpegio baja desde la nota base** (la primera nota sigue siendo la base,
  que es la que mide 07):
  ```python
  paso_arp = 1 if base + k <= len(notas) else -1
  arp = [int(notas[base + paso_arp * j]) for j in range(k)]
  ```
  Probado en la copia: GISTEMP pasa de 69 a 75 ataques y los 6 últimos fotogramas suenan con 4 golpes; SST de
  110 a 117; 07 sigue en PASA (2,6 y 2,8 cents). `evaluar.py` da 2 FALLA (E2 e I1) hasta que se actualice la
  misma fórmula en los tres sitios de "Dónde".

Recomendación: B. Cambia el audio de las dos pistas: después hay que regenerar `salidas_*`, los `_mapeo.json` y
`_esperado.json` y los dos MP4 de `web/assets/` (ver "Cadena de regeneración"). No ejecutar sin decisión.

## 6. En SST el volumen no se oye — Decisión de Misael

**Dónde:** `06_rasgos_a_audio.py:116` (y `:296` en el respaldo numpy); `herramientas/exportar_mapeo.py:168-169`;
ESPEC §2.3.

**Escenario (Confirmado):** el volumen es `−6 + 6·area/area_max` dB. En SST `area` va de 0,428 a 0,494, así que
el volumen recorre de −0,8 a 0 dB: no se percibe. La descripción propuesta para la web dice "el volumen sube
cuando una parte mayor del océano supera los 25 °C", algo que no se puede oír. En la rama `datos-oficiales`, Juan
resolvió lo mismo con un mínimo y un máximo de volumen en el config.

**Opciones:**
- **A. Dejarlo** y quitar la frase del volumen de la descripción de SST.
- **B. Normalizar entre el mínimo y el máximo de la pista:**
  `np.clip((area - area.min()) / max(area.max() - area.min(), 1e-6), 0, 1)`.
  Probado en la copia: `rocola.mid` de GISTEMP **idéntico** (su `area` mínima es 0), `evaluar.py` 37 PASA, y SST
  recorre los 6 dB (velocidades 30–127 en vez de 49–127). Hay que añadir `area_min` al `_mapeo.json` y cambiar la
  fórmula de ganancia en `exportar_mapeo.py` y en la ESPEC.

Recomendación: B. Solo cambia el audio de SST (regenerar su cadena). No ejecutar sin decisión.

## 7. La media de SST sale 2,2 °C alta y con el ciclo exagerado — Decisión de Misael

**Dónde:** `05_video_a_rasgos.py` (`media_campo`), `config/config_sst.json`.

**Escenario (Confirmado):** 05 promedia juntos todos los píxeles válidos, y hay más líneas brillantes en las
zonas cálidas (la mitad de los trópicos es válida frente al 5 % de las zonas polares). Comparado con la media
por celdas fijas (ver "Lo que está bien"):

| | mínimo | máximo | promedio | recorrido |
|---|---|---|---|---|
| 05 actual | 21,48 | 22,44 | 21,97 | 0,96 |
| celdas fijas | 19,49 | 20,06 | 19,75 | 0,57 |

La forma es la misma (r = 0,886), así que la melodía cuenta bien las estaciones; lo que no vale es el número.
Además el recorrido es pequeño frente al ruido entre fotogramas (0,07 °C de salto típico), y por eso hizo falta
`umbral_evento: 0.15` a mano.

**Opciones:**
- **A. Dejarlo** como índice relativo (ya lo dicen el README y la descripción propuesta).
- **B. Tono por diferencia entre hemisferios** (PR #6 de Juan: `"hemisferios": true`,
  `"rasgo_tono": "dif_hemisferios"`). La diferencia norte − sur recorre 6,4 °C con un ruido relativo cuatro veces
  menor (datos de Juan). Medido hoy con nuestro archivo: norte 22,99–26,36 °C, sur 17,88–21,58 °C. Cambia lo que
  significa el tono: ya no es "temperatura media" sino "cuánto más caliente está el norte que el sur".
- **C. Media por celdas** como clave opcional de 05: acerca el valor al real (19,75 °C), pero el recorrido baja a
  0,57 °C y el ruido pesa más.

Recomendación: decidir entre A y B junto con el PR #6; C no mejora el sonido. No ejecutar sin decisión.

## 8. El PR #6 (`juan/tono-hemisferios`) choca con `master` y con la especificación — Coordinación

**Dónde:** PR #6 abierto, rama basada en `575023f` (antes de los PR #4 y #5). Toca `05_video_a_rasgos.py`,
`06_rasgos_a_audio.py` y `docs/CAMBIOS.txt`.

**Escenario (Confirmado con `git merge-tree`):**
- Conflicto de contenido en `docs/CAMBIOS.txt`: hay dos "RONDA 26" (la de Juan y la del modo en vivo). 05 y 06
  se fusionan solos.
- 06 gana 14 líneas a partir de la 98, así que todas las citas `06:línea` de `docs/ESPEC_MODO_EN_VIVO.md` y los
  comentarios `# 06:NN` de `exportar_mapeo.py` quedan corridos.
- `exportar_mapeo.py` y la ESPEC leen siempre `media`. Si se activa `rasgo_tono` en `config_sst.json`,
  `exportar_mapeo` aborta ("el mapeo NO reproduce el resultado de 06") y los archivos de `web/assets/` quedan
  viejos. Sin activar la clave, nada cambia (lo comprobó Juan con `cmp`).
- `evaluar.py` no tiene ninguna prueba de `hemisferios` ni de `rasgo_tono`.

**Corrección (al fusionar el PR #6, no antes):**
1. Resolver `docs/CAMBIOS.txt` dejando las dos rondas y renumerando la de Juan como RONDA 27.
2. `exportar_mapeo.py`: `campo_tono = doc.get("rasgo_tono") or "media"`; leer ese campo en `construir_mapeo` y
   `aplicar_mapeo`; el relleno es `(vmin_sonido + vmax_sonido) / 2` si no es `media`; guardarlo en el mapeo como
   `"tono": {"campo": …}`. ESPEC §2.1: "el rasgo del tono viene en `mapeo.tono.campo`".
3. Volver a numerar las citas `06:NN` de la ESPEC y de `exportar_mapeo.py`.
4. Prueba nueva: un cuarto caso en I1 con `hemisferios` simulado (`dif_hemisferios` en los rasgos,
   `rasgo_tono`, `vmin_sonido`/`vmax_sonido` en sus unidades) → el mapeo reproduce `control.json`.
5. El aviso del hallazgo 3 debe mirar el rasgo de `rasgo_tono`.

## 9. `web/preparar_datos.py` pisa la pista de GISTEMP con el audio de otra corrida — Error (web, para Juan)

**Dónde:** `web/preparar_datos.py:32-34`, `:101-117`, `:142-149`.

**Escenario (Confirmado en la copia):** el script solo mira que existan `salidas/rocola.wav` y el video de
GISTEMP. Con `salidas/` ocupada por el ejemplo sintético (pasó hoy):
- `web/assets/gistemp_1880_2023.mp4` se reemplaza por el video de GISTEMP con el audio sintético (20 s, 1280×640);
- `web/assets/gistemp_1880_2023_rasgos.json` pasa a tener 40 registros sintéticos, sin fechas, con `fuente` de GISTEMP;
- añade al catálogo la entrada `gistemp-1880-2023` con la descripción antigua.

Aun con `salidas/` correcta, reemplaza el MP4 de 1024×512 por otro de 1280 px y añade esa entrada antigua.

**Corrección (para Juan; no tocar `web/` sin acordarlo):** en `preparar_real()`, salir con mensaje si
`os.path.basename(rasgos["fuente"])` no es el video de GISTEMP o si `len(rasgos) * 0.5` difiere de la duración
del WAV en más de 0,6 s. Leer de `salidas_gistemp/` (o de `ROCOLA_SALIDAS`) en vez de `salidas/`. No añadir la
entrada si el catálogo ya trae ese `id`, y decidir cuál de las dos descripciones queda.

**Verificación:** `salidas/` sintética → mensaje y `web/assets/` intacto. Mientras tanto protege I1: tras el
pisado da FALLA ("40 fotogramas frente a 60").

## 10. `salidas/` compartida: una corrida pisa a otra sin aviso — Robustez / proceso

**Dónde:** `rutas.py:15`; `README.md:71-88`; `08_video_con_audio.py:106-108`.

**Escenario (Confirmado, pasó dos veces hoy):** GISTEMP, SST y el ejemplo sintético escriben por defecto en
`salidas/` con los mismos nombres. Una corrida del sintético dejó `salidas/rocola.wav` de 20 s junto a
`demo_gistemp.mp4`; de ahí salió una versión web de GISTEMP con el audio equivocado, que hubo que rehacer.
08 une cualquier video con cualquier WAV: si `rasgos.json` es de otro video solo dice "sin texto superpuesto".

**Corrección:**
- README: sección "Una carpeta por pista" con los comandos completos de cada una
  (`ROCOLA_SALIDAS=salidas_gistemp …config_eic.json`, `ROCOLA_SALIDAS=salidas_sst …config_sst.json`) y la
  advertencia de que `salidas/` es solo para el ejemplo sintético.
- 08: cuando `rasgos.json` es de otro video, o cuando `len(rasgos) * 0.5` difiere de la duración del WAV en más
  de 0,6 s, imprimir "AVISO: … ¿el WAV es de este video?". No debe ser error: `web/preparar_datos.py` usa a
  propósito un video con otro nombre para obtener el MP4 sin texto.

**Verificación:** D1 y F4 siguen en PASA; 08 con el video de GISTEMP y `salidas/` sintética → AVISO.

## 11. Lo que falta para publicar las dos pistas en la web sin textos falsos — Coordinación (Juan)

Las pistas están en `web/assets/`, pero `web/catalogo.json` solo lista el ejemplo. Antes de pegar las entradas de
`docs/catalogo_propuesto.json`:

- `web/describir.js:16` escribe "Año " delante de la fecha: con SST diría "Año mar 2007." Poner "Año" solo si la
  fecha es un número.
- `web/describir.js:37-50`: "La zona caliente cubre el 45 % del mapa". En SST ese número es la parte de las líneas
  válidas (26 % del mapa) que pasa de 25 °C. Además dice "a la izquierda / derecha del mapa" con `centroide_x`,
  y las dos pistas panean por latitud (pendiente desde la auditoría 2, hallazgo 14).
- `web/index.html:147-150`: la tabla fija "Qué estás escuchando" dice "Izquierda / derecha en el estéreo" para
  "Dónde está lo caliente"; en las dos pistas es sur / norte.
- `web/index.html:158-161`: los créditos solo citan SVS 5207. Falta SVS 3912 (ECCO2); copiar el crédito exacto de
  su página.
- `docs/catalogo_propuesto.json:6`: dice "60 años muestreados"; son 60 momentos y 58 años distintos (2023 sale
  tres veces). Línea 15: la frase del volumen de SST depende del hallazgo 6.
- El `audio.js` del modo en vivo no está en ninguna rama remota: la tabla de diferencias de la ESPEC (§5) se
  escribió con la descripción de palabra y hay que contrastarla cuando llegue.
- El PR #2 (`web`) sigue abierto y va 12 commits por detrás de `master`.

## 12. Documentación y detalles desactualizados — Documentación

- **12a (en el parche).** `herramientas/exportar_mapeo.py:118` guarda en `_mapeo.json` la ruta local
  (`"fuente": "datos/ecco2_sst_flow.mp4"`); `preparar_datos.py` sí la quita. Usar `os.path.basename` y regenerar
  los dos `_mapeo.json` (solo cambia ese campo; `_esperado.json` no cambia: comprobado).
- `README.md:71-88`: solo explica GISTEMP. Falta "Segundo video (SVS 3912)": qué archivos van en `datos/`, el
  comando de `calibrar` con `--mapa 0,0,2048,1024 --modo-color matiz --umbral 25 --fps-muestreo 0.9`, y qué claves
  se ponen a mano (`fechas_formato`, `referencia`, `vmin_sonido`, `vmax_sonido`, `umbral_evento`, `paneo`).
- `README.md:150`: dice "unos °C más alta que la real"; ya hay número: 2,2 °C y recorrido 1,7 veces mayor (hallazgo 7).
- README: no menciona `LICENSE` (MIT) ni `salidas_gistemp/`; `README.md:5` dice que el prototipo se probó solo con SVS 5207.
- README, tabla de configuración: una barra horizontal siempre se lee con el mínimo a la izquierda
  (`barra_arriba_es_max` solo existe para la vertical). Añadir `validos_min` (hallazgo 2).
- `evaluar.py:7-8`: "Los grupos B-D ejecutan los scripts reales…"; hoy son B–I.
- `docs/ESPEC_MODO_EN_VIVO.md` y `herramientas/exportar_mapeo.py` repiten constantes de 06 (`DEFECTOS`,
  `SEG_POR_FOTOGRAMA`, la escala). I1 lo vigila; anotarlo en la cabecera de 06 para quien cambie un valor.
- `requirements.txt` fija versiones exactas, pero el README no dice la versión de Python (3.12).

## 13. Pendiente de la auditoría 2: el paneo de GISTEMP lo decide menos del 1 % del mapa — Decisión de Misael

Sin cambios desde el hallazgo 11 de `docs/AUDITORIA_2.md`. Medido hoy sobre los archivos de la web: en 16 de 60
fotogramas la zona sobre 1 °C es menos del 1 % del mapa, y en 7 de ellos el paneo supera 0,7 en valor absoluto
(por ejemplo 1916: área 0,07 % y pan −1,0). Las opciones A y B de entonces siguen valiendo. Si se
elige B (atenuar el paneo con el área), hay que cambiar también la fórmula de `exportar_mapeo.py` y la ESPEC §2.4.

## 14. En Windows `evaluar.py` da 3 FALLA — Sin confirmar (dato de Juan)

**Escenario (anotado por Juan en el PR #6, no reproducido aquí):** en Windows 11 con ffmpeg 9, `evaluar.py` da
33 PASA y 3 FALLA (C2, C3 y D1), igual con y sin sus cambios. D1: el video empieza 0,200 s después del audio y el
límite es 0,15 s. De C2 y C3 no hay detalle. En Linux con ffmpeg 6.1.1 las tres pasan.

**Qué hacer:** pedir a Juan la salida completa de `python evaluar.py` y la versión de `opencv-python-headless`.
Para D1, medir el desfase con ffmpeg ≥ 7 antes de tocar el límite. No cambiar umbrales sin esos datos.

---

## Cadena de regeneración (si se aprueba 5, 6, 7 o 13)

Cualquier cambio que altere notas, volumen o paneo obliga a rehacer, en este orden:
1. `ROCOLA_SALIDAS=salidas_gistemp` y `ROCOLA_SALIDAS=salidas_sst`: 05 → 06 → 07 → 08.
2. `python -m herramientas.exportar_mapeo` (aborta si sus fórmulas no reproducen `control.json`; hay que
   actualizarlas a la vez que 06).
3. Los dos MP4 de la web (1024×512, libx264 CRF 28, AAC 128 k, desde el video original sin texto) y sus
   `_rasgos.json` con `t_video`.
4. `docs/ESPEC_MODO_EN_VIVO.md` (fórmula y valores por pista) y `python evaluar.py`.

## Plan de ejecución (para quien aplique los cambios)

1. `git checkout master && git pull`; rama nueva. No tocar `salidas/` ni `web/` (salvo regenerar los dos
   `_mapeo.json`).
2. Guardar la referencia antes de tocar nada, en carpetas temporales:
   `ROCOLA_SALIDAS=<tmp>/g ROCOLA_SIN_AUDIO=1 python 05_video_a_rasgos.py config/config_eic.json` y lo mismo con
   `config/config_sst.json` en `<tmp>/s`.
3. `git apply docs/AUDITORIA_3.patch` (hallazgos 1, 2, 3, 4 y 12a). Si el PR #6 ya está fusionado y el parche
   no entra limpio en 05, aplicar a mano los dos bloques de 05 que describe el hallazgo 2 y el 3.
4. Añadir las pruebas H4 y H5 y ampliar H3. Comprobar que cada prueba nueva FALLA con el código anterior y PASA
   con el nuevo.
5. `python evaluar.py` sin FALLA; `cmp` de `rasgos.json` de GISTEMP y de SST contra la referencia del paso 2:
   deben ser idénticos (ningún hallazgo de 1–4 cambia rasgos ni audio).
6. `python -m herramientas.exportar_mapeo` y comprobar que en los `_mapeo.json` solo cambia `fuente`.
7. Hallazgos 10 y 12 (README, 08, cabecera de `evaluar.py`).
8. Hallazgo 8 solo cuando se fusione el PR #6. Hallazgos 9 y 11: avisar a Juan, no tocar `web/`.
9. Los hallazgos 5, 6, 7 y 13 no se tocan sin decisión de Misael; el 14, sin los datos de Juan.
10. Bloque "RONDA N" en `docs/CAMBIOS.txt` con los números antes/después.
