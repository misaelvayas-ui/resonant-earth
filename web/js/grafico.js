/* Gráficos SVG: el de la pista (con cursor que sigue al audio) y el mini-gráfico del hero. */
"use strict";

import { cargarPistas, cargarRasgos } from "./datos.js";

const NS = "http://www.w3.org/2000/svg";
const AN = 600, AL = 140, MARGEN = 12;
let serie = null;      // {puntos: [[x, y]], duracion}
let linea = null, punto = null;

function el(nombre, atrib, padre) {
  const e = document.createElementNS(NS, nombre);
  for (const [k, v] of Object.entries(atrib || {})) e.setAttribute(k, v);
  if (padre) padre.appendChild(e);
  return e;
}

function escala(valores) {
  let min = Math.min(...valores), max = Math.max(...valores);
  if (max - min < 1e-9) { min -= 1; max += 1; }
  return (v, alto, margen) => alto - margen - ((v - min) / (max - min)) * (alto - 2 * margen);
}

export function dibujarGraficoPista(contenedor, pista, doc) {
  contenedor.textContent = "";
  serie = null; linea = punto = null;
  const R = (doc ? doc.rasgos : []).filter((r) => r.media != null);
  if (R.length < 2) {
    contenedor.textContent = "Sin datos para el gráfico";
    return;
  }
  const svg = el("svg", { viewBox: `0 0 ${AN} ${AL}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" }, contenedor);
  const dur = pista.duracion_s;
  const valores = R.map((r) => r.media);
  if (doc.referencia != null) valores.push(doc.referencia);
  const y = escala(valores);
  const puntos = R.map((r) => [Math.min(AN, (r.t_video / dur) * AN), y(r.media, AL, MARGEN)]);
  if (doc.referencia != null) {
    const yr = y(doc.referencia, AL, MARGEN);
    el("line", { x1: 0, x2: AN, y1: yr, y2: yr, stroke: "#98a1ab", "stroke-width": 1, "stroke-dasharray": "4 4", "vector-effect": "non-scaling-stroke" }, svg);
  }
  el("polyline", { points: puntos.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#c3cad2", "stroke-width": 1.5, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, svg);
  linea = el("line", { class: "cursor-linea", x1: 0, x2: 0, y1: 0, y2: AL }, svg);
  punto = el("ellipse", { class: "cursor-punto", cx: 0, cy: puntos[0][1], rx: 4 * AN / (contenedor.clientWidth || AN), ry: 4 }, svg);
  serie = { puntos, dur };
  if (doc.referencia != null) {
    const t = document.createElement("span");
    t.className = "dato";
    t.textContent = pista.grafico.etiqueta_ref;
    t.style.cssText = "display:block;margin-top:4px";
    contenedor.appendChild(t);
  }
  document.getElementById("resumen-grafico").textContent = pista.grafico.resumen;
  moverCursor(0);
}

export function moverCursor(fraccion) {
  if (!serie || !linea) return;
  const f = Math.max(0, Math.min(1, fraccion));
  const x = f * AN;
  const P = serie.puntos;
  let y = P[0][1];
  if (x >= P[P.length - 1][0]) y = P[P.length - 1][1];
  else if (x > P[0][0]) {
    for (let i = 1; i < P.length; i++) {
      if (x <= P[i][0]) {
        const a = P[i - 1], b = P[i];
        y = a[1] + ((x - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]);
        break;
      }
    }
  }
  linea.setAttribute("x1", x); linea.setAttribute("x2", x);
  punto.setAttribute("cx", x); punto.setAttribute("cy", y);
}

export async function iniciarMiniGrafico(contenedor, parrafo) {
  try {
    const pistas = await cargarPistas();
    const doc = await cargarRasgos(pistas[0]);
    if (!doc) throw new Error("sin rasgos");
    const R = doc.rasgos.filter((r) => r.media != null);
    const w = 240, h = 64, m = 6;
    const valores = R.map((r) => r.media).concat(doc.referencia != null ? [doc.referencia] : []);
    const y = escala(valores);
    const pts = R.map((r, i) => [(i / (R.length - 1)) * w, y(r.media, h, m)]);
    const primero = R[0], ultimo = R[R.length - 1];
    const f = (n) => (n < 0 ? "−" : "+") + Math.abs(n).toFixed(2).replace(".", ",");
    const texto = `De ${f(primero.media)} °C en ${primero.fecha} a ${f(ultimo.media)} °C en ${ultimo.fecha}, frente al promedio de 1951–1980`;
    contenedor.textContent = "";
    const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": texto }, contenedor);
    if (doc.referencia != null) {
      const yr = y(doc.referencia, h, m);
      el("line", { x1: 0, x2: w, y1: yr, y2: yr, stroke: "#98a1ab", "stroke-width": 1, "stroke-dasharray": "3 3" }, svg);
    }
    el("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#f3f6f8", "stroke-width": 1.5, "stroke-linejoin": "round" }, svg);
    const u = pts[pts.length - 1];
    el("circle", { cx: u[0] - 3, cy: u[1], r: 3, fill: "#86cdfa" }, svg);
    parrafo.textContent = texto;
  } catch (e) {
    contenedor.textContent = "";
    parrafo.textContent = "Anomalía de temperatura, 1881–2023";
  }
}
