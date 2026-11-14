# Rocola de la Tierra · versión web (Resonant Earth)

> **Esta parte del proyecto (la carpeta `web/`) se hizo con ayuda de IA (Claude Code).**
> **El logo de Resonant Earth (`assets/logo.jpg`) fue generado con IA.** Lleva la marca visible «Generado con IA» escrita dentro de la propia imagen (arriba a la izquierda), así que se conserva si alguien la descarga. El texto alternativo y el pie de la página también lo dicen.
> La descripción en texto que aparece en la página también es automática y está marcada como "Descripción automática".

Página para elegir una visualización del clima, como en una rocola, y escucharla. Solo usa HTML, CSS y JavaScript puro: no tiene frameworks ni paso de compilación.

## Probarla

```bash
cd web
python -m http.server 8000
```

Abre <http://localhost:8000>. Si la abres con doble clic (`file://`), no carga: necesita un servidor.

Teclado: `Tab` recorre los controles · `Enter` elige · `Espacio` reproduce o pausa · `←` `→` retroceden o avanzan 5 s · `?` abre la ayuda.

Con `?lang=en` en la dirección la página abre en inglés (por ejemplo, `http://localhost:8000/?lang=en`).

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | estructura de la página |
| `estilos.css` | colores (tema oscuro y claro), fuentes, distribución, foco visible y movimiento reducido |
| `arranque.js` | pone el idioma y el tema antes de pintar (se carga sin `defer` para que la página no parpadee) y guarda las preferencias en `localStorage` (clave `rocola-preferencias`) |
| `textos.js` | todos los textos de la interfaz en español e inglés: `t("clave")` y `traducirPagina()` |
| `app.js` | catálogo, reproductor, teclado, sincronía, subtítulos, gráfico SVG, momentos clave y preferencias |
| `describir.js` | `describir(rasgo, contexto)`: arma el texto de lo que se ve en cada momento, en los dos idiomas |
| `momentos.js` | calcula los momentos clave de una pista a partir de sus datos (inicio, valor más bajo, más alto, mayor salto, cruce de la referencia, final) |
| `sonidos.js` | los seis ejemplos de sonido de «Qué estás escuchando» (Web Audio) |
| `voz.js` | narración con la voz del navegador (`speechSynthesis`) |
| `catalogo.json` | lista de visualizaciones |
| `assets/` | videos (mp4 con el audio ya mezclado) y rasgos (.json) |
| `assets/logo.jpg` | logo en grande (2048 px, generado con IA, con la marca «Generado con IA») |
| `assets/logo-240.jpg`, `logo-480.jpg` | logo de la portada, con la misma marca (el navegador elige según la densidad de la pantalla) |
| `assets/icono-64.png`, `icono-180.png` | ícono de la pestaña y del acceso directo: un círculo oscuro con una onda de sonido lila → turquesa, dibujado por código (no viene del logo ni de una IA de imágenes) |
| `hacer_icono.py` | dibuja esos dos íconos: `python web/hacer_icono.py` |
| `assets/fonts/` | Unbounded, Plus Jakarta Sans y Space Mono en woff2 (licencia SIL OFL); no depende de internet |
| `GUIA_ESTILO.md` | guía de estilo en una página: paleta, fuentes, distribución, componentes y dónde vive cada cosa |
| `capturas/` | capturas de página completa: `escritorio.png` y `movil.png` (español, tema oscuro) y `escritorio_claro_en.png` (inglés, tema claro) |
| `preparar_datos.py` | genera los archivos de `assets/` con el pipeline de Python |

## Diseño

Variante **"universo-movil"** (rama `estilo-universo-movil`), basada en el estilo espacial.

- **Fondo**: negro puro `#000000`, sin nebulosas.
- **Cielo en movimiento**: tres capas de estrellas en SVG en línea que suben despacio con una leve diagonal. Las de cerca van más rápido que las de lejos, lo que da sensación de profundidad:
  - lejana: puntos de 0,5 px, muchas, una vuelta cada 240 s;
  - media: de 0,8 a 1 px, una vuelta cada 150 s;
  - cercana: de 1,2 a 1,8 px, pocas, una vuelta cada 90 s.

  Casi todas son blancas y algunas tienen un leve tinte violeta (`#cdbfff`) o turquesa (`#a8ece4`). Cada 40 s pasa una estrella fugaz tenue. Todo está en `<div class="cielo" aria-hidden="true">`.
- **Cómo se mueve**: cada capa repite un patrón y se desplaza exactamente un patrón por vuelta con `transform` (lo hace la tarjeta gráfica, sin repintar la página). Por eso el bucle no tiene cortes y no frena el video. La diagonal sale de girar la capa 10°.
- **Movimiento reducido**: con `prefers-reduced-motion: reduce`, las estrellas quedan quietas y visibles y no hay estrella fugaz. En el modo de alto contraste de Windows el cielo se oculta.
- **Armonía con el cielo**: toda la interfaz toma sus colores de las propias estrellas. Blanco `#f5f4fb` para el texto; lila `#cdbfff` como acento (rótulo de marca, pista elegida, barras, casillas, enlaces); turquesa `#a8ece4` como segundo acento. El dorado `#F0CC7D`, como una estrella cálida, va solo en la línea del momento actual del gráfico.
- **Paneles**: vidrio oscuro neutro, `#0a0b12` al 86 % con desenfoque de 6 px, borde fino `rgba(255,255,255,.08)` y un leve brillo en el canto superior. Dentro de los paneles no hay más fondos, solo líneas finas. El texto siempre va sobre un panel, nunca sobre las estrellas.
- **Tema claro**: selector Sistema / Claro / Oscuro en la cabecera. En claro no hay estrellas: cielo pálido del lila al turquesa, paneles blancos y los mismos acentos oscurecidos (lila `#5438c9`, turquesa `#0a6b62`, dorado `#8f5b00`). Solo cambian las variables de color (`html[data-tema="claro"]`).
- **Distribución en escritorio** (≥ 1100 px): franja de pistas (tres en fila); debajo, dos columnas que terminan a la misma altura: a la izquierda el reproductor (título → video → colores del mapa → controles → teclado → explicación → gráfico) y a la derecha «Qué pasa ahora» y «Momentos clave»; después «Qué estás escuchando» a todo el ancho (seis fichas, tres por fila) y la ayuda. En pantallas más chicas todo va en una columna, en el mismo orden.
- **Portada**: el logo mide 152 px en escritorio y 136 px en tableta y móvil (no menos, para que la marca «Generado con IA» se lea). Va en un marco de vidrio con borde en degradado lila → turquesa y un resplandor suave, como un astro, con el título a su lado (o debajo en móvil).
- **Detalles**: el título y la barra de la pista elegida usan el degradado lila → turquesa de las estrellas. El botón de reproducir es una píldora de luz pálida (`#ece8ff` → `#e3f6f2`). El logo y el video tienen un halo lila muy suave. El punto del gráfico es una estrella blanca con resplandor.
- **Tipografía**: cada familia tiene un papel, ubicado en el contexto de la web:
  - **Unbounded** (500 y 600), ancha y geométrica como las letras del logo, es la voz de la marca: el título, los encabezados de sección y los rótulos en mayúsculas espaciadas (como "HEAR THE EARTH" en el logo).
  - **Plus Jakarta Sans** (400 y 600) es para todo lo que se lee, incluido el nombre de cada visualización.
  - **Space Mono** (400 y 700) es para los datos, como la telemetría de una misión: tiempos, ejes y números de pista.
- **Escala de tamaños** (base 20 px): marca 2,3 · título 1,4 · sección 1 · cuerpo 1 · chico 0,85 · dato 0,74 · rótulo 0,64 rem. Todo texto usa uno de esos tamaños.
- **Gráfico como trayectoria**: curva suave (interpolación monótona: pasa por cada dato sin inventar picos). El tramo por recorrer va punteado y el recorrido, en violeta → verde azulado. Un punto avanza con el video y la línea dorada marca el momento actual. Un clic salta a ese momento; con teclado se usa la barra de progreso.

## Agregar una visualización

Copia sus archivos en `assets/` y suma una entrada a `catalogo.json`. No hace falta tocar el código.

```json
{
  "id": "mi-video",
  "titulo": "Título que se ve en el botón",
  "titulo_en": "Title shown on the button",
  "descripcion": "Una o dos frases sobre qué muestra.",
  "descripcion_en": "One or two sentences about what it shows.",
  "video": "assets/mi_video.mp4",
  "rasgos": "assets/mi_video_rasgos.json",
  "unidad": "°C",
  "leyenda": "Qué significan los colores de este video.",
  "leyenda_en": "What the colors of this video mean."
}
```

`unidad` y los campos `_en` son opcionales (sin ellos, en inglés se muestra el texto en español). Con `#id` en la URL se abre una visualización directa (por ejemplo, `http://localhost:8000/#ejemplo-sintetico`).

El archivo de rasgos es el `rasgos.json` del pipeline (`fecha`, `media`, `area`, `centroide_x`…). Cada rasgo puede llevar `t_video`, el segundo del mp4 en que empieza. `preparar_datos.py` lo agrega porque el audio dedica 0,5 s a cada rasgo y el video se estira para durar lo mismo. Si falta `t_video`, se usa `t`.

## Generar los datos

Desde la raíz del proyecto, con el `.venv` activo y ffmpeg instalado:

```bash
python web/preparar_datos.py
```

- Si existen `datos/2023GISTEMP_Map_SOS.mp4` y `salidas/rocola.wav`, crea un mp4 de 1280 px de ancho con ese audio (menos de 30 MB) y lo agrega al catálogo.
- Si no existen, corre el pipeline sintético 04 → 05 → 06 → 08 en una carpeta temporal y copia el resultado. No pisa `salidas/` ni `config/`.

No modifica ningún script del pipeline.

## Reemplazar la descripción por una IA

Cambia solo `describir.js`. La función recibe un rasgo y `{unidad, vmin, vmax, referencia, paneo, idioma}`, y puede devolver un texto o una `Promise` con el texto. `app.js` usa ese resultado en el panel, en el lector de pantalla, en la voz y en los subtítulos.

## Accesibilidad

- **Teclado**: todo se usa con teclado, con foco visible y un enlace "Saltar al reproductor".
- **ARIA**: todos los controles tienen etiqueta, y las barras de progreso y volumen anuncian sus valores en palabras.
- **Lector de pantalla**: la descripción se anuncia en una región `aria-live`, como mucho cada 4 s mientras suena y enseguida al pausar o saltar. Se puede apagar con una casilla.
- **Subtítulos**: hay una pista WebVTT generada desde `describir()` que se puede mostrar sobre el video.
- **Voz**: para quien no usa lector de pantalla, la casilla «Narrar con voz» lee la descripción con la voz del navegador, en el idioma elegido. La música baja al 35 % mientras habla y la voz se calla al pausar.
- **Dos idiomas**: español e inglés en toda la página, incluidos los nombres accesibles, el título de la pestaña, los subtítulos y el resumen del gráfico.
- **Momentos clave**: botones que saltan a los momentos importantes de cada pista; a la vista muestran la fecha y el número, y el lector de pantalla lee la frase completa.
- **Aprender los sonidos**: seis ejemplos cortos («Oír ejemplo») enseñan qué significa cada sonido antes de escuchar una pista.
- **Tacto**: en teléfonos que vibran, una casilla activa una vibración en los cambios bruscos. En pantallas táctiles, todos los controles tienen 44 px de alto o más.
- **Ayuda**: sección «Ayuda» (enlace en la cabecera y tecla `?`, que se puede apagar) con cómo se usa, por qué suena así y qué tan fiel es.
- **Contraste (tema oscuro)**: se mide en el peor caso, con el panel encima de una estrella blanca opaca. Así, todo el texto tiene 5,6:1 o más (6,9:1 o más fuera de la pista elegida). La órbita, la estela y la línea dorada del gráfico tienen 7:1 o más; los ejes y bordes de controles, 4,2:1; el texto del botón, 17,5:1. axe lo confirma al reemplazar el cielo por un color plano (blanco): 0 fallos, mínimo 6,87:1. El texto base es de 20 px.
- **Contraste (tema claro)**: sobre el panel / sobre la pista elegida: texto 17,9 / 15,2; texto secundario 10,9 / 9,3; notas 7,3 / 6,2; lila 7,5 / 6,4; turquesa 6,3 / 5,4; gráfico 5,2 o más; botón 10,1.
- **HTML válido**: el validador de la W3C (vnu) y html-validate no encuentran errores.
- **Movimiento**: se respeta `prefers-reduced-motion`. Las estrellas solo se mueven si el sistema permite animaciones; si no, quedan quietas.
- **Revisión automática**: axe-core 4.10.2 (WCAG 2.2 AA y buenas prácticas), en los dos temas y los dos idiomas, da 0 violaciones. Sin desplazamiento horizontal a 1440, 1100, 768, 390 y 320 px. Marca como "incompleto" el contraste del texto sobre paneles semitransparentes, porque no puede ver el cielo de detrás. Por eso se mide aparte con fondos planos del peor caso (punto anterior).

El video se descarga entero y se reproduce desde la memoria del navegador. Así se puede saltar a cualquier punto aunque el servidor no acepte peticiones por rangos (`python -m http.server` no las acepta).
