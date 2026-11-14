/* Rocola de la Tierra — textos de la interfaz en español e inglés.
   t("clave", { dato }) devuelve el texto en el idioma actual y cambia cada {dato} por su valor.
   Los textos largos de la ayuda y de los créditos están en index.html, una vez por idioma
   (bloques con data-solo-idioma). Las frases de "Qué pasa ahora" están en describir.js. */
"use strict";

const TEXTOS = {
  es: {
    "pagina.titulo": "Rocola de la Tierra · Resonant Earth",
    "pagina.descripcion": "Rocola de la Tierra: escucha visualizaciones del clima de la NASA convertidas en sonido.",
    "saltar": "Saltar al reproductor",
    "logo.alt": "Logo de Resonant Earth: la Tierra con auriculares y ondas de sonido, con el lema Hear the Earth. Imagen generada con IA, con la marca «Generado con IA»",
    "cabecera.titulo": "Rocola de la Tierra",
    "cabecera.lema": "Visualizaciones del clima de la NASA convertidas en sonido. Elige una pista y escucha los datos.",
    "ajustes": "Ajustes de la página",
    "ajustes.ayuda": "Ayuda",
    "ajustes.idioma": "Idioma",
    "ajustes.tema": "Tema",
    "tema.sistema": "Sistema",
    "tema.claro": "Claro",
    "tema.oscuro": "Oscuro",

    "rocola.titulo": "Elige una visualización",
    "rocola.cargando": "Cargando el catálogo…",
    "rocola.elegida": "Elegida",
    "rocola.vacio": "El catálogo está vacío. Agrega una entrada en catalogo.json.",
    "rocola.error": "No pude leer el catálogo ({detalle}).",
    "rocola.error-archivo": "No pude leer el catálogo. Abre la página con un servidor: en la carpeta web/ ejecuta «python -m http.server 8000» y entra a http://localhost:8000",

    "reproductor.ninguna": "Ninguna visualización elegida",
    "reproductor.controles": "Controles del reproductor",
    "reproductor.reproducir": "Reproducir",
    "reproductor.pausar": "Pausar",
    "reproductor.completa": "Pantalla completa",
    "reproductor.progreso": "Progreso",
    "reproductor.volumen": "Volumen",
    "reproductor.video": "Video: {titulo}",
    "reproductor.cargando": "Cargando…",
    "reproductor.cargando-video": "Cargando video… {porcentaje} %",
    "reproductor.sin-video": "No pude cargar el video «{archivo}».",
    "reproductor.sin-rasgos": "Esta visualización no tiene archivo de rasgos: no hay descripción en vivo.",
    "reproductor.error-rasgos": "No pude leer los rasgos ({detalle}).",
    "reproductor.elegiste": "Elegiste {titulo}.",
    "reproductor.atajos": "Teclado: <kbd>Espacio</kbd> reproduce o pausa · <kbd><span aria-hidden=\"true\">←</span><span class=\"solo-lector\">flecha izquierda</span></kbd> <kbd><span aria-hidden=\"true\">→</span><span class=\"solo-lector\">flecha derecha</span></kbd> retrocede o avanza 5 segundos · <kbd>Tab</kbd> pasa al siguiente control · <kbd>?</kbd> abre la ayuda.",
    "tiempo.de": "{actual} de {total}",
    "tiempo.minuto": "minuto",
    "tiempo.minutos": "minutos",
    "tiempo.segundo": "segundo",
    "tiempo.segundos": "segundos",

    "grafico.temperatura": "Temperatura media",
    "grafico.valor": "Valor medio",
    "grafico.sin-datos": "Gráfico sin datos todavía.",
    "grafico.referencia": "referencia {valor}",
    "grafico.nota": "clic en el gráfico para saltar",
    "grafico.en-fecha": "en {fecha}",
    "grafico.a-los": "a los {tiempo}",
    "grafico.resumen": "Gráfico de {nombre} a lo largo del video. Empieza en {inicio} {cuandoInicio}, termina en {fin} {cuandoFin} y su máximo es {maximo} {cuandoMaximo}.",

    "momentos.titulo": "Momentos clave",
    "momentos.nota": "Detectados automáticamente a partir de los datos. Pulsa uno para saltar a ese momento.",
    "momentos.inicio": "Inicio",
    "momentos.minimo": "Valor más bajo",
    "momentos.maximo": "Valor más alto",
    "momentos.salto": "Mayor salto",
    "momentos.cruce": "Desde aquí ya no baja de la referencia",
    "momentos.fin": "Final",

    "vivo.titulo": "Qué pasa ahora",
    "vivo.etiqueta": "Descripción automática",
    "vivo.inicial": "Elige una visualización para ver aquí, en palabras, lo que muestra el video en cada momento.",
    "vivo.error": "No se pudo generar la descripción.",
    "vivo.anunciar": "Leer cambios con lector de pantalla (cada pocos segundos)",
    "vivo.subtitulos": "Mostrar la descripción como subtítulos sobre el video",
    "vivo.voz": "Narrar con voz (para quien no usa lector de pantalla)",
    "vivo.vibrar": "Vibrar en los cambios bruscos (teléfonos)",
    "vivo.pista-subtitulos": "Descripción automática",

    "leyenda.titulo": "Qué estás escuchando",
    "leyenda.intro": "Aprende los sonidos antes de escuchar una pista: cada botón toca un ejemplo corto.",
    "leyenda.oir": "Oír ejemplo",
    "leyenda.colores": "Colores de este video: {leyenda}",
    "leyenda.sin-audio": "Este navegador no puede tocar los ejemplos de sonido.",
    "leyenda.tono.dato": "Valor medio (temperatura)",
    "leyenda.tono.sonido": "Altura de la nota: más aguda = más caliente.",
    "leyenda.tono.ejemplo": "Oír ejemplo: cuatro notas, de grave a aguda",
    "leyenda.volumen.dato": "Tamaño de la zona caliente",
    "leyenda.volumen.sonido": "Volumen: más fuerte = más área caliente.",
    "leyenda.volumen.ejemplo": "Oír ejemplo: la misma nota, de suave a fuerte",
    "leyenda.paneo.dato": "Dónde está lo caliente",
    "leyenda.paneo.x": "Izquierda o derecha en el estéreo, igual que en el mapa. Usa auriculares.",
    "leyenda.paneo.y": "Sur a la izquierda y norte a la derecha en el estéreo. Usa auriculares.",
    "leyenda.paneo.ejemplo": "Oír ejemplo: la misma nota a la izquierda, al centro y a la derecha",
    "leyenda.dron.dato": "Valor de referencia",
    "leyenda.dron.sonido": "Tono grave fijo. Si la melodía suena lejos por encima, el dato está por encima de la referencia.",
    "leyenda.dron.ejemplo": "Oír ejemplo: el tono grave fijo, con una nota cerca y otra muy por encima",
    "leyenda.ritmo.dato": "Cuánto calor hay",
    "leyenda.ritmo.sonido": "Ritmo: una, dos o cuatro notas por momento. Más notas = valor más alto.",
    "leyenda.ritmo.ejemplo": "Oír ejemplo: una nota, luego dos, luego cuatro",
    "leyenda.golpe.dato": "Cambio brusco",
    "leyenda.golpe.sonido": "Un golpe más fuerte cuando el valor salta de un momento al siguiente.",
    "leyenda.golpe.ejemplo": "Oír ejemplo: tres notas suaves y un golpe fuerte",

    "ayuda.titulo": "Ayuda",
    "ayuda.atajo": "Usar la tecla ? para abrir esta ayuda",
    "pie.titulo": "Créditos",
    "noscript": "Esta rocola necesita JavaScript activado.",
  },

  en: {
    "pagina.titulo": "Earth Jukebox · Resonant Earth",
    "pagina.descripcion": "Earth Jukebox: listen to NASA climate visualizations turned into sound.",
    "saltar": "Skip to the player",
    "logo.alt": "Resonant Earth logo: the Earth wearing headphones with sound waves, and the motto Hear the Earth. AI-generated image, carrying the visible mark “Generado con IA” (AI-generated)",
    "cabecera.titulo": "Earth Jukebox",
    "cabecera.lema": "NASA climate visualizations turned into sound. Pick a track and listen to the data.",
    "ajustes": "Page settings",
    "ajustes.ayuda": "Help",
    "ajustes.idioma": "Language",
    "ajustes.tema": "Theme",
    "tema.sistema": "System",
    "tema.claro": "Light",
    "tema.oscuro": "Dark",

    "rocola.titulo": "Pick a visualization",
    "rocola.cargando": "Loading the catalog…",
    "rocola.elegida": "Selected",
    "rocola.vacio": "The catalog is empty. Add an entry to catalogo.json.",
    "rocola.error": "I could not read the catalog ({detalle}).",
    "rocola.error-archivo": "I could not read the catalog. Open the page through a server: in the web/ folder run “python -m http.server 8000” and go to http://localhost:8000",

    "reproductor.ninguna": "No visualization selected",
    "reproductor.controles": "Player controls",
    "reproductor.reproducir": "Play",
    "reproductor.pausar": "Pause",
    "reproductor.completa": "Full screen",
    "reproductor.progreso": "Progress",
    "reproductor.volumen": "Volume",
    "reproductor.video": "Video: {titulo}",
    "reproductor.cargando": "Loading…",
    "reproductor.cargando-video": "Loading video… {porcentaje}%",
    "reproductor.sin-video": "I could not load the video “{archivo}”.",
    "reproductor.sin-rasgos": "This visualization has no features file: there is no live description.",
    "reproductor.error-rasgos": "I could not read the features ({detalle}).",
    "reproductor.elegiste": "You picked {titulo}.",
    "reproductor.atajos": "Keyboard: <kbd>Space</kbd> plays or pauses · <kbd><span aria-hidden=\"true\">←</span><span class=\"solo-lector\">left arrow</span></kbd> <kbd><span aria-hidden=\"true\">→</span><span class=\"solo-lector\">right arrow</span></kbd> go back or forward 5 seconds · <kbd>Tab</kbd> moves to the next control · <kbd>?</kbd> opens the help.",
    "tiempo.de": "{actual} of {total}",
    "tiempo.minuto": "minute",
    "tiempo.minutos": "minutes",
    "tiempo.segundo": "second",
    "tiempo.segundos": "seconds",

    "grafico.temperatura": "Average temperature",
    "grafico.valor": "Average value",
    "grafico.sin-datos": "Chart with no data yet.",
    "grafico.referencia": "reference {valor}",
    "grafico.nota": "click the chart to jump",
    "grafico.en-fecha": "in {fecha}",
    "grafico.a-los": "at {tiempo}",
    "grafico.resumen": "Chart of {nombre} along the video. It starts at {inicio} {cuandoInicio}, ends at {fin} {cuandoFin} and its maximum is {maximo} {cuandoMaximo}.",

    "momentos.titulo": "Key moments",
    "momentos.nota": "Detected automatically from the data. Press one to jump to that moment.",
    "momentos.inicio": "Start",
    "momentos.minimo": "Lowest value",
    "momentos.maximo": "Highest value",
    "momentos.salto": "Biggest jump",
    "momentos.cruce": "From here on it never drops below the reference",
    "momentos.fin": "End",

    "vivo.titulo": "What is happening now",
    "vivo.etiqueta": "Automatic description",
    "vivo.inicial": "Pick a visualization to read here, in words, what the video shows at each moment.",
    "vivo.error": "The description could not be generated.",
    "vivo.anunciar": "Read changes with a screen reader (every few seconds)",
    "vivo.subtitulos": "Show the description as captions over the video",
    "vivo.voz": "Narrate with a voice (for people who do not use a screen reader)",
    "vivo.vibrar": "Vibrate on sudden changes (phones)",
    "vivo.pista-subtitulos": "Automatic description",

    "leyenda.titulo": "What you are hearing",
    "leyenda.intro": "Learn the sounds before you listen to a track: each button plays a short example.",
    "leyenda.oir": "Hear an example",
    "leyenda.colores": "Colors in this video: {leyenda}",
    "leyenda.sin-audio": "This browser cannot play the sound examples.",
    "leyenda.tono.dato": "Average value (temperature)",
    "leyenda.tono.sonido": "Pitch of the note: higher = warmer.",
    "leyenda.tono.ejemplo": "Hear an example: four notes, from low to high",
    "leyenda.volumen.dato": "Size of the hot area",
    "leyenda.volumen.sonido": "Loudness: louder = a larger hot area.",
    "leyenda.volumen.ejemplo": "Hear an example: the same note, from soft to loud",
    "leyenda.paneo.dato": "Where the heat is",
    "leyenda.paneo.x": "Left or right in stereo, the same as on the map. Use headphones.",
    "leyenda.paneo.y": "South on the left and north on the right in stereo. Use headphones.",
    "leyenda.paneo.ejemplo": "Hear an example: the same note on the left, in the centre and on the right",
    "leyenda.dron.dato": "Reference value",
    "leyenda.dron.sonido": "A steady low tone. If the melody sounds far above it, the data is above the reference.",
    "leyenda.dron.ejemplo": "Hear an example: the steady low tone, with one note close to it and one far above",
    "leyenda.ritmo.dato": "How much heat there is",
    "leyenda.ritmo.sonido": "Rhythm: one, two or four notes per moment. More notes = a higher value.",
    "leyenda.ritmo.ejemplo": "Hear an example: one note, then two, then four",
    "leyenda.golpe.dato": "Sudden change",
    "leyenda.golpe.sonido": "A stronger hit when the value jumps from one moment to the next.",
    "leyenda.golpe.ejemplo": "Hear an example: three soft notes and one strong hit",

    "ayuda.titulo": "Help",
    "ayuda.atajo": "Use the ? key to open this help",
    "pie.titulo": "Credits",
    "noscript": "This jukebox needs JavaScript turned on.",
  },
};

let idiomaActual = IDIOMAS.includes(document.documentElement.lang) ? document.documentElement.lang : "es";

function t(clave, datos = {}) {
  const texto = TEXTOS[idiomaActual][clave] ?? TEXTOS.es[clave] ?? clave;
  return texto.replace(/\{(\w+)\}/g, (todo, nombre) => (nombre in datos ? String(datos[nombre]) : todo));
}

/* Campo de una entrada del catálogo en el idioma actual: "titulo_en" si existe, si no "titulo". */
function campoCatalogo(entrada, nombre) {
  return (idiomaActual !== "es" && entrada[`${nombre}_${idiomaActual}`]) || entrada[nombre] || "";
}

/* Aplica el idioma a todo lo que está escrito en index.html:
     data-i18n="clave"              -> texto del elemento
     data-i18n-html="clave"         -> HTML del elemento (solo textos propios de este archivo)
     data-i18n-attr="atributo:clave; otro:clave"
     data-solo-idioma="es"          -> bloque visible solo en ese idioma */
function traducirPagina() {
  document.documentElement.lang = idiomaActual;
  document.title = t("pagina.titulo");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("pagina.descripcion"));
  for (const e of document.querySelectorAll("[data-i18n]")) e.textContent = t(e.dataset.i18n);
  for (const e of document.querySelectorAll("[data-i18n-html]")) e.innerHTML = t(e.dataset.i18nHtml);
  for (const e of document.querySelectorAll("[data-i18n-attr]")) {
    for (const par of e.dataset.i18nAttr.split(";")) {
      const [atributo, clave] = par.split(":").map((x) => x.trim());
      if (atributo && clave) e.setAttribute(atributo, t(clave));
    }
  }
  for (const e of document.querySelectorAll("[data-solo-idioma]")) e.hidden = e.dataset.soloIdioma !== idiomaActual;
}
