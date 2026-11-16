/* Rocola de la Tierra · Resonant Earth — conversación libre con IA para la guía por voz (opcional).

   Qué hace: cuando la frase NO es un comando corto y claro, la manda (con el estado de la página) a un
   servicio propio (carpeta servicio-ia/), que consulta un modelo de IA y devuelve
       { accion, parametros, respuesta }
   Aquí se comprueba esa respuesta y se ejecuta con el MISMO reproductor y las MISMAS funciones de guia-voz.js.

   Qué NO hace: no guarda ni conoce ninguna clave (la clave vive solo en el servicio) y no decide nada fuera
   de una lista corta de acciones permitidas.

   Si no hay dirección del servicio (guia-voz-config.js), no hay internet, el servicio falla, responde algo
   raro o tarda más de 6 segundos, este archivo devuelve "null" y la guía sigue con sus comandos de siempre,
   sin avisos. Sin este archivo, la guía funciona igual que antes. */
(function (raiz, fabrica) {
  "use strict";
  const api = fabrica();
  if (typeof module === "object" && module.exports) module.exports = api;       // pruebas con Node
  else raiz.GuiaVozIA = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Lo único que la IA puede pedir. La misma lista está en el servicio; aquí se vuelve a comprobar. */
  const ACCIONES = ["ninguna", "reproducir", "pausar", "siguiente", "anterior", "elegir", "saltar_tiempo", "saltar_anio",
    "descripcion", "leyenda", "volumen", "repetir", "ayuda", "senalar"];
  /* Los únicos lugares de la página que la IA puede pedir que se señalen. Igual que en guia-voz.js y en el servicio. */
  const LUGARES = ["pistas", "reproductor", "reproducir", "cambiar", "volumen", "avance", "grafico", "lectura", "descripcion", "leyenda",
    "como_funciona", "por_que", "accesibilidad", "equipo"];
  const ESPERA_MS = 9000;             // más que esto y se usan los comandos de siempre (el servicio prueba hasta ~8 s con sus modelos)
  const ESPERA_VOZ_MS = 3000;         // la voz humana: si no llega en esto, habla la voz del navegador
  const PAUSA_VOZ_MS = 5 * 60000;     // tras un fallo de la voz humana, no se pide durante 5 minutos (tras un "límite", 30)
  const MAX_VOZ = 600;                // caracteres que acepta la ruta de voz
  const PAUSA_MS = 60000;             // tras un "límite" o dos fallos seguidos, no se insiste durante un minuto
  const MAX_FRASE = 300;              // el servicio no acepta frases más largas
  const MAX_CONTEXTO = 8500;          // caracteres del contexto ya serializado (el servicio corta en 9000)
  const AVISO = "Tus frases se envían a un servicio de IA.";
  /* Lo que se ve de la IA, en los dos idiomas de la guía. Poco texto: el aviso, la etiqueta y una casilla que lo explica todo. */
  const TEXTOS = {
    es: { aviso: AVISO, etiqueta: "Respuesta generada por IA", firma: "Respuesta generada por IA. ",
      casilla: "Conversar con IA. Lo que dices y lo que suena se envía a un servicio de IA de Google. No digas datos personales; la IA puede equivocarse.",
      vozHumana: "Voz humana de Gemini para las respuestas de la IA. Si tarda o falla, sigo con la voz del navegador." },
    en: { aviso: "Your phrases are sent to an AI service.", etiqueta: "AI-generated answer", firma: "AI-generated answer. ",
      casilla: "Talk with AI. What you say and what is playing are sent to a Google AI service. Do not share personal data; the AI can make mistakes.",
      vozHumana: "Human-sounding Gemini voice for AI answers. If it is slow or fails, I keep using the browser voice." },
  };

  /* Comandos cortos y claros: se hacen al instante, sin IA (no esperan ni gastan cupo). "pausa" debe pausar ya. */
  const DIRECTOS = new Set(["nada", "reproducir", "pausar", "siguiente", "anterior", "saltar_tiempo", "saltar_relativo",
    "saltar_anio", "inicio", "final", "volumen", "callar", "afirmar", "negar"]);
  const SIEMPRE_DIRECTOS = new Set(["saltar_extremo", "recorrido", "detener_recorrido", "idioma", "lector"]);   // los resuelve la página con sus datos, sin modelo
  function esComandoDirecto(texto, accion, normalizar) {
    if (SIEMPRE_DIRECTOS.has(accion.tipo)) return true;
    const palabras = normalizar(texto).split(" ").filter(Boolean).length;
    if (palabras > 4) return false;                                       // una frase larga puede ser una pregunta
    return DIRECTOS.has(accion.tipo) || (accion.tipo === "elegir" && accion.numero != null);
  }

  const corto = (s, n) => { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  const redondo = (x, d = 2) => (typeof x === "number" && isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

  /* Estado de la página que se manda al servicio. Solo sale de lo que expone el adaptador. */
  function armarContexto(A, conversacion = [], resumir = null, idioma = "es") {
    const pistas = A.pistas(), i = A.indiceActual(), t = A.tiempo(), d = A.detalle ? A.detalle() : {};
    const fechas = A.fechas();
    const actual = fechas.filter((f) => f.t <= t + 0.001).pop();
    let serie = (d.serie || []).map((r) => [r.fecha == null ? redondo(r.t, 1) : r.fecha, redondo(r.media), redondo(r.area)]);
    let web = null;
    try { web = A.textosWeb ? A.textosWeb() : null; } catch (e) { web = null; }
    const ctx = {
      idioma: idioma === "en" ? "en" : "es",         // el idioma en que debe responder el modelo
      pistas: pistas.map((p, k) => ({ numero: k + 1, titulo: corto(p.titulo, 80) })),
      pista: pistas[i] ? { numero: i + 1, titulo: corto(pistas[i].titulo, 80), de_que_trata: corto(d.descripcionPista, 700) } : null,
      sonando: A.sonando(),
      segundo: redondo(t, 1),
      duracion_segundos: redondo(A.duracion(), 1),
      fecha_actual: actual ? actual.fecha : null,
      lo_que_pasa_ahora: corto(A.descripcion(), 400),
      leyenda: corto(A.leyenda(), 900),
      unidad: d.unidad || "sin unidad (índice relativo)",
      referencia: redondo(d.referencia),
      serie_columnas: d.serie && d.serie.length ? ["fecha o segundo", "media", "parte del mapa con zona caliente (0 a 1)"] : null,
      serie,
      calculado: null,
      web,                                           // textos fijos de la página: para dudas sobre la web
      conversacion: conversacion.slice(-3).map((c) => ({ persona: corto(c.persona, 160), guia: corto(c.guia, 200) })),
    };
    // cifras ya calculadas por la página (máximo, mínimo, mayor cambio y tendencia): el modelo las usa tal cual
    const R = resumir ? resumir(d.serie) : null;
    if (R) {
      const punto = (p) => ({ fecha: p.fecha, valor: p.valor });
      const ahora = (d.serie || []).filter((r) => r.t <= t + 0.001).pop();
      ctx.calculado = {
        nota: "Cifras ya calculadas por la página. Úsalas tal cual; no calcules ni estimes otras.",
        momento_actual: ahora && typeof ahora.media === "number" ? { fecha: ahora.fecha == null ? null : String(ahora.fecha), valor: redondo(ahora.media) } : null,
        maximo: punto(R.maximo), minimo: punto(R.minimo), mayor_cambio: R.mayor_cambio,
        tendencia: { inicio: punto(R.tendencia.inicio), fin: punto(R.tendencia.fin), cambio: R.tendencia.cambio, direccion: R.tendencia.direccion },
      };
    }
    // si no cabe: primero la serie a la mitad (varias veces), luego fuera la conversación y la leyenda
    while (JSON.stringify(ctx).length > MAX_CONTEXTO && ctx.serie.length > 12) ctx.serie = ctx.serie.filter((_, k) => k % 2 === 0);
    if (JSON.stringify(ctx).length > MAX_CONTEXTO) ctx.conversacion = [];
    if (JSON.stringify(ctx).length > MAX_CONTEXTO) ctx.leyenda = corto(ctx.leyenda, 300);
    if (JSON.stringify(ctx).length > MAX_CONTEXTO && ctx.web) for (const k of Object.keys(ctx.web)) ctx.web[k] = Array.isArray(ctx.web[k]) ? ctx.web[k].map((x) => corto(x, 120)) : corto(ctx.web[k], 280);
    if (JSON.stringify(ctx).length > MAX_CONTEXTO) { ctx.serie = []; ctx.serie_columnas = null; }
    if (JSON.stringify(ctx).length > MAX_CONTEXTO) ctx.web = null;
    return ctx;
  }

  /* Comprueba lo que devolvió el servicio contra la lista de acciones y contra el estado de la página.
     Devuelve { accion, parametros, respuesta } limpio, o null si algo no cuadra (entonces se usan los comandos). */
  function validarRespuesta(obj, ctx = {}) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    if (typeof obj.accion !== "string" || !ACCIONES.includes(obj.accion)) return null;
    if (obj.respuesta != null && typeof obj.respuesta !== "string") return null;
    const p = obj.parametros == null ? {} : obj.parametros;
    if (typeof p !== "object" || Array.isArray(p)) return null;
    const respuesta = (obj.respuesta || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
    if (respuesta.length > 600) return null;
    const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
    const nPistas = (ctx.pistas || []).length, dur = ctx.duracion_segundos || 0;
    const parametros = {};
    switch (obj.accion) {
      case "ninguna": if (!respuesta) return null; break;
      case "elegir": if (!entero(p.numero, 1, nPistas)) return null; parametros.numero = p.numero; break;
      case "saltar_tiempo":
        if (typeof p.segundos !== "number" || !isFinite(p.segundos)) return null;
        if (p.relativo != null && typeof p.relativo !== "boolean") return null;
        if (p.relativo ? Math.abs(p.segundos) > Math.max(dur, 1) || p.segundos === 0 : p.segundos < 0 || p.segundos > dur) return null;
        parametros.segundos = p.segundos; parametros.relativo = !!p.relativo; break;
      case "saltar_anio":
        if (!entero(p.anio, 1000, 2999)) return null;
        if (p.mes != null && !entero(p.mes, 1, 12)) return null;
        parametros.anio = p.anio; if (p.mes != null) parametros.mes = p.mes; break;
      case "volumen":
        if (p.valor != null) { if (!entero(p.valor, 0, 100)) return null; parametros.valor = p.valor; }
        else if (p.delta != null) { if (!entero(p.delta, -100, 100) || p.delta === 0) return null; parametros.delta = p.delta; }
        else return null;
        break;
      case "senalar":                                                    // solo lugares de la lista fija
        if (typeof p.lugar !== "string" || !LUGARES.includes(p.lugar)) return null;
        parametros.lugar = p.lugar; break;
      default: break;                                                    // el resto no lleva parámetros
    }
    return { accion: obj.accion, parametros, respuesta };
  }

  /* De la acción de la IA a la acción que ya entiende ejecutar() de guia-voz.js. null = solo responder. */
  function aAccionLocal(v) {
    const p = v.parametros;
    switch (v.accion) {
      case "ninguna": return null;
      case "elegir": return { tipo: "elegir", numero: p.numero };
      case "saltar_tiempo": return p.relativo ? { tipo: "saltar_relativo", segundos: p.segundos } : { tipo: "saltar_tiempo", segundos: p.segundos };
      case "saltar_anio": return { tipo: "saltar_anio", anio: p.anio, ...(p.mes ? { mes: p.mes } : {}) };
      case "volumen": return p.valor != null ? { tipo: "volumen", valor: p.valor } : { tipo: "volumen", delta: p.delta };
      case "senalar": return { tipo: "senalar", lugar: p.lugar };
      default: return { tipo: v.accion };                                 // reproducir, pausar, siguiente, anterior, descripcion, leyenda, repetir, ayuda
    }
  }

  /* La dirección del servicio debe ser https (o localhost, para probar). Cualquier otra cosa = sin IA. */
  function direccionValida(url) {
    url = typeof url === "string" ? url.trim() : "";
    return /^https:\/\/[^\s/]+/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url) ? url : "";
  }

  /* Pregunta al servicio. Devuelve el objeto que respondió o lanza un error con .limite si fue un 429. */
  async function preguntar(url, texto, contexto, { fetchImpl, espera = ESPERA_MS, Abortar = AbortController } = {}) {
    const control = new Abortar();
    const reloj = setTimeout(() => control.abort(), espera);
    try {
      const r = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, contexto }),
        signal: control.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
      if (!r.ok) { const e = new Error("servicio " + r.status); e.limite = r.status === 429; throw e; }
      return await r.json();
    } finally {
      clearTimeout(reloj);
    }
  }

  /* Pide al servicio el audio de una frase (ruta /voz). Devuelve un Blob de audio o lanza un error (con .limite si fue un 429). */
  async function pedirVoz(url, texto, { fetchImpl, espera = ESPERA_VOZ_MS, Abortar = AbortController } = {}) {
    const control = new Abortar();
    const reloj = setTimeout(() => control.abort(), espera);
    try {
      const r = await fetchImpl(url.replace(/\/+$/, "") + "/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }),
        signal: control.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
      if (!r.ok) { const e = new Error("voz " + r.status); e.limite = r.status === 429; throw e; }
      if (!/^audio\//i.test((r.headers && r.headers.get && r.headers.get("Content-Type")) || "")) throw new Error("voz sin audio");
      const audio = await r.blob();                                        // el reloj sigue corriendo mientras baja el audio
      if (!audio || !audio.size) throw new Error("voz vacía");
      return audio;
    } finally {
      clearTimeout(reloj);
    }
  }

  /* Conecta la IA con la guía. Devuelve null si no hay servicio configurado (todo queda como antes). */
  function conectar({ A, doc, ventana, panel, herramientas, preferencias, idioma = () => "es" }) {
    const T = () => TEXTOS[idioma() === "en" ? "en" : "es"];
    const url = direccionValida(ventana.GUIA_VOZ_CONFIG && ventana.GUIA_VOZ_CONFIG.servicioIA);
    if (!url || typeof ventana.fetch !== "function" || typeof ventana.AbortController !== "function") return null;
    const { interpretarComando, ejecutar, normalizar, buscarFecha, resumenSerie } = herramientas;
    const estado = { fallos: 0, pausaHasta: 0, conversacion: [], avisado: false, vozPausaHasta: 0 };

    /* ---------- lo que se ve: aviso, etiqueta y la casilla para apagarlo ---------- */
    const etiqueta = doc.createElement("p");
    etiqueta.id = "gv-ia-etiqueta"; etiqueta.className = "gv-ia-etiqueta"; etiqueta.hidden = true;
    panel.querySelector("#gv-respuesta").after(etiqueta);                   // justo debajo del subtítulo

    const aviso = doc.createElement("p");
    aviso.id = "gv-ia-aviso"; aviso.className = "gv-ia-aviso";
    panel.querySelector("#gv-escribir").before(aviso);                      // siempre a la vista mientras la IA está encendida

    const casilla = doc.createElement("label");
    casilla.className = "gv-casilla";
    casilla.innerHTML = '<input type="checkbox" id="gv-ia"> <span></span>';
    const grupo = panel.querySelector("#gv-grupo-escucha");                 // junto a las demás opciones de conversación
    if (grupo) grupo.append(casilla); else panel.querySelector("#gv-lector").closest("label").before(casilla);
    // interruptor de la voz humana (apagada por defecto: gasta cupo del modelo de voz y cada respuesta espera hasta 3 s)
    const casillaVoz = doc.createElement("label");
    casillaVoz.className = "gv-casilla";
    casillaVoz.innerHTML = '<input type="checkbox" id="gv-voz-ia"> <span></span>';
    casilla.after(casillaVoz);
    const interruptorVoz = casillaVoz.querySelector("input");
    interruptorVoz.checked = preferencias.leer().vozIA === true;
    interruptorVoz.addEventListener("change", () => { preferencias.guardar({ vozIA: interruptorVoz.checked }); estado.vozPausaHasta = 0; });
    const interruptor = casilla.querySelector("input");
    interruptor.checked = preferencias.leer().ia !== false;                 // encendida, salvo que la persona la haya apagado
    const pintar = () => { aviso.hidden = !interruptor.checked; if (!interruptor.checked) etiqueta.hidden = true; interruptorVoz.disabled = !interruptor.checked; };
    const traducir = () => { const t = T(); aviso.textContent = t.aviso; etiqueta.textContent = t.etiqueta; casilla.querySelector("span").textContent = t.casilla; casillaVoz.querySelector("span").textContent = t.vozHumana; };
    interruptor.addEventListener("change", () => { preferencias.guardar({ ia: interruptor.checked }); pintar(); });
    traducir();
    pintar();

    const anotar = (persona, guia) => { estado.conversacion.push({ persona, guia }); estado.conversacion = estado.conversacion.slice(-3); };
    const fallo = (limite) => { estado.fallos++; if (limite || estado.fallos >= 2) { estado.pausaHasta = Date.now() + PAUSA_MS; estado.fallos = 0; } return null; };

    /* texto -> resultado para la guía ({ texto, deIA, ... }) o null = "resuélvelo con los comandos de siempre". */
    async function atender(texto, accionLocal, memoria) {
      if (!interruptor.checked || !texto || texto.length > MAX_FRASE) return null;
      if (esComandoDirecto(texto, accionLocal, normalizar)) return null;
      if (ventana.navigator && ventana.navigator.onLine === false) return null;
      if (Date.now() < estado.pausaHasta) return null;

      let ctx, bruto;
      // "no entendí", "repite", "más simple": el modelo reformula lo último que dijo la guía, con palabras más simples
      const reformular = accionLocal.tipo === "repetir";
      if (reformular && !memoria.ultima) return null;
      try { ctx = armarContexto(A, estado.conversacion, resumenSerie, idioma()); } catch (e) { return null; }
      if (reformular) ctx.reformular = corto(memoria.ultima, 600);
      try { bruto = await preguntar(url, texto, ctx, { fetchImpl: ventana.fetch.bind(ventana), Abortar: ventana.AbortController }); }
      catch (e) { return fallo(!!e.limite); }
      const v = validarRespuesta(bruto, ctx);
      if (!v) return fallo(false);
      estado.fallos = 0;

      const local = aAccionLocal(v);
      const firmar = (t) => { if (estado.avisado) return t; estado.avisado = true; return T().firma + t; };   // se dice una vez por visita
      if (reformular) { if (!v.respuesta) return null; anotar(texto, v.respuesta); return { texto: firmar(v.respuesta), deIA: true }; }   // solo palabras: no ejecuta nada
      if (!local) { anotar(texto, v.respuesta); return { texto: firmar(v.respuesta), deIA: true }; }

      // una fecha que la pista no tiene (o no exacta): manda lo que diga el reproductor, no la IA
      const f = local.tipo === "saltar_anio" ? buscarFecha(A.fechas(), local.anio, local.mes) : null;
      const r = await ejecutar(local, A, memoria, idioma());
      const literal = ["descripcion", "leyenda", "repetir", "ayuda"].includes(local.tipo) || (f && !f.exacto) || !v.respuesta;
      anotar(texto, literal ? r.texto : v.respuesta);
      return literal ? { ...r, deIA: false } : { ...r, texto: firmar(v.respuesta), deIA: true };
    }

    /* El audio de una respuesta con la voz humana, o null = "dilo con la voz del navegador" (apagada, en pausa, sin red,
       texto largo, tardó más de 3 s, error o sin cupo). Nunca lanza. */
    async function voz(texto) {
      texto = String(texto || "").replace(/\s+/g, " ").trim();
      if (!interruptor.checked || !interruptorVoz.checked || !texto || texto.length > MAX_VOZ) return null;
      if (ventana.navigator && ventana.navigator.onLine === false) return null;
      if (Date.now() < estado.vozPausaHasta || typeof ventana.Audio !== "function" || !ventana.URL || !ventana.URL.createObjectURL) return null;
      try { return await pedirVoz(url, texto, { fetchImpl: ventana.fetch.bind(ventana), Abortar: ventana.AbortController }); }
      catch (e) { estado.vozPausaHasta = Date.now() + (e.limite ? 6 : 1) * PAUSA_VOZ_MS; return null; }
    }

    return { atender, voz, traducir, marcar: (esIA) => { etiqueta.hidden = !esIA || !interruptor.checked; }, encendida: () => interruptor.checked, estado };
  }

  return { ACCIONES, LUGARES, AVISO, TEXTOS, ESPERA_MS, MAX_CONTEXTO, armarContexto, validarRespuesta, aAccionLocal, esComandoDirecto, direccionValida, preguntar, pedirVoz, ESPERA_VOZ_MS, conectar };
});
