/* Lectura en vivo: qué rasgo está en pantalla y una frase que lo cuenta (para ver y para el lector de pantalla). */
"use strict";

const MENOS = "−";
let el = null;
let ultimo = { id: null, i: -1 };       // lo que muestra el panel
let anunciado = { id: null, i: -1 };    // lo último que se envió al lector de pantalla
let ultimoAnuncio = 0;
let espera = 0;                         // ms mínimos hasta el próximo anuncio

function coma(n, dec) {
  return Math.abs(n).toFixed(dec).replace(".", ",");
}
function conSigno(n, dec) {
  const t = coma(n, dec);
  if (Number(t.replace(",", ".")) === 0) return t;
  return (n < 0 ? MENOS : "+") + t;
}
function sinSigno(n, dec) {
  return (n < 0 && Number(coma(n, dec).replace(",", ".")) !== 0 ? MENOS : "") + coma(n, dec);
}

/* Índice del último rasgo con t_video <= t (rasgos ordenados por t_video): búsqueda binaria. */
export function indiceEn(rasgos, t) {
  let lo = 0, hi = rasgos.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (rasgos[m].t_video <= t + 1e-6) lo = m; else hi = m - 1;
  }
  return lo;
}

function etiquetaFecha(r, i) {
  return r.fecha != null ? String(r.fecha) : `Momento ${i + 1}`;
}

/* corta=true: la versión breve para el lector de pantalla (plantilla_viva), que se pronuncia en ~2 s */
export function frase(pista, doc, i, corta = false) {
  const r = doc.rasgos[i];
  const fecha = etiquetaFecha(r, i);
  if (r.media == null) return `${fecha}: sin dato en este momento.`;
  const dec = pista.lectura.decimales;
  const ref = doc.referencia ?? 0;
  const mapa = {
    fecha,
    valor: sinSigno(r.media, dec),
    valor_signo: conSigno(r.media, dec),
    dif_ref_signo: conSigno(r.media - ref, dec),
    area: String(Math.round((r.area ?? 0) * 100)),
  };
  const plantilla = (corta && pista.lectura.plantilla_viva) || pista.lectura.plantilla;
  return plantilla.replace(/\{(\w+)\}/g, (m, k) => (k in mapa ? mapa[k] : m));
}

export function iniciarLectura(elementos) {
  el = elementos;
}

/* Anuncia el fotograma ACTUAL (se calcula aquí, no se guarda): así nunca se dice algo que ya pasó. */
function anunciar(pista, doc, i, sonando) {
  anunciado = { id: pista.id, i };
  ultimoAnuncio = performance.now();
  const texto = frase(pista, doc, i, true);
  // el lector tarda en pronunciar el texto; no se envía otro hasta que haya terminado (~70 ms por carácter)
  espera = sonando ? Math.max(3000, texto.length * 70 + 800) : 700;
  el.viva.textContent = "";
  requestAnimationFrame(() => { el.viva.textContent = texto; });
}

function vaciarFechas(texto) {
  el.fecha.innerHTML = "&nbsp;";
  el.texto.textContent = texto;
  if (el.fechaVideo) { el.fechaVideo.textContent = ""; el.fechaVideo.hidden = true; }
}

export function limpiar() {
  ultimo = anunciado = { id: null, i: -1 };
  if (el) vaciarFechas("Sin lectura todavía.");
}

export function sinLectura() {
  ultimo = anunciado = { id: null, i: -1 };
  if (el) vaciarFechas("Sin lectura disponible.");
}

export function actualizar(pista, doc, t, sonando, forzar = false) {
  if (!el || !pista || !doc) return;
  const i = indiceEn(doc.rasgos, t);
  if (ultimo.id !== pista.id || ultimo.i !== i) {
    ultimo = { id: pista.id, i };
    const fecha = etiquetaFecha(doc.rasgos[i], i);
    el.fecha.textContent = fecha;
    el.texto.textContent = frase(pista, doc, i);
    if (el.fechaVideo) { el.fechaVideo.textContent = fecha; el.fechaVideo.hidden = false; }
  }
  if (!el.casilla.checked || (anunciado.id === pista.id && anunciado.i === i)) return;
  if (forzar || performance.now() - ultimoAnuncio >= espera) anunciar(pista, doc, i, sonando);
}
