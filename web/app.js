/* Rocola de la Tierra · Resonant Earth — lógica de la página (JavaScript puro). */
"use strict";

const SALTO_S = 5;            // flechas: ±5 s
const ANUNCIO_CADA_MS = 4000; // lector de pantalla: como mucho un anuncio cada 4 s al reproducir
const VOLUMEN_CON_VOZ = 0.35;  // la música baja a este nivel mientras habla la narración
const VIBRACION_MS = 80;      // duración de la vibración en un cambio brusco
// CLAVE_PREFERENCIAS, leerPreferencias(), guardarPreferencias(), aplicarTema(): arranque.js
// t(), campoCatalogo(), traducirPagina(), idiomaActual: textos.js

const $ = (id) => document.getElementById(id);
const el = {
  lista: $("lista"),
  estado: $("estado-catalogo"),
  reproductor: $("reproductor"),
  titulo: $("titulo-actual"),
  descripcion: $("descripcion-actual"),
  video: $("video"),
  play: $("play"),
  completa: $("completa"),
  progreso: $("progreso"),
  tiempo: $("tiempo"),
  volumen: $("volumen"),
  viva: $("descripcion-viva"),
  anuncio: $("anuncio"),
  anunciar: $("anunciar"),
  subtitulos: $("subtitulos"),
  voz: $("voz"),
  casillaVoz: $("casilla-voz"),
  vibrar: $("vibrar"),
  casillaVibrar: $("casilla-vibrar"),
  momentos: $("momentos"),
  cajaMomentos: document.querySelector(".momentos"),
  tema: $("tema"),
  atajoAyuda: $("atajo-ayuda"),
  tituloAyuda: $("titulo-ayuda"),
  leyendaColores: $("leyenda-colores"),
  leyendaPaneo: $("leyenda-paneo"),
  registroTiempo: $("registro-tiempo"),
  grafico: $("grafico"),
  graficoArea: document.querySelector(".grafico-area"),
  graficoTitulo: $("grafico-titulo"),
  curva: $("grafico-curva"),
  cursor: $("grafico-cursor"),
  estela: $("grafico-estela"),
  recorte: $("grafico-recorte"),
  punto: $("grafico-punto"),
  ref: $("grafico-ref"),
  refRotulo: $("grafico-ref-rotulo"),
  ejeYMax: $("eje-y-max"),
  ejeYMin: $("eje-y-min"),
  ejeXIni: $("eje-x-ini"),
  ejeXFin: $("eje-x-fin"),
};

const estado = {
  catalogo: [],
  actual: null,      // entrada del catálogo elegida
  rasgos: [],        // rasgos de la entrada actual, ordenados por tiempo del video
  contexto: {},      // unidad, vmin, vmax, referencia, seg, paneo, idioma
  cargada: false,    // video y rasgos de la pista actual ya listos
  vozHabla: false,   // la narración está hablando: la música suena más bajo
  indice: -1,        // rasgo en pantalla
  ultimoAnuncio: 0,
  turno: 0,          // descarta respuestas viejas si describir() es asíncrona
  arrastrando: false,
  urlVideo: null,    // URL del Blob del video actual
  escalaG: null,     // escala del gráfico: { min, max, dur, y(t), t0, t1 }
};

/* ---------- utilidades ---------- */

function formatoTiempo(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  return `${m}:${String(seg).padStart(2, "0")}`;
}

function textoTiempo(s) {
  const m = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  const partes = [];
  if (m) partes.push(`${m} ${t(m === 1 ? "tiempo.minuto" : "tiempo.minutos")}`);
  partes.push(`${seg} ${t(seg === 1 ? "tiempo.segundo" : "tiempo.segundos")}`);
  return partes.join(" ");
}

function anunciar(texto, forzar = false) {
  if (!el.anunciar.checked) return;
  const ahora = Date.now();
  if (!forzar && ahora - estado.ultimoAnuncio < ANUNCIO_CADA_MS) return;
  estado.ultimoAnuncio = ahora;
  // vaciar y volver a escribir hace que el lector lo lea aunque el texto se repita
  el.anuncio.textContent = "";
  setTimeout(() => { el.anuncio.textContent = texto; }, 50);
}

/* Preferencias del visitante (se guardan con guardarPreferencias de arranque.js). */
function guardarCasillas() {
  guardarPreferencias({
    volumen: Number(el.volumen.value),
    anunciar: el.anunciar.checked,
    subtitulos: el.subtitulos.checked,
    voz: el.voz.checked,
    vibrar: el.vibrar.checked,
    atajoAyuda: el.atajoAyuda.checked,
  });
}

function aplicarPreferencias() {
  const p = leerPreferencias();
  if (Number.isFinite(p.volumen) && p.volumen >= 0 && p.volumen <= 100) el.volumen.value = String(p.volumen);
  for (const nombre of ["anunciar", "subtitulos", "voz", "vibrar", "atajoAyuda"]) {
    if (typeof p[nombre] === "boolean") el[nombre].checked = p[nombre];
  }
  el.tema.value = temaGuardado();
  // la voz y la vibración solo se ofrecen si el navegador las tiene
  el.casillaVoz.hidden = !vozDisponible();
  el.casillaVibrar.hidden = !("vibrate" in navigator);
  if (el.casillaVoz.hidden) el.voz.checked = false;
  if (el.casillaVibrar.hidden) el.vibrar.checked = false;
}

/* ---------- idioma y tema ---------- */

function pintarBotonesDeIdioma() {
  for (const b of document.querySelectorAll(".boton-idioma")) {
    b.setAttribute("aria-pressed", String(b.dataset.idioma === idiomaActual));
  }
}

/* Vuelve a escribir todo lo que depende del idioma: textos fijos, lista, pista elegida,
   descripción, subtítulos, gráfico y momentos clave. */
function cambiarIdioma(idioma) {
  if (!IDIOMAS.includes(idioma) || idioma === idiomaActual) return;
  idiomaActual = idioma;
  guardarPreferencias({ idioma });
  callarVoz();
  pintarTodoElTexto();
}

function pintarTodoElTexto() {
  traducirPagina();
  pintarBotonesDeIdioma();
  estado.contexto.idioma = idiomaActual;
  pintarLista();
  pintarPlay();
  pintarProgreso();
  pintarVolumen();
  if (!estado.actual) return;
  pintarPista(estado.actual);
  dibujarGrafico();
  if (!estado.cargada) return;
  pintarMomentos();
  ponerSubtitulos(estado.actual);
  actualizarDescripcion(true, { silencio: true });
}

/* ---------- catálogo ---------- */

async function cargarCatalogo() {
  try {
    const r = await fetch("catalogo.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const datos = await r.json();
    estado.catalogo = (datos.visualizaciones || []).filter((v) => v.id && v.titulo && v.video);
  } catch (e) {
    el.estado.classList.add("error");
    ponerEstado(location.protocol === "file:" ? "rocola.error-archivo" : "rocola.error", { detalle: e.message });
    return;
  }
  if (!estado.catalogo.length) {
    ponerEstado("rocola.vacio");
    return;
  }
  ponerEstado(null);
  pintarLista();
  const pedido = decodeURIComponent(location.hash.slice(1));
  const inicial = estado.catalogo.find((v) => v.id === pedido) || estado.catalogo[0];
  elegir(inicial, { reproducir: false });
}

/* Mensaje bajo "Elige una visualización" (null = ninguno). Guarda la clave para que el
   cambio de idioma lo traduzca. */
function ponerEstado(clave, datos) {
  if (!clave) {
    delete el.estado.dataset.i18n;
    el.estado.textContent = "";
    return;
  }
  el.estado.dataset.i18n = clave;
  el.estado.textContent = t(clave, datos);
}

function pintarLista() {
  const elegida = estado.actual?.id;
  el.lista.replaceChildren(...estado.catalogo.map((v) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "boton-rocola";
    b.dataset.id = v.id;
    b.setAttribute("aria-pressed", String(v.id === elegida));

    // nombre accesible = solo el título (la descripción completa puede ser muy larga);
    // el resumen se lee como descripción y "Elegida" ya lo dice aria-pressed
    const titulo = document.createElement("span");
    titulo.className = "titulo";
    titulo.id = `pista-${v.id}-titulo`;
    titulo.textContent = campoCatalogo(v, "titulo");
    const resumen = document.createElement("span");
    resumen.className = "resumen";
    resumen.id = `pista-${v.id}-resumen`;
    resumen.textContent = campoCatalogo(v, "descripcion");
    b.setAttribute("aria-labelledby", titulo.id);
    if (resumen.textContent) b.setAttribute("aria-describedby", resumen.id);
    const sonando = document.createElement("span");
    sonando.className = "sonando";
    sonando.setAttribute("aria-hidden", "true");
    sonando.textContent = t("rocola.elegida");

    b.append(titulo, resumen, sonando);
    b.addEventListener("click", () => elegir(v, { reproducir: true }));
    li.append(b);
    return li;
  }));
}

/* Textos de la pista elegida (se repinta al cambiar de idioma). */
function pintarPista(v) {
  const titulo = campoCatalogo(v, "titulo");
  const leyenda = campoCatalogo(v, "leyenda");
  el.titulo.textContent = titulo;
  el.descripcion.textContent = campoCatalogo(v, "descripcion");
  el.leyendaColores.textContent = leyenda ? t("leyenda.colores", { leyenda }) : "";
  el.video.setAttribute("aria-label", t("reproductor.video", { titulo }));
  el.leyendaPaneo.textContent = t(estado.contexto.paneo === "y" ? "leyenda.paneo.y" : "leyenda.paneo.x");
}

async function elegir(v, { reproducir }) {
  estado.actual = v;
  estado.cargada = false;
  estado.rasgos = [];
  estado.indice = -1;
  estado.escalaG = null;
  estado.contexto = { unidad: v.unidad ?? "", paneo: "x", idioma: idiomaActual }; // hasta que lleguen los rasgos
  callarVoz();
  callarEjemplo();
  dibujarGrafico();
  pintarMomentos();
  el.registroTiempo.textContent = "--:--";
  history.replaceState(null, "", location.search + "#" + encodeURIComponent(v.id));

  for (const b of el.lista.querySelectorAll(".boton-rocola")) {
    b.setAttribute("aria-pressed", String(b.dataset.id === v.id));
  }
  pintarPista(v);
  el.viva.textContent = t("reproductor.cargando");
  activarControles(false);

  await Promise.all([cargarVideo(v), cargarRasgos(v)]);
  if (estado.actual !== v) return; // el usuario eligió otra mientras cargaba
  if (el.video.error) {
    el.viva.textContent = t("reproductor.sin-video", { archivo: v.video });
    return;
  }
  estado.cargada = true;
  activarControles(true);
  pintarPista(v);
  await actualizarDescripcion(true, { silencio: true });
  if (estado.actual !== v) return;
  ponerSubtitulos(v);
  dibujarGrafico();
  pintarMomentos();
  if (reproducir) {
    el.video.play().catch(() => {});
    anunciar(t("reproductor.elegiste", { titulo: campoCatalogo(v, "titulo") }), true);
  } else {
    anunciar(el.viva.textContent, true); // al abrir la página: solo al lector de pantalla, sin voz
  }
}

function activarControles(activos) {
  el.play.disabled = !activos;
  el.progreso.disabled = !activos;
  el.completa.disabled = !activos;
}

/* El video se descarga entero y se reproduce desde un Blob: así se puede saltar a cualquier
   punto aunque el servidor no acepte peticiones por rangos (python -m http.server no las acepta). */
async function cargarVideo(v) {
  if (estado.urlVideo) URL.revokeObjectURL(estado.urlVideo);
  estado.urlVideo = null;
  let src = v.video;
  try {
    const r = await fetch(v.video);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const total = Number(r.headers.get("Content-Length")) || 0;
    const partes = [];
    let recibido = 0;
    const lector = r.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (estado.actual !== v) { lector.cancel(); return; }
      partes.push(value);
      recibido += value.length;
      if (total) el.viva.textContent = t("reproductor.cargando-video", { porcentaje: Math.round((100 * recibido) / total) });
    }
    src = estado.urlVideo = URL.createObjectURL(new Blob(partes, { type: "video/mp4" }));
  } catch (e) {
    // sin fetch (p. ej. file://) se intenta igual con la ruta directa
  }
  if (estado.actual !== v) return;
  el.video.src = src;
  el.video.load();
  await new Promise((ok) => {
    el.video.addEventListener("loadedmetadata", ok, { once: true });
    el.video.addEventListener("error", ok, { once: true });
  });
}

async function cargarRasgos(v) {
  if (!v.rasgos) {
    el.viva.textContent = t("reproductor.sin-rasgos");
    return;
  }
  try {
    const r = await fetch(v.rasgos);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (estado.actual !== v) return;
    const lista = Array.isArray(d) ? d : d.rasgos || [];
    // t_video = segundo del mp4 en que empieza el rasgo; si falta, se usa t
    estado.rasgos = lista
      .map((x) => ({ ...x, _t: x.t_video ?? x.t ?? 0 }))
      .sort((a, b) => a._t - b._t);
    marcarSaltos(estado.rasgos, umbralDeSalto(d)); // momentos.js: el mismo umbral que el golpe fuerte del audio
    const primero = estado.rasgos[0];
    estado.contexto = {
      idioma: idiomaActual,
      unidad: v.unidad ?? d.unidad ?? "",
      vmin: d.vmin,
      vmax: d.vmax,
      referencia: d.referencia ?? (primero ? primero.media : null), // igual que el dron de 06
      seg: d.seg_por_fotograma,
      paneo: d.paneo === "y" ? "y" : "x", // mismo eje que el paneo del audio (06)
    };
  } catch (e) {
    el.viva.textContent = t("reproductor.error-rasgos", { detalle: e.message });
  }
}

/* ---------- subtítulos: la misma descripción como pista WebVTT ---------- */

function vttTiempo(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = (s % 60).toFixed(3);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${seg.padStart(6, "0")}`;
}

async function ponerSubtitulos(v) {
  el.video.querySelectorAll("track").forEach((t) => { URL.revokeObjectURL(t.src); t.remove(); });
  const R = estado.rasgos;
  if (!R.length) return;
  const textos = await Promise.all(R.map((r) => Promise.resolve(describir(r, estado.contexto)).catch(() => "")));
  if (estado.actual !== v) return;
  const escapar = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/-->/g, "→");
  const cues = R.map((r, i) => {
    const fin = i + 1 < R.length ? R[i + 1]._t : r._t + (estado.contexto.seg ?? 0.5);
    // -1 ms: en el borde exacto el navegador activaría también el subtítulo anterior
    return `${vttTiempo(r._t)} --> ${vttTiempo(Math.max(r._t, fin - 0.001))}\n${escapar(textos[i])}`;
  });
  const pista = document.createElement("track");
  pista.kind = "captions";
  pista.srclang = idiomaActual;
  pista.label = t("vivo.pista-subtitulos");
  pista.src = URL.createObjectURL(new Blob(["WEBVTT\n\n" + cues.join("\n\n") + "\n"], { type: "text/vtt" }));
  el.video.append(pista);
  pista.track.mode = el.subtitulos.checked ? "showing" : "hidden";
}

/* ---------- sincronía de la descripción ---------- */

function indiceEn(t) {
  const R = estado.rasgos;
  let lo = 0, hi = R.length - 1, res = -1;
  while (lo <= hi) {             // último rasgo con _t <= t
    const mid = (lo + hi) >> 1;
    if (R[mid]._t <= t + 1e-3) { res = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return Math.max(res, R.length ? 0 : -1);
}

/* forzar: escribe y anuncia aunque el rasgo no haya cambiado (al pausar, saltar o cambiar de idioma).
   silencio: no anuncia ni narra (hay otro anuncio en curso, p. ej. "Elegiste…").
   sinVoz: lo anuncia al lector de pantalla pero no lo narra (al pausar, la voz se calla). */
async function actualizarDescripcion(forzar = false, { silencio = false, sinVoz = false } = {}) {
  if (!estado.rasgos.length) return;
  const i = indiceEn(el.video.currentTime);
  if (i === estado.indice && !forzar) return;
  const cambioDeRasgo = i !== estado.indice;
  estado.indice = i;
  const rasgo = estado.rasgos[i];
  const turno = ++estado.turno;
  let texto;
  try {
    texto = await describir(rasgo, estado.contexto);
  } catch (e) {
    texto = t("vivo.error");
  }
  if (turno !== estado.turno) return; // llegó tarde: ya hay un rasgo más nuevo
  el.registroTiempo.textContent = reloj(rasgo._t);
  el.viva.textContent = texto;
  if (silencio) return;
  anunciar(texto, forzar);
  if (!sinVoz) narrarRasgo(rasgo, texto, forzar);
  if (cambioDeRasgo && rasgo.salto) vibrar();
}

/* Narración con voz: mientras suena, una frase corta (fecha y valor) cuando la voz está libre;
   en pausa (al saltar a un momento), la descripción completa. Al pausar, se calla. */
function narrarRasgo(rasgo, textoCompleto, forzar) {
  if (!el.voz.checked) return;
  if (el.video.paused) {
    if (forzar) narrar(textoCompleto, idiomaActual, true);
    return;
  }
  Promise.resolve(describir(rasgo, estado.contexto, { breve: true }))
    .then((breve) => narrar(breve, idiomaActual, false))
    .catch(() => {});
}

function vibrar() {
  if (el.vibrar.checked && !el.video.paused && navigator.vibrate) navigator.vibrate(VIBRACION_MS);
}

/* ---------- momentos clave: botones que saltan al momento (momentos.js los calcula) ---------- */

function pintarMomentos() {
  const momentos = estado.cargada ? calcularMomentos(estado.rasgos, estado.contexto.referencia) : [];
  el.cajaMomentos.hidden = !momentos.length;
  el.momentos.replaceChildren(...momentos.map((m) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "boton-momento";
    const cuando = document.createElement("span");
    cuando.className = "cuando";
    cuando.textContent = m.rasgo.fecha != null ? fechaCorta(m.rasgo.fecha, idiomaActual) : formatoTiempo(m.rasgo._t);
    const que = document.createElement("span");
    que.className = "que";
    que.textContent = m.tipos.map((tipo) => t(`momentos.${tipo}`)).join(" · ");
    const valor = document.createElement("span");
    valor.className = "valor";
    Promise.resolve(describir({ media: m.rasgo.media }, estado.contexto, { breve: true }))
      .then((texto) => { valor.textContent = texto; })
      .catch(() => {});
    b.append(cuando, que, valor);
    b.addEventListener("click", () => saltarA(m.rasgo._t));
    li.append(b);
    return li;
  }));
}

function saltarA(segundo) {
  if (el.play.disabled) return;
  el.video.currentTime = segundo + 0.01; // un pelo dentro del rasgo, para caer en él y no en el anterior
}

/* ---------- gráfico: curva de la media y línea del momento actual (SVG) ---------- */

const ANCHO_G = 1000, ALTO_G = 200; // unidades del viewBox (el SVG se estira al ancho)

function reloj(s) { // 00:12 para el registro
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/* Interpolación cúbica monótona (Fritsch–Carlson): curva suave que pasa por cada dato
   sin inventar picos ni valles entre ellos. Devuelve f(x). */
function interpoladorMonotono(xs, ys) {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const h = xs[hi] - xs[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] +
           (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
  };
}

function dibujarGrafico() {
  const R = estado.rasgos.filter((r) => r.media != null);
  const c = estado.contexto;
  const nombre = t(c.unidad === "°C" ? "grafico.temperatura" : "grafico.valor");
  el.graficoTitulo.textContent = c.unidad ? `${nombre} (${c.unidad})` : nombre;
  if (!R.length) {
    el.curva.setAttribute("d", "");
    el.estela.setAttribute("d", "");
    estado.escalaG = null;
    el.ref.setAttribute("visibility", "hidden");
    el.refRotulo.hidden = true;
    for (const e of [el.ejeYMax, el.ejeYMin, el.ejeXIni, el.ejeXFin]) e.textContent = "–";
    el.grafico.setAttribute("aria-label", t("grafico.sin-datos"));
    pintarCursor();
    return;
  }
  const seg = c.seg ?? 0.5;
  const dur = isFinite(el.video.duration) && el.video.duration > 0 ? el.video.duration : R[R.length - 1]._t + seg;
  const valores = R.map((r) => r.media);
  let min = Math.min(...valores), max = Math.max(...valores);
  if (c.referencia != null) { min = Math.min(min, c.referencia); max = Math.max(max, c.referencia); }
  if (max - min < 1e-6) { min -= 0.5; max += 0.5; }
  const margen = (max - min) * 0.08;
  min -= margen; max += margen;
  const x = (t) => (Math.min(t, dur) / dur) * ANCHO_G;
  const y = (v) => ALTO_G - ((v - min) / (max - min)) * ALTO_G;
  // cada rasgo suena durante 'seg' segundos: su dato va al centro de ese tramo
  const ts = [], vs = [];
  for (const r of R) {
    const t = r._t + seg / 2;
    if (!ts.length || t > ts[ts.length - 1]) { ts.push(t); vs.push(r.media); }
  }
  const f = interpoladorMonotono(ts, vs);
  const t0 = ts[0], t1 = ts[ts.length - 1];
  estado.escalaG = { min, max, dur, t0, t1, yDe: (t) => y(f(Math.min(Math.max(t, t0), t1))) };
  // trayectoria suave: muestreada cada ~3 unidades del viewBox
  const pasos = Math.max(ts.length - 1, Math.ceil((x(t1) - x(t0)) / 3));
  const puntos = [];
  for (let k = 0; k <= pasos; k++) {
    const t = ts.length > 1 ? t0 + (t1 - t0) * (k / pasos) : t0;
    puntos.push(`${k ? "L" : "M"}${x(t).toFixed(1)},${y(f(t)).toFixed(1)}`);
  }
  const d = puntos.join("");
  el.curva.setAttribute("d", d);
  el.estela.setAttribute("d", d);

  // signo menos tipográfico (−) en las lecturas del gráfico
  const num = (v) => v.toLocaleString(idiomaActual, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace("-", "−");
  if (c.referencia != null) {
    const yr = y(c.referencia).toFixed(1);
    el.ref.setAttribute("y1", yr);
    el.ref.setAttribute("y2", yr);
    el.ref.setAttribute("visibility", "visible");
    el.refRotulo.hidden = false;
    el.refRotulo.style.top = `${(yr / ALTO_G) * 100}%`;
    el.refRotulo.textContent = t("grafico.referencia", { valor: num(c.referencia) });
  } else {
    el.ref.setAttribute("visibility", "hidden");
    el.refRotulo.hidden = true;
  }
  el.ejeYMax.textContent = num(max);
  el.ejeYMin.textContent = num(min);
  const primero = R[0], ultimo = R[R.length - 1];
  el.ejeXIni.textContent = primero.fecha != null ? fechaCorta(primero.fecha, idiomaActual) : "0:00";
  el.ejeXFin.textContent = ultimo.fecha != null ? fechaCorta(ultimo.fecha, idiomaActual) : formatoTiempo(dur);

  // resumen en texto para lectores de pantalla (fijo: no se anuncia al moverse el cursor)
  const u = c.unidad ? " " + c.unidad : "";
  const cuando = (r) => (r.fecha != null
    ? t("grafico.en-fecha", { fecha: fechaCorta(r.fecha, idiomaActual) })
    : t("grafico.a-los", { tiempo: textoTiempo(r._t) }));
  const iMax = valores.indexOf(Math.max(...valores));
  el.grafico.setAttribute("aria-label", t("grafico.resumen", {
    nombre: nombre.toLowerCase(),
    inicio: num(primero.media) + u, cuandoInicio: cuando(primero),
    fin: num(ultimo.media) + u, cuandoFin: cuando(ultimo),
    maximo: num(valores[iMax]) + u, cuandoMaximo: cuando(R[iMax]),
  }));
  pintarCursor();
}

function pintarCursor() {
  const g = estado.escalaG;
  const dur = g?.dur;
  const ahora = dur ? Math.min(el.video.currentTime, dur) : 0;
  const xc = dur ? (ahora / dur) * ANCHO_G : 0;
  el.cursor.setAttribute("x1", xc.toFixed(1));
  el.cursor.setAttribute("x2", xc.toFixed(1));
  el.cursor.setAttribute("visibility", dur ? "visible" : "hidden");
  // estela: el tramo ya recorrido; punto: la posición actual sobre la trayectoria
  el.recorte.setAttribute("width", dur ? (xc + 10).toFixed(1) : "0");
  el.punto.hidden = !dur;
  if (dur) {
    const tp = Math.min(Math.max(ahora, g.t0), g.t1); // el punto no sale de la curva
    el.punto.style.left = `${((tp / dur) * 100).toFixed(3)}%`;
    el.punto.style.top = `${((g.yDe(ahora) / ALTO_G) * 100).toFixed(3)}%`;
  }
}

function seguirCursor() { // movimiento fluido mientras suena (timeupdate llega solo ~4 veces/s)
  pintarCursor();
  if (!el.video.paused && !el.video.ended) requestAnimationFrame(seguirCursor);
}

// clic en el gráfico: saltar a ese momento (con teclado, lo mismo se hace con la barra de progreso)
el.graficoArea.addEventListener("click", (e) => {
  const dur = estado.escalaG?.dur;
  if (!dur || el.play.disabled) return;
  const caja = el.grafico.getBoundingClientRect();
  const f = Math.min(Math.max((e.clientX - caja.left) / caja.width, 0), 1);
  el.video.currentTime = f * dur;
});

/* ---------- reproductor ---------- */

function alternar() {
  if (el.play.disabled) return;
  if (el.video.paused || el.video.ended) {
    callarEjemplo();
    el.video.play().catch(() => {});
  } else el.video.pause();
}

function saltar(delta) {
  if (el.play.disabled || !isFinite(el.video.duration)) return;
  el.video.currentTime = Math.min(Math.max(el.video.currentTime + delta, 0), el.video.duration);
}

/* Pantalla completa del video (en iPhone, el modo propio de Safari para videos). */
function puedePantallaCompleta() {
  return Boolean(document.fullscreenEnabled || el.video.webkitEnterFullscreen);
}

function pantallaCompleta() {
  if (el.completa.disabled) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (el.video.requestFullscreen) el.video.requestFullscreen().catch(() => {});
  else if (el.video.webkitEnterFullscreen) el.video.webkitEnterFullscreen();
}

function pintarPlay() {
  const pausado = el.video.paused || el.video.ended;
  el.play.querySelector(".icono").textContent = pausado ? "▶" : "❚❚";
  el.play.querySelector(".texto").textContent = t(pausado ? "reproductor.reproducir" : "reproductor.pausar");
  const b = el.lista.querySelector('[aria-pressed="true"]');
  for (const x of el.lista.querySelectorAll(".boton-rocola")) x.classList.toggle("reproduciendo", !pausado && x === b);
}

function pintarProgreso() {
  const dur = isFinite(el.video.duration) ? el.video.duration : 0;
  const ahora = el.video.currentTime;
  el.progreso.max = String(dur);
  if (!estado.arrastrando) el.progreso.value = String(ahora);
  el.tiempo.textContent = `${formatoTiempo(ahora)} / ${formatoTiempo(dur)}`;
  el.progreso.setAttribute("aria-valuetext", t("tiempo.de", { actual: textoTiempo(ahora), total: textoTiempo(dur) }));
  pintarCursor();
}

function pintarVolumen() {
  // mientras habla la narración, la música baja para que se entienda la voz
  el.video.volume = (Number(el.volumen.value) / 100) * (estado.vozHabla ? VOLUMEN_CON_VOZ : 1);
  el.volumen.setAttribute("aria-valuetext", `${el.volumen.value} %`);
}

el.play.addEventListener("click", alternar);
el.completa.addEventListener("click", pantallaCompleta);
el.completa.hidden = !puedePantallaCompleta();
el.video.addEventListener("click", alternar);
el.video.addEventListener("play", () => { pintarPlay(); requestAnimationFrame(seguirCursor); });
el.video.addEventListener("pause", () => {
  pintarPlay();
  callarVoz(); // la narración se calla al pausar
  actualizarDescripcion(true, { silencio: el.video.ended, sinVoz: true });
});
el.video.addEventListener("ended", pintarPlay);
el.video.addEventListener("emptied", pintarPlay); // al cambiar de pista no llega "pause"
el.video.addEventListener("loadedmetadata", pintarProgreso);
el.video.addEventListener("timeupdate", () => { pintarProgreso(); actualizarDescripcion(); });
// "seeking" llega en cuanto se pide el salto (con "seeked" habría que esperar a que el video
// decodifique la imagen, y en una pestaña en segundo plano puede tardar mucho)
el.video.addEventListener("seeking", () => {
  pintarProgreso();
  if (estado.cargada) actualizarDescripcion(true);
});
el.video.addEventListener("seeked", pintarProgreso);

el.progreso.addEventListener("input", () => {
  estado.arrastrando = true;
  el.video.currentTime = Number(el.progreso.value);
});
el.progreso.addEventListener("change", () => { estado.arrastrando = false; });
el.progreso.addEventListener("keydown", (e) => {
  const mapa = { ArrowLeft: -SALTO_S, ArrowDown: -SALTO_S, ArrowRight: SALTO_S, ArrowUp: SALTO_S,
                 PageDown: -SALTO_S * 2, PageUp: SALTO_S * 2 };
  if (e.key in mapa) { e.preventDefault(); saltar(mapa[e.key]); }
  else if (e.key === "Home") { e.preventDefault(); el.video.currentTime = 0; }
  else if (e.key === "End" && isFinite(el.video.duration)) { e.preventDefault(); el.video.currentTime = el.video.duration; }
});

el.volumen.addEventListener("input", pintarVolumen);
el.volumen.addEventListener("change", guardarCasillas);
el.anunciar.addEventListener("change", () => {
  if (!el.anunciar.checked) el.anuncio.textContent = "";
  guardarCasillas();
});
el.subtitulos.addEventListener("change", () => {
  for (const pista of el.video.textTracks) pista.mode = el.subtitulos.checked ? "showing" : "hidden";
  guardarCasillas();
});
el.voz.addEventListener("change", () => {
  if (el.voz.checked) actualizarDescripcion(true); // dice enseguida dónde estamos
  else callarVoz();
  guardarCasillas();
});
el.vibrar.addEventListener("change", guardarCasillas);
el.atajoAyuda.addEventListener("change", guardarCasillas);
narrador.alCambiar = (habla) => { estado.vozHabla = habla; pintarVolumen(); };

/* idioma y tema */
for (const b of document.querySelectorAll(".boton-idioma")) {
  b.addEventListener("click", () => cambiarIdioma(b.dataset.idioma));
}
el.tema.addEventListener("change", () => {
  guardarPreferencias({ tema: el.tema.value });
  aplicarTema(el.tema.value);
});
if (window.matchMedia) { // con "Sistema", seguir al sistema operativo si cambia mientras la página está abierta
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => aplicarTema(temaGuardado()));
}

/* "Aprende los sonidos": cada botón toca un ejemplo corto (sonidos.js) */
for (const b of document.querySelectorAll(".boton-ejemplo")) {
  b.addEventListener("click", () => {
    if (!el.video.paused) el.video.pause();
    const dura = tocarEjemplo(b.dataset.ejemplo, Number(el.volumen.value) / 100);
    if (!dura) anunciar(t("leyenda.sin-audio"), true);
  });
}

/* ayuda: el enlace de la cabecera y la tecla ? llevan al título de la sección */
function abrirAyuda() {
  el.tituloAyuda.scrollIntoView();
  el.tituloAyuda.focus({ preventScroll: true });
}
document.querySelector(".enlace-ayuda").addEventListener("click", (e) => {
  e.preventDefault();
  abrirAyuda();
});

/* atajos globales: Espacio = play/pausa, ← → = ±5 s, ? = ayuda (se puede apagar en la ayuda) */
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
  const destino = e.target;
  const etiqueta = destino.tagName;
  const escribe = etiqueta === "TEXTAREA" || etiqueta === "SELECT" || destino.isContentEditable ||
    (etiqueta === "INPUT" && !["range", "checkbox"].includes(destino.type));
  if (escribe) return;

  if (e.key === " " || e.code === "Space") {
    // en botones y casillas, Espacio conserva su función normal (activar)
    if (etiqueta === "BUTTON" || etiqueta === "A" || destino.type === "checkbox") return;
    e.preventDefault();
    alternar();
  } else if (e.key === "?" && el.atajoAyuda.checked) {
    e.preventDefault();
    abrirAyuda();
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    if (destino === el.volumen) return; // las flechas ajustan el volumen
    e.preventDefault();
    saltar(e.key === "ArrowLeft" ? -SALTO_S : SALTO_S);
  }
});

window.addEventListener("hashchange", () => {
  const v = estado.catalogo.find((x) => x.id === decodeURIComponent(location.hash.slice(1)));
  if (v && v !== estado.actual) elegir(v, { reproducir: false });
});

aplicarPreferencias();
traducirPagina();
pintarBotonesDeIdioma();
pintarVolumen();
cargarCatalogo();
