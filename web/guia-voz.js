/* Resonant Earth — guía por voz que ESCUCHA (JavaScript puro, sin servicios propios).

   Cuatro partes, en este orden:
     A. interpretarComando(texto) -> acción.  Función pura: no toca la página (se prueba con Node).
     B. Reconocimiento de voz del navegador (SpeechRecognition / webkitSpeechRecognition, es-EC y es-ES).
     C. Respuestas: por voz (speechSynthesis) O por escrito para el lector de pantalla. Nunca las dos.
     D. Panel de la guía (se crea aquí, no está en index.html) y conexión con el reproductor.

   El reproductor solo se toca a través de window.GuiaVozAdaptador (guia-voz-adaptador.js).
   Si ese objeto no existe, la guía no se monta y la página funciona igual que sin ella.

   Dos idiomas, español e inglés, SOLO en la guía (la web no se traduce): interpretarES / interpretarEN devuelven
   los mismos tipos de acción, y los textos están en L (respuestas) y U (tarjeta).
   Por voz primero: al abrirla saluda y escucha; tras cada respuesta vuelve a escuchar unos segundos; la tarjeta
   solo muestra un subtítulo con lo último que dijo, un botón "Escribir" y "Ayuda y opciones".

   Conversación con IA (opcional): si está cargado guia-voz-ia.js y hay un servicio configurado, atender()
   le pasa primero la frase. Si la IA no responde (o no existe), sigue por aquí, con los comandos de siempre.

   Ideas tomadas de compañeros (ver web/README.md): de voice-guide.js (Roberth) la elección de voz y
   velocidad, guardar la frase en curso y el texto equivalente; de voz.js (rama mejora/auditoria-clean-code)
   el "turno" que descarta frases canceladas, bajar la música mientras se habla y ocultar lo que el
   navegador no tiene. */
(function (raiz, fabrica) {
  "use strict";
  const api = fabrica();
  if (typeof module === "object" && module.exports) module.exports = api;       // pruebas con Node
  else {
    raiz.GuiaVoz = api;
    if (raiz.document) {
      const guion = raiz.document.currentScript;
      const montar = () => { try { api.montar(raiz.GuiaVozAdaptador, raiz.document, guion && guion.src); } catch (e) { console.warn("Guía por voz: no se pudo iniciar.", e); } };
      if (raiz.document.readyState === "loading") raiz.document.addEventListener("DOMContentLoaded", montar);
      else montar();
    }
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ================================================================== A. intérprete de comandos */

  const UNIDADES = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
    nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
    veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
  const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
  const CENTENAS = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
    seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
  const ORDINALES = { primer: 1, primera: 1, primero: 1, segunda: 2, segundo: 2, tercer: 3, tercera: 3, tercero: 3,
    cuarta: 4, cuarto: 4, quinta: 5, quinto: 5, ultima: -1, ultimo: -1 };
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const CORTESIA = /\b(por favor|porfavor|porfa|oye|hola|gracias|guia|rocola|quiero que|quisiera que|puedes|podrias|necesito que|ahora)\b/g;

  /* "Mil novecientos noventa" -> "1990", "treinta y cinco" -> "35". Recibe y devuelve palabras sueltas. */
  function palabrasANumeros(palabras) {
    const salida = [];
    let total = 0, actual = 0, dentro = false, ultimaDecena = false;
    const cerrar = () => { if (dentro) salida.push(String(total + actual)); total = 0; actual = 0; dentro = false; ultimaDecena = false; };
    for (let i = 0; i < palabras.length; i++) {
      const p = palabras[i];
      const articulo = (p === "un" || p === "una") && !dentro && !/^(minutos?|segundos?|mil)$/.test(palabras[i + 1] || "");
      if (articulo) { cerrar(); salida.push(p); }                       // "pon una pista": no es el número 1
      else if (p in UNIDADES) { actual += UNIDADES[p]; dentro = true; ultimaDecena = false; }
      else if (p in DECENAS) { actual += DECENAS[p]; dentro = true; ultimaDecena = true; }
      else if (p in CENTENAS) { actual += CENTENAS[p]; dentro = true; ultimaDecena = false; }
      else if (p === "mil") { total += (actual || 1) * 1000; actual = 0; dentro = true; ultimaDecena = false; }
      else if (p === "y" && dentro && ultimaDecena && palabras[i + 1] in UNIDADES) { /* "treinta Y cinco" */ }
      else { cerrar(); salida.push(p); }
    }
    cerrar();
    return salida;
  }

  /* Minúsculas, sin tildes ni signos, números en cifras y sin palabras de cortesía. */
  function normalizar(texto) {
    let s = String(texto == null ? "" : texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/(\d)[.,](\d{3})\b/g, "$1$2")                         // 1.990 -> 1990
         .replace(/\b(\d{1,2}):(\d{2})\b/g, "$1 minutos $2 segundos")   // 1:30
         .replace(/[^a-z0-9 ]+/g, " ")
         .replace(CORTESIA, " ")
         .replace(/\bun poco\b/g, "poco")
         .replace(/\bmedio minuto\b/g, "30 segundos")
         .replace(/\s+/g, " ").trim();
    s = palabrasANumeros(s.split(" ")).join(" ");
    s = s.replace(/\b(\d+) minutos? y medio\b/g, (_, n) => `${Number(n) * 60 + 30} segundos`)
         .replace(/\bminuto y medio\b/g, "90 segundos");
    return s.trim();
  }

  /* Un tiempo dentro de la frase. absoluto = "segundo 10" (posición); si no, "10 segundos" (duración). */
  function tiempoEn(s) {
    let m = /\b(minuto|segundo)\s+(\d+)(?:\s+(?:y\s+|con\s+)?(\d+)(?:\s+segundos?)?)?/.exec(s);
    if (m) return { seg: m[1] === "minuto" ? Number(m[2]) * 60 + Number(m[3] || 0) : Number(m[2]), absoluto: true };
    m = /\b(\d+)\s*(?:minutos?|min)\b(?:\s*(?:y|con)?\s*(\d+)\s*(?:segundos?|segs?|s)\b)?/.exec(s);
    if (m) return { seg: Number(m[1]) * 60 + Number(m[2] || 0), absoluto: false };
    m = /\b(\d+)\s*(?:segundos?|segs?|s)\b/.exec(s);
    if (m) return { seg: Number(m[1]), absoluto: false };
    return null;
  }

  /* Texto (lo que dijo o escribió la persona) -> acción { tipo, ... }. No toca la página. */
  function interpretarES(texto) {
    const s = normalizar(texto);
    if (!s) return { tipo: "nada" };
    if (/qu[eé] (puedes|sabes) (hacer|decir)|qu[eé] (te )?puedo (decir|pedir|preguntar)/i.test(String(texto))) return { tipo: "ayuda" };
    const hay = (re) => re.test(s);

    // idioma de la guía y lector de pantalla
    if (hay(/\b(ingles|english)\b/)) return { tipo: "idioma", idioma: "en" };
    if (hay(/\b(espanol|castellano|spanish)\b/)) return { tipo: "idioma", idioma: "es" };
    if (hay(/^(si )?(yo )?(no )?(uso|utilizo|tengo|estoy usando)\b.*\blector\b/)) return { tipo: "lector", usa: !hay(/\bno\b/) };

    // respuestas a "¿usas lector de pantalla?"
    if (hay(/^(si|claro|claro que si|afirmativo|correcto|si uso( un)?( lector)?( de pantalla)?|uso( un)? lector( de pantalla)?)$/)) return { tipo: "afirmar" };
    if (hay(/^(no|negativo|no uso( un)?( lector)?( de pantalla)?|no gracias)$/)) return { tipo: "negar" };

    if (hay(/\b(ayuda|ayudame|comandos|instrucciones|opciones|que (puedo|se puede) (decir|hacer|pedir)|que (puedes|sabes) hacer|como (te|se) usa\w*)\b/)) return { tipo: "ayuda" };
    if (hay(/\b(calla|callate|silencio|deja de hablar|no hables|shh+)\b/)) return { tipo: "callar" };

    // ---- "no entendí", "repite", "más simple", "otra vez": con IA se reformula; sin IA se repite más despacio
    if (hay(/\b(no (te |lo |le )?(entendi|entiendo|comprendi|comprendo|escuche|oi)|mas (simple|sencill\w+|facil|claro|despacio|lento)|repite\w*|repetir|repitelo|otra vez|de nuevo|como dijiste|que dijiste)\b/) &&
        !hay(/\b(reprodu\w+|pon\w*|toca|empieza|reinicia\w*|desde)\b/)) return { tipo: "repetir" };

    // ---- preguntas sobre la web (qué es, cómo funciona, por qué, accesibilidad, equipo)
    if (hay(/\bque es (esta (pagina|web)|este (sitio|proyecto|lugar)|resonant earth)\b|\bde que (trata|va)\b|\bpara que sirve\b|\bque hace esta (pagina|web)\b/)) return { tipo: "sobre_web", tema: "proyecto" };
    if (hay(/\bcomo funciona\b|\bcomo (lo )?(hacen|hicieron|hacemos|convierten|se convierte|se hace|se hizo)\b|\bpipeline\b/)) return { tipo: "sobre_web", tema: "como_funciona" };
    if (hay(/^por que (escuchar|sonificar|convertir|hacer|hicieron|lo hicieron|existe|musica|usar sonido|con sonido)\b/)) return { tipo: "sobre_web", tema: "por_que" };
    if (hay(/\b(accesib\w+|cieg[ao]s?|sord[ao]s?|sin (ver|raton|pantalla)|baja vision)\b/)) return { tipo: "sobre_web", tema: "accesibilidad" };
    if (hay(/\b(equipo|quien(es)? (lo |la )?(hizo|hicieron|creo|crearon|son|eres|esta detras)|autores|creadores|integrantes)\b/)) return { tipo: "sobre_web", tema: "equipo" };

    // ---- recorrido guiado, "por qué sube el tono" y "el año más cálido"
    if (hay(/\b(recorrido|tour|visita guiada|paseo guiado)\b/)) {
      return { tipo: hay(/\b(deten\w*|para|parar|paralo|termina\w*|cancela\w*|salir|sal|basta|stop|quita\w*|no quiero)\b/) ? "detener_recorrido" : "recorrido" };
    }
    const porQue = hay(/^(por que|como es que|a que se debe)\b/);
    if (porQue && hay(/\b(tono|agud\w+|grave\w*|notas?|melodia|sube|baja|suena|sonido|cambia)\b/)) return { tipo: "explicar_tono" };
    if (!porQue) {
      const punto = hay(/\b(ano|anos|momento|punto|mes|fecha|dia|valor|temperatura|indice|parte|nota)\b/);
      if (hay(/\bmas (calid\w+|calient\w+|caluros\w+)\b|\b(mayor|mas) calor\b/) || (punto && hay(/\b(mas alt\w+|maxim\w+|pico)\b/))) return { tipo: "saltar_extremo", cual: "max" };
      if (hay(/\bmas (fri\w+|fresc\w+|helad\w+)\b|\bmenos calor\b/) || (punto && hay(/\b(mas baj\w+|minim\w+)\b/))) return { tipo: "saltar_extremo", cual: "min" };
    }

    // ---- saltos: lo más concreto primero (llevan números)
    const atras = hay(/\b(retrocede\w*|atras|regresa\w*|devuelve\w*|rebobina\w*)\b/);
    const adelante = hay(/\b(avanza\w*|adelanta\w*|adelante)\b/) || (hay(/\bsalta\w*\b/) && !hay(/\b(a|al|hasta)\b/));
    if (hay(/\b(reinicia\w*|desde (el )?(principio|inicio|comienzo|cero)|empieza de nuevo)\b/) ||
        (hay(/\b(al|el) (principio|inicio|comienzo)\b/))) return { tipo: "inicio" };
    if (hay(/\b(al|hasta el) final\b/) && s.split(" ").length <= 5) return { tipo: "final" };   // una frase larga con "el final" es una pregunta

    let m = new RegExp(`\\b(${MESES.join("|")}|set)[a-z]*\\s+(?:de\\s+|del\\s+)?(\\d{4})\\b`).exec(s);
    if (m) return { tipo: "saltar_anio", anio: Number(m[2]), mes: m[1] === "set" ? 9 : MESES.indexOf(m[1]) + 1 };
    m = /\b(?:ano|anio|anos|ao)\s+(?:de\s+|del\s+)?(\d{2,4})\b/.exec(s);
    if (m) return { tipo: "saltar_anio", anio: Number(m[1]) };

    const t = tiempoEn(s);
    if (t) {
      if (t.absoluto) return { tipo: "saltar_tiempo", segundos: t.seg };
      if (atras) return { tipo: "saltar_relativo", segundos: -t.seg };
      if (adelante) return { tipo: "saltar_relativo", segundos: t.seg };
      return { tipo: "saltar_tiempo", segundos: t.seg };                 // "diez segundos", "ve a los 10 segundos"
    }
    m = /\b(1[0-9]{3}|2[0-9]{3})\b/.exec(s);                              // un año suelto: "1990", "ve al 1990"
    if (m && !hay(/\b(pista|video|volumen|numero)\b/)) return { tipo: "saltar_anio", anio: Number(m[1]) };

    // una pregunta ("por qué suena…", "cómo subo…") no es una orden: no mueve el volumen ni el reproductor
    const pregunta = hay(/^(por que|para que|que|como|cual|cuales|cuando|cuanto|cuanta|cuantos|cuantas|donde|quien)\b/);

    // ---- volumen
    if (!pregunta && hay(/\bvolumen\b/) && (m = /\b(\d{1,3})\b/.exec(s))) return { tipo: "volumen", valor: Math.min(100, Number(m[1])) };
    if (!pregunta && hay(/\b(sube|subir|subele|aumenta\w*|mas (fuerte|alto|volumen|duro))\b/)) return { tipo: "volumen", delta: 20 };
    if (!pregunta && hay(/\b(baja|bajar|bajale|disminuye|menos volumen|mas (bajo|bajito|suave))\b/)) return { tipo: "volumen", delta: -20 };

    // ---- pistas
    if (hay(/\b(que|cuales|cuantas|cuantos) (pistas|videos|visualizaciones|canciones)\b|\b(lista|listar|catalogo|menu)\b/)) return { tipo: "pistas" };
    m = /\b(?:pista|video|visualizacion|cancion|tema|numero)\s+(?:numero\s+)?(\d+)\b/.exec(s);
    if (m) return { tipo: "elegir", numero: Number(m[1]) };
    m = /\b(primer[ao]?|segund[ao]|tercer[ao]?|cuart[ao]|quint[ao]|ultim[ao])\s+(?:pista|video|visualizacion|cancion)\b/.exec(s) ||
        /\b(?:pista|video|visualizacion|cancion)\s+(primer[ao]|segund[ao]|tercer[ao]|cuart[ao]|quint[ao]|ultim[ao])\b/.exec(s) ||
        /^(?:pon |elige |quiero )?la (primera|segunda|tercera|cuarta|quinta|ultima)$/.exec(s);
    if (m) return { tipo: "elegir", numero: ORDINALES[m[1]] };
    if (hay(/\b(siguiente|proxim[ao]|otra pista|otro video|next|cambia\w* (de )?(pista|video)|pasa\w* (de |la )?pista)\b/)) return { tipo: "siguiente" };
    if (hay(/\b(anterior|previ[ao]|la de antes)\b/)) return { tipo: "anterior" };

    // ---- saltos sin unidad ("retrocede 5") o sin número ("avanza")
    if ((atras || adelante) && !pregunta) {
      m = /\b(\d{1,3})\b/.exec(s);
      return { tipo: "saltar_relativo", segundos: (adelante ? 1 : -1) * (m ? Number(m[1]) : 10) };
    }

    // ---- leer
    if (hay(/\b(leyendas?|llenda|colores|color)\b/)) return { tipo: "leyenda" };
    if (hay(/\b(que (estoy|estamos|estas|se esta) (escuchando|oyendo)|que (oigo|escucho|suena|es (esto|eso|ese sonido))|lo que (oigo|escucho|suena)|explica\w*)\b/)) return { tipo: "explicar" };
    if (hay(/\b(que significa\w*|como se (lee|escucha|entiende))\b/)) return { tipo: "leyenda" };
    if (hay(/\b(donde (estoy|vamos|voy|va)|que pista (es|suena|esta)|cual (pista|es la pista)|cuanto (falta|queda|lleva)|en que (segundo|minuto|momento|parte))\b/)) return { tipo: "donde" };
    if (hay(/\b(descri\w+|que (pasa|esta pasando|sucede|ocurre|se ve|muestra|hay)|cuentame|dime que|lee\w*|como va|que ano es|en que ano)\b/)) return { tipo: "descripcion" };
    if (hay(/\b(repite|repetir|repitelo|otra vez|de nuevo|como dijiste)\b/) && !hay(/\b(reprodu\w+|pon\w*|toca)\b/)) return { tipo: "repetir" };

    // ---- reproducir y pausar
    if (pregunta) return { tipo: "desconocido", texto: s };
    if (hay(/\bno (pares|pauses|te detengas|detengas)\b/)) return { tipo: "reproducir" };
    if (hay(/\b(pausa\w*|pause|posa|para|parar|paralo|parale|detente|deten\w*|alto|stop|espera|basta|quieto)\b/)) return { tipo: "pausar" };
    m = /\b(?:pon|ponme|pone|elige|escoge|selecciona|abre|busca|quiero (?:oir|escuchar|ver)|quiero)\s+(.+)$/.exec(s);
    if (m && !/^(?:la |el |un |una )?(?:musica|sonido|video|pista|cancion|play|reproduccion|audio)$/.test(m[1])) {
      return { tipo: "elegir", nombre: m[1].replace(/^(?:la pista|el video|la visualizacion|la|el|los|las|de|del)\s+/, "") };
    }
    if (hay(/\b(reprodu\w+|play|plei|pley|dale|inicia\w*|empieza|empezar|comienza|comenzar|arranca|continua\w*|sigue|seguir|reanuda\w*|suena|sonar|toca|tocar|escuchar|oir|pon\w*)\b/)) return { tipo: "reproducir" };

    return { tipo: "desconocido", texto: s };
  }

  /* ================================================================== A2. intérprete de comandos en inglés */

  const UNIDADES_EN = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
    twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const DECENAS_EN = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const MESES_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const MESES_EN_LARGO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const ORDINALES_EN = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };
  const CORTESIA_EN = /\b(please|hey|hi|hello|thanks|thank you|guide|can you|could you|would you|i want you to|i would like you to|now)\b/g;

  /* "nineteen ninety" -> "1990", "two thousand seven" -> "2007", "thirty five" -> "35". */
  function palabrasANumerosEN(palabras) {
    const salida = [];
    const esNumero = (p) => p in UNIDADES_EN || p in DECENAS_EN;
    let i = 0;
    const trozo = () => {                              // "thirty five", "nineteen" o "seven"
      const p = palabras[i];
      if (p in DECENAS_EN) { let v = DECENAS_EN[p]; i++; const u = UNIDADES_EN[palabras[i]]; if (u > 0 && u < 10) { v += u; i++; } return v; }
      if (p in UNIDADES_EN) { i++; return UNIDADES_EN[p]; }
      return null;
    };
    const resto = () => { if (palabras[i] === "and" && esNumero(palabras[i + 1])) i++; const v = esNumero(palabras[i]) ? trozo() : null; return v || 0; };
    while (i < palabras.length) {
      if (!esNumero(palabras[i])) { salida.push(palabras[i++]); continue; }
      const v = trozo();
      if (palabras[i] === "thousand") { i++; let t = v * 1000, h = resto(); if (h && palabras[i] === "hundred") { i++; h = h * 100 + resto(); } salida.push(String(t + h)); continue; }
      if (palabras[i] === "hundred") { i++; salida.push(String(v * 100 + resto())); continue; }
      if (v >= 10 && esNumero(palabras[i])) { const j = i, w = trozo(); if (w >= 10) { salida.push(String(v * 100 + w)); continue; } i = j; }   // "nineteen ninety"
      salida.push(String(v));
    }
    return salida;
  }

  function normalizarEN(texto) {
    let s = String(texto == null ? "" : texto).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/\bcan't\b/g, "can not").replace(/n't\b/g, " not").replace(/\bwhat's\b/g, "what is").replace(/\bwhere's\b/g, "where is").replace(/\bi'm\b/g, "i am")
         .replace(/(\d),(\d{3})\b/g, "$1$2")
         .replace(/\b(\d{1,2}):(\d{2})\b/g, "$1 minutes $2 seconds")
         .replace(/[^a-z0-9 ]+/g, " ")
         .replace(CORTESIA_EN, " ")
         .replace(/\bhalf a minute\b/g, "30 seconds")
         .replace(/\s+/g, " ").trim();
    return palabrasANumerosEN(s.split(" ")).join(" ").trim();
  }

  function tiempoEnEN(s) {
    let m = /\b(minute|second)\s+(\d+)(?:\s+(?:and\s+)?(\d+)(?:\s+seconds?)?)?/.exec(s);
    if (m) return { seg: m[1] === "minute" ? Number(m[2]) * 60 + Number(m[3] || 0) : Number(m[2]), absoluto: true };
    m = /\b(\d+)\s*(?:minutes?|min)\b(?:\s*(?:and)?\s*(\d+)\s*(?:seconds?|secs?|s)\b)?/.exec(s);
    if (m) return { seg: Number(m[1]) * 60 + Number(m[2] || 0), absoluto: false };
    m = /\b(\d+)\s*(?:seconds?|secs?|s)\b/.exec(s);
    if (m) return { seg: Number(m[1]), absoluto: false };
    return null;
  }

  /* Lo mismo que interpretarES, para frases en inglés. Devuelve los MISMOS tipos de acción. */
  function interpretarEN(texto) {
    const s = normalizarEN(texto);
    if (!s) return { tipo: "nada" };
    if (/what can (you|i) (do|say|ask)/i.test(String(texto))) return { tipo: "ayuda" };
    const hay = (re) => re.test(s);
    const palabras = s.split(" ").length;

    if (hay(/\b(spanish|espanol|castellano)\b/)) return { tipo: "idioma", idioma: "es" };
    if (hay(/\b(english|ingles)\b/)) return { tipo: "idioma", idioma: "en" };
    if (hay(/^(yes )?i (do not |never )?(use|have|am using)\b.*\bscreen ?reader\b/)) return { tipo: "lector", usa: !hay(/\b(not|never)\b/) };

    if (hay(/\b(help|what can (you|i) (do|say|ask)|commands|instructions|what do you do)\b/)) return { tipo: "ayuda" };
    if (hay(/\b(quiet|silence|shut up|stop talking|be quiet|hush|mute yourself)\b/)) return { tipo: "callar" };
    if (hay(/\b(repeat|say (that|it) again|one more time|once more|(did|do) not (understand|get|catch|hear)|simpler|more simply|simple (words|terms)|easier|slower|more slowly|pardon|what did you say|come again)\b/) ||
        hay(/^(again|sorry|what|huh)$/)) return { tipo: "repetir" };

    if (hay(/\b(tour|walkthrough|walk me through|show me around|guided visit)\b/)) {
      return { tipo: hay(/\b(stop|end|cancel|quit|exit|enough|no more)\b/) ? "detener_recorrido" : "recorrido" };
    }
    // sobre la web
    if (hay(/\bwhat is (this|that|it|resonant earth|this (page|site|website|project|place))( about)?$|\bwhat is this (page|site|website|project)\b|\bwhat is resonant earth\b|\bwhat does this (page|site|website) do\b/)) return { tipo: "sobre_web", tema: "proyecto" };
    if (hay(/\bhow does (it|this|that|the (site|page|website|project)) work\b|\bhow (is|was) (it|this) (made|built|done)\b|\bhow do you (make|turn|convert)\b|\bpipeline\b/)) return { tipo: "sobre_web", tema: "como_funciona" };
    if (hay(/^why (listen|sonif\w+|turn|make|did you|do you|music|use sound|does this exist)\b/)) return { tipo: "sobre_web", tema: "por_que" };
    if (hay(/\b(accessib\w+|blind|deaf|without (a )?(mouse|screen)|low vision)\b/)) return { tipo: "sobre_web", tema: "accesibilidad" };
    if (hay(/\b(team|who (made|built|created|is behind|are you|did) |authors|creators|who made)\b/)) return { tipo: "sobre_web", tema: "equipo" };

    const porQue = hay(/^(why|how come)\b/);
    if (porQue && hay(/\b(pitch|tone|high\w*|low\w*|notes?|melody|ris\w+|go(es)? up|go(es)? down|sounds?|chang\w+)\b/)) return { tipo: "explicar_tono" };
    if (!porQue && !hay(/\bvolume\b/)) {
      if (hay(/\b(warmest|hottest|highest|peak|maximum|record high)\b/)) return { tipo: "saltar_extremo", cual: "max" };
      if (hay(/\b(coldest|coolest|lowest|minimum)\b/)) return { tipo: "saltar_extremo", cual: "min" };
    }

    const atras = hay(/\b(back|backward|backwards|rewind)\b/) && !hay(/\btrack\b/);
    const adelante = hay(/\b(forward|ahead|advance|skip)\b/) && !hay(/\btrack\b/);
    if (hay(/\b(restart|start over|start again|from the (beginning|start|top)|to the (beginning|start)|the beginning)\b/)) return { tipo: "inicio" };
    if (hay(/\b(to|near) the end\b/) && palabras <= 6) return { tipo: "final" };

    let m = new RegExp(`\\b(${MESES_EN.join("|")})[a-z]*\\s+(?:of\\s+)?(\\d{4})\\b`).exec(s);
    if (m) return { tipo: "saltar_anio", anio: Number(m[2]), mes: MESES_EN.indexOf(m[1]) + 1 };
    m = /\byear\s+(?:of\s+)?(\d{2,4})\b/.exec(s);
    if (m) return { tipo: "saltar_anio", anio: Number(m[1]) };

    const t = tiempoEnEN(s);
    if (t) {
      if (t.absoluto) return { tipo: "saltar_tiempo", segundos: t.seg };
      if (atras) return { tipo: "saltar_relativo", segundos: -t.seg };
      if (adelante) return { tipo: "saltar_relativo", segundos: t.seg };
      return { tipo: "saltar_tiempo", segundos: t.seg };
    }
    m = /\b(1[0-9]{3}|2[0-9]{3})\b/.exec(s);
    if (m && !hay(/\b(track|video|volume|number)\b/)) return { tipo: "saltar_anio", anio: Number(m[1]) };

    const pregunta = hay(/^(why|what|how|which|when|where|who|is|are|does|do|can)\b/);

    if (!pregunta && hay(/\bvolume\b/) && (m = /\b(\d{1,3})\b/.exec(s))) return { tipo: "volumen", valor: Math.min(100, Number(m[1])) };
    if (!pregunta && hay(/\b(louder|volume up|turn (it |the volume |that )?up|raise the volume|increase the volume)\b/)) return { tipo: "volumen", delta: 20 };
    if (!pregunta && hay(/\b(quieter|softer|volume down|turn (it |the volume |that )?down|lower the volume|decrease the volume)\b/)) return { tipo: "volumen", delta: -20 };

    if (hay(/\b(what|which|how many) (tracks|songs|videos|visualizations)\b|\b(list|catalog|menu)\b/)) return { tipo: "pistas" };
    m = /\b(?:track|video|song|number)\s+(?:number\s+)?(\d+)\b/.exec(s);
    if (m) return { tipo: "elegir", numero: Number(m[1]) };
    m = /\b(first|second|third|fourth|fifth|last)\s+(?:track|video|song|1)\b/.exec(s);
    if (m) return { tipo: "elegir", numero: ORDINALES_EN[m[1]] };
    if (hay(/\b(next|another track|other track|change (the )?track|switch (the )?track|skip (this |the )?track)\b/)) return { tipo: "siguiente" };
    if (hay(/\b(previous|the 1 before|go back a track)\b/)) return { tipo: "anterior" };

    if ((atras || adelante) && !pregunta) {
      m = /\b(\d{1,3})\b/.exec(s);
      return { tipo: "saltar_relativo", segundos: (adelante ? 1 : -1) * (m ? Number(m[1]) : 10) };
    }

    if (hay(/\b(legend|colou?rs?|key)\b/)) return { tipo: "leyenda" };
    if (hay(/\b(what am i (hearing|listening to)|what (is|are) (this|that|these) sounds?|what is playing|what do i hear|what i (am hearing|hear)|explain)\b/)) return { tipo: "explicar" };
    if (hay(/\b(what does (it|this|that) mean|how do i (read|listen))\b/)) return { tipo: "leyenda" };
    if (hay(/\b(where am i|which track is (this|playing|it)|what track|how much (is left|time|longer)|how far)\b/)) return { tipo: "donde" };
    if (hay(/\b(what is (happening|going on)|describe\w*|what year is it|which year|tell me what|read)\b/)) return { tipo: "descripcion" };

    if (hay(/\b(do not|never) (stop|pause)\b/)) return { tipo: "reproducir" };
    if (pregunta) return { tipo: "desconocido", texto: s };
    if (hay(/\b(pause|stop|halt|wait|hold on|enough|freeze)\b/)) return { tipo: "pausar" };
    m = /\b(?:play|put on|choose|select|open|i want to (?:hear|listen to|see)|i want)\s+(.+)$/.exec(s);
    if (m && !/^(?:the |some |a )?(?:music|sound|video|track|song|it|audio|that|this)$/.test(m[1])) {
      return { tipo: "elegir", nombre: m[1].replace(/^(?:the track|the video|the|a|of)\s+/, "") };
    }
    if (hay(/\b(play|resume|continue|start|go|begin|keep going|unpause|listen)\b/)) return { tipo: "reproducir" };

    return { tipo: "desconocido", texto: s };
  }

  /* La frase -> acción, en el idioma de la guía ("es" o "en"). */
  function interpretarComando(texto, idioma = "es") {
    return idioma === "en" ? interpretarEN(texto) : interpretarES(texto);
  }

  /* Año (y mes) de una fecha del catálogo: 1990, "1990", "mar 2007", "2007-03". */
  function leerFecha(fecha) {
    const s = String(fecha).toLowerCase();
    const a = /\b(\d{4})\b/.exec(s);
    if (!a) return null;
    let mes = MESES.findIndex((x) => s.includes(x)) + 1;
    const iso = /\b\d{4}-(\d{2})\b/.exec(s);
    if (!mes && iso) mes = Number(iso[1]);
    return { anio: Number(a[1]), mes: mes || null };
  }

  /* fechas = [{ t, fecha }] de la pista. Devuelve { t, fecha, exacto } o { vacio } o { fuera, desde, hasta }. */
  function buscarFecha(fechas, anio, mes) {
    const lista = (fechas || []).map((f) => ({ ...f, ...(leerFecha(f.fecha) || {}) })).filter((f) => f.anio);
    if (!lista.length) return { vacio: true };
    const anios = lista.map((f) => f.anio), desde = Math.min(...anios), hasta = Math.max(...anios);
    if (anio < 100) anio = [1900 + anio, 2000 + anio, 1800 + anio].find((a) => a >= desde && a <= hasta) || 1900 + anio; // "año 90"
    if (anio < desde || anio > hasta) return { fuera: true, desde, hasta, anio };
    const exacto = lista.find((f) => f.anio === anio && (!mes || f.mes === mes));
    if (exacto) return { t: exacto.t, fecha: exacto.fecha, exacto: true };
    const valor = (f) => f.anio * 12 + (f.mes || 1), meta = anio * 12 + (mes || 1);
    const cerca = lista.reduce((a, b) => (Math.abs(valor(b) - meta) < Math.abs(valor(a) - meta) ? b : a));
    return { t: cerca.t, fecha: cerca.fecha, exacto: false };
  }

  /* Índice de la pista cuyo título se parece más a lo dicho ("el mar" -> "Corrientes y temperatura del mar"). */
  function buscarPista(pistas, nombre) {
    const palabras = normalizar(nombre).split(" ").filter((p) => p.length > 2);
    let mejor = -1, puntos = 0;
    pistas.forEach((p, i) => {
      const titulo = " " + normalizar(p.titulo) + " ";
      const n = palabras.filter((w) => titulo.includes(" " + w) ).length;
      if (n > puntos) { puntos = n; mejor = i; }
    });
    return mejor;
  }

  const reloj = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const enPalabras = (s, idioma = "es") => {
    const m = Math.floor(s / 60), seg = Math.floor(s % 60);
    if (idioma === "en") return (m ? `${m} ${m === 1 ? "minute" : "minutes"} ` : "") + `${seg} ${seg === 1 ? "second" : "seconds"}`;
    return (m ? `${m} ${m === 1 ? "minuto" : "minutos"} ` : "") + `${seg} ${seg === 1 ? "segundo" : "segundos"}`;
  };

  const coma = (n) => (Math.round(Math.abs(n) * 100) / 100).toFixed(2).replace(".", ",");
  const conPunto = (t) => (t && !/[.!?]$/.test(t) ? t + "." : t);
  /* Un valor dicho en palabras: "más 1,06 grados", "menos 0,61 grados" o, en el mar, "índice 22,44".
     En inglés: "plus 1.06 degrees", "minus 0.61 degrees", "index 22.44". */
  const valorDicho = (v, d = {}, idioma = "es") => {
    if (idioma === "en") { const n = (Math.round(Math.abs(v) * 100) / 100).toFixed(2); return d.indiceRelativo ? `index ${n}` : `${v < 0 ? "minus" : "plus"} ${n} degrees`; }
    return d.indiceRelativo ? `índice ${coma(v)}` : `${v < 0 ? "menos" : "más"} ${coma(v)} grados`;
  };

  /* Cifras ya calculadas de una serie [{ t, fecha, media }]: máximo, mínimo, mayor cambio entre dos momentos
     seguidos y tendencia (primer dato frente al último). Las usan los comandos y viajan a la IA para que el
     modelo no calcule ni invente nada. null si no hay datos. */
  function resumenSerie(serie) {
    const s = (serie || []).filter((r) => r && typeof r.media === "number" && isFinite(r.media));
    if (s.length < 2) return null;
    const red = (x) => Math.round(x * 100) / 100;
    const fecha = (r) => (r.fecha != null ? String(r.fecha) : `segundo ${Math.round(r.t)}`);
    const punto = (r) => ({ fecha: fecha(r), valor: red(r.media), t: r.t });
    let max = s[0], min = s[0], a = s[0], b = s[1];
    for (let i = 1; i < s.length; i++) {
      if (s[i].media > max.media) max = s[i];
      if (s[i].media < min.media) min = s[i];
      if (Math.abs(s[i].media - s[i - 1].media) > Math.abs(b.media - a.media)) { a = s[i - 1]; b = s[i]; }
    }
    const fin = s[s.length - 1], cambio = fin.media - s[0].media, rango = max.media - min.media;
    return {
      maximo: punto(max), minimo: punto(min),
      mayor_cambio: { de: fecha(a), a: fecha(b), cambio: red(b.media - a.media) },
      tendencia: { inicio: punto(s[0]), fin: punto(fin), cambio: red(cambio),
        direccion: rango === 0 || Math.abs(cambio) < rango / 3 ? "sube y baja" : cambio > 0 ? "sube" : "baja" },
    };
  }

  /* "nov 2007" (así vienen las fechas de la web) dicho en inglés: "November 2007". En español se deja igual. */
  function fechaDicha(fecha, idioma = "es") {
    const s = String(fecha);
    if (idioma !== "en") return s;
    return s.replace(/^(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\b/i, (m) => MESES_EN_LARGO[m.toLowerCase().startsWith("set") ? 8 : MESES.indexOf(m.slice(0, 3).toLowerCase())]);
  }

  /* ================================================================== textos de las respuestas, en los dos idiomas */

  const AYUDA = "Puedes decir: reproduce. Pausa. Siguiente pista. Pista dos. Qué pistas hay. Año 1990. Segundo diez. " +
    "Avanza diez segundos. Qué estoy escuchando. Por qué sube el tono. Llévame al año más cálido. Dame un recorrido. " +
    "Lee la leyenda. Dónde estoy. Sube el volumen. Repite. Silencio.";
  const AYUDA_EN = "You can say: play. Pause. Next track. Track two. What tracks are there. Year 1990. Second ten. " +
    "Forward ten seconds. What am I hearing. Why does the pitch rise. Take me to the warmest year. Give me a tour. " +
    "Read the legend. Where am I. Volume up. Repeat. Quiet.";

  const L = {
    es: {
      ayuda: AYUDA, nadaDicho: "Todavía no he dicho nada.",
      hayPistas: (n, lista) => `Hay ${n} ${n === 1 ? "pista" : "pistas"}: ${lista}. Di, por ejemplo: pista 1.`, sinCatalogo: "El catálogo todavía no cargó.",
      sinPista: "Todavía no hay ninguna pista elegida. Di «reproduce» o «dame un recorrido».", cargando: "La pista todavía se está cargando. Espera un momento y repite.",
      pista: (i, n, t) => `Pista ${i} de ${n}: ${t}.`, reproduciendo: (t) => (t ? `Reproduciendo ${t}.` : "Reproduciendo."),
      yaPausa: "Ya está en pausa.", enPausa: "En pausa.",
      noPista: (x) => `No encontré una pista llamada «${x}». Di «qué pistas hay».`, soloHay: (n) => `Solo hay ${n} ${n === 1 ? "pista" : "pistas"}. Di un número del 1 al ${n}.`,
      inicio: "Al inicio.", final: "Cerca del final.", dura: (d) => `Esta pista dura ${d}. Di un tiempo menor.`,
      avance: (d, adelante) => `${adelante ? "Avancé" : "Retrocedí"} ${d}.`,
      sinFechas: "Esta pista no tiene fechas. Di, por ejemplo: segundo 10.", fuera: (a, b, c) => `Esta pista va de ${a} a ${b}. No tiene el año ${c}.`,
      cercano: (f) => `No hay un dato exacto de esa fecha. Voy al más cercano: ${f}.`,
      sinDatos: "Esta pista no tiene datos para buscar ese momento.",
      extremo: (min, indice, f, v) => `${indice ? (min ? "El índice más bajo" : "El índice más alto") : (min ? "El momento más frío" : "El momento más cálido")} de esta pista es ${f}: ${v}. Te llevo ahí.`,
      nadaSuena: "Todavía no suena nada. Di «reproduce» o «dame un recorrido». En esta página, cuanto más caliente está el mapa, más agudo suena.",
      explicar: (sonando, t, ahora, max, min) => `${sonando ? "Suena" : "Está elegida"} la pista ${t}. ` + (ahora ? `Ahora, ${ahora} ` : "") + (max ? `El punto más alto de la pista es ${max} y el más bajo, ${min}. ` : "") + "Cuanto más alto el valor, más agudo suena.",
      tonoBase: "El tono sigue al valor medio del mapa: cuanto más caliente, más agudo; cuanto más frío, más grave.",
      tono: (base, v0, f0, v1, f1, dir, max) => `${base} En esta pista pasa de ${v0} en ${f0} a ${v1} en ${f1}` +
        (dir === "sube" ? ", por eso la melodía termina más aguda de como empieza." : dir === "baja" ? ", por eso termina más grave de como empieza." : ": sube y baja por el camino.") + ` Su punto más alto es ${max}.`,
      sinDescripcion: "Todavía no hay descripción: elige una pista.", sinLeyenda: "Esta página no tiene leyenda.",
      donde: (i, n, t, a, b, sonando) => `Pista ${i} de ${n}: ${t}. Vas en ${a} de ${b}. ${sonando ? "Está sonando." : "Está en pausa."}`,
      volumen: (v) => `Volumen al ${v} por ciento.`,
      noEntendi: (x) => `No entendí «${x}». Di «ayuda» si quieres ejemplos.`,
      web: {
        proyecto: "Resonant Earth convierte visualizaciones de la NASA en música: el color de cada mapa decide qué nota suena, qué tan fuerte y de qué lado. Hay dos pistas: la temperatura del planeta desde 1880 y la del mar durante un año.",
        como_funciona: "En cuatro pasos: tomamos fotogramas del video de la NASA, medimos el valor medio, la zona caliente y dónde está, lo pasamos a nota, volumen y lado, y sale una pista de marimba que luego comprobamos contra los datos.",
        por_que: "Porque el sonido llega a quien no puede ver el mapa, y también a quien ya lo vio demasiadas veces. Un número se vuelve una melodía que sube.",
        accesibilidad: "Todo se usa con teclado, una frase en texto dice qué pasa en cada momento, el lector de pantalla puede anunciarla y cada pista explica qué se ve y qué se oye. Esta guía también responde por escrito.",
        equipo: "Somos cinco estudiantes de la Universidad de Las Américas, en Quito, en el NASA Space Apps Challenge 2026. Los nombres están en la sección Equipo de la página.",
      },
      recorrido: {
        bienvenida: "Te doy la bienvenida a Resonant Earth. Aquí los mapas de la NASA se vuelven música: cuanto más caliente está el mapa, más agudo suena.",
        primera: (t, desde) => `Primera pista: ${t}${desde ? `, desde ${desde}` : ""}. Escucha cómo empieza.`,
        salto: (f, v) => `Salto hacia ${f}: ${v}. Es el punto más alto de la pista, por eso la melodía suena cada vez más aguda.`,
        segunda: (t, dir, min) => `Segunda pista: ${t}.` + (dir ? ` Aquí la melodía ${dir}: su punto más bajo es ${min}.` : ""),
        direccion: { sube: "sube", baja: "baja", "sube y baja": "sube y baja" },
        fin: "Fin del recorrido. Pulsa la esfera Háblame y pregúntame lo que quieras.",
      },
    },
    en: {
      ayuda: AYUDA_EN, nadaDicho: "I have not said anything yet.",
      hayPistas: (n, lista) => `There ${n === 1 ? "is 1 track" : `are ${n} tracks`}: ${lista}. Say, for example: track 1.`, sinCatalogo: "The catalogue has not loaded yet.",
      sinPista: "No track is selected yet. Say “play” or “give me a tour”.", cargando: "The track is still loading. Wait a moment and try again.",
      pista: (i, n, t) => `Track ${i} of ${n}: ${t}.`, reproduciendo: (t) => (t ? `Playing ${t}.` : "Playing."),
      yaPausa: "It is already paused.", enPausa: "Paused.",
      noPista: (x) => `I could not find a track called “${x}”. Say “what tracks are there”.`, soloHay: (n) => `There ${n === 1 ? "is only 1 track" : `are only ${n} tracks`}. Say a number from 1 to ${n}.`,
      inicio: "Back to the start.", final: "Near the end.", dura: (d) => `This track lasts ${d}. Say a shorter time.`,
      avance: (d, adelante) => `${adelante ? "Moved forward" : "Moved back"} ${d}.`,
      sinFechas: "This track has no dates. Say, for example: second 10.", fuera: (a, b, c) => `This track runs from ${a} to ${b}. It does not include ${c}.`,
      cercano: (f) => `There is no exact data for that date. Going to the closest one: ${f}.`,
      sinDatos: "This track has no data to find that moment.",
      extremo: (min, indice, f, v) => `${indice ? (min ? "The lowest index" : "The highest index") : (min ? "The coldest moment" : "The warmest moment")} of this track is ${f}: ${v}. Taking you there.`,
      nadaSuena: "Nothing is playing yet. Say “play” or “give me a tour”. On this page, the warmer the map, the higher the sound.",
      explicar: (sonando, t, ahora, max, min) => `${sonando ? "Now playing" : "Selected"}: the track ${t}. ` + (ahora ? `Right now, ${ahora} ` : "") + (max ? `The highest point of the track is ${max} and the lowest is ${min}. ` : "") + "The higher the value, the higher the sound.",
      tonoBase: "The pitch follows the average value of the map: the warmer it is, the higher the note; the colder, the lower.",
      tono: (base, v0, f0, v1, f1, dir, max) => `${base} In this track it goes from ${v0} in ${f0} to ${v1} in ${f1}` +
        (dir === "sube" ? ", so the melody ends higher than it starts." : dir === "baja" ? ", so it ends lower than it starts." : ": it rises and falls along the way.") + ` Its highest point is ${max}.`,
      sinDescripcion: "There is no description yet: choose a track.", sinLeyenda: "This page has no legend.",
      donde: (i, n, t, a, b, sonando) => `Track ${i} of ${n}: ${t}. You are at ${a} of ${b}. ${sonando ? "It is playing." : "It is paused."}`,
      volumen: (v) => `Volume at ${v} percent.`,
      noEntendi: (x) => `I did not understand “${x}”. Say “help” if you want examples.`,
      web: {
        proyecto: "Resonant Earth turns NASA visualizations into music: the colour of each map decides which note plays, how loud and on which side. There are two tracks: the planet's temperature since 1880 and the sea's over one year.",
        como_funciona: "In four steps: we take frames from the NASA video, measure the average value, the warm area and where it is, turn that into note, volume and side, and get a marimba track that we then check against the data.",
        por_que: "Because sound reaches people who cannot see the map, and also those who have seen it too many times. A number becomes a melody that climbs.",
        accesibilidad: "Everything works with the keyboard, a sentence in text says what is happening at each moment, a screen reader can announce it, and each track explains what you see and hear. This guide also answers in writing.",
        equipo: "We are five students from Universidad de Las Américas, in Quito, at the NASA Space Apps Challenge 2026. The names are in the Team section of the page.",
      },
      recorrido: {
        bienvenida: "Welcome to Resonant Earth. Here NASA maps become music: the warmer the map, the higher the sound.",
        primera: (t, desde) => `First track: ${t}${desde ? `, starting in ${desde}` : ""}. Listen to how it begins.`,
        salto: (f, v) => `Jumping towards ${f}: ${v}. It is the highest point of the track, which is why the melody keeps getting higher.`,
        segunda: (t, dir, min) => `Second track: ${t}.` + (dir ? ` Here the melody ${dir}: its lowest point is ${min}.` : ""),
        direccion: { sube: "rises", baja: "falls", "sube y baja": "rises and falls" },
        fin: "End of the tour. Press the sphere and ask me anything.",
      },
    },
  };
  const textos = (idioma) => L[idioma === "en" ? "en" : "es"];

  /* El recorrido guiado: un guion FIJO (no lo escribe ningún modelo). Cada paso tiene un texto, una pausa para
     dejar oír la música y, a veces, una acción de ACCIONES_RECORRIDO. Las cifras salen de resumenSerie(). */
  const ACCIONES_RECORRIDO = ["elegir", "saltar_tiempo"];
  function guionRecorrido(A, idioma = "es") {
    const pistas = A.pistas(idioma), R0 = textos(idioma).recorrido, f = (x) => fechaDicha(x, idioma);
    const de = (i) => { const d = (A.detalle && pistas[i] && A.detalle(i)) || {}; return { ...d, resumen: resumenSerie(d.serie) }; };
    const pasos = [{ accion: null, pausa: 300, texto: R0.bienvenida }];
    if (pistas[0]) {
      const d = de(0), R = d.resumen;
      pasos.push({ accion: { tipo: "elegir", numero: 1 }, pausa: 3000, texto: R0.primera(pistas[0].titulo, R ? f(R.tendencia.inicio.fecha) : "") });
      // unos segundos antes del punto más alto: la música sube hasta él mientras la guía lo cuenta
      if (R) pasos.push({ accion: { tipo: "saltar_tiempo", segundos: Math.max(0, Math.round((R.maximo.t - 7) * 10) / 10) }, pausa: 2500,
        texto: R0.salto(f(R.maximo.fecha), valorDicho(R.maximo.valor, d, idioma)) });
    }
    if (pistas[1]) {
      const d = de(1), R = d.resumen;
      pasos.push({ accion: { tipo: "elegir", numero: 2 }, pausa: 3000, texto: R0.segunda(pistas[1].titulo, R ? R0.direccion[R.tendencia.direccion] : "", R ? f(R.minimo.fecha) : "") });
    }
    pasos.push({ accion: null, pausa: 0, texto: R0.fin });
    return pasos;
  }

  /* Ejecuta una acción con el adaptador y responde en el idioma pedido. Devuelve { texto, paginaAnuncia, paginaHabla }:
     paginaAnuncia = la página ya lo dirá al lector de pantalla; paginaHabla = la página ya lo dirá con su voz. */
  async function ejecutar(accion, A, memoria = {}, idioma = "es") {
    const T = textos(idioma), pistas = A.pistas(idioma), n = pistas.length;
    const f = (x) => fechaDicha(x, idioma), dura = (s) => enPalabras(s, idioma);
    let actual = A.indiceActual();
    // "llévame al año más cálido" o "año 1990" sin pista elegida: se carga la primera y se sigue
    if (actual < 0 && n && ["saltar_extremo", "saltar_anio"].includes(accion.tipo)) { await A.elegir(0, false); actual = A.indiceActual(); }
    const datos = () => { const d = (A.detalle && A.detalle()) || {}; return { ...d, resumen: resumenSerie(d.serie) }; };
    const anuncia = (que) => !!(A.paginaAnuncia && A.paginaAnuncia(que)), habla = !!(A.paginaHablaSola && A.paginaHablaSola());
    const r = (texto, extra = {}) => ({ texto, ...extra });
    const cargando = () => r(n && actual < 0 ? T.sinPista : T.cargando);
    const elegir = async (i) => {
      await A.elegir(i, true);
      return r(T.pista(i + 1, n, pistas[i].titulo), { paginaAnuncia: anuncia("elegir") && idioma !== "en" });
    };
    const ir = (t, texto) => {
      const en_pausa = !A.sonando();
      A.irA(Math.min(Math.max(t, 0), Math.max(A.duracion() - 0.05, 0)));
      return r(texto, { paginaAnuncia: anuncia("saltar"), paginaHabla: habla && en_pausa });
    };

    switch (accion.tipo) {
      case "nada": return r("");
      case "ayuda": return r(T.ayuda, { ayuda: true });
      case "callar": return r("", { callar: true });
      case "repetir": return r(memoria.ultima || T.nadaDicho, { lento: !!memoria.ultima });   // sin IA: lo mismo, más despacio
      case "sobre_web": return r(T.web[accion.tema] || T.web.proyecto);
      case "pistas": return r(n ? T.hayPistas(n, pistas.map((p, i) => `${i + 1}, ${p.titulo}`).join("; ")) : T.sinCatalogo);
      case "reproducir":
        if (actual < 0 && n) return elegir(0);                             // todavía no hay pista elegida: la primera
        if (!A.listo()) return cargando();
        await A.reproducir();
        return r(T.reproduciendo(pistas[actual] && pistas[actual].titulo));
      case "pausar":
        if (!A.sonando()) return r(T.yaPausa);
        A.pausar();
        return r(T.enPausa, { paginaAnuncia: anuncia("pausar") });
      case "siguiente": return n ? elegir((actual + 1) % n) : cargando();
      case "anterior": return n ? elegir((actual - 1 + n) % n) : cargando();
      case "elegir": {
        if (!n) return cargando();
        let i = accion.nombre != null ? buscarPista(pistas, accion.nombre) : (accion.numero === -1 ? n - 1 : accion.numero - 1);
        if (accion.nombre != null && i < 0) return r(T.noPista(accion.nombre));
        if (!(i >= 0 && i < n)) return r(T.soloHay(n));
        return elegir(i);
      }
      case "inicio": return A.listo() ? ir(0, T.inicio) : cargando();
      case "final": return A.listo() ? ir(A.duracion() - 3, T.final) : cargando();
      case "saltar_tiempo":
        if (!A.listo()) return cargando();
        if (accion.segundos > A.duracion()) return r(T.dura(dura(A.duracion())));
        return ir(accion.segundos, `${dura(accion.segundos)}.`);
      case "saltar_relativo":
        if (!A.listo()) return cargando();
        return ir(A.tiempo() + accion.segundos, T.avance(dura(Math.abs(accion.segundos)), accion.segundos > 0));
      case "saltar_anio": {
        if (!A.listo()) return cargando();
        const x = buscarFecha(A.fechas(), accion.anio, accion.mes);
        if (x.vacio) return r(T.sinFechas);
        if (x.fuera) return r(T.fuera(x.desde, x.hasta, x.anio));
        return ir(x.t + 0.01, x.exacto ? `${f(x.fecha)}.` : T.cercano(f(x.fecha)));
      }
      case "saltar_extremo": {
        if (!A.listo()) return cargando();
        const d = datos(), min = accion.cual === "min", e = d.resumen && (min ? d.resumen.minimo : d.resumen.maximo);
        if (!e) return r(T.sinDatos);
        const res = ir(e.t + 0.01, T.extremo(min, !!d.indiceRelativo, f(e.fecha), valorDicho(e.valor, d, idioma)));
        await A.reproducir();
        return { ...res, paginaAnuncia: false };                           // la frase de la guía dice más que la lectura de la página
      }
      case "explicar": {
        if (!pistas[actual]) return r(T.nadaSuena);
        const d = datos(), ahora = conPunto(A.descripcion(idioma)), R = d.resumen;
        return r(T.explicar(A.sonando(), pistas[actual].titulo, ahora, R ? f(R.maximo.fecha) : "", R ? f(R.minimo.fecha) : ""));
      }
      case "explicar_tono": {
        const d = pistas[actual] ? datos() : {}, R = d.resumen;
        if (!R) return r(T.tonoBase);
        const t = R.tendencia;
        return r(T.tono(T.tonoBase, valorDicho(t.inicio.valor, d, idioma), f(t.inicio.fecha), valorDicho(t.fin.valor, d, idioma), f(t.fin.fecha), t.direccion, f(R.maximo.fecha)));
      }
      case "recorrido": return r("", { recorrido: true });
      case "detener_recorrido": return r("", { detenerRecorrido: true });
      case "descripcion": return r(A.descripcion(idioma) || T.sinDescripcion);
      case "leyenda": return r(A.leyenda(idioma) || T.sinLeyenda);
      case "donde":
        if (!pistas[actual]) return cargando();
        return r(T.donde(actual + 1, n, pistas[actual].titulo, dura(A.tiempo()), dura(A.duracion()), A.sonando()));
      case "volumen": {
        const v = Math.min(100, Math.max(0, accion.valor != null ? accion.valor : A.volumen() + accion.delta));
        A.ponerVolumen(v);
        return r(T.volumen(v));
      }
      default: return r(T.noEntendi(accion.texto || ""));
    }
  }

  /* ================================================================== C0. qué voz usa la guía */

  /* Nombres de voces masculinas que traen Windows, Edge, Chrome, macOS, iOS y Android, por orden de preferencia.
     Inglés: primero británicas. Español: cualquier país. La lista es de nombres de voces del sistema. */
  const VOCES_PREFERIDAS = {
    en: [/\bgeorge\b/i, /\bryan\b/i, /google uk english male/i, /\bdaniel\b/i, /\b(thomas|oliver|arthur|alfie|elliot|ethan|noah)\b/i,
      /\b(david|mark|guy|james|andrew|brian|christopher|eric|roger|steffan|william|liam|alex|fred|tom|aaron|reed|eddy)\b/i],
    es: [/\bpablo\b/i, /\bra[uú]l\b/i, /\bjorge\b/i, /\b([aá]lvaro|alonso|luis|diego|carlos|enrique|andr[eé]s|miguel|tom[aá]s|gonzalo|mateo|emilio|el[ií]as|dar[ií]o|juan|rodrigo|sebasti[aá]n|eddy|reed)\b/i],
  };
  const TONO_VOZ = 0.85, VELOCIDAD_VOZ = 0.95;        // algo más grave y un poco más despacio: voz serena

  /* voces = las del navegador ({ name, lang, default }). Devuelve la mejor para el idioma, o null si no hay ninguna.
     preferida = "nombre|idioma" elegida a mano en las opciones (gana siempre que exista). */
  function elegirVozDe(voces, idioma = "es", preferida = "") {
    const del = (voces || []).filter((v) => v && String(v.lang).toLowerCase().replace("_", "-").startsWith(idioma));
    if (!del.length) return null;
    const pais = (v) => String(v.lang).toLowerCase().replace("_", "-");
    const aMano = del.find((v) => `${v.name}|${v.lang}` === preferida);
    if (aMano) return aMano;
    const mujer = (v) => /\bfemale\b|\bmujer\b|\bfemenin/i.test(v.name), hombre = (v) => /\bmale\b|\bhombre\b|\bmasculin/i.test(v.name) && !mujer(v);
    const grupos = idioma === "en" ? [del.filter((v) => pais(v) === "en-gb"), del] : [del];
    for (const grupo of grupos) {
      for (const patron of VOCES_PREFERIDAS[idioma] || []) { const v = grupo.find((x) => patron.test(x.name) && !mujer(x)); if (v) return v; }
      const v = grupo.find(hombre);
      if (v) return v;
    }
    if (idioma === "en") return del.find((v) => pais(v) === "en-gb") || del.find((v) => v.default) || del[0];
    return del.find((v) => pais(v) === "es-ec") || del.find((v) => !/^es(-es)?$/.test(pais(v))) || del.find((v) => v.default) || del[0];
  }

  /* ================================================================== D. la esfera, la tarjeta y la conexión (B y C van dentro) */

  const CLAVE = "rocola-guia-voz";
  const SUGERENCIAS = {
    es: ["¿Qué estoy escuchando?", "¿Por qué sube el tono?", "Llévame al año más cálido"],
    en: ["What am I hearing?", "Why does the pitch rise?", "Take me to the warmest year"],
  };
  /* Textos de la tarjeta, en los dos idiomas. Frases cortas y sin jerga: deben entenderse a la primera. */
  const U = {
    es: {
      nombre: "Eco, la guía por voz", alias: "Eco", rol: "Guía por voz", hablar: "Háblame", escuchando: "Te escucho…", cerrar: "Cerrar la guía", inicial: "Pulsa la esfera y háblame.",
      saludo: "Hola, soy Eco, la guía de Resonant Earth. ¿Qué quieres escuchar?",
      pistaLector: "Atajo: tecla H. Si usas un lector de pantalla, márcalo en Ayuda y opciones y la guía responderá por escrito.",
      lista: "Lista.", pensando: "Un momento…", espera: "Un momento.", teEscucho: "Te escucho.", hablando: "Hablando…", sigo: "Sigo escuchando…", silencio: "(en silencio)",
      escribir: "Escribir", campo: "Escribe tu pregunta", enviar: "Enviar", sugeridas: "Atajos", recorrido: "Dame un recorrido", detener: "Detener el recorrido",
      opciones: "Ayuda y opciones", quePuedoDecir: "Puedes decir",
      ayudaLista: ["«Reproduce» o «pausa»", "«Llévame a 1990»", "«¿Qué estoy escuchando?»", "«Dame un recorrido»"],
      idioma: "Idioma (Language)",
      lector: "Uso un lector de pantalla (NVDA, JAWS, VoiceOver, TalkBack). La guía responderá solo por escrito, para que no se mezclen dos voces.",
      tecla: "Usar la tecla H para hablar",
      seguir: "Escuchar de nuevo después de cada respuesta", voz: "Voz", vozAuto: "Automática", velocidad: "Velocidad", probar: "Probar la voz", prueba: "Esta es la voz de la guía.",
      velocidades: ["lenta", "normal", "rápida"],
      privacidad: "El micrófono solo se abre al pulsar la esfera o después de una respuesta. Tu navegador convierte la voz en texto; esta página no la guarda.",
      saltar: "Saltar a la guía por voz",
      lectorSi: "De acuerdo. Responderé solo por escrito y tu lector de pantalla lo leerá. Para hablarme, pulsa la tecla H o el botón Háblame.",
      lectorNo: "De acuerdo. Te responderé con mi voz.", idiomaListo: "Listo, sigo en español.",
      sinRecorrido: "No hay ningún recorrido en marcha. Di «dame un recorrido» para empezar uno.", recorridoDetenido: "Recorrido detenido.",
      noPude: "No pude hacerlo: el reproductor no respondió.", sinMicro: "No pude abrir el micrófono. Puedes escribir tu pregunta.",
      sinReconocimiento: "Este navegador no entiende la voz. Escribe tu pregunta, o usa Chrome, Edge o Safari.",
      sinVoz: "Este navegador no tiene voz: respondo por escrito.", sinVozIdioma: "No hay una voz en español instalada: respondo por escrito.",
      https: "El micrófono solo funciona en páginas seguras (https). Puedes escribir tu pregunta.",
      errorVoz: (e) => `No pude escucharte (${e}). Puedes escribir tu pregunta.`,
      errores: {
        "not-allowed": "No tengo permiso para usar el micrófono. Dámelo desde el candado de la barra de direcciones y pulsa la esfera otra vez. También puedes escribir tu pregunta.",
        "service-not-allowed": "El navegador no deja usar el micrófono en esta página. Puedes escribir tu pregunta.",
        "audio-capture": "No encuentro ningún micrófono. Conecta uno o escribe tu pregunta.",
        "no-speech": "No escuché nada. Pulsa la esfera o la tecla H y habla después del pitido.",
        "network": "Para entender tu voz, este navegador necesita internet y no respondió. Puedes escribir tu pregunta.",
        "language-not-supported": "Este navegador no entiende voz en español. Puedes escribir tu pregunta.",
      },
    },
    en: {
      nombre: "Eco, the voice guide", alias: "Eco", rol: "Voice guide", hablar: "Talk to me", escuchando: "Listening…", cerrar: "Close the guide", inicial: "Press the sphere and talk to me.",
      saludo: "Hello, I am Eco, the Resonant Earth guide. What would you like to hear?",
      pistaLector: "Shortcut: H key. If you use a screen reader, tick it under Help and options and the guide will answer in writing.",
      lista: "Ready.", pensando: "One moment…", espera: "One moment.", teEscucho: "I am listening.", hablando: "Speaking…", sigo: "Still listening…", silencio: "(silent)",
      escribir: "Type", campo: "Type your question", enviar: "Send", sugeridas: "Shortcuts", recorrido: "Give me a tour", detener: "Stop the tour",
      opciones: "Help and options", quePuedoDecir: "You can say",
      ayudaLista: ["“Play” or “pause”", "“Take me to 1990”", "“What am I hearing?”", "“Give me a tour”"],
      idioma: "Language (Idioma)",
      lector: "I use a screen reader (NVDA, JAWS, VoiceOver, TalkBack). The guide will answer in writing only, so two voices do not overlap.",
      tecla: "Use the H key to talk",
      seguir: "Listen again after each answer", voz: "Voice", vozAuto: "Automatic", velocidad: "Speed", probar: "Test the voice", prueba: "This is the guide's voice.",
      velocidades: ["slow", "normal", "fast"],
      privacidad: "The microphone only opens when you press the sphere or after an answer. Your browser turns your voice into text; this page does not store it.",
      saltar: "Skip to the voice guide",
      lectorSi: "All right. I will answer in writing only and your screen reader will read it. To talk to me, press the H key or the Talk to me button.",
      lectorNo: "All right. I will answer with my voice.", idiomaListo: "Sure, I will speak English from now on.",
      sinRecorrido: "There is no tour running. Say “give me a tour” to start one.", recorridoDetenido: "Tour stopped.",
      noPude: "I could not do that: the player did not respond.", sinMicro: "I could not open the microphone. You can type your question.",
      sinReconocimiento: "This browser cannot understand speech. Type your question, or use Chrome, Edge or Safari.",
      sinVoz: "This browser has no voice: I answer in writing.", sinVozIdioma: "No English voice is installed: I answer in writing.",
      https: "The microphone only works on secure pages (https). You can type your question.",
      errorVoz: (e) => `I could not hear you (${e}). You can type your question.`,
      errores: {
        "not-allowed": "I do not have permission to use the microphone. Allow it from the padlock in the address bar and press the sphere again. You can also type your question.",
        "service-not-allowed": "The browser does not allow the microphone on this page. You can type your question.",
        "audio-capture": "I cannot find a microphone. Connect one or type your question.",
        "no-speech": "I did not hear anything. Press the sphere or the H key and speak after the beep.",
        "network": "To understand your voice, this browser needs the internet and it did not respond. You can type your question.",
        "language-not-supported": "This browser cannot understand speech in English. You can type your question.",
      },
    },
  };
  const IDIOMAS_VOZ = { es: ["es-EC", "es-ES"], en: ["en-US"] };
  const ESPERA_AVISO_MS = 1500;                       // si la IA tarda más, la guía dice «un momento»
  const ESPERA_SEGUIR_MS = 10000;                     // tras una respuesta, cuánto espera a que la persona empiece a hablar
  const SILENCIO_MS = 2500;                           // silencio tras la última palabra para dar la frase por terminada
  const SILENCIO_SIN_TEXTO_MS = 5000;                 // se oyó voz pero aún no hay palabras: un poco más de margen
  const HABLA_MAX_MS = 30000;                         // lo máximo que puede durar una frase

  /* La tarjeta no lleva textos: los pone pintarTextos() en el idioma elegido (atributos data-t y data-t-aria).
     Orden: cabecera (avatar, nombre, cerrar), subtítulo, estado, «Escribir» y «Ayuda y opciones» plegado. */
  const PLANTILLA = `
    <div class="gv-tarjeta" id="gv-tarjeta" hidden>
      <div class="gv-cabecera">
        <span class="gv-avatar" aria-hidden="true"></span>
        <p class="gv-identidad"><strong class="gv-alias" data-t="alias"></strong> <span class="gv-rol" data-t="rol"></span></p>
        <button type="button" id="gv-cerrar" class="gv-cerrar" data-t-aria="cerrar">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
        </button>
      </div>
      <p id="gv-respuesta" class="gv-subtitulo"></p>
      <p id="gv-escucha" class="gv-escucha" hidden><span class="gv-escucha-barra" aria-hidden="true"></span><span data-t="sigo"></span></p>
      <p id="gv-estado" class="gv-estado"></p>
      <button type="button" id="gv-detener" class="gv-boton gv-detener" data-t="detener" hidden></button>
      <button type="button" id="gv-escribir" class="gv-boton gv-escribir" aria-expanded="false" aria-controls="gv-zona-escribir" data-t="escribir"></button>
      <div id="gv-zona-escribir" class="gv-zona-escribir" hidden>
        <form id="gv-formulario" class="gv-formulario">
          <label for="gv-campo" data-t="campo"></label>
          <div class="gv-fila">
            <input id="gv-campo" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send">
            <button type="submit" class="gv-boton" data-t="enviar"></button>
          </div>
        </form>
        <p class="gv-rotulo" id="gv-rotulo-atajos" data-t="sugeridas"></p>
        <div class="gv-sugerencias" role="group" aria-labelledby="gv-rotulo-atajos">
          <button type="button" class="gv-chip"></button><button type="button" class="gv-chip"></button><button type="button" class="gv-chip"></button>
          <button type="button" class="gv-chip gv-chip-recorrido" data-t="recorrido"></button>
        </div>
      </div>
      <div id="gv-vivo" class="gv-solo-lector" aria-live="polite" aria-atomic="true"></div>
      <details class="gv-opciones" id="gv-opciones">
        <summary data-t="opciones"></summary>
        <div class="gv-grupo">
          <p class="gv-rotulo" data-t="quePuedoDecir"></p>
          <ul id="gv-lista-ayuda" class="gv-lista-ayuda"></ul>
        </div>
        <div class="gv-grupo">
          <div class="gv-campo-opcion"><label for="gv-idioma" data-t="idioma"></label><select id="gv-idioma"><option value="es" lang="es">Español</option><option value="en" lang="en">English</option></select></div>
        </div>
        <div class="gv-grupo">
          <div class="gv-campo-opcion"><label for="gv-voz" data-t="voz"></label><select id="gv-voz"><option value="auto"></option></select></div>
          <div class="gv-campo-opcion"><label for="gv-velocidad" data-t="velocidad"></label><input id="gv-velocidad" type="range" min="0.6" max="1.4" step="0.05" value="${VELOCIDAD_VOZ}"></div>
          <button type="button" id="gv-probar" class="gv-boton gv-boton-chico" data-t="probar"></button>
        </div>
        <div class="gv-grupo">
          <label class="gv-casilla"><input type="checkbox" id="gv-lector"> <span data-t="lector"></span></label>
        </div>
        <div class="gv-grupo" id="gv-grupo-escucha">
          <label class="gv-casilla"><input type="checkbox" id="gv-seguir" checked> <span data-t="seguir"></span></label>
          <label class="gv-casilla"><input type="checkbox" id="gv-tecla" checked> <span data-t="tecla"></span></label>
        </div>
        <p class="gv-nota" id="gv-privacidad" data-t="privacidad"></p>
      </details>
    </div>
    <button type="button" id="gv-hablar" class="gv-hablar" aria-pressed="false" aria-describedby="gv-pista-lector">
      <span class="gv-esfera" aria-hidden="true">
        <svg focusable="false" viewBox="0 0 24 24" width="30" height="30"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2z" fill="currentColor"/></svg>
      </span>
      <span id="gv-hablar-texto" class="gv-hablar-texto"></span>
    </button>
    <span id="gv-pista-lector" class="gv-solo-lector" data-t="pistaLector"></span>`;

  function montar(A, doc, urlGuion) {
    if (!A || !doc || doc.getElementById("guia-voz")) return null;       // sin adaptador no hay guía: la web sigue igual
    const ventana = doc.defaultView;
    const $ = (id) => doc.getElementById(id);

    const hoja = doc.createElement("link");
    hoja.rel = "stylesheet";
    hoja.href = (urlGuion || "guia-voz.js").replace(/guia-voz\.js(\?.*)?$/, "guia-voz.css");
    doc.head.append(hoja);

    const panel = doc.createElement("section");
    panel.id = "guia-voz";
    panel.className = "guia-voz";
    panel.dataset.estado = "reposo";                 // reposo | escuchando | pensando | respondiendo (lo usa guia-voz.css)
    panel.innerHTML = PLANTILLA;
    const ancla = A.ancla && A.ancla(), principal = doc.querySelector("main");   // el adaptador dice dónde va el panel
    if (ancla) ancla.before(panel); else if (principal) principal.before(panel); else doc.body.prepend(panel);

    const ui = { hablar: $("gv-hablar"), hablarTexto: $("gv-hablar-texto"), estado: $("gv-estado"), formulario: $("gv-formulario"), campo: $("gv-campo"),
      tarjeta: $("gv-tarjeta"), cerrar: $("gv-cerrar"), detener: $("gv-detener"), respuesta: $("gv-respuesta"), vivo: $("gv-vivo"), escucha: $("gv-escucha"),
      escribir: $("gv-escribir"), zonaEscribir: $("gv-zona-escribir"), opciones: $("gv-opciones"), listaAyuda: $("gv-lista-ayuda"), idioma: $("gv-idioma"),
      lector: $("gv-lector"), tecla: $("gv-tecla"), seguir: $("gv-seguir"), voz: $("gv-voz"), velocidad: $("gv-velocidad"), probar: $("gv-probar") };

    /* ---------- preferencias (pueden fallar: ventana privada) ---------- */
    const leer = () => { try { return JSON.parse(ventana.localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } };
    const guardar = (cambios) => { try { ventana.localStorage.setItem(CLAVE, JSON.stringify({ ...leer(), ...cambios })); } catch (e) { /* sin almacenamiento */ } };
    const pref = leer();
    const delNavegador = /^en\b/i.test((ventana.navigator && ventana.navigator.language) || "") ? "en" : "es";
    const guia = { idioma: pref.idioma === "en" || pref.idioma === "es" ? pref.idioma : delNavegador, lector: pref.lector === true, ultima: "", escuchando: false,
      hablando: false, turno: 0, turnoVoz: 0, turnoFrase: 0, frases: [], recorrido: 0, enRecorrido: false, saludo: false };
    const u = () => U[guia.idioma];
    let ia = null;                                  // conversación con IA (guia-voz-ia.js); null = solo comandos
    const modoLector = () => guia.lector === true;

    /* ---------- la tarjeta (el subtítulo) y el estado de la esfera ---------- */
    const abrirTarjeta = () => { ui.tarjeta.hidden = false; ui.hablar.setAttribute("aria-expanded", "true"); };
    const cerrarTarjeta = () => { const dentro = ui.tarjeta.contains(doc.activeElement); ui.tarjeta.hidden = true; ui.hablar.setAttribute("aria-expanded", "false"); if (dentro) ui.hablar.focus(); };
    const abrirEscribir = (abierta = true) => { ui.zonaEscribir.hidden = !abierta; ui.escribir.setAttribute("aria-expanded", String(abierta)); };
    let relojBrillo = 0;
    const pintarEsfera = () => {
      panel.dataset.estado = guia.escuchando ? "escuchando" : guia.pensando ? "pensando" : guia.hablando || guia.brillando ? "respondiendo" : "reposo";
      pintarLinea();
    };
    /* la esfera brilla mientras responde: lo que dura la voz o, si la respuesta va por escrito, un rato según su largo */
    const brillar = (texto) => {
      ventana.clearTimeout(relojBrillo);
      guia.brillando = true; pintarEsfera();
      relojBrillo = ventana.setTimeout(() => { guia.brillando = false; pintarEsfera(); }, Math.min(9000, 1500 + texto.length * 45));
    };
    // la música baja mientras el micrófono está abierto (0,2: que no la oiga) o mientras la guía habla (0,35)
    const nivelar = () => { pintarEsfera(); try { A.atenuar(guia.escuchando ? 0.2 : guia.hablando ? 0.35 : 1); } catch (e) { /* el reproductor no está listo */ } };
    const esperar = (ms) => new Promise((listo) => ventana.setTimeout(listo, ms));

    /* ================================================================ C. respuestas: voz O texto para el lector */
    const sintesis = "speechSynthesis" in ventana && typeof ventana.SpeechSynthesisUtterance === "function" ? ventana.speechSynthesis : null;
    let voces = [];
    const vocesIdioma = () => voces.filter((v) => v.lang.toLowerCase().startsWith(guia.idioma));
    const elegirVoz = () => elegirVozDe(voces, guia.idioma, ui.voz.value);
    function cargarVoces() {
      if (!sintesis) return;
      voces = sintesis.getVoices();
      const guardada = (leer().voces || {})[guia.idioma] || "auto";
      ui.voz.replaceChildren(new ventana.Option(u().vozAuto, "auto"), ...vocesIdioma().map((v) => new ventana.Option(`${v.name} (${v.lang})`, `${v.name}|${v.lang}`)));
      ui.voz.value = [...ui.voz.options].some((o) => o.value === guardada) ? guardada : "auto";
      pintarEstado();
    }
    /* true si hay con qué hablar en el idioma de la guía. Con la lista vacía (algunos móviles la entregan tarde) se intenta igual. */
    const puedeHablar = () => !!sintesis && (voces.length === 0 || vocesIdioma().length > 0);

    let alCallar = null;                              // termina la espera de quien aguarda a que la guía acabe de hablar
    function callar() {
      guia.turno++; guia.turnoVoz++;
      if (sintesis) sintesis.cancel();
      guia.hablando = false;
      if (alCallar) { const fin = alCallar; alCallar = null; fin(false); }
      nivelar();
    }
    /* Dice el texto con la voz del navegador. La promesa da true si terminó de hablar y false si la callaron. */
    function decir(texto, { lento = false } = {}) {
      const turno = ++guia.turno;
      sintesis.cancel();
      if (alCallar) { const fin = alCallar; alCallar = null; fin(false); }
      const voz = elegirVoz(), en = guia.idioma === "en";
      const hablado = texto.replace(/[−-](\d)/g, en ? "minus $1" : "menos $1").replace(/\+(\d)/g, en ? "plus $1" : "más $1").replace(/[«»“”]/g, "");   // signos que la voz se salta
      // frases cortas (Chrome corta las muy largas). El punto de un decimal ("1.06") no termina la frase.
      const frases = (hablado.match(/.+?(?:[.!?]+(?=\s|$)|$)/g) || [hablado]).map((f) => f.trim()).filter(Boolean);
      guia.frases = [];                                              // se guardan: algunos navegadores las descartan a medias
      return new Promise((listo) => {
        const tope = ventana.setTimeout(() => { alCallar = null; listo(false); }, 4000 + hablado.length * 110);   // por si el navegador nunca avisa del final
        alCallar = (completo) => { ventana.clearTimeout(tope); listo(completo); };
        frases.forEach((f, i) => {
          const x = new ventana.SpeechSynthesisUtterance(f.trim());
          if (voz) x.voice = voz;
          x.lang = voz ? voz.lang : en ? "en-GB" : "es-ES";
          x.rate = (Number(ui.velocidad.value) || VELOCIDAD_VOZ) * (lento ? 0.8 : 1);
          x.pitch = TONO_VOZ;
          if (i === 0) x.onstart = () => { if (turno === guia.turno) { guia.hablando = true; nivelar(); } };
          const fin = () => { if (turno === guia.turno && i === frases.length - 1) { guia.hablando = false; nivelar(); if (alCallar) { const a = alCallar; alCallar = null; a(true); } } };
          x.onend = fin; x.onerror = fin;
          guia.frases.push(x);
          sintesis.speak(x);
        });
      });
    }
    function escribirParaLector(texto) {            // vaciar y volver a escribir: el lector lo lee aunque se repita
      ui.vivo.textContent = "";
      ventana.setTimeout(() => { ui.vivo.textContent = texto; }, 60);
    }
    /* UNA sola salida por respuesta, y siempre el subtítulo a la vista.
       Con lector: texto en la región viva (y solo si la página no lo anuncia ya). Sin lector: la voz de la guía.
       seguir: al terminar de hablar, vuelve a escuchar unos segundos (solo si la respuesta salió por voz). */
    async function responder(texto, { paginaAnuncia = false, paginaHabla = false, lento = false, seguir = true } = {}) {
      if (!texto) return;
      guia.ultima = texto;
      ui.respuesta.textContent = texto;               // el subtítulo: toda respuesta se ve también como texto
      abrirTarjeta();
      brillar(texto);
      if (modoLector()) { if (!paginaAnuncia) escribirParaLector(texto); return; }
      if (paginaHabla) return;
      if (!puedeHablar()) { escribirParaLector(texto); return; }
      const mio = ++guia.turnoVoz;
      await esperar(120);                             // tras la acción: que nadie la cancele
      if (mio !== guia.turnoVoz) return;
      const completo = await decir(texto, { lento });
      if (completo && seguir && mio === guia.turnoVoz) seguirEscuchando();
    }

    /* ================================================================ B. reconocimiento de voz */
    const Reconocedor = ventana.SpeechRecognition || ventana.webkitSpeechRecognition || null;
    let idiomaRec = 0, rec = null;

    function pitido() {
      try {
        const AC = ventana.AudioContext || ventana.webkitAudioContext;
        const ctx = pitido.ctx || (pitido.ctx = new AC());
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = 0.08;
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.09);
      } catch (e) { /* sin Web Audio: sin pitido */ }
    }
    function pintarEscucha(activa, auto = false) {
      guia.escuchando = activa;
      ui.hablar.setAttribute("aria-pressed", String(activa));
      ui.hablarTexto.textContent = activa ? u().escuchando : u().hablar;
      ui.escucha.hidden = !(activa && auto);          // el indicador visible de "sigo escuchando"
      if (activa) abrirTarjeta();
      nivelar();
      pintarEstado();
    }
    /* Junta lo oído hasta ahora. En modo continuo llegan varios trozos; algunos navegadores repiten en cada trozo todo lo
       anterior, así que un trozo que empieza por lo ya juntado lo sustituye en vez de sumarse. k = número de alternativa. */
    function juntarOido(resultados, k) {
      let todo = "";
      for (const res of Array.from(resultados || [])) {
        const alt = res[Math.min(k, (res.length || 1) - 1)];
        const t = String((alt && alt.transcript) || "").replace(/\s+/g, " ").trim();
        if (!t) continue;
        todo = todo && !t.toLowerCase().startsWith(todo.toLowerCase()) ? todo + " " + t : t;
      }
      return todo;
    }
    /* Abre el micrófono y no corta a la persona: la frase termina cuando lleva SILENCIO_MS callada tras su última palabra
       (o a los HABLA_MAX_MS). auto = escucha de seguimiento tras una respuesta: espera ESPERA_SEGUIR_MS a que empiece a hablar,
       con un temporizador a la vista que se detiene y se oculta en cuanto habla; si nadie habla, se cierra sin decir nada. */
    function escuchar({ auto = false } = {}) {
      if (detenerRecorrido({ silencio: true })) guia.cortePorEscucha = true;   // la frase que venga sabrá que había recorrido
      if (guia.escuchando) { try { rec.stop(); } catch (e) { pintarEscucha(false); } return; }
      if (!Reconocedor) { if (!auto) { responder(u().sinReconocimiento, { seguir: false }); abrirEscribir(); ui.campo.focus(); } return; }
      if (!auto) callar();                                               // que el micrófono no oiga a la guía
      const idiomas = IDIOMAS_VOZ[guia.idioma];
      const mio = rec = new Reconocedor();
      mio.lang = idiomas[Math.min(idiomaRec, idiomas.length - 1)];
      mio.interimResults = true;                                         // resultados parciales: así se sabe que sigue hablando
      mio.continuous = true;                                             // el navegador no corta en la primera pausa
      mio.maxAlternatives = 4;
      let oido = [], hablo = false, callado = false, fallo = false, cerrado = false, relojInicio = 0, relojSilencio = 0, relojTope = 0;
      const limpiar = () => { for (const r of [relojInicio, relojSilencio, relojTope]) ventana.clearTimeout(r); };
      const terminar = () => { try { mio.stop(); } catch (e) { /* ya cerrado */ } };
      const alHablar = (silencio) => {
        if (!hablo) {
          hablo = true;
          ventana.clearTimeout(relojInicio);                             // empezó a hablar: el temporizador se detiene
          ui.escucha.hidden = true;                                      // y se oculta
          relojTope = ventana.setTimeout(terminar, HABLA_MAX_MS);
        }
        ventana.clearTimeout(relojSilencio);
        relojSilencio = ventana.setTimeout(terminar, silencio);
      };
      mio.onstart = () => {
        pintarEscucha(true, auto); pitido();
        if (auto) relojInicio = ventana.setTimeout(() => { callado = true; try { mio.abort(); } catch (e) { /* ya cerrado */ } pintarEscucha(false); }, ESPERA_SEGUIR_MS);
      };
      mio.onspeechstart = () => alHablar(SILENCIO_SIN_TEXTO_MS);
      mio.onresult = (e) => {
        const opciones = [];
        for (let k = 0; k < 4; k++) { const t = juntarOido(e.results, k); if (t && !opciones.includes(t)) opciones.push(t); }
        if (!opciones.length) return;
        oido = opciones;
        alHablar(SILENCIO_MS);
      };
      mio.onerror = (e) => {
        if (e.error === "aborted") { callado = true; return; }
        if (oido.length) return;                                         // ya dijo algo: se atiende eso
        fallo = true;
        if (auto) return;                                                // en la escucha de seguimiento, los fallos no se dicen
        if (e.error === "language-not-supported" && idiomaRec < idiomas.length - 1) { idiomaRec++; ventana.setTimeout(escuchar, 200); return; }
        let texto = u().errores[e.error] || u().errorVoz(e.error);
        if (e.error === "not-allowed" && ventana.isSecureContext === false) texto = u().https;
        responder(texto, { seguir: false });
      };
      mio.onend = () => {
        limpiar(); pintarEscucha(false);
        if (cerrado) return;
        cerrado = true;
        if (callado) return;
        if (oido.length) {
          const util = oido.find((o) => !["desconocido", "nada"].includes(interpretarComando(o, guia.idioma).tipo));
          atender(util || oido[0], { auto });                            // la primera alternativa que sea un comando
        } else if (!fallo) { guia.cortePorEscucha = false; if (!auto) responder(u().errores["no-speech"], { seguir: false }); }
      };
      try { mio.start(); } catch (e) { pintarEscucha(false); if (!auto) responder(u().sinMicro, { seguir: false }); }
    }
    /* Tras una respuesta dicha por voz, la guía vuelve a escuchar UNA vez. Nunca es lo primero que pasa: siempre
       viene después de algo que hizo la persona (pulsar la esfera, la tecla H, un botón o escribir). */
    function seguirEscuchando() {
      if (!ui.seguir.checked || !Reconocedor || guia.escuchando || guia.enRecorrido || modoLector() || doc.hidden || ui.tarjeta.hidden) return;
      escuchar({ auto: true });
    }
    /* La esfera (o la tecla H). La primera vez abre la guía, saluda en una frase y escucha. Después, escucha. */
    function pulsarEsfera() {
      if (!guia.saludo && ui.tarjeta.hidden && !guia.escuchando) {
        guia.saludo = true;
        abrirTarjeta();
        saludar();
        return;
      }
      abrirTarjeta();
      escuchar();
    }
    async function saludar() {
      const texto = u().saludo;
      guia.ultima = texto; ui.respuesta.textContent = texto; brillar(texto);
      if (modoLector()) { escribirParaLector(texto); return; }           // con lector no se abre el micrófono solo: oiría al lector
      if (!puedeHablar()) { escribirParaLector(texto); if (Reconocedor) escuchar(); return; }
      const mio = ++guia.turnoVoz;
      const completo = await decir(texto);
      if (completo && mio === guia.turnoVoz && !guia.escuchando) escuchar();   // abrió la guía para hablar: escucha siempre
    }

    /* ---------- de un texto (oído o escrito) a la acción y a la respuesta ---------- */
    async function atender(texto, { auto = false } = {}) {
      const accion = interpretarComando(texto, guia.idioma);
      if (accion.tipo === "afirmar" || accion.tipo === "negar") { accion.tipo = "desconocido"; accion.texto = normalizar(texto); }
      const turno = ++guia.turnoFrase;
      const habiaRecorrido = guia.enRecorrido || !!guia.cortePorEscucha;
      guia.cortePorEscucha = false;
      detenerRecorrido({ silencio: true });           // cualquier frase nueva corta el recorrido
      if (habiaRecorrido && ["detener_recorrido", "pausar", "callar"].includes(accion.tipo)) { detenerRecorrido({ forzar: true }); return; }
      if (accion.tipo === "idioma") { fijarIdioma(accion.idioma); return; }
      if (accion.tipo === "lector") { fijarLector(accion.usa); return; }
      let r = null;
      if (ia) {                                       // la IA devuelve null cuando debe resolverlo el intérprete de comandos
        guia.pensando = true; pintarEstado();           // la esfera pasa a "pensando"
        // si el servicio tarda, la guía avisa de viva voz «un momento» (una vez; con lector de pantalla basta el texto)
        const aviso = ventana.setTimeout(() => {
          if (turno !== guia.turnoFrase || !guia.pensando || modoLector() || !puedeHablar() || guia.hablando) return;
          decir(u().espera);
        }, ESPERA_AVISO_MS);
        try { r = await ia.atender(texto, accion, guia); } catch (e) { r = null; }
        ventana.clearTimeout(aviso);
        guia.pensando = false; pintarEstado();
        if (turno !== guia.turnoFrase) return;        // mientras esperaba llegó otra frase: esta ya no cuenta
      }
      if (!r) {
        try { r = await ejecutar(accion, A, guia, guia.idioma); }
        catch (e) { r = { texto: u().noPude }; }
      }
      if (ia) ia.marcar(!!r.deIA);                    // etiqueta "Respuesta generada por IA"
      if (r.callar) { callar(); ui.respuesta.textContent = u().silencio; return; }
      if (r.recorrido) { recorrer(); return; }
      if (r.detenerRecorrido) { responder(u().sinRecorrido); return; }
      if (r.ayuda) ui.opciones.open = true;           // la ayuda con ejemplos solo aparece cuando la piden
      // una frase que no se entendió en la escucha de seguimiento no abre otra escucha (así no se encadenan ruidos)
      responder(r.texto, { ...r, seguir: !(auto && accion.tipo === "desconocido" && !r.deIA) });
    }

    /* ---------- recorrido guiado: guion fijo, paso a paso, y se puede detener en cualquier momento ---------- */
    /* Un paso del recorrido: se ve en el subtítulo y sale por UN camino (voz, o región viva con lector). Espera a que termine. */
    async function narrar(texto) {
      guia.ultima = texto;
      ui.respuesta.textContent = texto;
      abrirTarjeta();
      if (!modoLector() && puedeHablar()) return decir(texto);
      brillar(texto);
      escribirParaLector(texto);
      await esperar(1500 + texto.length * 60);        // tiempo para que el lector de pantalla lo lea
      return false;
    }
    async function recorrer() {
      const mio = ++guia.recorrido, sigue = () => mio === guia.recorrido;
      guia.enRecorrido = true;
      ui.detener.hidden = false;
      if (ia) ia.marcar(false);
      let hablado = false;
      for (const paso of guionRecorrido(A, guia.idioma)) {
        if (paso.accion) { try { await ejecutar(paso.accion, A, guia, guia.idioma); } catch (e) { /* el paso se cuenta igual */ } }
        if (!sigue()) return;
        hablado = await narrar(paso.texto);
        if (!sigue()) return;
        await esperar(paso.pausa);
        if (!sigue()) return;
      }
      guia.enRecorrido = false;
      ui.detener.hidden = true;
      if (hablado) seguirEscuchando();                // "pregúntame lo que quieras": escucha una vez
    }
    /* silencio: lo corta otra frase (no dice nada ni pausa). Sin silencio: lo pidió la persona; calla, pausa y avisa. */
    function detenerRecorrido({ silencio = false, forzar = false } = {}) {
      if (!guia.enRecorrido && !forzar) return false;
      guia.recorrido++;
      guia.enRecorrido = false;
      ui.detener.hidden = true;
      callar();
      if (silencio) return true;
      try { A.pausar(); } catch (e) { /* nada que pausar */ }
      if (ui.tarjeta.contains(doc.activeElement) || doc.activeElement === doc.body) ui.hablar.focus();
      responder(u().recorridoDetenido, { paginaAnuncia: false, seguir: false });
      return true;
    }

    /* ---------- lo que se ve ---------- */
    /* La línea de estado de la tarjeta: dice con palabras lo mismo que muestra la esfera, y avisa si falta voz o micrófono. */
    function pintarLinea() {
      const partes = [guia.escuchando ? u().teEscucho : guia.pensando ? u().pensando : guia.hablando ? u().hablando : u().lista];
      if (!Reconocedor) partes.push(u().sinReconocimiento);
      if (!modoLector()) {
        if (!sintesis) partes.push(u().sinVoz);
        else if (voces.length && !vocesIdioma().length) partes.push(u().sinVozIdioma);
      }
      ui.estado.textContent = partes.join(" ");
    }
    function pintarEstado() {
      pintarEsfera();
      const sinVoz = modoLector() || !puedeHablar();
      for (const c of [ui.voz, ui.velocidad, ui.probar]) c.disabled = sinVoz;
    }
    const nombreVelocidad = (v) => u().velocidades[v < 0.85 ? 0 : v > 1.1 ? 2 : 1];
    /* Pone todos los textos de la tarjeta en el idioma de la guía. */
    function pintarTextos() {
      const t = u();
      panel.lang = guia.idioma;
      panel.setAttribute("aria-label", t.nombre);
      for (const e of panel.querySelectorAll("[data-t]")) e.textContent = t[e.dataset.t];
      for (const e of panel.querySelectorAll("[data-t-aria]")) e.setAttribute("aria-label", t[e.dataset.tAria]);
      panel.querySelectorAll(".gv-chip:not(.gv-chip-recorrido)").forEach((c, i) => { c.textContent = SUGERENCIAS[guia.idioma][i]; });
      ui.listaAyuda.replaceChildren(...t.ayudaLista.map((x) => { const li = doc.createElement("li"); li.textContent = x; return li; }));
      ui.hablarTexto.textContent = guia.escuchando ? t.escuchando : t.hablar;
      ui.velocidad.setAttribute("aria-valuetext", nombreVelocidad(Number(ui.velocidad.value)));
      ui.idioma.value = guia.idioma;
      if (!guia.ultima) ui.respuesta.textContent = t.inicial;
      if (enlaceSalto) enlaceSalto.textContent = t.saltar;
      if (ia && ia.traducir) ia.traducir(guia.idioma);
      cargarVoces();
      pintarEstado();
    }
    function fijarIdioma(idioma, { avisar = true } = {}) {
      guia.idioma = idioma === "en" ? "en" : "es";
      idiomaRec = 0;
      guardar({ idioma: guia.idioma });
      callar();
      pintarTextos();
      if (avisar) responder(u().idiomaListo);
    }
    function fijarLector(usa, { avisar = true } = {}) {
      guia.lector = !!usa;
      guardar({ lector: guia.lector });
      ui.lector.checked = guia.lector;
      if (guia.lector) callar();
      pintarEstado();
      if (avisar) responder(guia.lector ? u().lectorSi : u().lectorNo, { seguir: false });
    }

    /* ---------- eventos ---------- */
    ui.hablar.addEventListener("click", pulsarEsfera);
    ui.cerrar.addEventListener("click", cerrarTarjeta);
    ui.detener.addEventListener("click", () => detenerRecorrido());
    ui.escribir.addEventListener("click", () => { const abrir = ui.zonaEscribir.hidden; abrirEscribir(abrir); if (abrir) ui.campo.focus(); });
    ui.formulario.addEventListener("submit", (e) => {
      e.preventDefault();
      const texto = ui.campo.value.trim();
      if (!texto) return;
      ui.campo.value = "";
      atender(texto);
    });
    for (const chip of panel.querySelectorAll(".gv-chip")) chip.addEventListener("click", () => atender(chip.textContent));
    ui.idioma.addEventListener("change", () => fijarIdioma(ui.idioma.value));
    ui.lector.addEventListener("change", () => fijarLector(ui.lector.checked));
    ui.tecla.addEventListener("change", () => guardar({ tecla: ui.tecla.checked }));
    ui.seguir.addEventListener("change", () => guardar({ seguir: ui.seguir.checked }));
    ui.voz.addEventListener("change", () => guardar({ voces: { ...(leer().voces || {}), [guia.idioma]: ui.voz.value } }));
    ui.velocidad.addEventListener("input", () => {
      ui.velocidad.setAttribute("aria-valuetext", nombreVelocidad(Number(ui.velocidad.value)));
      guardar({ velocidad: Number(ui.velocidad.value) });
    });
    ui.probar.addEventListener("click", () => { if (puedeHablar()) decir(u().prueba); });

    /* Atajos: H habla con la guía (se puede apagar) y Esc cierra. No hay más teclas: la barra espaciadora no se usa. */
    doc.addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const d = e.target, etiqueta = d.tagName;
      const escribe = etiqueta === "TEXTAREA" || etiqueta === "SELECT" || d.isContentEditable ||
        (etiqueta === "INPUT" && !["range", "checkbox"].includes(d.type));
      if (e.key === "Escape" && guia.escuchando) { try { rec.abort(); } catch (x) { /* ya cerrado */ } pintarEscucha(false); return; }
      if (e.key === "Escape" && guia.enRecorrido) { detenerRecorrido(); return; }
      if (e.key === "Escape" && !ui.tarjeta.hidden && panel.contains(d)) { callar(); cerrarTarjeta(); return; }
      if (escribe || !ui.tecla.checked) return;
      if (e.key === "h" || e.key === "H") { e.preventDefault(); pulsarEsfera(); }
    });
    ventana.addEventListener("pagehide", () => { callar(); try { if (rec) rec.abort(); } catch (e) { /* nada */ } });

    /* ---------- estado inicial ---------- */
    if (typeof pref.tecla === "boolean") ui.tecla.checked = pref.tecla;
    if (typeof pref.seguir === "boolean") ui.seguir.checked = pref.seguir;
    if (pref.velocidad >= 0.6 && pref.velocidad <= 1.4) ui.velocidad.value = String(pref.velocidad);
    ui.lector.checked = guia.lector;
    ui.hablar.setAttribute("aria-keyshortcuts", "H");
    ui.hablar.setAttribute("aria-expanded", "false");
    ui.hablar.setAttribute("aria-controls", "gv-tarjeta");
    // enlace para saltar a la guía, después del "Saltar a…" de la página (si lo tiene)
    let enlaceSalto = null;
    const salto = doc.querySelector("a.saltar");
    if (salto) {
      enlaceSalto = doc.createElement("a");
      enlaceSalto.className = salto.className; enlaceSalto.href = "#gv-hablar";
      enlaceSalto.addEventListener("click", (e) => { e.preventDefault(); ui.hablar.focus(); });
      salto.after(enlaceSalto);
    }
    try {
      if (ventana.GuiaVozIA) ia = ventana.GuiaVozIA.conectar({ A, doc, ventana, panel, preferencias: { leer, guardar }, idioma: () => guia.idioma,
        herramientas: { interpretarComando, ejecutar, normalizar, buscarFecha, resumenSerie } });
    } catch (e) { ia = null; }                        // si la IA no arranca, la guía sigue con sus comandos
    if (sintesis && sintesis.addEventListener) sintesis.addEventListener("voiceschanged", cargarVoces);
    // sin voz o sin reconocimiento: el campo para escribir y las frases sugeridas quedan a la vista desde el principio
    abrirEscribir(!Reconocedor || !sintesis);
    pintarTextos();

    return { atender, escuchar, callar, recorrer, detenerRecorrido, fijarIdioma, fijarLector, estado: guia };
  }

  return { interpretarComando, interpretarES, interpretarEN, normalizar, normalizarEN, palabrasANumeros, palabrasANumerosEN, buscarFecha, buscarPista, leerFecha,
    fechaDicha, resumenSerie, guionRecorrido, valorDicho, elegirVozDe, ACCIONES_RECORRIDO, SUGERENCIAS, TEXTOS: L, INTERFAZ: U, TONO_VOZ, VELOCIDAD_VOZ,
    ESPERA_SEGUIR_MS, ESPERA_AVISO_MS, SILENCIO_MS, HABLA_MAX_MS, ejecutar, montar, AYUDA, AYUDA_EN };
});
