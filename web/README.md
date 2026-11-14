# Escucha la Tierra · web de Resonant Earth

> Esta parte del proyecto (la carpeta `web/`) se hizo con ayuda de IA (Claude Code). No usa el logotipo de la NASA ni el logo del equipo generado con IA.

Página única para presentar el proyecto al jurado del NASA Space Apps Challenge 2026 (Quito). Muestra solo las dos pistas reales del pipeline: **GISTEMP** (temperatura del planeta, 1880–2023) y **SST/ECCO2** (temperatura y corrientes del mar, 2007–2008). Es HTML, CSS y JavaScript puro con módulos ES: no hay compilación.

## Probarla

```bash
cd web
python -m http.server 8000
```

Abre <http://localhost:8000>. Con doble clic (`file://`) no carga: necesita un servidor.

## Qué tiene

- **Hero:** globo 3D (Three.js, texturas Blue Marble y Black Marble de NASA) con un anillo de sonido que se deforma con el audio real, órbitas y una atmósfera que brilla con la amplitud.
- **La rocola:** dos tarjetas de pista y un reproductor con visualizador (Web Audio, `AnalyserNode`), gráfico con cursor, lectura en vivo («1976: +0,02 °C respecto al promedio…») y la descripción accesible de cada pista.
- **Cómo funciona, El porqué, Accesibilidad, Equipo y pie.**
- Animaciones con GSAP + ScrollTrigger; con `prefers-reduced-motion` el globo no gira y solo hay fundidos.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html`, `estilos.css` | estructura, textos fijos, tokens de diseño y componentes |
| `pistas.json` | las 2 pistas: textos, rutas, plantilla de la lectura en vivo, resumen del gráfico |
| `equipo.json` | los 5 integrantes (nombres de ejemplo: edítalos) |
| `js/principal.js` | arranque y bucle único de animación |
| `js/audio.js` | cargar, reproducir, volumen, amplitud y espectro |
| `js/rocola.js`, `js/lectura.js`, `js/grafico.js`, `js/visualizador.js` | reproductor y sus partes |
| `js/globo.js`, `js/animaciones.js`, `js/tarjetas.js` | globo 3D, GSAP y brillo del cursor |
| `vendor/` | three, GSAP y ScrollTrigger (ver `vendor/LICENCIAS.md`) |
| `texturas/`, `fotogramas/` | texturas del globo (2048x1024) y fotogramas de las tarjetas |
| `assets/` | mp4 con el audio mezclado, `_rasgos.json`, `_mapeo.json`, `_esperado.json`, `_procedencia.json`, fuentes e íconos |
| `pruebas/verificar.cjs` | pruebas con Playwright y axe |
| `hacer_icono.py` | dibuja los íconos de la pestaña |

## Regenerar los medios desde el pipeline

Los mp4 y los rasgos de `assets/` salen del pipeline, con la misma salida que el demo y con una comprobación de que el audio del mp4 es el de `rocola.wav`:

```bash
python -m herramientas.exportar_web      # mp4, _rasgos.json y _procedencia.json
python -m herramientas.exportar_mapeo    # _mapeo.json y _esperado.json
```

## Cambiar textos

Los textos de cada pista están en `pistas.json`. La frase de la lectura en vivo sale de `lectura.plantilla` con estos marcadores: `{fecha}`, `{valor}`, `{valor_signo}` (con + o −), `{dif_ref_signo}` (diferencia con la referencia) y `{area}` (porcentaje). Los textos fijos de la página están en `index.html`.

## Publicar

- **GitHub Pages:** en el repositorio, Settings → Pages → Source «GitHub Actions». Luego Actions → «Publicar la web» → Run workflow. Queda en <https://misaelvayas-ui.github.io/rocola_practica/>. El flujo solo corre a mano.
- **Vercel:** importa el repositorio, Root Directory `web`, sin comando de compilación.

## Pruebas

Necesitan Node 18 y Playwright, fuera del repositorio:

```bash
mkdir /tmp/verif && cd /tmp/verif && npm init -y && npm i playwright @axe-core/playwright && npx playwright install chromium
cd web && python -m http.server 8137 &
NODE_PATH=/tmp/verif/node_modules node web/pruebas/verificar.cjs http://localhost:8137/ /tmp/capturas
```

El Chromium de Playwright no trae H.264 ni AAC. Para que reproduzca las pistas, convierte los mp4 a webm y pasa `WEBM_DIR` (ver la cabecera de `verificar.cjs`). Lighthouse se corre con `--preset=desktop`.

## Accesibilidad

- Todo se usa con teclado, con foco visible y un enlace «Saltar a la rocola».
- La lectura en vivo (fecha y frase) se actualiza mientras suena y se anuncia en una región `aria-live` como mucho cada 4 s; una casilla la apaga.
- Cada pista trae «Qué se ve y qué se oye» y «Colores del mapa»; el gráfico lleva un resumen en texto.
- Contraste AA o mejor en el peor caso (texto sobre una zona blanca del globo).
- `prefers-reduced-motion` y alto contraste forzado de Windows están contemplados.

## Créditos y licencias

three.js (MIT), GSAP y ScrollTrigger (licencia estándar gratuita de GreenSock, no MIT), texturas Blue Marble y Black Marble de NASA Earth Observatory (dominio público), fuentes Unbounded, Plus Jakarta Sans y Space Mono (SIL OFL), datos de NASA SVS 5207 y 3912. Hecho con ayuda de IA (Claude). No es un sitio oficial de la NASA.
