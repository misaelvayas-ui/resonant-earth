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
  el.viva.textContent = texto;
  anunciar(texto, forzarAnuncio);
}

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
}

function pintarVolumen() {
  el.video.volume = Number(el.volumen.value) / 100;
  el.volumen.setAttribute("aria-valuetext", `${el.volumen.value} %`);
}

el.play.addEventListener("click", alternar);
el.video.addEventListener("click", alternar);
el.video.addEventListener("play", pintarPlay);
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
