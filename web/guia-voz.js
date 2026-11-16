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

    // ---- «dónde está el volumen», «señala la leyenda»: la guía muestra ese lugar de la página
    { const m = /\b(?:donde (?:esta|estan|queda|quedan|veo|encuentro)|senala(?:me)?|(?:muestrame|ensename) donde(?: esta| estan)?)\b(.*)$/.exec(s);
      const l = m && lugarDicho(m[1]); if (l) return { tipo: "senalar", lugar: l }; }

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
    // "where is the volume", "point to the legend": the guide shows that place on the page
    { const m = /\b(?:where (?:is|are|can i (?:see|find))|show me where(?: is| are)?|point (?:to|at))\b(.*)$/.exec(s);
      const l = m && lugarDicho(m[1]); if (l) return { tipo: "senalar", lugar: l }; }
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
        salto: (f, v) => `Salto hacia ${f}: ${v}. Es el punto más alto: por eso la melodía sube hasta aquí.`,
        segunda: (t, dir) => `Segunda pista: ${t}.` + (dir ? ` Aquí la melodía ${dir}.` : ""),
        direccion: { sube: "sube", baja: "baja", "sube y baja": "sube y baja" },
        boton: "Con este botón pausas cuando quieras.",
        suenaMar: "Escucha cómo suena el mar.",
        saltoMar: (f, v) => `Salto hacia ${f}: ${v}. Es el punto más bajo: por eso suena más grave.`,
        fin: "Fin del recorrido. Ahora explora tú, o pregúntame lo que quieras.",
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
        salto: (f, v) => `Jumping towards ${f}: ${v}. It is the highest point: the melody climbs up to here.`,
        segunda: (t, dir) => `Second track: ${t}.` + (dir ? ` Here the melody ${dir}.` : ""),
        direccion: { sube: "rises", baja: "falls", "sube y baja": "rises and falls" },
        boton: "This button pauses whenever you like.",
        suenaMar: "Listen to how the ocean sounds.",
        saltoMar: (f, v) => `Jumping towards ${f}: ${v}. It is the lowest point: that is why it sounds lower.`,
        fin: "End of the tour. Now it is your turn: explore, or ask me anything.",
      },
    },
  };
  const textos = (idioma) => L[idioma === "en" ? "en" : "es"];

  /* Los ÚNICOS lugares de la página que la guía puede señalar. Lista fija: el adaptador dice dónde está cada uno
     (A.lugar(nombre)); la IA solo puede pedir uno de estos y cualquier otro valor se descarta. */
  const LUGARES = ["pistas", "reproductor", "reproducir", "cambiar", "volumen", "avance", "grafico", "lectura", "descripcion", "leyenda",
    "como_funciona", "por_que", "accesibilidad", "equipo"];
  const NOMBRES_LUGAR = {
    es: { pistas: "la lista de pistas", reproductor: "el reproductor", reproducir: "el botón de reproducir y pausar", cambiar: "el botón para cambiar de pista",
      volumen: "el volumen", avance: "la línea de tiempo", grafico: "el gráfico de la pista", lectura: "la lectura en vivo", descripcion: "la descripción de la pista",
      leyenda: "la leyenda de colores", como_funciona: "la sección Cómo funciona", por_que: "la sección que cuenta por qué escuchar los datos",
      accesibilidad: "la sección de accesibilidad", equipo: "la sección del equipo" },
    en: { pistas: "the track list", reproductor: "the player", reproducir: "the play and pause button", cambiar: "the button to switch tracks",
      volumen: "the volume", avance: "the timeline", grafico: "the chart of the track", lectura: "the live reading", descripcion: "the description of the track",
      leyenda: "the colour legend", como_funciona: "the How it works section", por_que: "the section on why to listen to data",
      accesibilidad: "the accessibility section", equipo: "the team section" },
  };
  const FRASES_LUGAR = {
    es: { aqui: (n) => `Aquí está ${n}.`, sinLugar: "No encuentro ese lugar en la página.", foco: (n) => `Te llevé a ${n}.`.replace(" a el ", " al ") },
    en: { aqui: (n) => `Here is ${n}.`, sinLugar: "I cannot find that place on the page.", foco: (n) => `I took you to ${n}.` },
  };
  const nombreLugar = (lugar, idioma) => NOMBRES_LUGAR[idioma === "en" ? "en" : "es"][lugar] || "";
  /* De unas palabras (ya normalizadas, en español o inglés) al lugar del que hablan, o null. */
  const PALABRAS_LUGAR = [
    ["reproducir", /\b(reproducir|play|pausar?|pause)\b/], ["cambiar", /\b(cambiar|cambio|switch|change)\b/], ["volumen", /\b(volumen|volume)\b/],
    ["avance", /\b(linea de tiempo|avance|barra|timeline|progress)\b/], ["grafico", /\b(grafic\w*|chart|graph)\b/], ["leyenda", /\b(leyenda|colores|legend|colou?rs)\b/],
    ["descripcion", /\b(descripcion|description)\b/], ["lectura", /\b(lectura|que pasa ahora|reading|live)\b/], ["pistas", /\b(pistas|lista|tracks?)\b/],
    ["como_funciona", /\b(como funciona|how it works)\b/], ["por_que", /\b(por que|why)\b/], ["accesibilidad", /\b(accesib\w*|accessib\w*)\b/],
    ["equipo", /\b(equipo|team)\b/], ["reproductor", /\b(reproductor|video|mapa|player|map)\b/],
  ];
  function lugarDicho(palabras) {
    const hallado = PALABRAS_LUGAR.find(([, re]) => re.test(String(palabras || "")));
    return hallado ? hallado[0] : null;
  }
  /* Qué lugar se señala al explicar cada cosa (solo si el adaptador sabe señalar). */
  const LUGAR_DE = { explicar: "lectura", explicar_tono: "grafico", descripcion: "lectura", leyenda: "leyenda", pistas: "pistas", volumen: "volumen", donde: "reproductor" };

  /* El recorrido guiado: un guion FIJO (no lo escribe ningún modelo). Cada paso tiene un texto, una pausa para
     dejar oír la música y, a veces, una acción de ACCIONES_RECORRIDO. Las cifras salen de resumenSerie(). */
  const ACCIONES_RECORRIDO = ["elegir", "reproducir", "saltar_tiempo"];
  /* Cada paso: { texto, pausa, accion, lugar, pulsar }. lugar = qué se señala mientras se explica (de LUGARES).
     pulsar = el control de la página que el puntero pulsa de verdad ({ control, indice }); accion es lo mismo dicho como
     acción, y se usa si el control no está o si la página no tiene puntero. */
  function guionRecorrido(A, idioma = "es") {
    const pistas = A.pistas(idioma), R0 = textos(idioma).recorrido, f = (x) => fechaDicha(x, idioma);
    const de = (i) => { const d = (A.detalle && pistas[i] && A.detalle(i)) || {}; return { ...d, resumen: resumenSerie(d.serie) }; };
    const pasos = [{ accion: null, pausa: 0, texto: R0.bienvenida, lugar: "pistas" }];
    if (pistas[0]) {
      const d = de(0), R = d.resumen;
      pasos.push({ accion: { tipo: "elegir", numero: 1 }, pulsar: { control: "pista", indice: 0 }, lugar: "reproductor", pausa: 2500,
        texto: R0.primera(pistas[0].titulo, R ? f(R.tendencia.inicio.fecha) : "") });
      pasos.push({ accion: { tipo: "reproducir" }, pulsar: { control: "reproducir" }, lugar: "reproducir", pausa: 300, texto: R0.boton });
      // unos segundos antes del punto más alto: la música sube hasta él mientras la guía lo cuenta
      if (R) pasos.push({ accion: { tipo: "saltar_tiempo", segundos: Math.max(0, Math.round((R.maximo.t - 7) * 10) / 10) }, pulsar: { control: "avance" }, lugar: "grafico", pausa: 2000,
        texto: R0.salto(f(R.maximo.fecha), valorDicho(R.maximo.valor, d, idioma)) });
    }
    if (pistas[1]) {
      const d = de(1), R = d.resumen;
      // la segunda pista también se oye de verdad: se cambia, se pulsa reproducir si hace falta, y se salta a su momento clave
      pasos.push({ accion: { tipo: "elegir", numero: 2 }, pulsar: { control: "cambiar" }, lugar: "reproductor", pausa: 300,
        texto: R0.segunda(pistas[1].titulo, R ? R0.direccion[R.tendencia.direccion] : "") });
      pasos.push({ accion: { tipo: "reproducir" }, pulsar: { control: "reproducir" }, lugar: "reproducir", pausa: 2000, texto: R0.suenaMar });
      if (R) pasos.push({ accion: { tipo: "saltar_tiempo", segundos: Math.max(0, Math.round((R.minimo.t - 4) * 10) / 10) }, pulsar: { control: "avance" }, lugar: "lectura", pausa: 2000,
        texto: R0.saltoMar(f(R.minimo.fecha), valorDicho(R.minimo.valor, d, idioma)) });
    }
    pasos.push({ accion: null, pausa: 0, texto: R0.fin });
    return pasos;
  }

  /* Ejecuta una acción con el adaptador y responde en el idioma pedido. Devuelve { texto, paginaAnuncia, paginaHabla }:
     paginaAnuncia = la página ya lo dirá al lector de pantalla; paginaHabla = la página ya lo dirá con su voz. */
  async function ejecutar(accion, A, memoria = {}, idioma = "es") {
    const sabeSenalar = typeof A.lugar === "function", F = FRASES_LUGAR[idioma === "en" ? "en" : "es"];
    if (accion.tipo === "senalar") {                                       // solo lugares de la lista fija, y solo si están en la página
      const hay = sabeSenalar && LUGARES.includes(accion.lugar) && A.lugar(accion.lugar);
      return hay ? { texto: F.aqui(nombreLugar(accion.lugar, idioma)), lugar: accion.lugar } : { texto: F.sinLugar };
    }
    const res = await ejecutarAccion(accion, A, memoria, idioma);
    const lugar = accion.tipo === "sobre_web" ? accion.tema : LUGAR_DE[accion.tipo];
    return sabeSenalar && res && res.texto && LUGARES.includes(lugar) && A.lugar(lugar) ? { ...res, lugar } : res;
  }
  async function ejecutarAccion(accion, A, memoria = {}, idioma = "es") {
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

  /* ================================================================== C0. qué voz usa la guía y cómo prepara el texto */

  /* Voces de adorno o de baja calidad que traen algunos sistemas (macOS sobre todo): nunca se eligen solas. */
  const VOCES_RARAS = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|eloquence|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|hysterical|pipe organ|princess)\b/i;
  /* Países preferidos por idioma (de más a menos). Las demás variantes valen, pero después. */
  const PAISES_VOZ = { es: ["es-ec", "es-mx", "es-es", "es-us", "es-co", "es-419"], en: ["en-us", "en-gb"] };
  const TONO_VOZ = 1, VELOCIDAD_VOZ = 1;              // voz tal cual la da el navegador: ni más grave ni más lenta

  /* Qué tan natural suena una voz, por su nombre: 3 = neuronal en línea (Edge: «Natural», «Online»), 2 = de Google
     (Chrome), 1 = instalada en el sistema, 0 = de adorno. */
  function calidadVoz(v) {
    const nombre = String((v && v.name) || "");
    if (VOCES_RARAS.test(nombre)) return 0;
    if (/natural|online|neural/i.test(nombre)) return 3;
    if (/^google\b/i.test(nombre)) return 2;
    return 1;
  }
  /* voces = las del navegador ({ name, lang }). Devuelve la más natural para el idioma, o null si no hay ninguna.
     Orden: primero las «Natural» u «Online», luego las de Google, luego las locales; dentro de cada grupo, por país
     (español: Ecuador, México, España…; inglés: Estados Unidos, Reino Unido). Masculinas y femeninas valen igual.
     preferida = "nombre|idioma" elegida a mano en las opciones (gana siempre que exista). */
  function elegirVozDe(voces, idioma = "es", preferida = "") {
    const pais = (v) => String(v.lang).toLowerCase().replace("_", "-");
    const del = (voces || []).filter((v) => v && pais(v).startsWith(idioma));
    if (!del.length) return null;
    const aMano = del.find((v) => `${v.name}|${v.lang}` === preferida);
    if (aMano) return aMano;
    const paises = PAISES_VOZ[idioma] || [];
    const puesto = (v) => { const i = paises.indexOf(pais(v)); return i < 0 ? paises.length : i; };
    let mejor = null, nota = -1;
    for (const v of del) {                              // a igual nota, gana la primera de la lista del navegador
      const n = calidadVoz(v) * 100 - puesto(v);
      if (n > nota) { mejor = v; nota = n; }
    }
    return mejor;
  }

  const MESES_ABREV = {
    es: { ene: "enero", feb: "febrero", mar: "marzo", abr: "abril", may: "mayo", jun: "junio", jul: "julio", ago: "agosto", sep: "septiembre", sept: "septiembre", oct: "octubre", nov: "noviembre", dic: "diciembre" },
    en: { jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June", jul: "July", aug: "August", sep: "September", sept: "September", oct: "October", nov: "November", dec: "December" },
  };
  /* Deja el texto listo para decirlo en voz alta: lo que se ve en el subtítulo no cambia.
     «°C» se dice «grados», los signos se dicen con palabras, los rangos de años llevan «a», los meses abreviados se
     dicen enteros, no se leen símbolos, y los paréntesis y las rayas se vuelven pausas (comas). */
  function prepararParaVoz(texto, idioma = "es") {
    const en = idioma === "en";
    const meses = MESES_ABREV[en ? "en" : "es"];
    let t = String(texto == null ? "" : texto);
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ");                      // emojis y adornos
    t = t.replace(/[«»“”"*_#`~|<>\[\]{}]/g, "").replace(/[•·→←↑↓]/g, ", ");                              // símbolos que no se leen
    t = t.replace(/\s*\n+\s*/g, ". ");
    t = t.replace(/(\d{4})\s*[–—-]\s*(\d{4})/g, en ? "$1 to $2" : "$1 a $2");                            // 1880–2023
    t = t.replace(/(^|[\s(:;,])[−-]\s?(\d)/g, en ? "$1minus $2" : "$1menos $2");                        // −0,36
    t = t.replace(/(^|[\s(:;,])\+\s?(\d)/g, en ? "$1plus $2" : "$1más $2");                             // +0,47
    t = t.replace(/(^|[^\d.,])1\s?°\s?C\b/g, en ? "$11 degree" : "$11 grado");                           // 1 °C
    t = t.replace(/\s?°\s?C\b/g, en ? " degrees" : " grados").replace(/\s?°/g, en ? " degrees" : " grados");
    t = t.replace(/(\d)\s?%/g, en ? "$1 percent" : "$1 por ciento");
    t = t.replace(/\bCO2\b/g, en ? "C O 2" : "C O 2");
    t = t.replace(/(?<!\b(?:del|el|al) )\b([A-Za-zé]{3,4})\.? (\d{4})\b/gi, (todo, mes, anio) => {                            // «mar 2007» -> «marzo de 2007»
      const m = meses[mes.toLowerCase()];
      return m ? (en ? `${m} ${anio}` : `${m} de ${anio}`) : todo;
    });
    if (!en) t = t.replace(/\bp\. ?ej\./gi, "por ejemplo").replace(/\betc\./gi, "etcétera");
    t = t.replace(/\s*[(]\s*/g, ", ").replace(/\s*[)]\s*([.,;:!?])/g, "$1").replace(/\s*[)]\s*/g, ", ");   // paréntesis = pausa
    t = t.replace(/\s+[–—-]\s+/g, ", ").replace(/[–—]/g, ", ");                                          // rayas = pausa
    t = t.replace(/\s*\/\s*/g, en ? " or " : " o ");
    t = t.replace(/([.,;:!?])(?=[^\s\d.,;:!?])/g, "$1 ");                                                // espacio tras el signo: la voz hace la pausa
    t = t.replace(/\s+([.,;:!?])/g, "$1").replace(/,\s*,/g, ",").replace(/,\s*([.;:!?])/g, "$1").replace(/([.;:!?])\s*,\s*/g, "$1 ").replace(/\s+/g, " ").trim();
    return t.replace(/^[,;:]\s*/, "");
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
      bienvenida: "Hola, soy Eco. En menos de un minuto te enseño cómo suena el clima de la Tierra.", empezar: "Empezar el recorrido guiado",
      explorar: "Explorar yo solo", cerrarBienvenida: "Cerrar la bienvenida",
      intro: "Hola, soy Eco, tu guía en Resonant Earth. Aquí los mapas del clima de la NASA se convierten en música. Sube el volumen: en menos de un minuto vas a oír cómo se ha calentado el planeta.",
      nombre: "Eco, la guía por voz", alias: "Eco", rol: "Guía por voz", hablar: "Háblame", hablarOye: "Háblame · o di «Oye Eco»", escuchando: "Te escucho…", cerrar: "Cerrar la guía", inicial: "Pulsa la esfera y háblame.",
      saludo: "Hola, soy Eco, la guía de Resonant Earth. ¿Qué quieres escuchar?",
      pistaLector: "Atajo: tecla H. Si usas un lector de pantalla, márcalo en Ayuda y opciones y la guía responderá por escrito.",
      lista: "Lista.", pensando: "Un momento…", espera: "Un momento.", teEscucho: "Te escucho.", hablando: "Hablando…", sigo: "Sigo escuchando…", silencio: "(en silencio)",
      abrirPanel: "Abrir el panel de la guía", cerrarBarra: "Cerrar los subtítulos",
      escribir: "Escribir", campo: "Escribe tu pregunta", enviar: "Enviar", sugeridas: "Atajos", recorrido: "Dame un recorrido", detener: "Detener el recorrido",
      opciones: "Ayuda y opciones", quePuedoDecir: "Puedes decir",
      ayudaLista: ["«Reproduce» o «pausa»", "«Llévame a 1990»", "«¿Qué estoy escuchando?»", "«Dame un recorrido»"],
      idioma: "Idioma (Language)",
      lector: "Uso un lector de pantalla (NVDA, JAWS, VoiceOver, TalkBack). La guía responderá solo por escrito, para que no se mezclen dos voces.",
      tecla: "Usar la tecla H para hablar",
      oye: "Activar con «Oye Eco»", oyeNota: "Viene activo desde tu primer clic. Mientras lo está, el micrófono queda abierto en esta página; en Chrome y Edge el audio va al servicio de voz del navegador. Se pausa tras 10 minutos sin usarse y vuelve con tu siguiente acción.",
      oyeApagar: "Apagar «Oye Eco»", apagarCorto: "Apagar",
      oyeBienvenida: "Activar «Oye Eco»: llámame con la voz, sin pulsar nada",
      oyeBienvenidaNota: "Puedes llamarme en cualquier momento diciendo: Oye Eco. El navegador te pedirá permiso para usar el micrófono. Lo puedes cambiar después en Ayuda y opciones.",
      oyeSinPermiso: "«Oye Eco»: sin permiso de micrófono. Actívalo en el candado de la barra de direcciones.",
      oyeLlamame: "Cuando quieras, llámame diciendo: Oye Eco.", oyeEscuchando: "Escuchando «Oye Eco»", oyePausadoHablo: "«Oye Eco»: pausado mientras hablo",
      oyePausadoEscucho: "«Oye Eco»: pausado mientras te escucho", oyePausadoRecorrido: "«Oye Eco»: pausado durante el recorrido", oyePausadoPienso: "«Oye Eco»: pausado mientras pienso",
      oyeActivando: "«Oye Eco»: activando el micrófono…", oyeRed: "«Oye Eco»: sin conexión con el servicio de voz; reintento en unos segundos",
      oyeNoDisponible: "«Oye Eco» no está disponible en este navegador. Usa la esfera o la tecla H.", oyeNoViable: "«Oye Eco» no funciona bien en este navegador y lo apagué. Usa la esfera o la tecla H.",
      oyeLector: "«Oye Eco» está apagado con lector de pantalla.", oyeSinMicro: "«Oye Eco»: no encuentro ningún micrófono.", oyeDormido: "«Oye Eco» en pausa por 10 minutos sin uso: vuelve con tu próxima acción.",
      oyePrimerClic: "«Oye Eco» se activa con tu primer clic.", oyeApagadoTexto: "«Oye Eco»: apagado.",
      seguir: "Escuchar de nuevo después de cada respuesta", voz: "Voz", vozAuto: "La más natural", velocidad: "Velocidad", probar: "Probar la voz", prueba: "Esta es la voz de la guía.",
      velocidades: ["lenta", "normal", "rápida"],
      privacidad: "El micrófono solo se abre al pulsar la esfera, después de una respuesta o si activas «Oye Eco». Tu navegador convierte la voz en texto; esta página no la guarda.",
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
      bienvenida: "Hi, I am Eco. In under a minute I will show you what Earth's climate sounds like.", empezar: "Start the guided tour",
      explorar: "Explore on my own", cerrarBienvenida: "Close the welcome",
      intro: "Hello, I am Eco, your guide to Resonant Earth. Here, NASA climate maps become music. Turn up the volume: in under a minute you will hear how the planet has warmed.",
      nombre: "Eco, the voice guide", alias: "Eco", rol: "Voice guide", hablar: "Talk to me", hablarOye: "Talk to me · or say “Hey Eco”", escuchando: "Listening…", cerrar: "Close the guide", inicial: "Press the sphere and talk to me.",
      saludo: "Hello, I am Eco, the Resonant Earth guide. What would you like to hear?",
      pistaLector: "Shortcut: H key. If you use a screen reader, tick it under Help and options and the guide will answer in writing.",
      lista: "Ready.", pensando: "One moment…", espera: "One moment.", teEscucho: "I am listening.", hablando: "Speaking…", sigo: "Still listening…", silencio: "(silent)",
      abrirPanel: "Open the guide panel", cerrarBarra: "Close the captions",
      escribir: "Type", campo: "Type your question", enviar: "Send", sugeridas: "Shortcuts", recorrido: "Give me a tour", detener: "Stop the tour",
      opciones: "Help and options", quePuedoDecir: "You can say",
      ayudaLista: ["“Play” or “pause”", "“Take me to 1990”", "“What am I hearing?”", "“Give me a tour”"],
      idioma: "Language (Idioma)",
      lector: "I use a screen reader (NVDA, JAWS, VoiceOver, TalkBack). The guide will answer in writing only, so two voices do not overlap.",
      tecla: "Use the H key to talk",
      oye: "Wake with “Hey Eco”", oyeNota: "It is on from your first click. While it is on, the microphone stays open on this page; in Chrome and Edge the audio goes to the browser's speech service. It pauses after 10 minutes without use and comes back with your next action.",
      oyeApagar: "Turn off “Hey Eco”", apagarCorto: "Turn off",
      oyeBienvenida: "Turn on “Hey Eco”: call me with your voice, no pressing needed",
      oyeBienvenidaNota: "You can call me at any time by saying: Hey Eco. Your browser will ask for permission to use the microphone. You can change this later under Help and options.",
      oyeSinPermiso: "“Hey Eco”: no microphone permission. Turn it on from the padlock in the address bar.",
      oyeLlamame: "Whenever you like, call me by saying: Hey Eco.", oyeEscuchando: "Listening for “Hey Eco”", oyePausadoHablo: "“Hey Eco”: paused while I speak",
      oyePausadoEscucho: "“Hey Eco”: paused while I listen to you", oyePausadoRecorrido: "“Hey Eco”: paused during the tour", oyePausadoPienso: "“Hey Eco”: paused while I think",
      oyeActivando: "“Hey Eco”: turning the microphone on…", oyeRed: "“Hey Eco”: no connection to the speech service; retrying in a few seconds",
      oyeNoDisponible: "“Hey Eco” is not available in this browser. Use the sphere or the H key.", oyeNoViable: "“Hey Eco” does not work well in this browser, so I turned it off. Use the sphere or the H key.",
      oyeLector: "“Hey Eco” is off while using a screen reader.", oyeSinMicro: "“Hey Eco”: I cannot find a microphone.", oyeDormido: "“Hey Eco” paused after 10 minutes without use: it comes back with your next action.",
      oyePrimerClic: "“Hey Eco” turns on with your first click.", oyeApagadoTexto: "“Hey Eco”: off.",
      seguir: "Listen again after each answer", voz: "Voice", vozAuto: "Most natural", velocidad: "Speed", probar: "Test the voice", prueba: "This is the guide's voice.",
      velocidades: ["slow", "normal", "fast"],
      privacidad: "The microphone only opens when you press the sphere, after an answer, or if you turn on “Hey Eco”. Your browser turns your voice into text; this page does not store it.",
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
  const OYE_MAX_MS = 10 * 60000;                      // «Oye Eco» se apaga solo tras 10 minutos sin usarse

  /* «Oye Eco» / «Hey Eco»: la palabra de activación, con las variantes que suele escribir el reconocimiento.
     Devuelve null si no está, o { orden } con lo que se dijo después ("" si no dijo nada más). */
  // variantes que escriben los reconocimientos para «oye eco» / «hey eco»: «oye ego», «oye ecco», «hoy eco», «oye eso», «hey echo»…
  const PALABRA_ECO = /(?:^|\s)(?:oye|oie|olle|oyes|hoye|hoy|oy|hey|hei|ei|ey|ay|ok|okay|okey|oquei|o k)\s+(?:eco|ecco|eko|ekko|echo|ecko|heco|hecho|ego|eso|ecos)\b\s*(.*)$/;
  const SOLO_ECO = /^(?:eco|ecco|echo|eko|ekko|heco)$/;
  function palabraActivacion(texto) {
    // limpieza propia (normalizar() quita «oye» como cortesía): minúsculas, sin tildes ni signos
    const s = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
    if (SOLO_ECO.test(s) || /^oye ?eco$/.test(s)) return { orden: "" };       // «Eco» a secas, o todo junto
    const m = PALABRA_ECO.exec(s);
    if (!m) return null;
    const orden = m[1].replace(/^(?:por favor|please)\s+/, "").trim();
    return { orden: orden.length >= 2 ? orden : "" };
  }
  const ESPERA_AVISO_MS = 1500;                       // si la IA tarda más, la guía dice «un momento»
  const ESPERA_SEGUIR_MS = 10000;                     // tras una respuesta, cuánto espera a que la persona empiece a hablar
  const SILENCIO_MS = 2500;                           // silencio tras la última palabra para dar la frase por terminada
  const SILENCIO_SIN_TEXTO_MS = 5000;                 // se oyó voz pero aún no hay palabras: un poco más de margen
  const HABLA_MAX_MS = 30000;                         // lo máximo que puede durar una frase

  /* La tarjeta no lleva textos: los pone pintarTextos() en el idioma elegido (atributos data-t y data-t-aria).
     Orden: cabecera (avatar, nombre, cerrar), subtítulo, estado, «Escribir» y «Ayuda y opciones» plegado. */
  const PLANTILLA = `
    <div class="gv-tarjeta gv-bienvenida" id="gv-bienvenida" role="dialog" aria-labelledby="gv-bienvenida-titulo" aria-describedby="gv-bienvenida-texto" hidden>
      <div class="gv-cabecera">
        <span class="gv-avatar" aria-hidden="true"></span>
        <p class="gv-identidad" id="gv-bienvenida-titulo"><strong class="gv-alias" data-t="alias"></strong> <span class="gv-rol" data-t="rol"></span></p>
        <button type="button" id="gv-bienvenida-cerrar" class="gv-cerrar" data-t-aria="cerrarBienvenida">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
        </button>
      </div>
      <p id="gv-bienvenida-texto" class="gv-subtitulo" data-t="bienvenida"></p>
      <div class="gv-bienvenida-opciones">
        <div class="gv-campo-opcion"><label for="gv-b-idioma" data-t="idioma"></label><select id="gv-b-idioma"><option value="es" lang="es">Español</option><option value="en" lang="en">English</option></select></div>
        <label class="gv-casilla"><input type="checkbox" id="gv-b-oye" aria-describedby="gv-b-oye-nota" checked> <span data-t="oyeBienvenida"></span></label>
        <p class="gv-nota" id="gv-b-oye-nota" data-t="oyeBienvenidaNota"></p>
      </div>
      <div class="gv-fila">
        <button type="button" id="gv-empezar" class="gv-boton gv-boton-principal" data-t="empezar"></button>
        <button type="button" id="gv-explorar" class="gv-boton" data-t="explorar"></button>
      </div>
    </div>
    <div class="gv-tarjeta" id="gv-tarjeta" hidden>
      <div class="gv-cabecera">
        <span class="gv-avatar" aria-hidden="true"></span>
        <p class="gv-identidad"><strong class="gv-alias" data-t="alias"></strong> <span class="gv-rol" data-t="rol"></span></p>
        <button type="button" id="gv-cerrar" class="gv-cerrar" data-t-aria="cerrar">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
        </button>
      </div>
      <p id="gv-respuesta" class="gv-subtitulo" tabindex="0"></p>
      <div class="gv-barra-acciones">
        <button type="button" id="gv-barra-escribir" class="gv-boton gv-boton-chico" data-t="escribir"></button>
        <button type="button" id="gv-barra-opciones" class="gv-boton gv-boton-chico" aria-controls="gv-opciones" data-t="opciones"></button>
        <button type="button" id="gv-barra-cerrar" class="gv-cerrar" data-t-aria="cerrarBarra">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="14" height="14"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
        </button>
      </div>
      <p id="gv-oye-linea" class="gv-oye-linea"><span id="gv-oye-linea-texto"></span> <button type="button" id="gv-oye-linea-apagar" class="gv-oye-linea-apagar" data-t="apagarCorto" data-t-aria="oyeApagar" hidden></button></p>
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
          <label class="gv-casilla"><input type="checkbox" id="gv-oye" aria-describedby="gv-oye-nota"> <span data-t="oye"></span></label>
          <p class="gv-nota" id="gv-oye-nota" data-t="oyeNota"></p>
        </div>
        <p class="gv-nota" id="gv-privacidad" data-t="privacidad"></p>
      </details>
    </div>
    <p id="gv-oye-indicador" class="gv-oye-indicador" hidden><span class="gv-oye-punto" aria-hidden="true"></span><span id="gv-oye-texto"></span>
      <button type="button" id="gv-oye-apagar" class="gv-oye-apagar" data-t-aria="oyeApagar"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="14" height="14"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg></button></p>
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
    panel.dataset.vista = "barra";                   // barra: solo los subtítulos (por defecto y en el recorrido) | completo: el panel
    panel.innerHTML = PLANTILLA;
    const ancla = A.ancla && A.ancla(), principal = doc.querySelector("main");   // el adaptador dice dónde va el panel
    if (ancla) ancla.before(panel); else if (principal) principal.before(panel); else doc.body.prepend(panel);

    const ui = { hablar: $("gv-hablar"), hablarTexto: $("gv-hablar-texto"), estado: $("gv-estado"), formulario: $("gv-formulario"), campo: $("gv-campo"),
      tarjeta: $("gv-tarjeta"), cerrar: $("gv-cerrar"), detener: $("gv-detener"), respuesta: $("gv-respuesta"), vivo: $("gv-vivo"), escucha: $("gv-escucha"),
      escribir: $("gv-escribir"), zonaEscribir: $("gv-zona-escribir"), opciones: $("gv-opciones"), listaAyuda: $("gv-lista-ayuda"), idioma: $("gv-idioma"),
      lector: $("gv-lector"), tecla: $("gv-tecla"), seguir: $("gv-seguir"), voz: $("gv-voz"), velocidad: $("gv-velocidad"), probar: $("gv-probar"),
      barraEscribir: $("gv-barra-escribir"), barraOpciones: $("gv-barra-opciones"), barraCerrar: $("gv-barra-cerrar"),
      bIdioma: $("gv-b-idioma"), bOye: $("gv-b-oye"),
      oyeLinea: $("gv-oye-linea"), oyeLineaTexto: $("gv-oye-linea-texto"), oyeLineaApagar: $("gv-oye-linea-apagar"),
      oye: $("gv-oye"), oyeIndicador: $("gv-oye-indicador"), oyeTexto: $("gv-oye-texto"), oyeApagar: $("gv-oye-apagar"),
      bienvenida: $("gv-bienvenida"), empezar: $("gv-empezar"), explorar: $("gv-explorar"), cerrarBienvenida: $("gv-bienvenida-cerrar") };

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
    const abrirTarjeta = () => { ui.tarjeta.hidden = false; ui.hablar.setAttribute("aria-expanded", "true"); refrescarOye(); };
    /* Por defecto (y durante el recorrido) solo se ve una barra de subtítulos compacta, abajo y centrada, para no tapar la
       web. El panel completo solo se abre cuando la persona lo pide: «Escribir», «Ayuda y opciones» o un clic en la barra. */
    function ponerVista(vista) {
      if (panel.dataset.vista === vista) return;
      panel.dataset.vista = vista;
      const f = doc.activeElement;
      if (vista === "barra" && f && ui.tarjeta.contains(f) && !f.getClientRects().length) (ui.detener.hidden ? ui.hablar : ui.detener).focus();   // el foco no se pierde
    }
    const cerrarTarjeta = () => { const dentro = ui.tarjeta.contains(doc.activeElement); ui.tarjeta.hidden = true; ui.hablar.setAttribute("aria-expanded", "false"); ponerVista("barra"); refrescarOye(); if (dentro) ui.hablar.focus(); };
    const abrirEscribir = (abierta = true) => { ui.zonaEscribir.hidden = !abierta; ui.escribir.setAttribute("aria-expanded", String(abierta)); if (abierta) ponerVista("completo"); };
    let relojBrillo = 0;
    let refrescarOye = () => {};                     // la pone el bloque de «Oye Eco» (más abajo)
    const pintarEsfera = () => {
      panel.dataset.estado = guia.escuchando ? "escuchando" : guia.pensando ? "pensando" : guia.hablando || guia.brillando ? "respondiendo" : "reposo";
      pintarLinea();
      refrescarOye();
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

    /* ================================================================ E. señalar un lugar de la página y pulsar con un puntero */
    const sinMovimiento = () => !!(ventana.matchMedia && ventana.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const anillo = doc.createElement("div"), puntero = doc.createElement("div");
    anillo.className = "gv-anillo"; puntero.className = "gv-puntero";
    puntero.innerHTML = '<svg focusable="false" viewBox="0 0 24 24" width="34" height="34"><path d="M5 2.5l13.5 10.2-6 .9 3.6 7-2.7 1.4-3.6-7L5 19z" fill="currentColor" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    for (const e of [anillo, puntero]) { e.hidden = true; e.setAttribute("aria-hidden", "true"); panel.append(e); }
    let relojAnillo = 0, cuadroAnillo = 0;
    const quitarAnillo = () => { ventana.clearTimeout(relojAnillo); if (ventana.cancelAnimationFrame) ventana.cancelAnimationFrame(cuadroAnillo); anillo.hidden = true; delete panel.dataset.lugar; delete panel.dataset.lado; delete panel.dataset.min; };
    const tapa = (a, b) => a.width > 0 && b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    /* Si la barra o el panel tapan el lugar señalado: primero se van al borde opuesto (arriba); si aun así lo tapan, se
       minimizan hasta que se quite el resalte. */
    function apartarDe(r) {
      if (ui.tarjeta.hidden || panel.dataset.min) return;
      if (!tapa(r, ui.tarjeta.getBoundingClientRect())) return;
      if (!panel.dataset.lado) panel.dataset.lado = "arriba"; else panel.dataset.min = "si";
    }
    const quitarSenal = () => { quitarAnillo(); puntero.hidden = true; puntero.classList.remove("gv-puntero-clic"); };
    const llevarA = (el) => { try { el.scrollIntoView({ behavior: sinMovimiento() ? "auto" : "smooth", block: "center", inline: "nearest" }); } catch (e) { try { el.scrollIntoView(); } catch (x) { /* sin scroll */ } } };
    /* Lleva la página hasta un lugar de la lista fija y lo rodea con un anillo de luz que se quita solo.
       Con lector de pantalla, además mueve el foco a ese lugar. Devuelve false si el lugar no está. */
    function senalar(lugar, { dure = 4500 } = {}) {
      const el = LUGARES.includes(lugar) && A.lugar ? A.lugar(lugar) : null;
      if (!el) return false;
      quitarAnillo();
      llevarA(el);
      const colocar = () => {                         // el anillo sigue al lugar mientras la página se desplaza
        const r = el.getBoundingClientRect(), m = 6, alto = ventana.innerHeight, ancho = ventana.innerWidth;
        const arriba = Math.max(r.top - m, 4), abajo = Math.min(r.bottom + m, alto - 4), izq = Math.max(r.left - m, 4), der = Math.min(r.right + m, ancho - 4);
        anillo.style.top = arriba + "px"; anillo.style.left = izq + "px";
        anillo.style.width = Math.max(der - izq, 0) + "px"; anillo.style.height = Math.max(abajo - arriba, 0) + "px";
        apartarDe(r);
        if (!anillo.hidden && ventana.requestAnimationFrame) cuadroAnillo = ventana.requestAnimationFrame(colocar);
      };
      anillo.hidden = false; panel.dataset.lugar = lugar;
      colocar();
      relojAnillo = ventana.setTimeout(quitarAnillo, dure);
      if (modoLector()) {
        if (!/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName) && !el.hasAttribute("tabindex")) {
          el.setAttribute("tabindex", "-1");
          el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
        }
        try { el.focus({ preventScroll: true }); } catch (e) { /* no se pudo enfocar: queda el anuncio por texto */ }
      }
      return true;
    }
    /* Mueve el puntero visible hasta un control de la página. parte = en qué punto del ancho (0 a 1). Con «menos
       movimiento» aparece ya en su sitio, sin deslizarse. */
    async function moverPuntero(el, { parte = 0.5, clic = true } = {}) {
      if (!el) return false;
      llevarA(el);
      await esperar(sinMovimiento() ? 60 : 550);
      const poner = (x, y) => { puntero.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; };
      if (puntero.hidden) {                             // sale de la esfera
        const e = ui.hablar.getBoundingClientRect();
        puntero.style.transition = "none"; poner(e.left + e.width / 2, e.top + e.height / 2);
        puntero.hidden = false; void puntero.offsetWidth; puntero.style.transition = "";
      }
      const r = el.getBoundingClientRect();
      poner(r.left + r.width * parte, r.top + r.height / 2);
      await esperar(sinMovimiento() ? 120 : 700);
      if (clic) { puntero.classList.add("gv-puntero-clic"); await esperar(240); puntero.classList.remove("gv-puntero-clic"); }
      return true;
    }

    /* ================================================================ C. respuestas: voz O texto para el lector */
    const sintesis = "speechSynthesis" in ventana && typeof ventana.SpeechSynthesisUtterance === "function" ? ventana.speechSynthesis : null;
    let voces = [];
    const vocesIdioma = () => voces.filter((v) => v.lang.toLowerCase().startsWith(guia.idioma));
    const elegirVoz = () => elegirVozDe(voces, guia.idioma, ui.voz.value);
    function cargarVoces() {
      if (!sintesis) return;
      voces = sintesis.getVoices();
      const guardada = (leer().voces || {})[guia.idioma] || "auto";
      const mejor = elegirVozDe(voces, guia.idioma);    // la más natural ya viene elegida; el nombre se ve en la primera opción
      const lista = vocesIdioma().slice().sort((a, b) => calidadVoz(b) - calidadVoz(a));
      ui.voz.replaceChildren(new ventana.Option(mejor ? `${u().vozAuto}: ${mejor.name}` : u().vozAuto, "auto"), ...lista.map((v) => new ventana.Option(`${v.name} (${v.lang})`, `${v.name}|${v.lang}`)));
      ui.voz.value = [...ui.voz.options].some((o) => o.value === guardada) ? guardada : "auto";
      pintarEstado();
    }
    /* true si hay con qué hablar en el idioma de la guía. Con la lista vacía (algunos móviles la entregan tarde) se intenta igual. */
    const puedeHablar = () => !!sintesis && (voces.length === 0 || vocesIdioma().length > 0);

    let alCallar = null;                              // termina la espera de quien aguarda a que la guía acabe de hablar
    let audioHumano = null;                           // el audio de la voz humana que está sonando (o null)
    function soltarAudio() {
      if (!audioHumano) return;
      const { audio, direccion } = audioHumano; audioHumano = null;
      audio.onended = audio.onerror = audio.onplaying = null;
      try { audio.pause(); } catch (e) { /* ya parado */ }
      try { ventana.URL.revokeObjectURL(direccion); } catch (e) { /* nada que soltar */ }
    }
    /* Reproduce el audio de la voz humana. Da true si terminó, false si la callaron y null si no pudo sonar
       (entonces quien llama usa la voz del navegador). */
    function sonar(blob) {
      pararVigia();                                   // que «Oye Eco» no oiga a la propia guía
      const turno = ++guia.turno;
      if (sintesis) sintesis.cancel();
      if (alCallar) { const fin = alCallar; alCallar = null; fin(false); }
      soltarAudio();
      return new Promise((listo) => {
        let audio, direccion;
        try { direccion = ventana.URL.createObjectURL(blob); audio = new ventana.Audio(direccion); } catch (e) { listo(null); return; }
        audioHumano = { audio, direccion };
        let empezo = false;
        const acabar = (resultado) => { guia.finVoz = Date.now(); if (alCallar === cierre) alCallar = null; if (audioHumano && audioHumano.audio === audio) soltarAudio(); if (turno === guia.turno) { guia.hablando = false; nivelar(); } listo(resultado); };
        const cierre = (completo) => acabar(completo);
        alCallar = cierre;
        audio.playbackRate = Math.min(1.4, Math.max(0.6, Number(ui.velocidad.value) || 1));
        audio.onplaying = () => { empezo = true; if (turno === guia.turno) { guia.hablando = true; nivelar(); } };
        audio.onended = () => acabar(true);
        audio.onerror = () => acabar(empezo ? true : null);
        let promesa;
        try { promesa = audio.play(); } catch (e) { acabar(null); return; }
        if (promesa && promesa.catch) promesa.catch(() => { if (!empezo) acabar(null); });   // el navegador no dejó sonar: voz del navegador
      });
    }
    function callar() {
      guia.turno++; guia.turnoVoz++;
      if (sintesis) sintesis.cancel();
      soltarAudio();
      guia.hablando = false;
      if (alCallar) { const fin = alCallar; alCallar = null; fin(false); }
      nivelar();
    }
    /* Dice el texto con la voz del navegador. La promesa da true si terminó de hablar y false si la callaron. */
    function decir(texto, { lento = false } = {}) {
      pararVigia();                                   // que «Oye Eco» no oiga a la propia guía
      const turno = ++guia.turno;
      sintesis.cancel();
      if (alCallar) { const fin = alCallar; alCallar = null; fin(false); }
      const voz = elegirVoz(), en = guia.idioma === "en";
      const hablado = prepararParaVoz(texto, guia.idioma) || texto;   // «°C» -> «grados», signos con palabras, sin símbolos, con pausas
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
          const fin = () => { if (turno === guia.turno && i === frases.length - 1) { guia.hablando = false; guia.finVoz = Date.now(); nivelar(); if (alCallar) { const a = alCallar; alCallar = null; a(true); } } };
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
    async function responder(texto, { paginaAnuncia = false, paginaHabla = false, lento = false, seguir = true, lugar = null, deIA = false } = {}) {
      if (!texto) return;
      guia.ultima = texto;
      ui.respuesta.textContent = texto;               // el subtítulo: toda respuesta se ve también como texto
      abrirTarjeta();
      brillar(texto);
      const senalado = lugar ? senalar(lugar) : false;   // la página va hasta el lugar del que se habla y lo resalta
      if (modoLector()) {                               // con lector: el foco ya se movió; el lugar se anuncia por texto
        const aviso = senalado ? FRASES_LUGAR[guia.idioma].foco(nombreLugar(lugar, guia.idioma)) : "";
        const escrito = [paginaAnuncia ? "" : texto, aviso].filter(Boolean).join(" ");
        if (escrito) escribirParaLector(escrito);
        return;
      }
      if (paginaHabla) return;
      if (!puedeHablar()) { escribirParaLector(texto); return; }
      const mio = ++guia.turnoVoz;
      await esperar(120);                             // tras la acción: que nadie la cancele
      if (mio !== guia.turnoVoz) return;
      // respuestas de la IA: voz humana de Gemini si está encendida y llega a tiempo (~3 s); si no, la voz del navegador
      let completo = null;
      if (deIA && ia && ia.voz) {
        guia.pensando = true; pintarEstado();
        let audio = null;
        try { audio = await ia.voz(prepararParaVoz(texto, guia.idioma) || texto); } catch (e) { audio = null; }
        guia.pensando = false; pintarEstado();
        if (mio !== guia.turnoVoz) return;
        if (audio) completo = await sonar(audio);
        if (mio !== guia.turnoVoz) return;
      }
      if (completo === null) completo = await decir(texto, { lento });
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
      refrescarOye();                                 // «Háblame · o di "Oye Eco"» cuando corresponde
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
      if (vigia.rec) { pararVigia(); guia.esperandoMicro = true; ventana.setTimeout(() => { guia.esperandoMicro = false; escuchar({ auto }); }, 350); return; }   // un solo micrófono a la vez
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
      guia.abriendoMicro = true;                      // entre start() y onstart, «Oye Eco» no debe arrancar otro reconocimiento
      mio.onstart = () => {
        guia.abriendoMicro = false;
        pintarEscucha(true, auto); pitido();
        if (auto) relojInicio = ventana.setTimeout(() => { callado = true; try { mio.abort(); } catch (e) { /* ya cerrado */ } pintarEscucha(false); }, ESPERA_SEGUIR_MS);
        // al pulsar la esfera: si en 10 s nadie habla, se cierra (algunos navegadores, en modo continuo, nunca lo cierran solos)
        else relojInicio = ventana.setTimeout(() => { if (!hablo) terminar(); }, ESPERA_SEGUIR_MS);
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
        guia.abriendoMicro = false;
        limpiar(); pintarEscucha(false);
        if (cerrado) return;
        cerrado = true;
        if (callado) return;
        if (oido.length) {
          const util = oido.find((o) => !["desconocido", "nada"].includes(interpretarComando(o, guia.idioma).tipo));
          atender(util || oido[0], { auto });                            // la primera alternativa que sea un comando
        } else if (!fallo) { guia.cortePorEscucha = false; if (!auto) responder(u().errores["no-speech"], { seguir: false }); }
      };
      try { mio.start(); } catch (e) { guia.abriendoMicro = false; pintarEscucha(false); if (!auto) responder(u().sinMicro, { seguir: false }); }
    }
    /* Cierra el micrófono sin atender lo que se haya oído (Esc, al escribir, al pulsar un atajo o al empezar el recorrido). */
    function cerrarMicro() {
      pararVigia();
      if (!guia.escuchando && !rec) return;
      try { if (rec) rec.abort(); } catch (e) { /* ya cerrado */ }
      if (guia.escuchando) pintarEscucha(false);
    }
    /* ---------- «Oye Eco» / «Hey Eco»: activo por defecto, pero solo desde la primera acción de la persona (nunca al
       cargar) y nunca con lector de pantalla. Un reconocimiento continuo escucha la palabra de activación SOLO cuando
       la guía está libre (no habla, no escucha, no piensa, sin recorrido) y la página se ve: así no se oye a sí misma y
       nunca hay dos reconocimientos a la vez. Su estado se ve siempre con palabras. Fuera de este modo, el micrófono solo
       se abre por una acción de la persona.
       DEPURACIÓN TEMPORAL: con depurarOye en true, la consola muestra [oye-eco] con el estado, los errores y lo que oye. */
    const depurarOye = true;
    const registroOye = (...x) => { if (depurarOye) { try { ventana.console.debug("[oye-eco]", ...x); } catch (e) { /* sin consola */ } } };
    const vigia = { encendido: false, rec: null, reloj: 0, ultimoUso: 0, reinicios: [], esperaHasta: 0, oyendo: false, inicio: 0,
      fallosSeguidos: 0, denegado: false, sinMicro: false, noViable: false, dormido: false, red: 0, ultimoEstado: "" };
    const oyeMaxMs = () => { const m = Number(ventana.GUIA_VOZ_CONFIG && ventana.GUIA_VOZ_CONFIG.oyeMinutos); return m > 0 ? m * 60000 : OYE_MAX_MS; };
    const oyeElegido = () => leer().oye !== false;
    const oyePosible = () => !!Reconocedor && !modoLector() && !vigia.noViable;
    // protección contra el eco: mientras Eco habla (y casi un segundo después) no se escucha la palabra de activación
    const guiaLibre = () => !guia.escuchando && !guia.hablando && !guia.pensando && !guia.enRecorrido && !doc.hidden && !modoLector() &&
      !guia.esperandoMicro && !guia.abriendoMicro && Date.now() - (guia.finVoz || 0) > 900;
    /* El estado, con palabras: nunca queda mudo. clave = para el registro y para las pruebas. */
    function estadoOye() {
      const t = u();
      if (!Reconocedor) return ["no_disponible", t.oyeNoDisponible];
      if (modoLector()) return ["lector", t.oyeLector];
      if (vigia.noViable) return ["no_viable", t.oyeNoViable];
      if (vigia.denegado) return ["sin_permiso", t.oyeSinPermiso];
      if (vigia.sinMicro) return ["sin_micro", t.oyeSinMicro];
      if (!vigia.encendido) {
        if (vigia.dormido) return ["dormido", t.oyeDormido];
        return oyeElegido() ? ["espera_clic", t.oyePrimerClic] : ["apagado", t.oyeApagadoTexto];
      }
      if (vigia.rec && vigia.oyendo) return ["escuchando", t.oyeEscuchando];
      if (guia.hablando || Date.now() - (guia.finVoz || 0) <= 900) return ["pausado_hablo", t.oyePausadoHablo];
      if (guia.escuchando || guia.esperandoMicro) return ["pausado_escucho", t.oyePausadoEscucho];
      if (guia.enRecorrido) return ["pausado_recorrido", t.oyePausadoRecorrido];
      if (guia.pensando) return ["pausado_pienso", t.oyePausadoPienso];
      if (vigia.red) return ["red", t.oyeRed];
      return ["activando", t.oyeActivando];
    }
    function pintarOye() {
      const [clave, texto] = estadoOye();
      if (clave !== vigia.ultimoEstado) { registroOye("estado:", clave); vigia.ultimoEstado = clave; }
      ui.oye.checked = vigia.encendido;
      ui.oye.disabled = !Reconocedor || modoLector() || vigia.noViable;
      ui.bOye.checked = oyeElegido() && oyePosible();          // la bienvenida: marcado por defecto, salvo que se haya apagado antes
      ui.bOye.disabled = ui.oye.disabled;
      // en la barra (o el panel): siempre, con palabras
      ui.oyeLineaTexto.textContent = texto;
      ui.oyeLinea.dataset.estado = clave;
      ui.oyeLineaApagar.hidden = !vigia.encendido;   // el interruptor, a mano en la barra
      // sobre la esfera, cuando la barra no está a la vista: solo si está activo o si hay un problema que contar
      const contar = vigia.encendido || ["sin_permiso", "sin_micro", "no_viable", "dormido"].includes(clave);
      ui.oyeIndicador.hidden = !ui.tarjeta.hidden || !contar;
      ui.oyeTexto.textContent = texto;
      ui.oyeApagar.hidden = !vigia.encendido;
      panel.dataset.oye = vigia.encendido ? (clave === "escuchando" ? "oyendo" : "si") : "no";
      // el rótulo bajo la esfera recuerda el comando (sin depender del permiso), mientras «Oye Eco» sea posible y elegido
      if (!guia.escuchando) ui.hablarTexto.textContent = oyePosible() && oyeElegido() ? u().hablarOye : u().hablar;
    }
    refrescarOye = pintarOye;
    function pararVigia() {
      const r = vigia.rec;
      if (!r) return;
      vigia.rec = null; vigia.oyendo = false;
      r.onresult = r.onerror = r.onaudiostart = r.onstart = null;
      try { r.abort(); } catch (e) { /* ya cerrado */ }
      pintarOye();
    }
    function vigilar() {
      if (!vigia.encendido || vigia.rec || !oyePosible() || vigia.denegado || vigia.sinMicro || !guiaLibre() || Date.now() < vigia.esperaHasta) return;
      const idiomas = IDIOMAS_VOZ[guia.idioma];
      const r = vigia.rec = new Reconocedor();
      r.lang = idiomas[Math.min(idiomaRec, idiomas.length - 1)];    // el mismo idioma que ya aceptó el navegador para la guía
      r.continuous = true; r.interimResults = false; r.maxAlternatives = 4;
      vigia.inicio = Date.now(); vigia.oyendo = false;
      r.onstart = () => { if (vigia.rec === r) { vigia.oyendo = true; registroOye("start: escuchando, idioma", r.lang); pintarOye(); } };
      r.onaudiostart = () => { vigia.fallosSeguidos = 0; vigia.red = 0; };
      r.onresult = (e) => {
        vigia.fallosSeguidos = 0;
        for (let i = e.resultIndex || 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal === false) continue;
          const alternativas = Array.from(res).map((a) => (a && a.transcript) || "");
          registroOye("oído:", alternativas);
          for (const alt of alternativas) {
            const hallado = palabraActivacion(alt);
            if (hallado) { registroOye("¡palabra de activación!", hallado); despertar(hallado.orden); return; }
          }
        }
      };
      r.onerror = (e) => {
        registroOye("error:", e.error, e.message || "");
        if (e.error === "not-allowed" || e.error === "service-not-allowed") { vigia.denegado = true; apagarOye({ olvidar: false }); return; }
        if (e.error === "audio-capture") { vigia.sinMicro = true; apagarOye({ olvidar: false }); return; }
        if (e.error === "language-not-supported" && idiomaRec < idiomas.length - 1) { idiomaRec++; return; }   // se reintenta con la otra variante
        if (e.error === "network") { vigia.red++; vigia.esperaHasta = Date.now() + Math.min(30000, 2000 * vigia.red); }
        // "no-speech" y "aborted" son normales en una escucha continua: se reinicia al terminar
      };
      r.onend = () => {                               // el navegador lo corta cada cierto tiempo: se reinicia
        if (vigia.rec !== r) return;
        vigia.rec = null; vigia.oyendo = false;
        const ahora = Date.now(), duro = ahora - vigia.inicio;
        registroOye("end tras", duro, "ms");
        if (duro < 1500) vigia.fallosSeguidos++;      // se cortó enseguida sin oír nada: quizá el navegador no lo admite
        if (vigia.fallosSeguidos >= 8) { vigia.noViable = true; registroOye("la escucha continua no es viable aquí: se apaga"); apagarOye({ olvidar: false }); return; }
        vigia.reinicios = vigia.reinicios.filter((t) => t > ahora - 10000).concat(ahora);
        if (vigia.reinicios.length > 5) vigia.esperaHasta = Math.max(vigia.esperaHasta, ahora + 5000);   // muchos cortes seguidos: un respiro
        pintarOye();
        if (vigia.encendido) ventana.setTimeout(vigilar, 300);
      };
      try { r.start(); registroOye("start() llamado, idioma", r.lang); }
      catch (e) { registroOye("start() falló:", e && e.name, e && e.message); vigia.rec = null; vigia.fallosSeguidos++; vigia.esperaHasta = Date.now() + 2000; }
      pintarOye();
    }
    /* Se oyó «Oye Eco»: abre la guía; si la frase ya traía la orden, la atiende; si no, escucha la orden. */
    function despertar(orden) {
      vigia.ultimoUso = Date.now();
      pararVigia();
      cerrarBienvenida({ foco: false });
      guia.saludo = true;
      abrirTarjeta();
      if (orden) { atender(orden); return; }
      guia.esperandoMicro = true;                     // hasta que se abra el micrófono de la guía, «Oye Eco» no vuelve a arrancar
      ventana.setTimeout(() => { guia.esperandoMicro = false; escuchar(); }, 350);
    }
    /* Pide el permiso del micrófono DENTRO del clic de la persona (así el navegador lo pregunta enseguida y no en
       silencio más tarde). Se cierra al momento: solo sirve para tener el permiso. */
    function pedirPermiso() {
      const md = ventana.navigator && ventana.navigator.mediaDevices;
      if (!md || typeof md.getUserMedia !== "function") { registroOye("sin getUserMedia: el permiso lo pedirá el reconocimiento"); return; }
      md.getUserMedia({ audio: true }).then((flujo) => {
        registroOye("permiso del micrófono: concedido");
        try { flujo.getTracks().forEach((p) => p.stop()); } catch (e) { /* nada que cerrar */ }
        vigia.denegado = false; vigia.sinMicro = false; pintarOye();
      }).catch((e) => {
        registroOye("permiso del micrófono:", e && e.name, e && e.message);
        if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) vigia.denegado = true;
        else if (e && (e.name === "NotFoundError" || e.name === "NotReadableError")) vigia.sinMicro = true;
        if (vigia.denegado || vigia.sinMicro) apagarOye({ olvidar: false }); else pintarOye();
      });
    }
    function encenderOye() {
      if (!oyePosible() || vigia.denegado) { pintarOye(); return; }
      vigia.dormido = false; vigia.sinMicro = false;
      vigia.encendido = true; vigia.ultimoUso = Date.now(); vigia.esperaHasta = 0; vigia.reinicios = []; vigia.fallosSeguidos = 0;
      registroOye("encendido");
      ventana.clearInterval(vigia.reloj);
      vigia.reloj = ventana.setInterval(() => {
        if (Date.now() - vigia.ultimoUso > oyeMaxMs()) { vigia.dormido = true; registroOye("10 minutos sin uso: en pausa"); apagarOye({ olvidar: false }); return; }
        if (doc.hidden && vigia.rec) pararVigia();
        if (guiaLibre()) vigilar();
        pintarOye();
      }, 1000);
      pintarOye();                                    // empieza a escuchar en el siguiente tic, cuando la guía esté libre
    }
    /* La elección se recuerda (localStorage): sin elegir = activo. Se enciende solo tras una acción de la persona (los
       botones de la bienvenida, la esfera, la tecla H o escribir), nunca al cargar la página. */
    function interaccion() {
      vigia.ultimoUso = Date.now();
      if (vigia.encendido || !oyeElegido() || !oyePosible() || vigia.denegado) { pintarOye(); return; }
      pedirPermiso();
      encenderOye();
    }
    /* ¿Se le dice a la persona que puede llamar a Eco? Sin depender del permiso: si es posible y no lo apagó. */
    const decirOye = () => oyePosible() && oyeElegido();
    function apagarOye({ olvidar = false } = {}) {
      vigia.encendido = false;
      ventana.clearInterval(vigia.reloj);
      pararVigia();
      if (olvidar) registroOye("apagado por la persona");
      pintarOye();
    }

    /* Tras una respuesta dicha por voz, la guía vuelve a escuchar UNA vez. Nunca es lo primero que pasa: siempre
       viene después de algo que hizo la persona (pulsar la esfera, la tecla H, un botón o escribir). */
    function seguirEscuchando() {
      if (!ui.seguir.checked || !Reconocedor || guia.escuchando || guia.enRecorrido || modoLector() || doc.hidden || ui.tarjeta.hidden) return;
      escuchar({ auto: true });
    }
    /* ---------- bienvenida: una tarjeta breve al cargar, una vez por sesión. No es modal ni roba el foco al cargar (el
       primer Tab sigue llevando a «Saltar al contenido»); el enlace «Saltar a la guía por voz» lleva a ella mientras está
       abierta. Esc la cierra. Los navegadores no dejan sonar nada sin un clic: por eso la voz empieza al pulsar un botón. */
    const CLAVE_BIENVENIDA = "rocola-guia-bienvenida";
    function mostrarBienvenida() {
      try {
        if (ventana.sessionStorage.getItem(CLAVE_BIENVENIDA)) return;
        ventana.sessionStorage.setItem(CLAVE_BIENVENIDA, "1");
      } catch (e) { /* sin almacenamiento (ventana privada): se muestra igual */ }
      ui.bienvenida.hidden = false;
    }
    function cerrarBienvenida({ foco = true } = {}) {
      if (ui.bienvenida.hidden) return;
      const dentro = ui.bienvenida.contains(doc.activeElement);
      ui.bienvenida.hidden = true;
      if (dentro && foco) ui.hablar.focus();
    }
    /* «Empezar el recorrido guiado»: Eco se presenta, presenta la web, invita, y el recorrido arranca solo.
       Con lector de pantalla, todo va por escrito (sin voz). */
    function empezarGuiado() {
      cerrarBienvenida({ foco: false });
      interaccion();                                  // pide el permiso del micrófono y activa «Oye Eco» si la persona lo dejó marcado
      guia.saludo = true;                             // la esfera ya no vuelve a saludar
      abrirTarjeta();
      // «Oye Eco» se menciona antes que nada: después del nombre y antes de contar la web (si no lo apagó)
      const partes = u().intro.split(/(?<=\.)\s+/);
      const dice = decirOye();
      if (dice) guia.oyeDicho = true;
      recorrer({ intro: dice ? [partes[0], u().oyeLlamame, ...partes.slice(1)].join(" ") : u().intro });
      ui.detener.focus();                             // con el teclado, Enter detiene el recorrido
    }

    /* La esfera (o la tecla H). La primera vez abre la guía, saluda en una frase y escucha. Después, escucha. */
    function pulsarEsfera() {
      cerrarBienvenida({ foco: false });
      interaccion();
      const avisar = decirOye() && !guia.oyeDicho;
      if (!guia.saludo && ui.tarjeta.hidden && !guia.escuchando) {
        if (avisar) guia.oyeDicho = true;
        guia.saludo = true;
        abrirTarjeta();
        saludar(avisar);
        return;
      }
      abrirTarjeta();
      escuchar();
    }
    async function saludar(avisarOye = false) {
      const texto = avisarOye ? `${u().saludo} ${u().oyeLlamame}` : u().saludo;
      guia.ultima = texto; ui.respuesta.textContent = texto; brillar(texto);
      if (modoLector()) { escribirParaLector(texto); return; }           // con lector no se abre el micrófono solo: oiría al lector
      if (!puedeHablar()) { escribirParaLector(texto); if (Reconocedor) escuchar(); return; }
      const mio = ++guia.turnoVoz;
      const completo = await decir(texto);
      if (completo && mio === guia.turnoVoz && !guia.escuchando) escuchar();   // abrió la guía para hablar: escucha siempre
    }

    /* ---------- de un texto (oído o escrito) a la acción y a la respuesta ---------- */
    async function atender(texto, { auto = false } = {}) {
      if (!vigia.encendido) interaccion(); else vigia.ultimoUso = Date.now();
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
      if (r.ayuda) { ui.opciones.open = true; ponerVista("completo"); }   // la ayuda con ejemplos solo aparece cuando la piden
      // una frase que no se entendió en la escucha de seguimiento no abre otra escucha (así no se encadenan ruidos)
      responder(r.texto, { ...r, seguir: !(auto && accion.tipo === "desconocido" && !r.deIA) });
    }

    /* ---------- recorrido guiado: guion fijo, paso a paso, y se puede detener en cualquier momento ---------- */
    /* Un paso del recorrido: se ve en el subtítulo y sale por UN camino (voz, o región viva con lector). Espera a que termine. */
    async function narrar(texto, aviso = "") {
      guia.ultima = texto;
      ui.respuesta.textContent = texto;
      abrirTarjeta();
      if (!modoLector() && puedeHablar()) return decir(texto);
      brillar(texto);
      escribirParaLector(texto + aviso);
      await esperar(1500 + (texto.length + aviso.length) * 60);   // tiempo para que el lector de pantalla lo lea
      return false;
    }
    /* Un paso que pulsa un control de verdad: el puntero va hasta él y la guía hace clic en el control de la página.
       «reproducir» solo se pulsa si la pista no suena (si ya suena, el puntero lo muestra sin pulsar); la línea de tiempo
       no admite un clic con sentido, así que el puntero va al punto exacto y el salto lo hace el reproductor. */
    async function pulsarPaso(paso, sigue) {
      const p = paso.pulsar, hacer = async () => { try { await ejecutar(paso.accion, A, guia, guia.idioma); } catch (e) { /* el paso se cuenta igual */ } };
      const el = p && A.control ? A.control(p.control, p.indice) : null;
      if (!el || el.disabled) { if (paso.accion) await hacer(); return; }
      const yaSuena = p.control === "reproducir" && A.sonando();
      const yaEsta = p.control === "cambiar" && A.indiceActual() === paso.accion.numero - 1;
      const parte = p.control === "avance" && A.duracion() ? Math.min(1, Math.max(0, paso.accion.segundos / A.duracion())) : 0.5;
      if (!modoLector()) await moverPuntero(el, { parte, clic: !yaSuena && !yaEsta });
      if (!sigue()) return;
      if (p.control === "avance") { await hacer(); return; }
      if (yaSuena || yaEsta) return;
      el.click();                                     // el clic de verdad, en el control de la página
      for (let i = 0; i < 50 && sigue() && !A.listo(); i++) await esperar(100);   // la pista se está cargando
    }
    async function recorrer({ intro = "" } = {}) {
      const mio = ++guia.recorrido, sigue = () => mio === guia.recorrido;
      cerrarMicro();                                  // que el micrófono no oiga a la guía contar el recorrido
      guia.enRecorrido = true;
      ui.detener.hidden = false;
      ponerVista("barra");                            // durante el recorrido, solo los subtítulos: la web queda a la vista
      if (ia) ia.marcar(false);
      let hablado = false;
      const pasos = guionRecorrido(A, guia.idioma);
      const ultimo = pasos[pasos.length - 1];
      if (ultimo && decirOye()) pasos[pasos.length - 1] = { ...ultimo, texto: `${ultimo.texto} ${u().oyeLlamame}` };   // al final del recorrido
      if (intro && pasos[0]) pasos[0] = { ...pasos[0], texto: intro };   // desde la bienvenida: Eco se presenta en vez del primer paso
      for (const paso of pasos) {
        if (paso.pulsar || paso.accion) await pulsarPaso(paso, sigue);
        if (!sigue()) return;
        const senalado = paso.lugar ? senalar(paso.lugar, { dure: 9000 }) : false;   // señala el lugar mientras lo explica
        const aviso = senalado && modoLector() ? " " + FRASES_LUGAR[guia.idioma].foco(nombreLugar(paso.lugar, guia.idioma)) : "";
        hablado = await narrar(paso.texto, aviso);
        if (!sigue()) return;
        await esperar(paso.pausa);
        if (!sigue()) return;
      }
      guia.enRecorrido = false;
      ui.detener.hidden = true;
      quitarSenal();
      if (hablado) seguirEscuchando();                // "pregúntame lo que quieras": escucha una vez
    }
    /* silencio: lo corta otra frase (no dice nada ni pausa). Sin silencio: lo pidió la persona; calla, pausa y avisa. */
    function detenerRecorrido({ silencio = false, forzar = false } = {}) {
      if (!guia.enRecorrido && !forzar) return false;
      guia.recorrido++;
      guia.enRecorrido = false;
      ui.detener.hidden = true;
      quitarSenal();
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
      if (vigia.encendido) { pararVigia(); }          // el reconocimiento de «Oye Eco» se reinicia en el idioma nuevo
      ventana.setTimeout(() => refrescarOye(), 0);
      panel.lang = guia.idioma;
      panel.setAttribute("aria-label", t.nombre);
      for (const e of panel.querySelectorAll("[data-t]")) e.textContent = t[e.dataset.t];
      for (const e of panel.querySelectorAll("[data-t-aria]")) e.setAttribute("aria-label", t[e.dataset.tAria]);
      panel.querySelectorAll(".gv-chip:not(.gv-chip-recorrido)").forEach((c, i) => { c.textContent = SUGERENCIAS[guia.idioma][i]; });
      ui.listaAyuda.replaceChildren(...t.ayudaLista.map((x) => { const li = doc.createElement("li"); li.textContent = x; return li; }));
      ui.hablarTexto.textContent = guia.escuchando ? t.escuchando : t.hablar;
      ui.velocidad.setAttribute("aria-valuetext", nombreVelocidad(Number(ui.velocidad.value)));
      ui.idioma.value = guia.idioma;
      ui.bIdioma.value = guia.idioma;
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
      if (guia.lector) { callar(); apagarOye(); }     // con lector de pantalla, nunca
      pintarOye();
      pintarEstado();
      if (avisar) responder(guia.lector ? u().lectorSi : u().lectorNo, { seguir: false });
    }

    /* ---------- eventos ---------- */
    ui.hablar.addEventListener("click", pulsarEsfera);
    ui.empezar.addEventListener("click", empezarGuiado);
    ui.explorar.addEventListener("click", () => {
      cerrarBienvenida();
      interaccion();
      if (decirOye() && !guia.oyeDicho) { guia.oyeDicho = true; responder(u().oyeLlamame, { seguir: false }); }   // una vez, sin abrir más el micrófono
    });
    ui.cerrarBienvenida.addEventListener("click", () => cerrarBienvenida());
    ui.cerrar.addEventListener("click", cerrarTarjeta);
    ui.barraCerrar.addEventListener("click", () => { callar(); cerrarTarjeta(); });
    ui.barraEscribir.addEventListener("click", () => { ponerVista("completo"); abrirEscribir(true); ui.campo.focus(); });
    ui.barraOpciones.addEventListener("click", () => { ponerVista("completo"); ui.opciones.open = true; ui.opciones.querySelector("summary").focus(); });
    ui.respuesta.addEventListener("click", () => { if (panel.dataset.vista === "barra" && !guia.enRecorrido) ponerVista("completo"); });   // un clic en la barra abre el panel
    ui.detener.addEventListener("click", () => detenerRecorrido());
    ui.escribir.addEventListener("click", () => { const abrir = ui.zonaEscribir.hidden; abrirEscribir(abrir); if (abrir) ui.campo.focus(); });
    ui.formulario.addEventListener("submit", (e) => {
      e.preventDefault();
      const texto = ui.campo.value.trim();
      if (!texto) return;
      ui.campo.value = "";
      cerrarMicro();                                  // escribió: ya no hace falta seguir escuchando
      atender(texto);
    });
    for (const chip of panel.querySelectorAll(".gv-chip")) chip.addEventListener("click", () => { cerrarMicro(); atender(chip.textContent); });
    ui.idioma.addEventListener("change", () => fijarIdioma(ui.idioma.value));
    // la bienvenida: se elige el idioma y «Oye Eco» ANTES de empezar (sin que Eco hable por el cambio)
    ui.bIdioma.addEventListener("change", () => fijarIdioma(ui.bIdioma.value, { avisar: false }));
    ui.bOye.addEventListener("change", () => { guardar({ oye: ui.bOye.checked }); pintarOye(); });
    ui.lector.addEventListener("change", () => fijarLector(ui.lector.checked));
    ui.tecla.addEventListener("change", () => guardar({ tecla: ui.tecla.checked }));
    ui.oye.addEventListener("change", () => {           // la elección se recuerda
      guardar({ oye: ui.oye.checked });
      if (ui.oye.checked) { vigia.denegado = false; vigia.sinMicro = false; pedirPermiso(); encenderOye(); } else apagarOye({ olvidar: true });
    });
    ui.oyeLineaApagar.addEventListener("click", () => { guardar({ oye: false }); apagarOye({ olvidar: true }); ui.hablar.focus(); });
    ui.oyeApagar.addEventListener("click", () => { const dentro = ui.oyeIndicador.contains(doc.activeElement); guardar({ oye: false }); apagarOye({ olvidar: true }); if (dentro) ui.hablar.focus(); });
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
      if (e.key === "Escape" && !ui.bienvenida.hidden) { cerrarBienvenida(); return; }
      const d = e.target, etiqueta = d.tagName;
      const escribe = etiqueta === "TEXTAREA" || etiqueta === "SELECT" || d.isContentEditable ||
        (etiqueta === "INPUT" && !["range", "checkbox"].includes(d.type));
      if (e.key === "Escape" && guia.enRecorrido) { cerrarMicro(); detenerRecorrido(); return; }   // primero el recorrido: Esc siempre lo detiene
      if (e.key === "Escape" && guia.escuchando) { cerrarMicro(); return; }
      if (e.key === "Escape" && !ui.tarjeta.hidden && panel.contains(d)) { callar(); cerrarTarjeta(); return; }
      if (escribe || !ui.tecla.checked) return;
      if (e.key === "h" || e.key === "H") { e.preventDefault(); pulsarEsfera(); }
    });
    ventana.addEventListener("pagehide", () => { callar(); apagarOye(); try { if (rec) rec.abort(); } catch (e) { /* nada */ } });

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
      enlaceSalto.addEventListener("click", (e) => { e.preventDefault(); (ui.bienvenida.hidden ? ui.hablar : ui.empezar).focus(); });
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
    pintarOye();
    mostrarBienvenida();

    return { atender, escuchar, callar, recorrer, detenerRecorrido, fijarIdioma, fijarLector, estado: guia };
  }

  return { interpretarComando, interpretarES, interpretarEN, normalizar, normalizarEN, palabrasANumeros, palabrasANumerosEN, buscarFecha, buscarPista, leerFecha,
    fechaDicha, resumenSerie, guionRecorrido, valorDicho, LUGARES, NOMBRES_LUGAR, lugarDicho, elegirVozDe, calidadVoz, prepararParaVoz, ACCIONES_RECORRIDO, SUGERENCIAS, TEXTOS: L, INTERFAZ: U, TONO_VOZ, VELOCIDAD_VOZ,
    ESPERA_SEGUIR_MS, ESPERA_AVISO_MS, SILENCIO_MS, OYE_MAX_MS, palabraActivacion, HABLA_MAX_MS, ejecutar, montar, AYUDA, AYUDA_EN };
});
