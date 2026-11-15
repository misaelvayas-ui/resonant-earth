/* Gráficos SVG: el de la pista (con cursor que sigue al audio) y el mini-gráfico del hero. */
"use strict";

import { cargarPistas, cargarRasgos } from "./datos.js";
import { frase } from "./lectura.js";

const NS = "http://www.w3.org/2000/svg";
const AN = 600, AL = 140, MARGEN = 12;
let serie = null;      // {puntos: [[x, y]], dur}
let linea = null, punto = null, seleccion = null;

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

/* alElegir(segundos) se llama al hacer clic en el gráfico o al pulsar Enter sobre el momento elegido con las flechas. */
export function dibujarGraficoPista(contenedor, pista, doc, alElegir) {
  contenedor.textContent = "";
  for (const a of ["role", "tabindex", "aria-label", "aria-describedby", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"]) contenedor.removeAttribute(a);
  contenedor.classList.remove("grafico-activo");
  serie = null; linea = punto = seleccion = null;
  const R = (doc ? doc.rasgos : []).map((r, i) => ({ r, i })).filter((x) => x.r.media != null);
  if (R.length < 2) {
    contenedor.textContent = "Sin datos para el gráfico";
    return;
  }
  const svg = el("svg", { viewBox: `0 0 ${AN} ${AL}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" }, contenedor);
  const dur = pista.duracion_s;
  const valores = R.map((x) => x.r.media);
  if (doc.referencia != null) valores.push(doc.referencia);
  const y = escala(valores);
  const puntos = R.map((x) => [Math.min(AN, (x.r.t_video / dur) * AN), y(x.r.media, AL, MARGEN)]);
  if (doc.referencia != null) {
    const yr = y(doc.referencia, AL, MARGEN);
    el("line", { x1: 0, x2: AN, y1: yr, y2: yr, stroke: "#98a1ab", "stroke-width": 1, "stroke-dasharray": "4 4", "vector-effect": "non-scaling-stroke" }, svg);
  }
  el("polyline", { points: puntos.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#c3cad2", "stroke-width": 1.5, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, svg);
  seleccion = el("line", { class: "cursor-sel", x1: 0, x2: 0, y1: 0, y2: AL }, svg);
  linea = el("line", { class: "cursor-linea", x1: 0, x2: 0, y1: 0, y2: AL }, svg);
  punto = el("ellipse", { class: "cursor-punto", cx: 0, cy: puntos[0][1], rx: 4 * AN / (contenedor.clientWidth || AN), ry: 4 }, svg);
  serie = { puntos, dur, fraccion: 0 };
  if (doc.referencia != null) {
    const t = document.createElement("span");
    t.className = "dato";
    t.textContent = pista.grafico.etiqueta_ref;
    t.style.cssText = "display:block;margin-top:4px";
    contenedor.appendChild(t);
  }
  document.getElementById("resumen-grafico").textContent = pista.grafico.resumen;
  hacerInteractivo(contenedor, svg, pista, doc, R, alElegir);
  moverCursor(0);
}

/* El gráfico pasa a ser un control: role="slider" con el momento elegido (un fotograma). Clic o Enter salta al video. */
function hacerInteractivo(contenedor, svg, pista, doc, R, alElegir) {
  if (!alElegir) return;
  let k = 0;                                             // posición elegida dentro de R
  let ultimaTecla = 0;                                   // mientras se navega con flechas, k no sigue al video
  const texto = () => frase(pista, doc, R[k].i, true);
  const mostrar = () => {
    seleccion.setAttribute("x1", serie.puntos[k][0]); seleccion.setAttribute("x2", serie.puntos[k][0]);
    contenedor.setAttribute("aria-valuenow", String(k));
    contenedor.setAttribute("aria-valuetext", texto());
  };
  const masCercano = () => {
    const x = serie.fraccion * AN;
    let mejor = 0;
    serie.puntos.forEach((p, n) => { if (Math.abs(p[0] - x) < Math.abs(serie.puntos[mejor][0] - x)) mejor = n; });
    return mejor;
  };
  const sincronizar = () => { k = masCercano(); mostrar(); };
  const ir = (seg) => { alElegir(Math.max(0, Math.min(pista.duracion_s, seg))); ultimaTecla = 0; };
  contenedor.setAttribute("role", "slider");
  contenedor.setAttribute("tabindex", "0");
  contenedor.setAttribute("aria-label", "Gráfico de la pista. Flechas izquierda y derecha eligen un momento; Enter salta hasta él");
  contenedor.setAttribute("aria-describedby", "resumen-grafico");
  contenedor.setAttribute("aria-valuemin", "0");
  contenedor.setAttribute("aria-valuemax", String(R.length - 1));
  mostrar();
  contenedor.addEventListener("focus", () => { sincronizar(); contenedor.classList.add("grafico-activo"); });
  contenedor.addEventListener("blur", () => contenedor.classList.remove("grafico-activo"));
  contenedor.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (performance.now() - ultimaTecla > 4000) sincronizar();
    ultimaTecla = performance.now();
    const paso = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[ev.key];
    if (paso !== undefined) k = Math.max(0, Math.min(R.length - 1, k + paso));
    else if (ev.key === "Home") k = 0;
    else if (ev.key === "End") k = R.length - 1;
    else if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ir(R[k].r.t_video); return; }
    else return;
    ev.preventDefault();
    mostrar();
  });
  contenedor.addEventListener("click", (ev) => {
    const caja = svg.getBoundingClientRect();
    if (caja.width <= 0) return;
    ir(Math.max(0, Math.min(1, (ev.clientX - caja.left) / caja.width)) * pista.duracion_s);
  });
}

export function moverCursor(fraccion) {
  if (!serie || !linea) return;
  const f = Math.max(0, Math.min(1, fraccion));
  serie.fraccion = f;
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
