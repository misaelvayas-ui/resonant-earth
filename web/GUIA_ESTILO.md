# Guía de estilo — Rocola de la Tierra (Resonant Earth)

Resumen de cómo se ve la web, para hacer materiales que combinen con ella. Está sacado de `web/estilos.css` y `web/index.html`. Si algo no coincide, manda el código.

**La idea:** espacio profundo en movimiento. Fondo negro con estrellas que suben despacio, paneles de vidrio oscuro y una paleta que sale de la luz de las estrellas (blanco, lila y turquesa), con un único toque cálido dorado.

## 1. Paleta

| Color | Hex | Uso |
|---|---|---|
| Fondo | `#000000` | fondo de la página y barra del navegador (`theme-color`) |
| Panel | `#0a0b12` al 86 % | todos los paneles; `#0a0b12` sólido detrás del logo y del rótulo "referencia" |
| Borde fino | blanco al 8 % | contorno de paneles, cajas internas y separadores |
| Brillo de canto | blanco al 7 % | línea de luz en el borde superior de cada panel |
| Texto | `#f5f4fb` | texto principal, anillo de foco |
| Texto 2 | `#d6d5e1` | descripciones, tabla, ejes |
| Texto 3 | `#b7b6c6` | rótulos en mayúsculas, notas, créditos |
| Línea fuerte | `#8d8c9c` | ejes del gráfico, bordes de teclas, cabecera de la tabla |
| Lila (acento) | `#cdbfff` | "RESONANT EARTH", "ELEGIDA", número de la pista elegida, enlaces, barras y casillas |
| Turquesa (2.º acento) | `#a8ece4` | tiempo del registro, final de los degradados |
| Órbita | `#7fc9c0` | tramo del gráfico que falta por recorrer |
| Dorado | `#F0CC7D` | **solo** la línea del momento actual del gráfico |
| Degradado de marca | `#cdbfff → #a8ece4` | título (100°), barra de la pista elegida (vertical), borde del logo, estela del gráfico |
| Botón | `#ece8ff → #e3f6f2` | botón Reproducir/Pausar, con texto `#000000` |

## 2. Tipografías

Las tres tienen licencia SIL OFL y van guardadas en `web/assets/fonts/`. Texto base: 20 px.

| Fuente | Pesos | Dónde |
|---|---|---|
| **Unbounded** (ancha, geométrica, como las letras del logo) | 500, 600 | título (600), encabezados de sección (500) y rótulos en mayúsculas con interletrado 0,16 em |
| **Plus Jakarta Sans** | 400, 600 | todo lo que se lee: descripciones, pistas, tabla, registro, botones, nombre de la visualización |
| **Space Mono** (tipo telemetría) | 400, 700 | datos: tiempos, ejes, número de pista, teclas |

**Tamaños** (en rem; 1 rem = 20 px):

| Nivel | rem | Uso |
|---|---|---|
| marca | 2,3 | título; 1,95 en tableta, 1,6 en móvil |
| título | 1,4 | nombre de la visualización |
| sección | 1 | encabezados de sección |
| cuerpo | 1 | texto normal |
| chico | 0,85 | texto secundario |
| dato | 0,74 | ejes y lecturas del gráfico |
| rótulo | 0,64 | rótulos en mayúsculas |

## 3. Orientación de la página

**Escritorio (≥ 1100 px)**, ancho máximo 1280 px, separación de 1,6 rem entre paneles:
1. **Encabezado:** logo grande (184 px) a la izquierda; rótulo, título y lema a la derecha.
2. **Lista de visualizaciones:** franja con el título a la izquierda y las pistas como tarjetas en fila.
3. **Escenario en dos columnas:**
   - izquierda: video → controles → atajos de teclado → gráfico;
   - derecha (320–400 px): **descripción** ("Qué pasa ahora") y debajo la **leyenda** ("Qué estás escuchando").
4. **Pie:** créditos en una franja delgada, en línea.

**Móvil y tableta (< 1100 px):** una sola columna, en este orden: encabezado → lista → video, controles y gráfico → descripción → leyenda → pie.
- A ≤ 600 px el encabezado va centrado (logo de 136 px), los controles se apilan, el gráfico baja de 160 a 120 px de alto y los créditos van uno por línea.
- En tableta, el logo mide 148 px.

## 4. Componentes

- **Paneles:**
  - vidrio oscuro al 86 % con desenfoque de 6 px detrás;
  - borde de 1 px blanco al 8 % y esquinas de 16 px;
  - relleno de 1,6 rem (1,1 en móvil);
  - brillo interior de 1 px en el canto superior; no tienen sombras externas.
  - Dentro de un panel no hay más fondos, solo líneas finas: el gráfico y el registro son cajas de borde fino con esquinas de 12 px.
- **Logo:** dentro de un marco de vidrio con 8 px de relleno, esquinas de 30 px y borde de 1 px con el degradado de marca. Lleva un resplandor lila y turquesa (36 y 90 px). La imagen tiene esquinas de 22 px.
- **Botón Reproducir/Pausar:** píldora (radio 100 px) con el degradado pálido y texto negro. Al pasar el ratón aparece un halo lila y turquesa.
- **Barras de progreso y volumen, y casillas:** nativas, en color lila.
- **Lista de pistas:** cada pista es una tarjeta con esquinas de 12 px, con el número en Space Mono, el título y un resumen de 2 líneas. La elegida lleva una barra izquierda de 3 px con el degradado de marca, un tinte lila muy suave, borde fino y el rótulo "ELEGIDA" en lila.
- **Video:** borde fino, esquinas de 12 px y un halo lila suave (24 px).
- **Gráfico (trayectoria u órbita):**
  - curva suave;
  - el tramo por recorrer va punteado en `#7fc9c0`;
  - el tramo recorrido va sólido (2,5 px) con el degradado lila → turquesa;
  - un punto blanco de 10 px con resplandor avanza con el video;
  - la línea dorada marca el momento actual;
  - la referencia es una línea gris punteada;
  - los ejes son líneas de 1 px en `#8d8c9c`.
- **Línea de registro:** caja de borde fino con esquinas de 12 px. A la izquierda va el tiempo en Space Mono turquesa (`00:12`) y a la derecha la frase en texto normal.
- **Teclas (`kbd`):** borde de 1 px `#8d8c9c`, esquinas de 6 px, en Space Mono.

## 5. Efectos decorativos

- **Estrellas:** tres capas en SVG en línea que suben con una leve diagonal (giro de 10°), cada una a su velocidad, lo que da sensación de profundidad:

  | Capa | Tamaño | Cantidad | Una vuelta cada |
  |---|---|---|---|
  | lejana | 0,5 px | muchas | 240 s |
  | media | 0,8–1 px | algunas | 150 s |
  | cercana | 1,2–1,8 px | pocas | 90 s |

  Casi todas son blancas y algunas tienen un tinte lila o turquesa. El fondo no tiene nebulosas.
- **Estrella fugaz:** un trazo blanco tenue cada 40 s.
- **Resplandores:** halo lila alrededor del logo y del video, y el punto del gráfico.
- **Degradados:** solo el degradado de marca (lila → turquesa) y el del botón. Nada de neón.
- **Con "reducir movimiento"** (`prefers-reduced-motion: reduce`): las estrellas quedan quietas pero visibles, la estrella fugaz desaparece y no hay transiciones ni desplazamiento suave. El punto del gráfico se sigue moviendo porque sigue al video, no es decoración.
- **En alto contraste de Windows** se ocultan las estrellas y los degradados pasan a colores del sistema.

## 6. Accesibilidad

- **El texto nunca va sobre las estrellas,** siempre sobre un panel.
- **Contraste AA o mejor**, medido en el peor caso: un panel encima de una estrella blanca. Todo el texto da 5,6:1 o más (6,9:1 fuera de la pista elegida). El gráfico y los bordes de controles dan 4,2:1 o más, y el texto del botón 17,5:1.
- **Foco visible:** anillo blanco de 2 px separado 3 px en todo lo que se usa con teclado. Hay un enlace "Saltar al reproductor".
- **Teclado:** Tab recorre todo en el orden visual, Espacio reproduce o pausa, y ← → mueven 5 s. El clic en el gráfico tiene su equivalente en la barra de progreso.
- **Lector de pantalla:**
  - las estrellas y el punto del gráfico están ocultos al lector (`aria-hidden`);
  - la descripción se anuncia en una región viva;
  - el gráfico tiene un resumen en texto;
  - hay subtítulos opcionales.
- **Verificado con axe-core** (WCAG 2.2 AA): 0 violaciones en escritorio y en móvil.

## 7. Dónde vive cada cosa

| Qué | Archivo y parte |
|---|---|
| Colores, fuentes, tamaños, radios, espaciados | `web/estilos.css`, bloque `:root` |
| Fuentes (`@font-face`) | `web/estilos.css`, inicio del archivo; archivos en `web/assets/fonts/` |
| Valores de contraste medidos | `web/estilos.css`, comentario del inicio |
| Estrellas y estrella fugaz | `web/estilos.css`, sección "cielo" (`.cielo`, `.capa-*`, `.fugaz`, `@keyframes deriva` y `fugaz`); los elementos están al inicio del `<body>` en `web/index.html` |
| Paneles | `web/estilos.css`, sección "paneles" |
| Encabezado y logo | `web/estilos.css`, sección "cabecera"; imágenes en `web/assets/logo-240.jpg` y `logo-480.jpg` |
| Distribución (escritorio y móvil) | `web/estilos.css`, sección "cuadrícula" (`.rejilla`, `@media (min-width: 1100px)`) |
| Lista de pistas, reproductor, gráfico, controles, registro, leyenda, pie | `web/estilos.css`, una sección con ese nombre para cada uno |
| Reducir movimiento y alto contraste | `web/estilos.css`, secciones "movimiento" y "alto contraste forzado", al final |
| Estructura y orden de las secciones | `web/index.html` |
| Curva suave y punto del gráfico | `web/app.js`, sección "gráfico" (`dibujarGrafico`, `pintarCursor`) |
| Capturas | `web/capturas/escritorio.png` y `web/capturas/movil.png` |
