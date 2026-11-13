# Rocola de la Tierra · versión web (Resonant Earth)

> **Esta parte del proyecto (la carpeta `web/`) se hizo con ayuda de IA (Claude Code).**
> **El logo de Resonant Earth (`assets/logo.jpg`) fue generado con IA.**
> La descripción en texto que aparece en la página también es automática y está marcada como "Descripción automática".

Página para elegir una visualización del clima, como en una rocola, y escucharla. Solo usa HTML, CSS y JavaScript puro: no tiene frameworks ni paso de compilación.

## Probarla

```bash
cd web
python -m http.server 8000
```

Abre <http://localhost:8000>. Si la abres con doble clic (`file://`), no carga: necesita un servidor.

Teclado: `Tab` recorre los controles · `Enter` elige · `Espacio` reproduce o pausa · `←` `→` retroceden o avanzan 5 s.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | estructura de la página |
| `estilos.css` | colores, fuentes, foco visible y movimiento reducido |
| `app.js` | catálogo, reproductor, teclado, sincronía y subtítulos |
| `describir.js` | `describir(rasgo, contexto)`: arma el texto de lo que se ve en cada momento |
| `catalogo.json` | lista de visualizaciones |
| `assets/` | videos (mp4 con el audio ya mezclado) y rasgos (.json) |
| `assets/logo.jpg` | logo original (2048 px, generado con IA) |
| `assets/logo-240.jpg`, `icono-64.png`, `icono-180.png` | versiones pequeñas del logo para la cabecera y la pestaña |
| `preparar_datos.py` | genera los archivos de `assets/` con el pipeline de Python |

## Agregar una visualización

Copia sus archivos en `assets/` y suma una entrada a `catalogo.json`. No hace falta tocar el código.

```json
{
  "id": "mi-video",
  "titulo": "Título que se ve en el botón",
  "descripcion": "Una o dos frases sobre qué muestra.",
  "video": "assets/mi_video.mp4",
  "rasgos": "assets/mi_video_rasgos.json",
  "unidad": "°C",
  "leyenda": "Qué significan los colores de este video."
}
```

`unidad` es opcional. Con `#id` en la URL se abre una visualización directa (por ejemplo, `http://localhost:8000/#ejemplo-sintetico`).

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

Cambia solo `describir.js`. La función recibe un rasgo y `{unidad, vmin, vmax, referencia}`, y puede devolver un texto o una `Promise` con el texto. `app.js` usa ese resultado en el panel, en el lector de pantalla y en los subtítulos.

## Accesibilidad

- **Teclado**: todo se usa con teclado, con foco visible y un enlace "Saltar al reproductor".
- **ARIA**: todos los controles tienen etiqueta, y las barras de progreso y volumen anuncian sus valores en palabras.
- **Lector de pantalla**: la descripción se anuncia en una región `aria-live`, como mucho cada 4 s mientras suena y enseguida al pausar o saltar. Se puede apagar con una casilla.
- **Subtítulos**: hay una pista WebVTT generada desde `describir()` que se puede mostrar sobre el video.
- **Colores**: la paleta sale del logo. Fondo azul marino `#08122D`, texto blanco cálido `#FCF9ED`, dorado `#F0CC7D`, menta `#53E8AA` y verde azulado `#4DAFC3`.
- **Contraste**: todos los textos tienen un contraste de 6,3:1 o más (el peor caso es el verde azulado sobre el panel); el texto base es de 20 px.
- **HTML válido**: el validador de la W3C (vnu) y html-validate no encuentran errores.
- **Movimiento**: se respeta `prefers-reduced-motion`.
- **Revisión automática**: axe-core 4.10 (WCAG 2.2 AA y buenas prácticas), en escritorio y móvil, da 0 violaciones. Solo marca como "incompletos" los símbolos decorativos, que no son texto.

El video se descarga entero y se reproduce desde la memoria del navegador. Así se puede saltar a cualquier punto aunque el servidor no acepte peticiones por rangos (`python -m http.server` no las acepta).
