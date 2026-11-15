/* Resonant Earth — guía por voz que ESCUCHA (JavaScript puro, sin servicios propios).

   Cuatro partes, en este orden:
     A. interpretarComando(texto) -> acción.  Función pura: no toca la página (se prueba con Node).
     B. Reconocimiento de voz del navegador (SpeechRecognition / webkitSpeechRecognition, es-EC y es-ES).
     C. Respuestas: por voz (speechSynthesis) O por escrito para el lector de pantalla. Nunca las dos.
     D. Panel de la guía (se crea aquí, no está en index.html) y conexión con el reproductor.

   El reproductor solo se toca a través de window.GuiaVozAdaptador (guia-voz-adaptador.js).
   Si ese objeto no existe, la guía no se monta y la página funciona igual que sin ella.

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
  function interpretarComando(texto) {
    const s = normalizar(texto);
    if (!s) return { tipo: "nada" };
    const hay = (re) => re.test(s);

    // respuestas a "¿usas lector de pantalla?"
    if (hay(/^(si|claro|claro que si|afirmativo|correcto|si uso( un)?( lector)?( de pantalla)?|uso( un)? lector( de pantalla)?)$/)) return { tipo: "afirmar" };
    if (hay(/^(no|negativo|no uso( un)?( lector)?( de pantalla)?|no gracias)$/)) return { tipo: "negar" };

    if (hay(/\b(ayuda|ayudame|comandos|instrucciones|opciones|que (puedo|se puede) (decir|hacer|pedir)|como funciona)\b/)) return { tipo: "ayuda" };
    if (hay(/\b(calla|callate|silencio|deja de hablar|no hables|shh+)\b/)) return { tipo: "callar" };

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
    if (!pregunta && hay(/\b(baja|bajar|bajale|disminuye|menos volumen|mas (bajo|bajito|suave|despacio))\b/)) return { tipo: "volumen", delta: -20 };

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
    if (hay(/\b(leyendas?|llenda|colores|color|que significa\w*|que (estoy|estamos|estas) (escuchando|oyendo)|como se (lee|escucha|entiende)|explica\w*)\b/)) return { tipo: "leyenda" };
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
  const enPalabras = (s) => {
    const m = Math.floor(s / 60), seg = Math.floor(s % 60);
    return (m ? `${m} ${m === 1 ? "minuto" : "minutos"} ` : "") + `${seg} ${seg === 1 ? "segundo" : "segundos"}`;
  };

  const AYUDA = "Puedes decir: reproduce. Pausa. Siguiente pista. Pista dos. Qué pistas hay. Año 1990. Segundo diez. " +
    "Avanza diez segundos. Qué pasa ahora. Lee la leyenda. Dónde estoy. Sube el volumen. Repite. Silencio.";

  /* Ejecuta una acción con el adaptador. Devuelve { texto, paginaAnuncia, paginaHabla }:
     paginaAnuncia = la página ya lo dirá al lector de pantalla; paginaHabla = la página ya lo dirá con su voz. */
  async function ejecutar(accion, A, memoria = {}) {
    const pistas = A.pistas(), n = pistas.length, actual = A.indiceActual();
    const anuncia = (que) => !!(A.paginaAnuncia && A.paginaAnuncia(que)), habla = !!(A.paginaHablaSola && A.paginaHablaSola());
    const r = (texto, extra = {}) => ({ texto, ...extra });
    const cargando = () => r("La pista todavía se está cargando. Espera un momento y repite.");
    const elegir = async (i) => {
      await A.elegir(i, true);
      return r(`Pista ${i + 1} de ${n}: ${pistas[i].titulo}.`, { paginaAnuncia: anuncia("elegir") });
    };
    const ir = (t, texto) => {
      const en_pausa = !A.sonando();
      A.irA(Math.min(Math.max(t, 0), Math.max(A.duracion() - 0.05, 0)));
      return r(texto, { paginaAnuncia: anuncia("saltar"), paginaHabla: habla && en_pausa });
    };

    switch (accion.tipo) {
      case "nada": return r("");
      case "ayuda": return r(AYUDA);
      case "callar": return r("", { callar: true });
      case "repetir": return r(memoria.ultima || "Todavía no he dicho nada.");
      case "pistas": return r(n ? `Hay ${n} ${n === 1 ? "pista" : "pistas"}: ` + pistas.map((p, i) => `${i + 1}, ${p.titulo}`).join("; ") + ". Di, por ejemplo: pista 1." : "El catálogo todavía no cargó.");
      case "reproducir":
        if (actual < 0 && n) return elegir(0);                             // todavía no hay pista elegida: la primera
        if (!A.listo()) return cargando();
        await A.reproducir();
        return r(pistas[actual] ? `Reproduciendo ${pistas[actual].titulo}.` : "Reproduciendo.");
      case "pausar":
        if (!A.sonando()) return r("Ya está en pausa.");
        A.pausar();
        return r("En pausa.", { paginaAnuncia: anuncia("pausar") });
      case "siguiente": return n ? elegir((actual + 1) % n) : cargando();
      case "anterior": return n ? elegir((actual - 1 + n) % n) : cargando();
      case "elegir": {
        if (!n) return cargando();
        let i = accion.nombre != null ? buscarPista(pistas, accion.nombre) : (accion.numero === -1 ? n - 1 : accion.numero - 1);
        if (accion.nombre != null && i < 0) return r(`No encontré una pista llamada «${accion.nombre}». Di «qué pistas hay».`);
        if (!(i >= 0 && i < n)) return r(`Solo hay ${n} ${n === 1 ? "pista" : "pistas"}. Di un número del 1 al ${n}.`);
        return elegir(i);
      }
      case "inicio": return A.listo() ? ir(0, "Al inicio.") : cargando();
      case "final": return A.listo() ? ir(A.duracion() - 3, "Cerca del final.") : cargando();
      case "saltar_tiempo":
        if (!A.listo()) return cargando();
        if (accion.segundos > A.duracion()) return r(`Esta pista dura ${enPalabras(A.duracion())}. Di un tiempo menor.`);
        return ir(accion.segundos, `${enPalabras(accion.segundos)}.`);
      case "saltar_relativo":
        if (!A.listo()) return cargando();
        return ir(A.tiempo() + accion.segundos, `${accion.segundos > 0 ? "Avancé" : "Retrocedí"} ${enPalabras(Math.abs(accion.segundos))}.`);
      case "saltar_anio": {
        if (!A.listo()) return cargando();
        const f = buscarFecha(A.fechas(), accion.anio, accion.mes);
        if (f.vacio) return r("Esta pista no tiene fechas. Di, por ejemplo: segundo 10.");
        if (f.fuera) return r(`Esta pista va de ${f.desde} a ${f.hasta}. No tiene el año ${f.anio}.`);
        return ir(f.t + 0.01, f.exacto ? `${f.fecha}.` : `No hay un dato exacto de esa fecha. Voy al más cercano: ${f.fecha}.`);
      }
      case "descripcion": return r(A.descripcion() || "Todavía no hay descripción: elige una pista.");
      case "leyenda": return r(A.leyenda() || "Esta página no tiene leyenda.");
      case "donde":
        if (!pistas[actual]) return cargando();
        return r(`Pista ${actual + 1} de ${n}: ${pistas[actual].titulo}. Vas en ${enPalabras(A.tiempo())} de ${enPalabras(A.duracion())}. ${A.sonando() ? "Está sonando." : "Está en pausa."}`);
      case "volumen": {
        const v = Math.min(100, Math.max(0, accion.valor != null ? accion.valor : A.volumen() + accion.delta));
        A.ponerVolumen(v);
        return r(`Volumen al ${v} por ciento.`);
      }
      default: return r(`No entendí «${accion.texto || ""}». Di «ayuda» para oír lo que puedo hacer.`);
    }
  }

  /* ================================================================== D. panel y conexión (B y C van dentro) */

  const CLAVE = "rocola-guia-voz";
  const PLANTILLA = `
    <h2 id="gv-titulo">Guía por voz</h2>
    <p class="gv-intro">Pide las cosas hablando o escribiendo. Por ejemplo: «reproduce», «pausa», «siguiente pista», «año 1990» o «qué pasa ahora».</p>
    <div class="gv-pregunta" id="gv-pregunta" role="group" aria-labelledby="gv-pregunta-texto">
      <p id="gv-pregunta-texto" class="gv-pregunta-texto">Antes de empezar: ¿usas un lector de pantalla?</p>
      <p class="gv-nota">Si lo usas, la guía no hablará con su propia voz: escribirá sus respuestas y tu lector las leerá. Así no suenan dos voces a la vez.</p>
      <div class="gv-fila">
        <button type="button" id="gv-si" class="gv-boton">Sí, uso lector de pantalla</button>
        <button type="button" id="gv-no" class="gv-boton">No uso lector de pantalla</button>
      </div>
    </div>
    <div class="gv-cuerpo" id="gv-cuerpo">
      <div class="gv-fila">
        <button type="button" id="gv-hablar" class="gv-hablar" aria-pressed="false" aria-describedby="gv-estado">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="24" height="24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2z" fill="currentColor"/></svg>
          <span id="gv-hablar-texto">Hablar con la guía</span>
        </button>
        <button type="button" id="gv-ayuda" class="gv-boton" aria-expanded="false" aria-controls="gv-lista-ayuda">¿Qué puedo decir?</button>
      </div>
      <p id="gv-estado" class="gv-estado"></p>
      <form id="gv-formulario" class="gv-formulario">
        <label for="gv-campo">O escribe lo que quieres hacer</label>
        <div class="gv-fila">
          <input id="gv-campo" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send">
          <button type="submit" class="gv-boton">Enviar</button>
        </div>
      </form>
      <ul id="gv-lista-ayuda" class="gv-lista-ayuda" hidden>
        <li>«Reproduce», «pausa», «siguiente pista», «pista anterior», «pista dos», «qué pistas hay».</li>
        <li>«Año 1990», «marzo de 2007», «segundo diez», «avanza diez segundos», «retrocede», «al inicio».</li>
        <li>«Qué pasa ahora», «lee la leyenda», «dónde estoy», «repite».</li>
        <li>«Sube el volumen», «baja el volumen», «volumen 50», «silencio», «ayuda».</li>
      </ul>
      <dl class="gv-dialogo">
        <div><dt>Entendí</dt><dd id="gv-oido">—</dd></div>
        <div><dt>Respuesta</dt><dd id="gv-respuesta">—</dd></div>
      </dl>
      <div id="gv-vivo" class="gv-solo-lector" aria-live="polite" aria-atomic="true"></div>
      <details class="gv-opciones">
        <summary>Opciones de la guía</summary>
        <label class="gv-casilla"><input type="checkbox" id="gv-lector"> <span>Uso lector de pantalla (la guía responde por escrito, sin su propia voz)</span></label>
        <label class="gv-casilla"><input type="checkbox" id="gv-tecla" checked> <span>Usar la tecla H para hablar con la guía</span></label>
        <div class="gv-campo-opcion"><label for="gv-voz">Voz de la guía</label><select id="gv-voz"><option value="auto">Automática (español)</option></select></div>
        <div class="gv-campo-opcion"><label for="gv-velocidad">Velocidad de la voz</label><input id="gv-velocidad" type="range" min="0.6" max="1.4" step="0.1" value="1" aria-valuetext="normal"></div>
        <button type="button" id="gv-probar" class="gv-boton">Probar la voz</button>
        <p class="gv-nota" id="gv-privacidad">El micrófono solo se abre cuando pulsas el botón o la tecla H. El reconocimiento lo hace tu navegador; en Chrome y Edge el audio se envía al servicio de voz del propio navegador. Esta página no lo guarda ni usa claves.</p>
      </details>
    </div>`;

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
    panel.setAttribute("aria-labelledby", "gv-titulo");
    panel.lang = "es";
    panel.innerHTML = PLANTILLA;
    const ancla = A.ancla && A.ancla(), principal = doc.querySelector("main");   // el adaptador dice dónde va el panel
    if (ancla) ancla.before(panel); else if (principal) principal.before(panel); else doc.body.prepend(panel);

    const ui = { pregunta: $("gv-pregunta"), cuerpo: $("gv-cuerpo"), si: $("gv-si"), no: $("gv-no"), hablar: $("gv-hablar"),
      hablarTexto: $("gv-hablar-texto"), estado: $("gv-estado"), formulario: $("gv-formulario"), campo: $("gv-campo"),
      ayuda: $("gv-ayuda"), listaAyuda: $("gv-lista-ayuda"), oido: $("gv-oido"), respuesta: $("gv-respuesta"), vivo: $("gv-vivo"),
      lector: $("gv-lector"), tecla: $("gv-tecla"), voz: $("gv-voz"), velocidad: $("gv-velocidad"), probar: $("gv-probar") };

    /* ---------- preferencias (pueden fallar: ventana privada) ---------- */
    const leer = () => { try { return JSON.parse(ventana.localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } };
    const guardar = (cambios) => { try { ventana.localStorage.setItem(CLAVE, JSON.stringify({ ...leer(), ...cambios })); } catch (e) { /* sin almacenamiento */ } };
    const pref = leer();
    const guia = { lector: typeof pref.lector === "boolean" ? pref.lector : null, ultima: "", escuchando: false, hablando: false, turno: 0, frases: [] };
    // la música baja mientras el micrófono está abierto (0,2: que no la oiga) o mientras la guía habla (0,35)
    let ia = null;                                  // conversación con IA (guia-voz-ia.js); null = solo comandos
    const nivelar = () => { try { A.atenuar(guia.escuchando ? 0.2 : guia.hablando ? 0.35 : 1); } catch (e) { /* el reproductor no está listo */ } };
    // lector === null: todavía no respondió. Se trata como "sí" (la guía no habla) hasta que responda.
    const modoLector = () => guia.lector !== false;

    /* ================================================================ C. respuestas: voz O texto para el lector */
    const sintesis = "speechSynthesis" in ventana && "SpeechSynthesisUtterance" in ventana ? ventana.speechSynthesis : null;
    let voces = [];
    const vocesEs = () => voces.filter((v) => v.lang.toLowerCase().startsWith("es"));
    function elegirVoz() {
      const es = vocesEs();
      const elegida = es.find((v) => `${v.name}|${v.lang}` === ui.voz.value);
      if (elegida) return elegida;
      const de = (pais) => es.find((v) => v.lang.toLowerCase() === pais);
      return de("es-ec") || es.find((v) => !/^es(-es)?$/i.test(v.lang)) || es.find((v) => v.default) || es[0] || null;
    }
    function cargarVoces() {
      if (!sintesis) return;
      voces = sintesis.getVoices();
      const antes = ui.voz.value === "auto" ? (pref.voz || "auto") : ui.voz.value;
      ui.voz.replaceChildren(new ventana.Option("Automática (español)", "auto"),
        ...vocesEs().map((v) => new ventana.Option(`${v.name} (${v.lang})`, `${v.name}|${v.lang}`)));
      ui.voz.value = [...ui.voz.options].some((o) => o.value === antes) ? antes : "auto";
      pintarEstado();
    }
    /* true si hay con qué hablar en español. Con la lista vacía (algunos móviles la entregan tarde) se intenta igual. */
    const puedeHablar = () => !!sintesis && (voces.length === 0 || vocesEs().length > 0);

    function callar() {
      guia.turno++;
      if (sintesis) sintesis.cancel();
      guia.hablando = false;
      nivelar();
    }
    function decir(texto) {
      const turno = ++guia.turno;
      sintesis.cancel();
      const voz = elegirVoz();
      const frases = texto.match(/[^.!?]+[.!?]*/g) || [texto];       // frases cortas: Chrome corta las muy largas
      guia.frases = [];                                              // se guardan: algunos navegadores las descartan a medias
      frases.forEach((f, i) => {
        const u = new ventana.SpeechSynthesisUtterance(f.trim());
        if (voz) u.voice = voz;
        u.lang = voz ? voz.lang : "es-ES";
        u.rate = Number(ui.velocidad.value) || 1;
        if (i === 0) u.onstart = () => { if (turno === guia.turno) { guia.hablando = true; nivelar(); } };
        const fin = () => { if (turno === guia.turno && i === frases.length - 1) { guia.hablando = false; nivelar(); } };
        u.onend = fin; u.onerror = fin;
        guia.frases.push(u);
        sintesis.speak(u);
      });
    }
    function escribirParaLector(texto) {            // vaciar y volver a escribir: el lector lo lee aunque se repita
      ui.vivo.textContent = "";
      ventana.setTimeout(() => { ui.vivo.textContent = texto; }, 60);
    }
    /* UNA sola salida por respuesta. Con lector: texto en la región viva (y solo si la página no lo anuncia ya).
       Sin lector: la voz de la guía (y solo si la página no lo va a decir con su propia voz). */
    function responder(texto, { paginaAnuncia = false, paginaHabla = false } = {}) {
      if (!texto) return;
      guia.ultima = texto;
      ui.respuesta.textContent = texto;
      if (modoLector()) { if (!paginaAnuncia) escribirParaLector(texto); return; }
      if (paginaHabla) return;
      if (puedeHablar()) ventana.setTimeout(() => decir(texto), 120);    // tras la acción: que nadie la cancele
      else escribirParaLector(texto);
    }

    /* ================================================================ B. reconocimiento de voz */
    const Reconocedor = ventana.SpeechRecognition || ventana.webkitSpeechRecognition || null;
    const IDIOMAS = ["es-EC", "es-ES"];
    let idioma = 0, rec = null;
    const ERRORES = {
      "not-allowed": "No tengo permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones y vuelve a pulsar el botón. También puedes escribir lo que quieres hacer.",
      "service-not-allowed": "El navegador no permite el reconocimiento de voz en esta página. Puedes escribir lo que quieres hacer.",
      "audio-capture": "No encuentro ningún micrófono. Conecta uno o escribe lo que quieres hacer.",
      "no-speech": "No escuché nada. Pulsa el botón o la tecla H y habla después del pitido.",
      "network": "El reconocimiento de voz de este navegador necesita internet y no respondió. Puedes escribir lo que quieres hacer.",
      "language-not-supported": "Este navegador no reconoce voz en español. Puedes escribir lo que quieres hacer.",
    };
    const SIN_RECONOCIMIENTO = "Este navegador no tiene reconocimiento de voz (pasa, por ejemplo, en Firefox). Usa Chrome, Edge o Safari, o escribe lo que quieres hacer.";

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
    function pintarEscucha(activa) {
      guia.escuchando = activa;
      ui.hablar.setAttribute("aria-pressed", String(activa));
      ui.hablarTexto.textContent = activa ? "Escuchando… pulsa para terminar" : "Hablar con la guía";
      nivelar();
      pintarEstado();
    }
    function escuchar() {
      if (guia.escuchando) { try { rec.stop(); } catch (e) { pintarEscucha(false); } return; }
      if (!Reconocedor) { responder(SIN_RECONOCIMIENTO); return; }
      callar();                                                          // que el micrófono no oiga a la guía
      rec = new Reconocedor();
      rec.lang = IDIOMAS[idioma];
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 4;
      let hubo = false;
      rec.onstart = () => { pintarEscucha(true); pitido(); };
      rec.onresult = (e) => {
        hubo = true;
        const opciones = Array.from(e.results[e.results.length - 1]).map((x) => x.transcript);
        const util = opciones.find((o) => !["desconocido", "nada"].includes(interpretarComando(o).tipo));
        atender(util || opciones[0]);                                    // la primera alternativa que sea un comando
      };
      rec.onerror = (e) => {
        hubo = true;
        if (e.error === "aborted") return;
        if (e.error === "language-not-supported" && idioma < IDIOMAS.length - 1) { idioma++; ventana.setTimeout(escuchar, 200); return; }
        let texto = ERRORES[e.error] || `El reconocimiento de voz falló (${e.error}). Puedes escribir lo que quieres hacer.`;
        if (e.error === "not-allowed" && ventana.isSecureContext === false) texto = "El micrófono solo funciona en páginas https o en localhost. Puedes escribir lo que quieres hacer.";
        responder(texto);
      };
      rec.onend = () => { pintarEscucha(false); if (!hubo) responder(ERRORES["no-speech"]); };
      try { rec.start(); } catch (e) { pintarEscucha(false); responder("No pude abrir el micrófono. Puedes escribir lo que quieres hacer."); }
    }

    /* ---------- de un texto (oído o escrito) a la acción y a la respuesta ---------- */
    async function atender(texto) {
      ui.oido.textContent = texto || "—";
      const accion = interpretarComando(texto);
      if (guia.lector === null && (accion.tipo === "afirmar" || accion.tipo === "negar")) { fijarLector(accion.tipo === "afirmar"); return; }
      if (accion.tipo === "afirmar" || accion.tipo === "negar") accion.tipo = "desconocido", accion.texto = normalizar(texto);
      const turno = ++guia.turnoFrase;
      let r = null;
      if (ia) {                                       // la IA devuelve null cuando debe resolverlo el intérprete de comandos
        guia.pensando = true; pintarEstado();
        try { r = await ia.atender(texto, accion, guia); } catch (e) { r = null; }
        guia.pensando = false; pintarEstado();
        if (turno !== guia.turnoFrase) return;        // mientras esperaba llegó otra frase: esta ya no cuenta
      }
      if (!r) {
        try { r = await ejecutar(accion, A, guia); }
        catch (e) { r = { texto: "No pude hacerlo: el reproductor no respondió." }; }
      }
      if (ia) ia.marcar(!!r.deIA);                    // etiqueta "Respuesta generada por IA"
      if (r.callar) { callar(); ui.respuesta.textContent = "(en silencio)"; return; }
      responder(r.texto, r);
    }

    function pintarEstado() {
      const partes = [];
      if (guia.pensando) partes.push("Un momento…");
      if (guia.escuchando) partes.push("Te escucho. Di lo que quieres hacer.");
      else if (!Reconocedor) partes.push(SIN_RECONOCIMIENTO);
      else partes.push(ui.tecla.checked ? "Pulsa el botón o la tecla H y habla después del pitido." : "Pulsa el botón y habla después del pitido.");
      if (!modoLector()) {
        if (!sintesis) partes.push("Este navegador no tiene voz: las respuestas salen por escrito.");
        else if (voces.length && !vocesEs().length) partes.push("No hay una voz en español instalada: las respuestas salen por escrito.");
      }
      ui.estado.textContent = partes.join(" ");
      const sinVoz = modoLector() || !puedeHablar();
      for (const c of [ui.voz, ui.velocidad, ui.probar]) c.disabled = sinVoz;
    }

    function fijarLector(usa, { avisar = true } = {}) {
      const primera = guia.lector === null;
      guia.lector = usa;
      guardar({ lector: usa });
      ui.lector.checked = usa;
      ui.pregunta.hidden = true;
      ui.cuerpo.hidden = false;
      if (usa) callar();
      pintarEstado();
      if (primera && panel.contains(doc.activeElement)) ui.hablar.focus();   // los botones de la pregunta desaparecen
      if (!avisar) return;
      responder(usa
        ? "De acuerdo. No usaré mi propia voz: tu lector de pantalla leerá mis respuestas. Pulsa la tecla H para hablar con la guía."
        : "Guía por voz activada. Pulsa la tecla H o el botón Hablar con la guía y di, por ejemplo: reproduce, pausa, siguiente pista o año 1990. Di ayuda para oír más.");
    }

    /* ---------- eventos ---------- */
    ui.si.addEventListener("click", () => fijarLector(true));
    ui.no.addEventListener("click", () => fijarLector(false));
    ui.lector.addEventListener("change", () => fijarLector(ui.lector.checked));
    ui.hablar.addEventListener("click", escuchar);
    ui.formulario.addEventListener("submit", (e) => {
      e.preventDefault();
      const texto = ui.campo.value.trim();
      if (!texto) return;
      ui.campo.value = "";
      atender(texto);
    });
    ui.ayuda.addEventListener("click", () => {
      const abrir = ui.listaAyuda.hidden;
      ui.listaAyuda.hidden = !abrir;
      ui.ayuda.setAttribute("aria-expanded", String(abrir));
    });
    ui.tecla.addEventListener("change", () => { guardar({ tecla: ui.tecla.checked }); pintarEstado(); });
    ui.voz.addEventListener("change", () => guardar({ voz: ui.voz.value }));
    const NOMBRE_VELOCIDAD = (v) => (v < 0.9 ? "lenta" : v > 1.1 ? "rápida" : "normal");
    ui.velocidad.addEventListener("input", () => {
      ui.velocidad.setAttribute("aria-valuetext", NOMBRE_VELOCIDAD(Number(ui.velocidad.value)));
      guardar({ velocidad: Number(ui.velocidad.value) });
    });
    ui.probar.addEventListener("click", () => { if (puedeHablar()) decir("Esta es la voz de la guía."); });

    doc.addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const d = e.target, etiqueta = d.tagName;
      const escribe = etiqueta === "TEXTAREA" || etiqueta === "SELECT" || d.isContentEditable ||
        (etiqueta === "INPUT" && !["range", "checkbox"].includes(d.type));
      if (e.key === "Escape" && guia.escuchando) { try { rec.abort(); } catch (x) { /* ya cerrado */ } pintarEscucha(false); return; }
      if (escribe || !ui.tecla.checked || guia.lector === null) return;
      if (e.key === "h" || e.key === "H") { e.preventDefault(); escuchar(); }
    });
    ventana.addEventListener("pagehide", () => { callar(); try { if (rec) rec.abort(); } catch (e) { /* nada */ } });

    /* ---------- estado inicial ---------- */
    if (typeof pref.tecla === "boolean") ui.tecla.checked = pref.tecla;
    if (pref.velocidad >= 0.6 && pref.velocidad <= 1.4) { ui.velocidad.value = String(pref.velocidad); ui.velocidad.setAttribute("aria-valuetext", NOMBRE_VELOCIDAD(pref.velocidad)); }
    ui.hablar.setAttribute("aria-keyshortcuts", "H");
    if (sintesis) { cargarVoces(); if (sintesis.addEventListener) sintesis.addEventListener("voiceschanged", cargarVoces); }
    guia.turnoFrase = 0;
    try {
      if (ventana.GuiaVozIA) ia = ventana.GuiaVozIA.conectar({ A, doc, ventana, panel, preferencias: { leer, guardar },
        herramientas: { interpretarComando, ejecutar, normalizar, buscarFecha } });
    } catch (e) { ia = null; }                        // si la IA no arranca, la guía sigue con sus comandos
    if (guia.lector === null) { ui.cuerpo.hidden = true; pintarEstado(); }
    else fijarLector(guia.lector, { avisar: false });

    return { atender, escuchar, callar, estado: guia };
  }

  return { interpretarComando, normalizar, palabrasANumeros, buscarFecha, buscarPista, leerFecha, ejecutar, montar, AYUDA };
});
