/* Lectura en vivo: qué rasgo está en pantalla y una frase que lo cuenta (para ver y para el lector de pantalla). */
"use strict";

const MENOS = "−";
let el = null;
let ultimo = { id: null, i: -1 };
let ultimoAnuncio = 0;
let pendiente = null;
let temporizador = null;

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

export function indiceEn(rasgos, t) {
  let i = 0;
  for (let k = 0; k < rasgos.length; k++) {
    if (rasgos[k].t_video <= t + 1e-6) i = k; else break;
  }
  return i;
}

function etiquetaFecha(r, i) {
  return r.fecha != null ? String(r.fecha) : `Momento ${i + 1}`;
}

export function frase(pista, doc, i) {
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
  return pista.lectura.plantilla.replace(/\{(\w+)\}/g, (m, k) => (k in mapa ? mapa[k] : m));
}

export function iniciarLectura(elementos) {
  el = elementos;
}

function anunciar(texto) {
  if (!el || !el.casilla.checked) return;
  el.viva.textContent = "";
  requestAnimationFrame(() => { el.viva.textContent = texto; });
  ultimoAnuncio = performance.now();
}

export function limpiar() {
  ultimo = { id: null, i: -1 };
  pendiente = null;
  if (el) { el.fecha.innerHTML = "&nbsp;"; el.texto.textContent = "Sin lectura todavía."; }
}

export function sinLectura() {
  ultimo = { id: null, i: -1 };
  if (el) { el.fecha.innerHTML = "&nbsp;"; el.texto.textContent = "Sin lectura disponible."; }
}

export function actualizar(pista, doc, t, sonando, forzar = false) {
  if (!el || !pista || !doc) return;
  const i = indiceEn(doc.rasgos, t);
  const cambio = ultimo.id !== pista.id || ultimo.i !== i;
  if (cambio) {
    ultimo = { id: pista.id, i };
    el.fecha.textContent = etiquetaFecha(doc.rasgos[i], i);
    const texto = frase(pista, doc, i);
    el.texto.textContent = texto;
    pendiente = texto;
  }
  if (!pendiente) return;
  const ahora = performance.now();
  if (forzar || !sonando) {
    anunciar(pendiente);
    pendiente = null;
  } else if (ahora - ultimoAnuncio >= 4000) {
    anunciar(pendiente);
    pendiente = null;
  }
}
