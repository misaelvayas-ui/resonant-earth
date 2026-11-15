/* «Explorar el mapa»: lee el color del fotograma del video bajo el cursor (o bajo una mira que se mueve con las
   flechas), lo convierte en valor con la barra de colores de la pista (<id>_paleta.json) y lo toca al instante.
   Es la misma idea que el programa en Python (05), hecha en el navegador y en tiempo real, punto por punto. */
"use strict";

import * as audio from "./audio.js";

const ANCHO = 256, ALTO = 128;          // el fotograma se reduce: basta para un mapa y suaviza costas y rejillas
const PASO = 0.025, PASO_LARGO = 0.1;   // fracción del mapa que mueve cada flecha (con Mayús, el largo)
const DIST_MAX = 70;                    // distancia RGB máxima a la barra para aceptar un color (modo lab)
const TONO_MAX = 12;                    // diferencia de matiz máxima, en grados (modo matiz)
const NIVEL = 0.22;                     // amplitud de la voz de exploración
const MENOS = "−";

let el = null;                          // { boton, zona, mira, texto, video }
let lienzo = null, pincel = null;
let activo = false;
let pista = null, paleta = null, notas = null, tonos = null;
let pos = { x: 0.5, y: 0.5 };
let voz = null, nivelVoz = null;
let ultimo = { valor: null, nota: null, texto: "" };
let ultimoDicho = 0;
let alSalir = null;
const memoria = new Map();

async function cargarPaleta(p) {
  if (memoria.has(p.id)) return memoria.get(p.id);
  let doc = null;
  try {
    const r = await fetch(p.rasgos.replace("_rasgos.json", "_paleta.json"), { cache: "no-cache" });
    if (r.ok) doc = await r.json();
  } catch (e) { doc = null; }
  if (doc && !(Array.isArray(doc.colores) && doc.colores.length > 1)) doc = null;
  memoria.set(p.id, doc);
  return doc;
}

function matiz(r, g, b) {                // → { h en grados, s y v de 0 a 255 }
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: mx ? (d / mx) * 255 : 0, v: mx };
}

/* Color → valor de la barra, o null si ese color no está en la barra (tierra, texto, borde) */
export function valorDeColor(pal, r, g, b, tonosPal) {
  const n = pal.colores.length;
  let mejor = -1, dMin = Infinity;
  if (pal.modo_color === "matiz") {
    const c = matiz(r, g, b);
    if (c.v < pal.brillo_min || c.s < pal.saturacion_min) return null;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(tonosPal[i] - c.h);
      if (d > 180) d = 360 - d;
      if (d < dMin) { dMin = d; mejor = i; }
    }
    if (dMin > TONO_MAX) return null;
  } else {
    for (let i = 0; i < n; i++) {
      const k = pal.colores[i];
      const d = Math.hypot(k[0] - r, k[1] - g, k[2] - b);
      if (d < dMin) { dMin = d; mejor = i; }
    }
    if (dMin > DIST_MAX) return null;
  }
  return pal.vmin + (pal.vmax - pal.vmin) * (mejor / (n - 1));
}

function leerPunto() {
  const v = el.video;
  if (!v || v.readyState < 2 || !v.videoWidth) return { sinImagen: true };
  try {
    pincel.drawImage(v, 0, 0, ANCHO, ALTO);
    const x = Math.min(ANCHO - 2, Math.max(1, Math.round(pos.x * (ANCHO - 1))));
    const y = Math.min(ALTO - 2, Math.max(1, Math.round(pos.y * (ALTO - 1))));
    const d = pincel.getImageData(x - 1, y - 1, 3, 3).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return { valor: valorDeColor(paleta, r / 9, g / 9, b / 9, tonos) };
  } catch (e) {
    return { sinImagen: true };
  }
}

function lugar() {
  const lat = Math.round((90 - pos.y * 180) / 5) * 5;
  const lon = Math.round((pos.x * 360 - 180) / 5) * 5;
  const la = lat === 0 ? "ecuador" : `${Math.abs(lat)}° ${lat > 0 ? "norte" : "sur"}`;
  const lo = Math.abs(lon) === 180 ? "180°" : lon === 0 ? "0°" : `${Math.abs(lon)}° ${lon > 0 ? "este" : "oeste"}`;
  return `${la}, ${lo}`;
}

function numero(v, dec, signo) {
  const t = Math.abs(v).toFixed(dec).replace(".", ",");
  if (Number(t.replace(",", ".")) === 0) return t;
  return (v < 0 ? MENOS : signo ? "+" : "") + t;
}

function frase(valor) {
  const fecha = (document.getElementById("ahora-fecha").textContent || "").trim();
  const cuando = fecha ? `, ${fecha}` : "";
  if (valor == null) return `${lugar()}${cuando}: sin dato aquí (tierra, borde o un color fuera de la barra).`;
  if (paleta.modo_color === "matiz") return `${lugar()}${cuando}: unos ${numero(valor, 0, false)} ${paleta.unidad}, según el color.`;
  const como = Math.abs(valor) < 0.2 ? "cerca del promedio" : valor > 0 ? "más caliente que el promedio" : "más frío que el promedio";
  return `${lugar()}${cuando}: ${numero(valor, 1, true)} ${paleta.unidad}, ${como}.`;
}

function notaDe(valor) {
  const f = Math.min(1, Math.max(0, (valor - paleta.vmin) / (paleta.vmax - paleta.vmin)));
  return notas[Math.round(f * (notas.length - 1))];
}

function sonar(nota) {
  const ctx = audio.contexto();
  if (!ctx) return;
  if (!voz) {
    voz = ctx.createOscillator();
    voz.type = "triangle";
    nivelVoz = ctx.createGain();
    nivelVoz.gain.value = 0;
    voz.connect(nivelVoz).connect(audio.entradaExtra());
    voz.start();
  }
  const t = ctx.currentTime;
  if (nota == null) { nivelVoz.gain.setTargetAtTime(0, t, 0.04); return; }
  voz.frequency.setTargetAtTime(440 * Math.pow(2, (nota - 69) / 12), t, 0.015);
  nivelVoz.gain.setTargetAtTime(NIVEL, t, 0.03);
}

function callar() {
  const ctx = audio.contexto();
  if (ctx && nivelVoz) nivelVoz.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
}

function actualizar(inmediato) {
  if (!activo) return;
  el.mira.style.left = `${pos.x * 100}%`;
  el.mira.style.top = `${pos.y * 100}%`;
  const p = leerPunto();
  if (p.sinImagen) {
    callar();
    ultimo = { valor: null, nota: null, texto: "Todavía no hay imagen. Reproduce la pista un momento y vuelve a explorar." };
    el.texto.textContent = ultimo.texto;
    return;
  }
  const nota = p.valor == null ? null : notaDe(p.valor);
  if (nota !== ultimo.nota && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* sin permiso */ } }
  sonar(nota);
  const texto = frase(p.valor);
  ultimo = { valor: p.valor, nota, texto };
  const ahora = performance.now();
  if (inmediato || ahora - ultimoDicho > 700) {       // con el ratón no se inunda al lector de pantalla
    ultimoDicho = ahora;
    if (el.texto.textContent !== texto) el.texto.textContent = texto;
  }
}

function alPuntero(ev) {
  if (!activo) return;
  const r = el.zona.getBoundingClientRect();
  pos = { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
  actualizar(ev.type === "pointerdown");
}

function alTeclado(ev) {
  if (!activo) return;
  const paso = ev.shiftKey ? PASO_LARGO : PASO;
  const mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso * 2], ArrowDown: [0, paso * 2] }[ev.key];
  if (mov) {
    ev.preventDefault();
    ev.stopPropagation();
    pos = { x: Math.min(1, Math.max(0, pos.x + mov[0])), y: Math.min(1, Math.max(0, pos.y + mov[1])) };
    actualizar(true);
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    salir();
    el.boton.focus();
  }
}

export function iniciarExplorar(elementos, opciones = {}) {
  el = elementos;
  alSalir = opciones.alSalir || null;
  lienzo = document.createElement("canvas");
  lienzo.width = ANCHO; lienzo.height = ALTO;
  pincel = lienzo.getContext("2d", { willReadFrequently: true });
  el.boton.addEventListener("click", () => { if (activo) salir(); else entrar(); });
  el.zona.addEventListener("pointermove", alPuntero);
  el.zona.addEventListener("pointerdown", alPuntero);
  el.zona.addEventListener("keydown", alTeclado);
  audio.alCambiar((e) => { if (activo && e.sonando) salir(); });       // si la pista vuelve a sonar, se deja de explorar
}

/* La rocola avisa de la pista elegida y de la escala con la que suena (notas del <id>_mapeo.json) */
export async function fijarPista(p, mapeo) {
  salir();
  pista = p;
  paleta = null;
  el.boton.disabled = true;
  const pal = p ? await cargarPaleta(p) : null;
  if (p !== pista) return;
  const escala = mapeo && mapeo.escala && mapeo.escala.notas_sonando;
  if (!pal || !Array.isArray(escala) || !escala.length) return;
  paleta = pal;
  notas = escala;
  tonos = pal.colores.map((c) => matiz(c[0], c[1], c[2]).h);
  el.boton.disabled = false;
}

function entrar() {
  if (!paleta) return;
  audio.desbloquear();                   // primero y sin await: es un gesto del usuario
  audio.pausar();
  activo = true;
  el.boton.setAttribute("aria-pressed", "true");
  el.boton.textContent = "Dejar de explorar";
  el.zona.hidden = false;
  el.zona.focus({ preventScroll: true });
  el.zona.scrollIntoView({ block: "center", behavior: "instant" });
  ultimo = { valor: null, nota: null, texto: "" };
  actualizar(true);
}

export function salir() {
  if (!activo) return;
  activo = false;
  callar();
  el.boton.setAttribute("aria-pressed", "false");
  el.boton.textContent = "Explorar el mapa";
  el.zona.hidden = true;
  el.texto.textContent = "";
  if (alSalir) alSalir();
}

/* Para las pruebas */
export const estado = () => ({ activo, x: pos.x, y: pos.y, valor: ultimo.valor, nota: ultimo.nota, texto: ultimo.texto,
  suena: !!(nivelVoz && ultimo.nota != null), disponible: !!paleta });
export function mover(x, y) { pos = { x, y }; actualizar(true); }
