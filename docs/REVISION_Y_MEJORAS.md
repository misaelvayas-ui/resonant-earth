# Revisión y mejoras — Rocola de la Tierra / Resonant Earth

Fecha: 15-nov-2026. Estado revisado: `master` en `a94ebeb` (ronda 36), más las ramas remotas sin fusionar.
Máquina de la revisión: Mac Intel, macOS, Python 3.13.4, ffmpeg 8.0.1 (Homebrew), Node 24, sin FluidSynth.
No se cambió ningún archivo del proyecto. Todo lo generado quedó fuera del repo, salvo `datos/` (3 archivos de la NASA, ignorados por git).

> **Estado al cierre del 15-nov-2026 (rama `mejoras/ronda-38`, sin push):** hechas M1 (parcial: falta el quinto nombre y los aportes), M2, M3, M4, M5, M6, M7, M8,
> D1 (fusionado; falta la prueba manual en Safari, iPhone y Firefox), D3, D8, P5 (CI escrito, sin ejecutar en GitHub) y los hallazgos H10, H13, H14, H15.
> Pendientes: D2, D4, D5, D6, D7, P1–P4, P6–P10, H12 (decisión), H16 (CSP), H17 y **publicar la web**. Detalle en la RONDA 38 de `docs/CAMBIOS.txt`.
> El resto de este documento es la revisión original, hecha sobre `master` antes de esos cambios.

---

## 1. Resumen para el usuario

- **El proyecto está bien y la ciencia aguanta.** Repetí la medición clave desde cero con los datos de la NASA: la música sigue la curva oficial de temperatura con 0,99 de parecido, igual que dice el README.
- **La web funciona y es accesible** (nota 100 en accesibilidad). En un teléfono lento tarda en arrancar.
- **Lo más urgente (1): la web publicada está vieja** y muestra a todo el mundo "Nombre Apellido 4", "Nombre Apellido 5" y "Aporte al proyecto (editar)". Hay que completar el equipo y volver a publicar.
- **Lo más urgente (2): en Mac la parte de video no funciona** tal como está (ya se sabía), y encontré un fallo más: el paso que une video y audio también falla en Mac. Si la demo sale de una Mac, hay que arreglarlo o usar otra máquina.
- **Lo más valioso (3): ya existe un "modo en vivo" terminado en una rama aparte** (`misael/en-vivo`), con interruptores para oír cada capa por separado. Es la mejor demo posible y hoy no está en la web.
- **Lo que necesito de ti:** los 2 nombres que faltan y qué hizo cada persona; decidir si el modo en vivo y la guía por voz entran antes de la entrega; y decidir si hace falta versión en inglés.
- **No pude:** oír el audio (soy un programa: lo medí), probar con un lector de pantalla real, ni en un teléfono real. Eso lo tiene que hacer una persona.

---

## 2. Lo que se probó y lo que se midió

| Qué se probó | Resultado |
|---|---|
| `python evaluar.py` tal cual | Termina con error y **sin tabla** (fallos ya conocidos 1 y 2 de `PROMPT_SIGUIENTE_AGENTE.md`). 50 s. |
| Pipeline 04→08 tal cual | 04 dice que creó el video pero no lo crea; 05–08 fallan en cadena (conocido). |
| Lo mismo, forzando otro códec de video desde fuera del repo (`avc1` en vez de `mp4v`) | 04→07 funcionan; 07 da 5 PASA. **08 falla: "No such filter: 'drawtext'"** (nuevo). |
| `evaluar.py` con ese mismo arreglo temporal | **41 PASA, 3 FALLA, 1 OMITIDA** en 118 s. Fallan C1 (error 0,0130 frente a 0,01: el códec con pérdida), D1 y F4 (las dos por `drawtext`). K1 omitida (sin FluidSynth). |
| Camino real GISTEMP: descarga de SVS 5207 (120 MB, 47 s) → 05 → 06 → 07 | 05 tarda 26,5 s y da 60 fotogramas; 06 da 89 golpes y cruce de la referencia en 1976; 07 PASA (error máx. 8,5 cents). 08 falla por `drawtext`. |
| Rasgos de hoy frente a los de `web/assets` | Diferencia máxima de la media: 0,005 °C. Es la misma pista. |
| Correlación con la tabla oficial GISTEMP v4 (`GLB.Ts+dSST.csv`, columna J-D, descargada hoy) | **r = 0,9918** con 58 años. Sesgo −0,09 °C. Pendiente 1980–2023: 0,196 (video) frente a 0,183 °C/década (oficial). Año más frío: 1911 en los dos. |
| Web en escritorio (1440 px) y móvil (375–390 px) | Carga sin errores de consola. Las dos pistas cargan y avanzan; la lectura en vivo cambia. Sin desborde horizontal. |
| `web/pruebas/verificar.cjs` (Playwright con Chromium 159 sin pantalla + axe, con webm) | Tal cual: **se corta** en una captura de pantalla (línea 184) y no llega a V2 ni a V14–V23. Con una copia que tolera esa captura: **22 PASA, 1 FALLA (V11)**. axe: 0 violaciones. |
| Lighthouse (local, Chrome sin tarjeta gráfica) | Móvil: rendimiento **41**, accesibilidad 100, buenas prácticas 100, SEO 100. Escritorio: rendimiento **72**, resto 100. Peso inicial 1.371 KiB. |
| Peso y sonido de los videos de la web | GISTEMP 4,2 MB (−16,6 LUFS); mar **10,1 MB** (−15,9 LUFS). Volumen parejo entre pistas. |
| Web publicada (`misaelvayas-ui.github.io/rocola_practica`) | Responde, pero es de antes de la ronda 35 (última modificación 14-nov 22:23 GMT). |
| Búsqueda de claves secretas en todas las ramas | Ninguna encontrada (patrones de clave de Google y `sk-`). |

No se pudo medir: escucha humana, lector de pantalla real, teléfono real, FluidSynth (timbre real), el camino real del mar (no descargué SVS 3912), Windows y Linux, y Lighthouse en un equipo con tarjeta gráfica (las cifras de rendimiento de arriba salen peores de lo real porque el 3D se dibujó por software).

---

## 3. Hallazgos

Los fallos 1–6 de `PROMPT_SIGUIENTE_AGENTE.md` siguen vigentes y no se repiten aquí (video en Mac, `evaluar.py` sin tabla, FluidSynth, pruebas web sin `package.json`, CI, `equipo.json`, `.gitignore`). Esto es lo nuevo.

| # | Gravedad | Hallazgo | Evidencia | Impacto |
|---|---|---|---|---|
| H1 | **Crítico** | La web publicada es antigua y muestra texto de relleno | La página pública dice "desde 1880" y "a lo largo de un año" (la local: 1881, 344 días); su `equipo.json` público trae "Nombre Apellido 4/5" y 5 × "Aporte al proyecto (editar)" | Es lo primero que abre el jurado. Parece inacabado. |
| H2 | **Alto** | 08 (video + audio) falla en Mac con el ffmpeg de Homebrew | `08_video_con_audio.py:123` usa el filtro `drawtext`; ffmpeg 8.0.1 de Homebrew no lo trae ("No such filter"). Tumba también D1 y F4 | En Mac no se puede generar el video de la demo ni regenerar los de la web. |
| H3 | **Alto** | El modo en vivo ya está hecho y no está en `master` | `origin/misael/en-vivo`: 23 commits por delante, 0 por detrás, sin PR. Añade `web/js/vivo.js`, `mapeo.js`, selector "Pista original / Sonido en vivo" y casillas melodía/volumen/paneo/dron; su ronda 37 declara 46 pruebas PASA y V1–V28 | Es la demo más convincente ("apago el paneo, ¿lo oyes?"). Riesgo: falta probar Safari, iOS y Firefox (lo dice la propia rama). |
| H4 | **Alto** | Las pruebas de la web se cortan a mitad | `verificar.cjs:184`: si falla una captura de página completa, el programa termina y no informa V2 ni V14–V23 | Un "no se pudo capturar" esconde 11 comprobaciones. Mismo defecto que el fallo 2 conocido de `evaluar.py`. |
| H5 | Medio | La portada da cifras propias como si fueran las oficiales | Tarjeta del héroe y resumen del gráfico (`pistas.json`): "De −0,24 °C en 1881 a +1,06 °C en 2023". La tabla oficial da −0,09 y +1,17. Solo "El porqué" aclara "en nuestra medición" | Un jurado científico puede notarlo. Se arregla con tres palabras o citando las dos cifras. |
| H6 | Medio | La correlación 0,99 no se puede reproducir con el repo | No hay ningún script que la calcule (búsqueda de `GLB`, `corrcoef`); solo está escrita en `docs/CAMBIOS.txt:416-418`. La web ni la menciona | Es el mejor argumento de validez científica y hoy es "créanme". |
| H7 | Medio | La web baja el video entero antes de sonar | `web/js/audio.js:52-66` (fetch completo → blob). La pista del mar pesa 10,1 MB: unos 8 s a 10 Mbps y unos 50 s a 1,6 Mbps (cálculo: tamaño ÷ velocidad) | En la demo con wifi del evento, el clic en "mar" puede quedarse esperando. |
| H8 | Medio | Arranque pesado en equipos lentos | Lighthouse móvil: 7,9 s de bloqueo del hilo principal, 16,6 s hasta ser interactiva; escritorio 1,0 s. `three.module.min.js` pesa 671 KB (409 KiB sin usar según Lighthouse). Cifras infladas por dibujar sin tarjeta gráfica: falta medir en un teléfono | Posible lentitud en teléfonos de gama baja. |
| H9 | Medio | Créditos de la NASA incompletos | Pie de `index.html`: "…SVS 3912 y Earth Information Center". Las páginas de SVS piden: 5207 → "NASA's Scientific Visualization Studio. Data provided by Robert B. Schmunk (NASA/GSFC GISS)"; 3912 → "NASA/Goddard Space Flight Center Scientific Visualization Studio" | Space Apps valora el uso correcto de datos de la NASA. |
| H10 | Medio | Añadir una tercera pista rompe la web | `web/js/datos.js:24` exige exactamente 2 pistas (`lista.length !== 2`) | Bloquea la idea más natural de crecimiento (hielo, CO₂…). |
| H11 | Medio | No hay vista previa al compartir ni versión en inglés | `index.html` sin etiquetas Open Graph/Twitter; `lang="es"` único. La rama `juan/guia-voz-ia-v2` sí trae guía en español e inglés | El enlace pegado en un chat sale sin imagen. La fase global de Space Apps se juzga en inglés. |
| H12 | Medio | El paneo de GISTEMP casi no cuenta nada | Medido en `_esperado.json`: |pan| > 0,5 en 16 de 60 fotogramas; en 07 de hoy la correlación del balance es r = −0,05. Es el hallazgo 13 de la auditoría 3, aún sin decisión | La portada promete "A la izquierda si el calor está al sur": en esta pista apenas se oye. |
| H13 | Bajo | V11 depende de la velocidad del equipo | `web/js/audio.js:152` baja el nivel ×0,9 por cuadro, no por tiempo; con pocos cuadros por segundo no llega a 0,02 en 2,5 s | Falso FALLA en máquinas lentas o CI. |
| H14 | Bajo | Controles pequeños en móvil | A 375 px: casilla "Anunciar…" 13×13 px; barras de volumen y avance de 16 px de alto (WCAG 2.2 pide 24 px) | Difícil de tocar con el dedo. axe no lo detecta. |
| H15 | Bajo | Config con tipo equivocado da una traza | `"fps_muestreo": "4"` → `TypeError` en `05_video_a_rasgos.py:197` | Confunde a quien añada un video nuevo. |
| H16 | Bajo | Sin política de seguridad de contenido (CSP) | `index.html` no la trae. El resto está bien: solo un `innerHTML` y es un texto fijo (`lectura.js:71`); los datos se escriben con `textContent`; permisos del workflow mínimos | Riesgo real bajo (web estática sin formularios). |
| H17 | Bajo | Historial pesado y ramas dispersas | En el historial hay 4 copias del video del mar (9,6 MB c/u), un WAV de 11,6 MB y capturas; 17 ramas remotas, varias 60+ commits atrasadas | Clonar es lento; confunde qué es lo vigente. |
| H18 | Bajo | "45 pruebas comprueban que el audio sigue a los datos" | Las 45 cubren también fechas, calibración y exportación; con `misael/en-vivo` serán 46 | Frase algo generosa y número que se desactualiza. |
| H19 | Bajo | El README promete "~50 s" para `evaluar.py` | Aquí, cuando funciona, tarda 118 s | Expectativa equivocada. |

Lo que está bien y conviene decirle al jurado: accesibilidad 100 y axe sin violaciones; cero errores de consola; todo el texto de datos entra con `textContent`; licencias de fuentes, texturas y librerías documentadas; la web no pide los videos hasta que el usuario interactúa; honestidad sobre el índice relativo del mar, ya visible en la web.

---

## 4. Mejoras priorizadas

Valor de 1 a 5. Las horas son estimaciones mías, no mediciones.

### Antes de la entrega

| # | Idea | Valor | Horas | Riesgo | Quién |
|---|---|---|---|---|---|
| M1 | Completar `equipo.json` (nombres y aportes reales) y volver a publicar la web (H1) | 5 | 0,5 | Bajo | Persona (datos) + dueño del repo (publicar) |
| M2 | Arreglar video en Mac: códec de 04 y texto de 08 sin `drawtext` (H2 + fallo conocido 1) | 5 | 3–4 | Medio | Agente |
| M3 | Que `evaluar.py` y `verificar.cjs` nunca se corten sin informe (H4 + fallo conocido 2) | 4 | 2 | Bajo | Agente |
| M4 | Script `herramientas/validar_gistemp.py` que calcule la correlación con la tabla oficial, y mostrar "0,99" en la web con enlace (H6) | 5 | 2 | Bajo | Agente |
| M5 | Textos honestos: "en nuestra medición" en portada y gráfico; créditos exactos de SVS (H5, H9) | 4 | 0,5 | Bajo | Agente |
| M6 | Vista previa al compartir (Open Graph con una imagen del globo) (H11) | 3 | 1 | Bajo | Agente |
| M7 | Aligerar el video del mar (objetivo ≤ 4 MB) o reproducir sin bajarlo entero (H7) | 4 | 2 | Medio (hay que regenerar con `exportar_web`) | Agente |
| M8 | Guía de 5 minutos para el jurado en el README (qué abrir, qué oír, qué cifra mirar) | 4 | 1 | Bajo | Agente + revisión de persona |

### Para la demo

| # | Idea | Valor | Horas | Riesgo | Quién |
|---|---|---|---|---|---|
| D1 | Fusionar `misael/en-vivo` tras probarlo en Safari, iPhone y Firefox (H3) | 5 | 3–5 | Medio | Persona prueba; agente fusiona |
| D2 | "Adivina el año": suena un tramo sin imagen y el público elige la década | 5 | 4 | Bajo | Agente |
| D3 | Antes y después: dos tramos seguidos (1881–1910 y 1994–2023) con un botón | 4 | 2 | Bajo | Agente |
| D4 | Plan de respaldo sin internet: carpeta con la web, un video grabado de la demo y parlante probado | 5 | 1 | Bajo | Persona |
| D5 | Prueba de escucha con 5 personas (ver abajo) y poner el resultado en la presentación | 5 | 2 | Bajo | Persona |
| D6 | Exportar la pista como MIDI y partitura (el `.mid` ya lo genera 06) con botón de descarga | 3 | 2 | Bajo | Agente |
| D7 | Prueba con VoiceOver en Mac e iPhone, grabada en 30 s de video | 4 | 1 | Bajo | Persona |
| D8 | Controles táctiles más grandes (H14) | 2 | 0,5 | Bajo | Agente |

**Prueba de escucha propuesta (D5):** 5 personas, sin ver la pantalla, con auriculares. Oyen GISTEMP una vez y responden: (1) ¿sube, baja o se queda igual?; (2) ¿en qué tercio empieza a cambiar más rápido?; (3) ¿notas un sonido grave fijo? ¿para qué crees que sirve?; (4) ¿el sonido se movió de lado? Luego la pista del mar: ¿cuántas veces baja y sube? Se anota cuántos aciertan cada una. Si casi nadie acierta la (4), se confirma H12 y conviene dejar de prometer el paneo en la portada.

### Después del hackathon

| # | Idea | Valor | Horas | Riesgo | Quién |
|---|---|---|---|---|---|
| P1 | Tercera y cuarta pista (hielo marino, CO₂); antes quitar el límite de 2 pistas (H10) | 4 | 6–10 por pista | Medio | Agente + persona elige el video |
| P2 | Versión en inglés de la web | 4 | 4 | Bajo | Agente + revisión |
| P3 | Calibración automática (leer los números de la barra con OCR) | 3 | 8+ | Alto | Agente |
| P4 | Subir tu propio video en el navegador | 3 | 20+ | Alto | Agente |
| P5 | CI en GitHub (Linux y Mac) con `evaluar.py` y Playwright | 3 | 3 | Bajo | Agente |
| P6 | Partir `evaluar.py` (1.203 líneas, 60 funciones) en un paquete de pruebas | 2 | 4 | Medio | Agente |
| P7 | Cargar el 3D solo si el equipo puede (H8) y medir en teléfono real | 3 | 3 | Medio | Agente + persona |
| P8 | Limpiar ramas viejas y, si se quiere, el historial pesado (H17) | 2 | 2 | Alto (reescribe historial) | Dueño del repo |
| P9 | CSP y validación de configs (H15, H16) | 2 | 2 | Bajo | Agente |
| P10 | Guía por voz (`juan/guia-voz-ia-v2`) cuando su servicio sea estable | 3 | ? | Alto (depende de un servicio externo con errores 502/504 según sus commits) | Persona decide |

---

## 5. Ideas descartadas y por qué

Lluvia inicial: 34 ideas. Las 26 de arriba se quedan. Estas no:

- **Tocar la Tierra con el globo 3D en vivo:** vistoso, pero necesita datos por región que el pipeline no produce; no cabe antes de la entrega.
- **Más instrumentos o cambiar la escala:** sin la prueba de escucha (D5) sería cambiar a ciegas; además obliga a regenerar toda la cadena.
- **Capa de eventos (huracanes, El Niño):** requiere una fuente de datos nueva y validarla; no hay evidencia de que mejore la comprensión.
- **Tono por diferencia entre hemisferios en la pista del mar:** ya se evaluó en la auditoría 3 (hallazgo 7) y cambia el significado de la nota.
- **Modo sin conexión (service worker):** el respaldo en carpeta local (D4) cubre la demo con mucho menos riesgo.
- **Git LFS ahora:** cambia cómo trabaja todo el equipo a días de la entrega.
- **Subtítulos del video:** las pistas no tienen voz; la lectura en vivo y la descripción ya hacen ese papel.
- **Lectura fácil certificada:** el texto ya es corto y claro; mejor invertir en la prueba con personas.

---

## 6. Preguntas para el usuario

1. **Equipo:** ¿cuáles son los 2 nombres que faltan y el aporte de cada una de las 5 personas? (No se puede inventar.)
2. **Modo en vivo:** ¿entra antes de la entrega? Opciones: (a) sí, tras probarlo en iPhone y Safari; (b) solo para la demo, desde la rama; (c) después.
3. **Guía por voz con IA:** ¿se incluye? Opciones: (a) no por ahora (recomendado: depende de un servicio que ha dado errores); (b) sí, con un respaldo si falla.
4. **Inglés:** ¿hace falta para esta entrega? Opciones: (a) solo el resumen del proyecto; (b) toda la web; (c) no.
5. **Paneo de GISTEMP:** ¿se deja y se suaviza la promesa de la portada, o se cambia la fórmula? (Es la decisión pendiente de la auditoría 3; conviene decidir después de la prueba de escucha.)
6. **Máquina de la demo:** ¿Mac, Windows o Linux? De eso depende la urgencia de M2.
7. **Publicación:** el sitio está en la cuenta `misaelvayas-ui`. ¿Quién pulsa "publicar" después de M1?
8. **Nombre legal:** ¿"Resonant Earth" es el titular correcto en `LICENSE`?

---

## 7. Anexo técnico (para el agente que haga los cambios)

Reglas comunes: rama nueva; todo en español; documentar como "RONDA N" en `docs/CAMBIOS.txt`; no push ni PR sin permiso; no cambiar umbrales de pruebas para que pasen; no tocar `web/equipo.json` con datos inventados. "Terminado" siempre incluye `python evaluar.py` sin FALLA y `node web/pruebas/verificar.cjs <url> <carpeta>` sin FALLA.

Cómo se reprodujo el entorno de esta revisión (útil para todos los prompts):
- Códec: un `sitecustomize.py` fuera del repo que cambia `mp4v` por `avc1` en `cv2.VideoWriter_fourcc`, con `PYTHONPATH` apuntando a él.
- Salidas fuera del repo: `ROCOLA_SALIDAS`, `ROCOLA_CONFIG`, `ROCOLA_SIN_AUDIO=1`.
- Web: `npm i playwright @axe-core/playwright && npx playwright install chromium` en una carpeta temporal; webm con `ffmpeg -i web/assets/<id>.mp4 -c:v libvpx -b:v 400k -c:a libopus <id>.webm`; `WEBM_DIR` y `NODE_PATH`.
- Datos: `https://svs.gsfc.nasa.gov/vis/a000000/a005200/a005207/{2023GISTEMP_Map_SOS.mp4,giss_navy_anomaly_Vertical-both.png,time.txt}` en `datos/`.

### M2 — Video en Mac (04 y 08)
Contexto: fallo 1 de `PROMPT_SIGUIENTE_AGENTE.md` más H2. Archivos: `04_video_sintetico.py:38`, todos los `VideoWriter` de `evaluar.py`, `08_video_con_audio.py:93-126`.
Qué hacer: (a) ayudante único de escritura de video con comprobación de `isOpened()` y relectura; para los videos de prueba preferir una ruta sin pérdida (PNG + `ffmpeg -c:v libx264 -crf 0 -pix_fmt yuv444p`), porque con `avc1` C1 falla por 0,003. (b) En 08, detectar si ffmpeg tiene `drawtext` (`ffmpeg -filters`); si no, dibujar el texto en PNG transparentes con Pillow u OpenCV y usar `overlay` (ese filtro sí está), o seguir sin texto con un AVISO claro. (c) 04 debe salir con código ≠ 0 si el archivo no existe.
Terminado: en macOS con ffmpeg de Homebrew, `evaluar.py` da 44 PASA + K1 OMITIDA (o 45 con FluidSynth); D1 y F4 pasan; en Linux sigue todo PASA y `rasgos.json` de GISTEMP no cambia (`cmp`).

### M3 — Informes que no se cortan
Archivos: `evaluar.py` (`main()`), `herramientas/exportar_web.py` (los `sys.exit`), `web/pruebas/verificar.cjs` (línea 184 y cada bloque V).
Qué hacer: atrapar `SystemExit` en `evaluar.py` y marcar OMITIDA las pruebas que dependen de una que falló; en `verificar.cjs`, envolver cada comprobación y cada captura en `try/catch` que informe `[FALLA] Vn <mensaje>` o `[AVISO]` y continúe; V11: hacer la caída de `nivel` dependiente del tiempo en `web/js/audio.js:150-154` o dar a la prueba un margen por cuadros.
Terminado: forzar un error en una captura y en una prueba (temporalmente) sigue imprimiendo todas las líneas V1–V23 y la tabla completa de `evaluar.py`.

### M4 — Correlación reproducible
Archivo nuevo: `herramientas/validar_gistemp.py`. Entrada: `web/assets/gistemp_1880_2023_rasgos.json` (o `--rasgos`) y `GLB.Ts+dSST.csv` (descargarlo de `https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv` a `datos/` si no está; columna 14 = J-D). Promediar por año los fotogramas repetidos, cruzar por año y escribir r de Pearson, sesgo, RMSE, pendiente 1980–2023 y n.
Valores esperados (medidos hoy): n = 58, r = 0,9918, sesgo −0,09 °C, RMSE 0,11, pendiente 0,196 frente a 0,183 °C/década.
Además: prueba nueva en `evaluar.py` (OMITIDA sin el CSV) que exija r ≥ 0,98; una frase en la web ("coincide con la serie oficial GISTEMP: r = 0,99 en 58 años") con enlace a la tabla; mención en el README.
Terminado: el script imprime esas cifras; la prueba nueva pasa; V1–V23 pasan.

### M5 — Textos y créditos
Archivos: `web/pistas.json` (`grafico.resumen` de GISTEMP), `web/index.html` (tarjeta del héroe y pie), `web/README.md`.
Qué hacer: anteponer "En nuestra lectura del mapa:" o añadir "(serie oficial: −0,09 y +1,17 °C)". Pie: crédito de SVS 5207 "NASA's Scientific Visualization Studio. Datos: Robert B. Schmunk (NASA/GSFC GISS)" y de SVS 3912 "NASA/Goddard Space Flight Center Scientific Visualization Studio"; quitar o aclarar "Earth Information Center". Copiar la línea exacta de cada página de SVS, no de este documento. Cambiar "45 pruebas…" por una frase que no dependa del número, o hacer que una prueba compare ese número con `evaluar.py`.
Terminado: V16 sigue en PASA (no debe aparecer "1880" fuera del crédito); axe sin violaciones.

### M6 — Vista previa al compartir
Archivo: `web/index.html` (`<head>`), imagen nueva `web/assets/compartir.jpg` (1200×630, captura del héroe; no usar logotipos de la NASA).
Qué hacer: `og:title`, `og:description`, `og:image` (URL absoluta del sitio publicado), `og:type`, `twitter:card=summary_large_image`, `link rel=canonical`.
Terminado: V1 sin respuestas ≥ 400; la imagen pesa < 200 KB.

### M7 — Pista del mar más ligera
Archivos: `herramientas/exportar_web.py` (parámetros de ffmpeg), `web/js/audio.js:37-79`.
Opción A (segura): recodificar a un bitrate menor (hoy 2,5 Mbps de video a 1024×512; GISTEMP usa 1,0) y regenerar con `python -m herramientas.exportar_web` (necesita `salidas_sst/` y el video original; comprueba que el audio sea el de `rocola.wav`). Opción B: asignar `medio.src` directo con `preload="auto"` y `-movflags +faststart`, sin `fetch` completo, manteniendo el aviso de progreso.
Terminado: `sst_ecco2_2007_2008.mp4` ≤ 4 MB; K2 y J4 pasan; `_procedencia.json` actualizado; V10 pasa.

### M8 — Guía de 5 minutos para el jurado
Archivo: `README.md` (sección nueva arriba) o `docs/GUIA_JURADO.md`.
Contenido: enlace a la web; "pulsa Temperatura del planeta y escucha 30 s"; qué significa cada capa en una línea; la cifra 0,99 y cómo comprobarla (M4); límites honestos (mar = índice relativo); cómo correr las pruebas en una línea. Sin nombres ni cifras que no estén en el repo.
Terminado: una persona que no conoce el proyecto la sigue en 5 minutos (probar con alguien).

### D1 — Fusionar el modo en vivo
Rama: `origin/misael/en-vivo` (0 commits detrás de `master`: entra sin conflictos hoy). Leer `docs/PLAN_MODO_EN_VIVO.md` sección 5.4 (lista manual sin hacer).
Antes de fusionar, una persona prueba: Safari de macOS, iPhone (interruptor de silencio, bloqueo de pantalla), Firefox, auriculares para el paneo.
Terminado: `evaluar.py` 46 PASA; `verificar.cjs` V1–V28 PASA; `node --test web/pruebas/motor.test.mjs` 13 PASA; la lista manual anotada en `CAMBIOS.txt`.

### D2 / D3 — "Adivina el año" y "Antes y después"
Archivos: `web/index.html`, `web/js/rocola.js`, `web/pistas.json`, `web/estilos.css`, pruebas nuevas en `verificar.cjs`.
D2: botón que salta a un momento al azar de GISTEMP, oculta video, fecha y lectura (también para el lector de pantalla), suena 5 s y ofrece 4 décadas como botones; al responder revela el año y el valor. D3: botón que reproduce 0–5 s y luego 25–30 s con un anuncio entre ambos.
Terminado: usable solo con teclado; axe sin violaciones a 1440 y 390 px; prueba que comprueba que la respuesta correcta coincide con `fecha` del rasgo.

### P1 — Tercera pista
Primero quitar `lista.length !== 2` en `web/js/datos.js:24` y revisar `btn-cambiar` en `rocola.js` (alterna entre dos). Después: elegir un SVS con barra de colores y mapa fijo, `calibrar`, 05–08 en su carpeta (`ROCOLA_SALIDAS`), añadirla a `VIDEOS` de `exportar_web.py`, `exportar_mapeo`, entrada en `pistas.json` y caso en I1.
Terminado: I1 reproduce la pista nueva; V4 actualizada a 3 pistas.
