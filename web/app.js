/* Rocola de la Tierra · Resonant Earth — lógica de la página (JavaScript puro). */
"use strict";

const SALTO_S = 5;            // flechas: ±5 s
const ANUNCIO_CADA_MS = 4000; // lector de pantalla: como mucho un anuncio cada 4 s al reproducir

const $ = (id) => document.getElementById(id);
const el = {
  lista: $("lista"),
  estado: $("estado-catalogo"),
  reproductor: $("reproductor"),
  titulo: $("titulo-actual"),
  descripcion: $("descripcion-actual"),
  video: $("video"),
  play: $("play"),
  progreso: $("progreso"),
  tiempo: $("tiempo"),
  volumen: $("volumen"),
  viva: $("descripcion-viva"),
  anuncio: $("anuncio"),
  anunciar: $("anunciar"),
  subtitulos: $("subtitulos"),
  leyendaColores: $("leyenda-colores"),
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
  contexto: {},      // unidad, vmin, vmax, referencia
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
  if (m) partes.push(`${m} ${m === 1 ? "minuto" : "minutos"}`);
  partes.push(`${seg} ${seg === 1 ? "segundo" : "segundos"}`);
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

/* ---------- catálogo ---------- */

async function cargarCatalogo() {
  try {
    const r = await fetch("catalogo.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const datos = await r.json();
    estado.catalogo = (datos.visualizaciones || []).filter((v) => v.id && v.titulo && v.video);
  } catch (e) {
    el.estado.classList.add("error");
    el.estado.textContent = location.protocol === "file:"
      ? "No pude leer el catálogo. Abre la página con un servidor: en la carpeta web/ ejecuta «python -m http.server 8000» y entra a http://localhost:8000"
      : `No pude leer el catálogo (${e.message}).`;
    return;
  }
  if (!estado.catalogo.length) {
    el.estado.textContent = "El catálogo está vacío. Agrega una entrada en catalogo.json.";
    return;
  }
  el.estado.textContent = "";
  pintarLista();
  const pedido = decodeURIComponent(location.hash.slice(1));
  const inicial = estado.catalogo.find((v) => v.id === pedido) || estado.catalogo[0];
  elegir(inicial, { reproducir: false });
}

function pintarLista() {
  el.lista.replaceChildren(...estado.catalogo.map((v) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "boton-rocola";
    b.dataset.id = v.id;
    b.setAttribute("aria-pressed", "false");

    const titulo = document.createElement("span");
    titulo.className = "titulo";
    titulo.textContent = v.titulo;
    const resumen = document.createElement("span");
    resumen.className = "resumen";
    resumen.textContent = v.descripcion || "";
    const sonando = document.createElement("span");
    sonando.className = "sonando";
    sonando.innerHTML = '<span class="barras" aria-hidden="true"><i></i><i></i><i></i></span> Elegida';

    b.append(titulo, resumen, sonando);
    b.addEventListener("click", () => elegir(v, { reproducir: true }));
    li.append(b);
    return li;
  }));
}

async function elegir(v, { reproducir }) {
  estado.actual = v;
  estado.rasgos = [];
  estado.indice = -1;
  estado.escalaG = null;
  dibujarGrafico();
  el.registroTiempo.textContent = "--:--";
  history.replaceState(null, "", "#" + encodeURIComponent(v.id));

  for (const b of el.lista.querySelectorAll(".boton-rocola")) {
    b.setAttribute("aria-pressed", String(b.dataset.id === v.id));
  }
  el.titulo.textContent = v.titulo;
  el.descripcion.textContent = v.descripcion || "";
  el.leyendaColores.textContent = v.leyenda ? `Colores de este video: ${v.leyenda}` : "";
  el.video.setAttribute("aria-label", `Video: ${v.titulo}`);
  el.viva.textContent = "Cargando…";
  el.play.disabled = true;
  el.progreso.disabled = true;

  await Promise.all([cargarVideo(v), cargarRasgos(v)]);
  if (estado.actual !== v) return; // el usuario eligió otra mientras cargaba
  if (el.video.error) {
    el.viva.textContent = `No pude cargar el video «${v.video}».`;
    return;
  }
  el.play.disabled = false;
  el.progreso.disabled = false;
  actualizarDescripcion(true);
  ponerSubtitulos(v);
  dibujarGrafico();
  if (reproducir) {
    el.video.play().catch(() => {});
    anunciar(`Elegiste ${v.titulo}.`, true);
  }
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
      if (total) el.viva.textContent = `Cargando video… ${Math.round((100 * recibido) / total)} %`;
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
    el.viva.textContent = "Esta visualización no tiene archivo de rasgos: no hay descripción en vivo.";
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
    const primero = estado.rasgos[0];
    estado.contexto = {
      unidad: v.unidad ?? d.unidad ?? "",
      vmin: d.vmin,
      vmax: d.vmax,
      referencia: d.referencia ?? (primero ? primero.media : null), // igual que el dron de 06
      seg: d.seg_por_fotograma,
    };
  } catch (e) {
    el.viva.textContent = `No pude leer los rasgos (${e.message}).`;
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
  pista.srclang = "es";
  pista.label = "Descripción automática";
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

async function actualizarDescripcion(forzarAnuncio = false) {
  if (!estado.rasgos.length) return;
  const i = indiceEn(el.video.currentTime);
  if (i === estado.indice && !forzarAnuncio) return;
  estado.indice = i;
  const turno = ++estado.turno;
  let texto;
  try {
    texto = await describir(estado.rasgos[i], estado.contexto);
  } catch (e) {
    texto = "No se pudo generar la descripción.";
  }
  if (turno !== estado.turno) return; // llegó tarde: ya hay un rasgo más nuevo
  el.registroTiempo.textContent = reloj(estado.rasgos[i]._t);
  el.viva.textContent = texto;
  anunciar(texto, forzarAnuncio);
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
  const nombre = c.unidad === "°C" ? "Temperatura media" : "Valor medio";
  el.graficoTitulo.textContent = c.unidad ? `${nombre} (${c.unidad})` : nombre;
  if (!R.length) {
    el.curva.setAttribute("d", "");
    el.estela.setAttribute("d", "");
    estado.escalaG = null;
    el.ref.setAttribute("visibility", "hidden");
    el.refRotulo.hidden = true;
    for (const e of [el.ejeYMax, el.ejeYMin, el.ejeXIni, el.ejeXFin]) e.textContent = "–";
    el.grafico.setAttribute("aria-label", "Gráfico sin datos todavía.");
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
  const num = (v) => v.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace("-", "−");
  if (c.referencia != null) {
    const yr = y(c.referencia).toFixed(1);
    el.ref.setAttribute("y1", yr);
    el.ref.setAttribute("y2", yr);
    el.ref.setAttribute("visibility", "visible");
    el.refRotulo.hidden = false;
    el.refRotulo.style.top = `${(yr / ALTO_G) * 100}%`;
    el.refRotulo.textContent = `referencia ${num(c.referencia)}`;
  } else {
    el.ref.setAttribute("visibility", "hidden");
    el.refRotulo.hidden = true;
  }
  el.ejeYMax.textContent = num(max);
  el.ejeYMin.textContent = num(min);
  const primero = R[0], ultimo = R[R.length - 1];
  el.ejeXIni.textContent = primero.fecha != null ? String(primero.fecha) : "0:00";
  el.ejeXFin.textContent = ultimo.fecha != null ? String(ultimo.fecha) : formatoTiempo(dur);

  // resumen en texto para lectores de pantalla (fijo: no se anuncia al moverse el cursor)
  const u = c.unidad ? " " + c.unidad : "";
  const cuando = (r) => (r.fecha != null ? `en ${r.fecha}` : `a los ${textoTiempo(r._t)}`);
  const iMax = valores.indexOf(Math.max(...valores));
  el.grafico.setAttribute("aria-label",
    `Gráfico de ${nombre.toLowerCase()} a lo largo del video. Empieza en ${num(primero.media)}${u} ${cuando(primero)}, ` +
    `termina en ${num(ultimo.media)}${u} ${cuando(ultimo)} y su máximo es ${num(valores[iMax])}${u} ${cuando(R[iMax])}.`);
  pintarCursor();
}

function pintarCursor() {
  const g = estado.escalaG;
  const dur = g?.dur;
  const t = dur ? Math.min(el.video.currentTime, dur) : 0;
  const xc = dur ? (t / dur) * ANCHO_G : 0;
  el.cursor.setAttribute("x1", xc.toFixed(1));
  el.cursor.setAttribute("x2", xc.toFixed(1));
  el.cursor.setAttribute("visibility", dur ? "visible" : "hidden");
  // estela: el tramo ya recorrido; punto: la posición actual sobre la trayectoria
  el.recorte.setAttribute("width", dur ? (xc + 10).toFixed(1) : "0");
  el.punto.hidden = !dur;
  if (dur) {
    const tp = Math.min(Math.max(t, g.t0), g.t1); // el punto no sale de la curva
    el.punto.style.left = `${((tp / dur) * 100).toFixed(3)}%`;
    el.punto.style.top = `${((g.yDe(t) / ALTO_G) * 100).toFixed(3)}%`;
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
  if (el.video.paused || el.video.ended) el.video.play().catch(() => {});
  else el.video.pause();
}

function saltar(delta) {
  if (el.play.disabled || !isFinite(el.video.duration)) return;
  const t = Math.min(Math.max(el.video.currentTime + delta, 0), el.video.duration);
  el.video.currentTime = t;
}

function pintarPlay() {
  const pausado = el.video.paused || el.video.ended;
  el.play.querySelector(".icono").textContent = pausado ? "▶" : "❚❚";
  el.play.querySelector(".texto").textContent = pausado ? "Reproducir" : "Pausar";
  const b = el.lista.querySelector('[aria-pressed="true"]');
  for (const x of el.lista.querySelectorAll(".boton-rocola")) x.classList.toggle("reproduciendo", !pausado && x === b);
}

function pintarProgreso() {
  const dur = isFinite(el.video.duration) ? el.video.duration : 0;
  const t = el.video.currentTime;
  el.progreso.max = String(dur);
  if (!estado.arrastrando) el.progreso.value = String(t);
  el.tiempo.textContent = `${formatoTiempo(t)} / ${formatoTiempo(dur)}`;
  el.progreso.setAttribute("aria-valuetext", `${textoTiempo(t)} de ${textoTiempo(dur)}`);
  pintarCursor();
}

function pintarVolumen() {
  el.video.volume = Number(el.volumen.value) / 100;
  el.volumen.setAttribute("aria-valuetext", `${el.volumen.value} %`);
}

el.play.addEventListener("click", alternar);
el.video.addEventListener("click", alternar);
el.video.addEventListener("play", () => { pintarPlay(); requestAnimationFrame(seguirCursor); });
el.video.addEventListener("pause", () => { pintarPlay(); actualizarDescripcion(true); });
el.video.addEventListener("ended", pintarPlay);
el.video.addEventListener("loadedmetadata", pintarProgreso);
el.video.addEventListener("timeupdate", () => { pintarProgreso(); actualizarDescripcion(); });
el.video.addEventListener("seeked", () => { pintarProgreso(); actualizarDescripcion(true); });

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
el.anunciar.addEventListener("change", () => { if (!el.anunciar.checked) el.anuncio.textContent = ""; });
el.subtitulos.addEventListener("change", () => {
  for (const t of el.video.textTracks) t.mode = el.subtitulos.checked ? "showing" : "hidden";
});

/* atajos globales: Espacio = play/pausa, ← → = ±5 s */
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

pintarVolumen();
cargarCatalogo();
