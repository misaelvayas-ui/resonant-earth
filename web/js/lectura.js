/* Lectura en vivo: qué rasgo está en pantalla y una frase que lo cuenta (para ver y para el lector de pantalla). */
"use strict";

import { t, loc, num, fechaLoc } from "./idioma.js";

let el = null;
let ultimo = { id: null, i: -1 };       // lo que muestra el panel
let anunciado = { id: null, i: -1 };    // lo último que se envió al lector de pantalla
let ultimoAnuncio = 0;
let espera = 0;                         // ms mínimos hasta el próximo anuncio

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
  return r.fecha != null ? fechaLoc(r.fecha) : t("lectura.momento", { n: i + 1 });
}

/* corta=true: la versión breve para el lector de pantalla (plantilla_viva), que se pronuncia en ~2 s */
export function frase(pista, doc, i, corta = false) {
  const r = doc.rasgos[i];
  const fecha = etiquetaFecha(r, i);
  if (r.media == null) return t("lectura.sinDato", { fecha });
  const dec = pista.lectura.decimales;
  const ref = doc.referencia ?? 0;
  const mapa = {
    fecha,
    valor: num(r.media, dec),
    valor_signo: num(r.media, dec, true),
    dif_ref_signo: num(r.media - ref, dec, true),
    area: String(Math.round((r.area ?? 0) * 100)),
  };
  const plantilla = (corta && loc(pista.lectura, "plantilla_viva")) || loc(pista.lectura, "plantilla");
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
  if (el) vaciarFechas(t("lectura.sin"));
}

export function sinLectura() {
  ultimo = anunciado = { id: null, i: -1 };
  if (el) vaciarFechas(t("lectura.noDisp"));
}

export function actualizar(pista, doc, seg, sonando, forzar = false) {
  if (!el || !pista || !doc) return;
  const i = indiceEn(doc.rasgos, seg);
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

/* Al cambiar de idioma: reescribe el panel (y la fecha sobre el video) sin anunciar nada al lector de pantalla */
export function refrescar(pista, doc, seg) {
  if (!el) return;
  ultimo = { id: null, i: -1 };
  if (!pista || !doc) { vaciarFechas(t("lectura.sin")); return; }
  const i = indiceEn(doc.rasgos, seg);
  ultimo = { id: pista.id, i };
  const fecha = etiquetaFecha(doc.rasgos[i], i);
  el.fecha.textContent = fecha;
  el.texto.textContent = frase(pista, doc, i);
  if (el.fechaVideo) { el.fechaVideo.textContent = fecha; el.fechaVideo.hidden = false; }
}
