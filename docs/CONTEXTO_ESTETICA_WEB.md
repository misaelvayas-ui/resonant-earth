# Contexto para rediseñar la estética de la web — Rocola de la Tierra

> **Para el asistente de IA que lee esto:** tu tarea es ayudarme a escribir **prompts** que le daré a Claude Code (el asistente que programa en mi computadora) para probar variantes estéticas de la página web: colores, tamaños, formas, tipografía, espaciados y efectos. Este documento te da todo el contexto. Cuando te pida ideas, devuélveme prompts concretos, listos para pegar, que respeten las reglas de la sección 8.
>
> Estado descrito: **13 de noviembre de 2026**. La sección 4 describe la versión 5 ("espacial"); la variante 6, **"universo-movil"**, se probó encima de ella en la rama `estilo-universo-movil` (ver el recuadro de la sección 4). El código real en `web/` manda sobre este documento si algo no coincide.

---

## 1. Qué es el proyecto

**Rocola de la Tierra** (marca: **Resonant Earth**) convierte visualizaciones científicas del clima en sonido. Un pipeline en Python lee los colores de cada fotograma de un video (por ejemplo, el mapa de anomalías de temperatura 1880–2023 de la NASA, SVS 5207 / GISTEMP), los traduce a números y los toca como una melodía estéreo:

| Dato del mapa | Sonido |
|---|---|
| Temperatura / valor medio | Altura de la nota (más aguda = más caliente) |
| Tamaño de la zona caliente | Volumen |
| Dónde está lo caliente | Izquierda / derecha en el estéreo |
| Valor de referencia | Tono grave fijo |

Es un prototipo para el **NASA Space Apps Challenge (reto 9)**. El público incluye **personas ciegas o con baja visión**: por eso la accesibilidad no es opcional (sección 6).

La **web** (`web/`) es la cara visible: una "rocola" donde eliges una visualización, la ves y escuchas, sigues su curva en un gráfico y lees en texto qué pasa en cada momento.

---

## 2. Tecnología de la web (restricciones)

- **HTML + CSS + JavaScript puro.** Sin frameworks, sin Tailwind, sin compilación. Todo el estilo está en **un solo archivo: `web/estilos.css`** (~590 líneas).
- **Sin internet en tiempo de ejecución:** las fuentes van empaquetadas en `web/assets/fonts/` (woff2, licencia SIL OFL). Si una propuesta usa otra fuente, hay que descargarla en woff2 (por ejemplo, de Fontsource), guardar su licencia junto a ella y borrar las que dejen de usarse; nada de Google Fonts en línea. Las decoraciones (estrellas, nebulosa) también se hacen solo con CSS o SVG en línea, sin librerías ni imágenes externas.
- **Para verla** hace falta un servidor local (con doble clic en el archivo no carga):
  ```bash
  cd C:\Users\DELL\rocola_practica\web
  python -m http.server 8000
  ```
  Luego abre <http://localhost:8000> y pulsa Ctrl+F5 para ver los cambios. **La terminal debe quedar abierta**: si se cierra, la página da "No se puede acceder al sitio web".
- El proyecto es un repositorio git (rama de trabajo: `diseno`; principal: `master`). Cada variante puede ir en su propio commit o rama para compararlas y volver atrás.

### Archivos de `web/`

| Archivo | Para el diseño importa… |
|---|---|
| `estilos.css` | **todo el aspecto visual**: variables de color, fuentes, tamaños, formas, cielo, diseño adaptable |
| `index.html` | la estructura y las clases; el `<div class="cielo">`; el SVG del gráfico (degradado de la estela y recorte); `theme-color` (color de la barra del navegador en móvil) y la precarga de la fuente |
| `app.js` | crea los botones de la lista y cambia estados (`aria-pressed`, clase `reproduciendo`); dibuja la curva suave del gráfico, la estela recorrida y mueve el punto. Para cambios solo de colores o tamaños **no** hace falta tocarlo |
| `describir.js` | genera el texto de "Qué pasa ahora". No es estético |
| `catalogo.json` | lista de visualizaciones (hoy hay **una sola**: "Mancha de calor viajera (ejemplo)") |
| `assets/logo.jpg`, `logo-240.jpg`, `icono-64.png`, `icono-180.png` | logo generado con IA: **un cuadrado con fondo azul oscuro**, la Tierra con auriculares y ondas de sonido, anillos dorados y verde azulado |
| `assets/fonts/` | Manrope 400, 600 y 700; IBM Plex Mono 400 y 600 (+ licencias) |
| `capturas/escritorio.png`, `capturas/movil.png` | capturas del diseño actual (v5) |
| `README.md` | describe diseño y accesibilidad; **hay que actualizarlo** si cambian colores o fuentes |

---

## 3. Estructura de la página (no cambia entre variantes)

De arriba abajo, en el HTML:

1. **Cielo** (`div.cielo`, `aria-hidden="true"`): capa fija detrás de todo, pura decoración.
2. **Enlace "Saltar al reproductor"** (`.saltar`): invisible hasta que se pulsa Tab.
3. **Cabecera** (`.cabecera`, es un panel): logo dentro de un recuadro (`.logo-marco` > `.logo`), rótulo "RESONANT EARTH" (`.rotulo`), título `h1` "Rocola de la Tierra" y lema (`.lema`).
4. **Rejilla principal** (`main.rejilla`) con 4 secciones; **cada una es un panel**:
   - **Lista de pistas** (`.rocola` > `ol.lista` > `button.boton-rocola`): lista numerada 01, 02… Cada botón tiene `.titulo`, `.resumen` y `.sonando` (texto "ELEGIDA", visible solo en la pista elegida). Hay un `span.barras` con tres `<i>` **oculto**, que se podría usar para un ecualizador animado. El botón elegido lleva `aria-pressed="true"`; mientras suena, también la clase `.reproduciendo`.
   - **Reproductor** (`.reproductor`): título `h2`, descripción, **video** (`.pantalla`, 16:9), **controles** (`.controles`: botón `.boton-play` "Reproducir/Pausar", barras de progreso y volumen `input[type=range]`, tiempo `.tiempo`), una línea de **atajos de teclado** con `<kbd>` y el **gráfico** (en ese orden).
     - El **gráfico** (`figure.grafico`) tiene: rótulo, eje Y (`.eje-y`), un área clicable (`.grafico-area`) con un SVG que se estira al ancho (`viewBox 0 0 1000 200`, `preserveAspectRatio="none"`) y contiene la órbita completa `.g-curva`, la estela recorrida `.g-estela` (recortada por `#grafico-recorte` y pintada con el degradado `#grad-estela`), la línea de referencia `.g-ref` y la línea del momento actual `.g-cursor`. Encima, en HTML: el punto que avanza `.g-punto` (HTML para que no se deforme al estirar el SVG) y el rótulo `.g-ref-rotulo`. Debajo, el eje X (`.eje-x`).
   - **"Qué pasa ahora"** (`.en-vivo`): rótulo "DESCRIPCIÓN AUTOMÁTICA" y una caja de registro (`.registro`) con el tiempo (`.registro-tiempo`, p. ej. `00:12`) y la frase (`.descripcion-viva`). Debajo, dos casillas (`.casilla`): leer cambios con el lector de pantalla y mostrar subtítulos.
   - **"Qué estás escuchando"** (`.leyenda`): tabla `.mapeo` de dos columnas, **Dato | Sonido**, y una línea con el significado de los colores del video (`.leyenda-colores`).
5. **Pie** (`.pie`, también es un panel): créditos (NASA SVS, hecho con IA, logo con IA, fuentes).

### Disposición

- **Escritorio (≥ 1100 px)**, de arriba abajo:
  1. Portada: logo grande + título + lema.
  2. Franja "Elige una visualización": el título a la izquierda y las pistas como tarjetas en fila a la derecha. El resumen de cada tarjeta se corta en 2 líneas; el texto completo está en el reproductor y el lector de pantalla lo lee entero.
  3. Escenario en dos columnas:
     - izquierda (flexible): el reproductor, en el orden video → controles → atajos de teclado → gráfico;
     - derecha (320–400 px): "Qué pasa ahora" junto al video y, debajo, "Qué estás escuchando".
  4. Créditos en una franja delgada, en línea.
- **Menos de 1100 px:** una columna, en el mismo orden del HTML: elegir → reproductor → qué pasa ahora → qué estás escuchando → créditos. A ≤ 600 px los controles se apilan, el gráfico baja a 120 px de alto, los paneles se compactan y los créditos van uno por línea.
- Ancho máximo 1280 px; márgenes laterales de 16 px en móvil y 32 px desde 760 px; separación entre paneles de 1,6rem.
- **Por qué esta distribución:** antes "Qué pasa ahora" quedaba lejos del video, los controles estaban debajo del gráfico y la columna izquierda era una torre que repetía el texto del reproductor. Ahora la descripción en vivo está al lado de la imagen, los controles van pegados al video y la página de escritorio mide unos 1930 px de alto en vez de 2230.
- **Texto base de 20 px** (`html { font-size: 125% }`): texto grande a propósito, por accesibilidad.

---

## 4. Diseño actual: versión 5, "espacial" (sin commit todavía)

> **Variante 6, "universo-movil"** (rama `estilo-universo-movil`, sin commit). Cambia esto respecto de la v5 y deja todo lo demás igual:
> - **Fondo:** `#000000`, sin nebulosas. `theme-color` también `#000000`.
> - **Cielo animado:** `.cielo` contiene `.capa-lejana`, `.capa-media`, `.capa-cercana` y `.fugaz`.
>   - Cada capa repite un patrón SVG de lado `--paso` (300 / 500 / 700 px) y avanza un patrón por vuelta (`--vuelta` 240 / 150 / 90 s) con `transform: rotate(-10deg) translate3d(...)`. Así sube con una leve diagonal y el bucle no tiene cortes.
>   - Las estrellas son de 0,5 / 0,8–1 / 1,2–1,8 px de radio, casi todas blancas y algunas con tinte `#cdbfff` o `#a8ece4`.
>   - Hay una estrella fugaz cada 40 s.
>   - La animación solo corre con `prefers-reduced-motion: no-preference`; con `reduce`, las estrellas quedan quietas y visibles.
> - **Fuentes:**
>   - Sora 600 y 700 (`--display`) para títulos, rótulos, títulos de pista y "ELEGIDA";
>   - Plus Jakarta Sans 400 y 600 (`--sans`) para el texto;
>   - JetBrains Mono 400 y 600 (`--mono`) para números y datos.
> - **Escala:** `--t-titulo` 1,95rem, `--t-seccion` 1,15rem, `--t-rotulo` 0,68rem, título del reproductor 1,45rem; interletrado más apretado en títulos (h1 −0,035 em).
> - **Contraste:** igual que la v5 en el peor caso (panel sobre una estrella blanca): texto ≥ 5,5:1. Botón: texto negro sobre `#ecebf5`, 17,8:1.
> - **Fluidez** (Chrome sin pantalla, orientativo): 60 fps con el cielo animado y el desenfoque de los paneles, igual que sin ellos.
>
> **Ajuste de armonía (después de probarla):** el fondo gustó mucho, pero el resto no combinaba. Tres causas:
> 1. paneles violáceos (`#131121`) sobre un negro neutro;
> 2. acentos que no salían del cielo;
> 3. demasiadas cajas dentro de cajas.
>
> Cambios:
> - **Paleta tomada de las estrellas:** texto `#f5f4fb` / `#d6d5e1` / `#b7b6c6`; acento lila `#cdbfff`; segundo acento turquesa `#a8ece4`; degradado del título y de la pista elegida `#cdbfff → #a8ece4`; órbita `#7fc9c0`; dorado sin cambios.
> - **Paneles de vidrio oscuro neutro:** `rgba(10,11,18,.86)` con borde `rgba(255,255,255,.08)` y brillo `inset 0 1px 0 rgba(255,255,255,.07)`.
> - **Sin fondos internos:** el gráfico, el registro, `kbd` y el recuadro del logo solo llevan línea fina.
> - **Halo lila suave** (`--halo`) en el logo y el video.
> - **Botón:** píldora `#ece8ff → #e3f6f2` con texto negro.
> - **Punto del gráfico:** estrella blanca con resplandor.
> - **Contraste en el peor caso:** texto ≥ 5,6:1 (axe con fondo blanco: mínimo 6,87:1).
>
> **Portada con el logo como protagonista:** la cabecera pasó a ser una portada.
> - **Logo:** 184 px en escritorio, 148 px a menos de 1000 px y 136 px centrado arriba en móvil. Usa `srcset` con `logo-240.jpg` y `logo-480.jpg` (nuevo, generado desde `logo.jpg`).
> - **Marco:** `.logo-marco` de vidrio (`#0a0b12`), 8 px de relleno, radio de 30 px, borde de 1 px con el degradado lila → turquesa y resplandor `0 0 36px rgba(205,191,255,.2), 0 0 90px rgba(168,236,228,.08)`. La imagen lleva radio de 22 px. No se recorta en círculo porque el logo trae abajo el texto "RESONANT EARTH / HEAR THE EARTH".
> - **Título:** en móvil, el texto va centrado (los tamaños actuales están en la tipografía, más abajo).
>
> **Tipografía en contexto** (reemplaza a Sora y JetBrains Mono). Cada familia tiene un papel:
> - **Unbounded** 500/600 (`--display`): la voz de la marca, ancha y geométrica como las letras del logo. Va en el `h1` (600), los `h2` de sección (500, 1rem) y los rótulos en mayúsculas (500, 0,64rem, interletrado 0,16 em, como "HEAR THE EARTH").
> - **Plus Jakarta Sans** 400/600 (`--sans`): toda la lectura, incluidos el nombre de la visualización en el reproductor (600, 1,4rem) y los títulos de pista (600, 1rem).
> - **Space Mono** 400/700 (`--mono`): datos como telemetría (tiempos, ejes, número de pista, `kbd`).
> - **Escala:** `--t-marca` 2,3 (1,95 en tableta, 1,6 en móvil) · `--t-titulo` 1,4 · `--t-seccion` 1 · `--t-cuerpo` 1 · `--t-chico` 0,85 · `--t-dato` 0,74 · `--t-rotulo` 0,64 rem. El lema va en `--t-cuerpo`.

Pedí una dirección **espacial**, inspirada en interfaces como Gemini y en mi app **Rumbo** (React, en `C:\Users\DELL\Downloads\rumbo`; estilos en `src/App.css`), sin copiar logos, marcas ni tipografías propietarias. Requisitos que di:

- Quitar el azul marino fuerte `#08122D`; fondo casi negro con un leve tono violeta; el azul solo como resplandor suave.
- Cielo con estrellas muy tenues y nebulosa violeta / verde azulado, discreta, que no compita con el video.
- Paneles semitransparentes con borde fino claro, esquinas suaves y mucho espacio.
- Degradado suave violeta → verde azulado en el título y en el elemento activo; **dorado solo para la línea del momento actual**; nada de neón saturado.
- Sans-serif geométrica para todo e IBM Plex Mono solo para números y datos.
- El gráfico como una trayectoria u órbita, con un punto que avanza al ritmo del video.
- **El texto nunca va directamente sobre el degradado ni las estrellas**: siempre sobre un panel suficientemente sólido.

### Variables de color (`:root` en `estilos.css`)

Contraste medido en el **peor caso**: el panel encima de una estrella blanca opaca (resultado `#2b2937`) y, para la pista elegida, con su tinte encima (`#37324c`). Sobre el panel normal (`#121020`) los valores son aún más altos.

| Variable | Valor | Uso | Contraste (peor caso / pista elegida) |
|---|---|---|---|
| `--fondo` | `#0a0a14` | fondo de la página (casi negro, leve violeta) | — |
| `--panel` | `rgba(19,17,33,.9)` (`#131121` al 90 %) | todos los paneles | — |
| `--panel-solido` | `#131121` | fondo del rótulo "referencia" | — |
| `--panel-interior` | `rgba(255,255,255,.03)` | cajas dentro de paneles: gráfico, registro, recuadro del logo, `kbd`, hover de pistas | — |
| `--linea` | `rgba(255,255,255,.12)` | borde fino de 1 px de paneles y separadores | decorativo |
| `--linea-fuerte` | `#8a879f` | ejes del gráfico, bordes de `kbd`, cabecera de la tabla | 4,1 / 3,5 |
| `--texto` | `#f2f1f8` | texto principal, anillo de foco | 12,7 / 10,9 |
| `--texto-2` | `#cfcde0` | texto secundario | 9,2 / 7,9 |
| `--texto-3` | `#aeabc2` | rótulos en mayúsculas, notas | 6,4 / 5,5 |
| `--oscuro` | `#0a0a14` | texto del botón claro y del enlace "saltar" | 16,7 sobre `#ecebf5` |
| `--violeta` | `#b49cf5` | acento de texto: "RESONANT EARTH", "ELEGIDA", número de la pista elegida, enlaces, barras y casillas | 6,1 / 5,3 |
| `--turquesa` | `#6fd3c9` | verde azulado: tiempo del registro, borde del punto | 8,1 / 6,9 |
| `--degradado` | `#c9b6ff → #8fdcd2` (100°) | texto del `h1` | 7,9 a 9,1 |
| `--degradado-barra` | `#b49cf5 → #6fd3c9` (vertical) | barra de 3 px de la pista elegida | — |
| `--tinte-activo` | violeta `rgba(143,114,230,.12)` → verde azulado `rgba(111,211,201,.05)` | fondo de la pista elegida | — |
| `--orbita` | `#5cc4bd` | órbita completa (tramo por recorrer), punteada | 6,9 |
| `--estela-ini` / `--estela-fin` | `#b09af2` → `#6fd3c9` | estela ya recorrida | 6,0 a 8,1 |
| `--dorado` | `#F0CC7D` | **solo** la línea del momento actual | 9,3 |

Otros: el botón de reproducir es `#ecebf5` (al pasar el ratón, `#fff` con un halo violeta suave); el video tiene fondo `#000`; los subtítulos, fondo `rgba(10,10,20,.92)`; los errores, rosa translúcido `rgba(242,116,154,.12)` con borde al `.35`.

### Cielo (`.cielo`)

- Capa `position: fixed` detrás de todo, `pointer-events: none`, `aria-hidden="true"`, **sin animación**.
- **Nebulosa:** tres `radial-gradient` con medidas fijas en px (para que no se deformen en pantallas altas): violeta `rgba(124,92,214,.22)` arriba a la izquierda (720×420), verde azulado `rgba(42,168,168,.14)` a la derecha (600×380) y azul `rgba(66,133,244,.08)` abajo (720×400).
- **Estrellas:** dos patrones SVG en línea (data URI) de 420 y 710 px que se repiten; círculos blancos de 0,5 a 1,2 px con opacidad de 0,18 a 0,55. Dos tamaños de patrón distintos evitan que se note la repetición.
- En el modo de alto contraste de Windows se oculta.

### Tipografía

- **Manrope** (400, 600, 700): títulos y todo el texto. `h1` y `h2` en 700 y 600; rótulos en mayúsculas 700 con interletrado de 0,14 em.
- **IBM Plex Mono** (400, 600): solo números y lecturas de datos: número de pista, tiempo, tiempo del registro, ejes del gráfico, rótulo "referencia", `kbd`. Con `tabular-nums` para que las cifras no bailen.
- Escala (con base de 20 px): `--t-titulo` 2,1rem (42 px) · título del reproductor 1,55rem · `--t-seccion` 1,25rem · `--t-cuerpo` 1rem · `--t-chico` 0,85rem · `--t-rotulo` 0,72rem (≈ 14 px).
- Interletrado negativo en títulos (h1 −0,025 em); interlineado 1,15 en títulos y 1,6 en el cuerpo.

### Formas y efectos

- Radios: `--radio` 16 px (paneles) · `--radio-medio` 12 px (video, gráfico, registro, pistas) · `--radio-chico` 8 px (avisos) · `kbd` 6 px · `--pildora` 100 px (botón de reproducir, enlace "saltar").
- Paneles con `backdrop-filter: blur(6px)` y relleno `--relleno` 1,6rem.
- **Logo:** recuadro (`--panel-interior`, borde de 1 px, radio 18 px, relleno 6 px); imagen de 64 px con radio 12 (en móvil, 48 px con radio 10).
- **Pista elegida:** barra izquierda de 3 px con degradado violeta → verde azulado, tinte suave y borde fino. Al pasar el ratón: `--panel-interior` y borde fino.
- **Gráfico como órbita:**
  - la curva es suave (interpolación cúbica monótona: pasa por cada dato sin inventar picos ni valles);
  - el tramo por recorrer va punteado (`stroke-dasharray: 2 5`, 1,5 px);
  - el tramo ya recorrido va sólido, de 2,5 px, con el degradado de la estela;
  - el punto (12 px, centro blanco, borde verde azulado y halo suave violeta / verde azulado) avanza con el video;
  - la línea dorada de 1,5 px marca el momento actual;
  - la referencia es una línea punteada gris.
- **Foco:** anillo blanco de 2 px separado 3 px.
- **Movimiento:** el cielo no se mueve. Solo hay transiciones cortas (fondo de pistas, botón), y desaparecen con `prefers-reduced-motion: reduce`. El punto se mueve porque sigue al video, no por adorno.

---

## 5. Historia de los estilos (para no repetir lo que ya descarté)

| Versión | Dónde está | Paleta y fuentes | Por qué cambió |
|---|---|---|---|
| 1 | commit `b92689f` | Fondo `#0E1430`, paneles `#18204A`, acento amarillo lima `#E6F03A`; Rubik + Nunito Sans; radio 14 px | primera versión funcional |
| 2 | commit `4d39b90` | Paleta sacada del logo: fondo azul marino `#08122D`, dorado `#F0CC7D`, menta `#53E8AA`, verde azulado `#4DAFC3`, texto blanco cálido `#FCF9ED` | combinar con el logo |
| 3 | commit `6d68ffc` | "Sobrio e institucional": mismo azul marino, **un solo acento dorado**, verde azulado y menta solo en el gráfico; Source Serif 4 + IBM Plex Sans + IBM Plex Mono; esquinas de 2–3 px, sin degradados ni sombras. Aquí nacieron la lista tipo pista, la tabla Dato/Sonido, el registro en vivo y el gráfico SVG | menos colores, más seriedad |
| 4 | `git stash` "v4 familia Rumbo (respaldo antes del estilo espacial)" | **Familia Rumbo**: fondo neutro `#0f0e16`, paneles blancos al 4 %, texto `#f3f3f7` / `#d6d5db` / `#96959f`, acento violeta claro `#b8a0e0`, borde violeta `#9168c0`, curva azul `#4285f4`, cursor coral `#f2749a`, título con el degradado metálico de Rumbo; Space Grotesk + Inter; botón blanco en píldora; secciones sin paneles, solo separadores | el azul marino se veía demasiado fuerte y saturado; quería parecerme a Rumbo |
| 5 | `git stash` "v5 espacial (respaldo antes de universo-movil)" | **Espacial** (sección 4) | quería una dirección espacial, tipo Gemini y Rumbo, con más profundidad |
| 6 | rama `estilo-universo-movil`, sin commit (**en prueba**) | **Universo en movimiento**: negro puro, tres capas de estrellas que suben despacio con efecto de profundidad, estrella fugaz; Sora + Plus Jakarta Sans + JetBrains Mono | quería que el fondo pareciera el espacio profundo en movimiento y una tipografía más moderna |

Lecciones:
- **No volver al azul marino saturado como fondo.** El azul queda como resplandor o detalle pequeño.
- Funcionaron: un solo acento principal, la lista numerada tipo pista, la tabla Dato/Sonido, el registro con hora y el gráfico sincronizado.
- **Nada de neón saturado.** El degradado de Rumbo en botones se descartó en la propia Rumbo por "empalagoso"; aquí el degradado va solo en el título y en la pista elegida.
- El dorado se reservó para un solo uso (el momento actual) y así destaca.

---

## 6. Accesibilidad que ya funciona (no se puede romper)

- **Contraste WCAG AA o mejor:** texto ≥ 4,5:1 (hoy el mínimo es 5,5:1 en el peor caso); elementos gráficos y bordes de controles ≥ 3:1.
- **Cómo se mide con fondos semitransparentes:** axe no puede ver el cielo detrás de los paneles y deja esos textos como "incompletos". Por eso hay que medir dos veces con axe, reemplazando el cielo por un color plano del peor caso:
  1. la nebulosa más intensa, `#26365b`;
  2. blanco (una estrella opaca).

  Hoy: 0 fallos y mínimo 5,86:1. El título con degradado y la pista elegida (fondo con degradado) se calculan a mano.
- **Regla:** el texto nunca va sobre el cielo, siempre dentro de un panel.
- **Foco visible** en todo lo que se puede usar con teclado (`:focus-visible`), y enlace "Saltar al reproductor".
- **Teclado:** Tab recorre todo; Espacio reproduce o pausa; ← → mueven 5 s; un clic en el gráfico salta a ese momento (con teclado se hace lo mismo con la barra de progreso).
- **Lector de pantalla:** región `aria-live` que anuncia la descripción cada pocos segundos; barras con `aria-valuetext`; el gráfico tiene `role="img"` con un resumen fijo; los números de la lista, el cielo y el punto del gráfico se ocultan al lector.
- **Subtítulos** WebVTT con la misma descripción (estilo en `video::cue`).
- **Texto base de 20 px.**
- **`prefers-reduced-motion`:** sin animaciones ni transiciones si el usuario las desactivó. Toda animación nueva debe ir dentro de `@media (prefers-reduced-motion: no-preference)`.
- **Alto contraste de Windows (`forced-colors`):** se oculta el cielo; el título con degradado pasa a color sólido; la curva, la estela, el cursor, el punto, la pista elegida y el botón tienen colores del sistema. Todo degradado o imagen de fondo nuevo necesita su respaldo ahí.
- **axe-core 4.10** (WCAG 2.2 AA y buenas prácticas) en escritorio (1440 px) y móvil (390 px): **0 violaciones**.

---

## 7. Qué se puede experimentar (perillas)

Casi todo se cambia en `:root` y en `.cielo` de `estilos.css`, sin tocar el HTML:

- **Cielo:** más o menos estrellas, su brillo, colores y posición de la nebulosa, quitarla, una versión casi lisa. Animación muy lenta (estrellas que titilan, nebulosa que se desplaza), siempre solo con `prefers-reduced-motion: no-preference` y sin competir con el video.
- **Colores:** fondo (más negro, más violeta, más azul), color de acento, otra pareja de degradado (p. ej. violeta → rosa, azul → verde azulado), color del momento actual, intensidad de paneles y bordes.
- **Paneles:** opacidad (más vidrio o más sólido; por debajo del 90 % hay que volver a medir el contraste), desenfoque, grosor y color del borde, sombra o brillo en el borde, radios.
- **Modo claro / oscuro:** hoy solo hay oscuro (`color-scheme: dark`). Se podría añadir un tema claro con `prefers-color-scheme` o un botón (eso sí toca HTML y JS).
- **Tipografía:** otra sans geométrica (p. ej. Outfit, Plus Jakarta Sans, Sora, Urbanist; todas OFL), otra mono para datos, pesos, tamaños de la escala, interletrado.
- **Espaciado y densidad:** `--relleno`, `--separacion`, ancho de la columna izquierda (360 px), alto del gráfico.
- **Gráfico / órbita:** grosor y estilo del tramo futuro, degradado de la estela, tamaño y halo del punto, relleno suave bajo la curva, rejilla tenue, una estela que se desvanece.
- **Lista:** ecualizador animado en la pista que suena (`.barras` y `.reproduciendo` ya existen), otro estilo de pista elegida.
- **Botón de reproducir:** píldora clara (actual), con borde de degradado, solo contorno, más grande o redondo.
- **Logo:** tamaño, forma del recuadro, halo.

Fuera de alcance para estos prompts: el pipeline de Python, `describir.js`, `catalogo.json`, los textos y el orden de las secciones (salvo que yo lo pida).

---

## 8. Reglas que todo prompt debe incluir o respetar

1. **Conservar la estructura** de la sección 3 (lista numerada, video, gráfico clicable con órbita, punto y línea del momento actual, controles, registro "Qué pasa ahora", tabla Dato/Sonido, créditos) y todo lo de la sección 6.
2. **El texto siempre sobre un panel suficientemente sólido**, nunca sobre el cielo, degradados o estrellas.
3. **Calcular el contraste de cada color nuevo** en el peor caso real (panel sobre la nebulosa más intensa y sobre una estrella blanca) y anotarlo en el comentario del inicio de `estilos.css` (como ahora).
4. **Decoración solo con CSS o SVG**, `aria-hidden`, sin librerías, sin animación salvo con `prefers-reduced-motion: no-preference`, y oculta o con respaldo en `forced-colors`.
5. **Fuentes locales** en `web/assets/fonts/` con su licencia; borrar las que dejen de usarse y actualizar la línea de créditos del pie y el README.
6. **Actualizar `theme-color`** en `index.html` si cambia el fondo.
7. **Al terminar:**
   - axe en escritorio y móvil (0 violaciones), más la medición de contraste sobre los fondos del peor caso;
   - comprobar el foco con Tab y que el clic en el gráfico salte;
   - capturas nuevas (`web/capturas/escritorio.png` y `movil.png`), agrandando la ventana a la altura de la página para que el cielo fijo salga completo;
   - correr las pruebas (`evaluar.py`);
   - explicar en español simple qué cambió.
8. **Una variante por prompt**, en su propia rama o commit, para poder volver atrás.
9. Que la página funcione bien a 390 px de ancho, sin desplazamiento horizontal.

---

## 9. Cómo quiero que me respondas (formato de salida)

Cuando te pida ideas:

1. Propón **2 a 4 direcciones estéticas** distintas (pueden ser ajustes de la v5 o cambios grandes), cada una con nombre, una frase de intención y valores concretos: paleta (hex), fuentes, radios, opacidad de paneles y un efecto destacado. Dime en qué se diferencia de lo que ya probé (sección 5).
2. Para la que yo elija (o para cada una, si te lo pido), escribe **un prompt en español listo para pegar** en Claude Code con:
   - el objetivo visual en una o dos frases;
   - los valores concretos que cambian (variables de `:root`, cielo, fuentes, radios, tamaños, gráfico);
   - lo que no debe cambiar (sección 8, resumida);
   - la verificación final (axe, contraste del peor caso, foco, clic en el gráfico, capturas, pruebas) y que me explique qué hizo.
3. Avísame si alguna idea pone en riesgo el contraste o la legibilidad. Por ejemplo: bajar la opacidad de los paneles, texto sobre degradados o sobre el cielo, violeta oscuro como texto, neón saturado, animaciones que distraigan del video.

### Plantilla de prompt (ejemplo de la forma esperada)

```
Quiero probar una variante estética de la web (web/estilos.css) llamada "<nombre>", partiendo de la versión espacial actual.
Objetivo: <cómo debe sentirse>.
Cambios:
- Fondo <hex>; paneles <color> al <n> %; borde <color>; texto <hex>/<hex>/<hex>; acento <hex>.
- Cielo: <estrellas / nebulosa: colores, intensidad, posición>.
- Degradado del título y de la pista elegida: <hex> → <hex>. Momento actual del gráfico: <color>.
- Fuentes: <texto> y <mono para datos> (descárgalas en woff2 a assets/fonts con su licencia OFL; quita las que no se usen).
- Radios: paneles <n> px, internos <n> px, botones <píldora / n px>. <efecto>.
Conserva la estructura (lista numerada, gráfico clicable con órbita y punto, controles, registro "Qué pasa ahora",
tabla Dato/Sonido) y toda la accesibilidad: el texto siempre sobre paneles; contraste AA o mejor medido en el peor
caso (panel sobre la nebulosa más intensa y sobre una estrella blanca), anotado en el comentario de estilos.css;
foco visible, teclado, lector de pantalla, prefers-reduced-motion y forced-colors.
Actualiza theme-color, el pie y el README. Hazlo en una rama nueva "estilo-<nombre>".
Al terminar: axe en escritorio y móvil, medición de contraste en el peor caso, revisión del foco con Tab y del clic
en el gráfico, capturas nuevas, evaluar.py, y explícame en español simple qué cambiaste.
```

---

## 10. Pendientes conocidos

- Nada tiene commit todavía. La variante 6 (universo-movil) está en la rama `estilo-universo-movil`. En `git stash list` están la 5 ("v5 espacial (respaldo antes de universo-movil)") y la 4 ("v4 familia Rumbo (respaldo antes del estilo espacial)").
- `python evaluar.py` (pruebas del pipeline en Python, ajenas a la web) da **15 PASA, 3 FALLA** (C2, C3, D1). Antes daba 18/18; no se ha investigado. En la consola de Windows hay que correrlo con `PYTHONIOENCODING=utf-8`.
- El catálogo solo tiene un video de ejemplo: con una sola pista no se ve cómo luce la lista con varias.
- No existe la carpeta `web/referencias/`. Si quiero que se usen capturas de referencia, hay que crearla y guardarlas ahí.
