/* Motor de audio: carga el mp4 (video + audio), lo reproduce y entrega amplitud y espectro en tiempo real.
   MediaElementSource → GainNode (volumen) → AnalyserNode → destino. */
"use strict";

export const N_BANDAS = 64;
const FFT = 1024;
const INDICE_MAX = 372;

let medio = null;
let ctx = null, ganancia = null, analizador = null;
let volumen = 0.8;
let peticion = 0;
let actual = null;                 // id de la pista cargada en el <video>
let cargando = false;
const urls = new Map();            // id → URL de objeto
const oyentes = new Set();
const bandas = new Float32Array(N_BANDAS);
const onda8 = new Uint8Array(FFT);
const frec8 = new Uint8Array(FFT / 2);
let nivel = 0;

function avisar() {
  const e = estado();
  oyentes.forEach((fn) => fn(e));
}

export function iniciar(elemento) {
  medio = elemento;
  medio.volume = 1;
  ["play", "pause", "ended", "timeupdate", "seeked", "loadedmetadata", "waiting", "error"]
    .forEach((n) => medio.addEventListener(n, avisar));
  onda8.fill(128);
}

export async function cargar(pista, alProgreso) {
  const mia = ++peticion;
  pausar();
  if (urls.has(pista.id)) {
    if (actual !== pista.id) await ponerFuente(pista, urls.get(pista.id), mia);
    actual = pista.id;
    cargando = false;
    avisar();
    return mia === peticion;
  }
  cargando = true;
  actual = null;
  avisar();
  let src = pista.video;
  try {
    const r = await fetch(pista.video);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const total = Number(r.headers.get("Content-Length")) || 0;
    const partes = [];
    let recibido = 0;
    const lector = r.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (mia !== peticion) { lector.cancel(); return false; }
      partes.push(value);
      recibido += value.length;
      if (total && alProgreso) alProgreso(recibido / total);
    }
    src = URL.createObjectURL(new Blob(partes, { type: "video/mp4" }));
    urls.set(pista.id, src);
  } catch (e) {
    src = pista.video;               // sin fetch (p. ej. file://) se prueba la ruta directa
  }
  if (mia !== peticion) return false;
  const ok = await ponerFuente(pista, src, mia);
  if (mia !== peticion) return false;
  cargando = false;
  actual = ok ? pista.id : null;
  avisar();
  return ok;
}

function ponerFuente(pista, src, mia) {
  return new Promise((resolver) => {
    medio.poster = pista.fotograma;
    medio.src = src;
    const fin = (ok) => {
      medio.removeEventListener("loadedmetadata", bien);
      medio.removeEventListener("error", mal);
      resolver(ok && mia === peticion);
    };
    const bien = () => fin(true);
    const mal = () => fin(false);
    medio.addEventListener("loadedmetadata", bien, { once: true });
    medio.addEventListener("error", mal, { once: true });
    medio.load();
  });
}

function crearGrafo() {
  if (ctx) return;
  const Clase = window.AudioContext || window.webkitAudioContext;
  if (!Clase) return;
  try {
    ctx = new Clase();
    const fuente = ctx.createMediaElementSource(medio);
    ganancia = ctx.createGain();
    ganancia.gain.value = volumen;
    analizador = ctx.createAnalyser();
    analizador.fftSize = FFT;
    analizador.smoothingTimeConstant = 0.8;
    fuente.connect(ganancia).connect(analizador).connect(ctx.destination);
  } catch (e) {
    ctx = ganancia = analizador = null;
    medio.volume = volumen;
  }
}

export async function reproducir() {
  if (!medio || !medio.src) return false;
  crearGrafo();
  try {
    if (ctx) await ctx.resume();
    await medio.play();
    return true;
  } catch (e) {
    return false;
  }
}

export function pausar() {
  if (medio) medio.pause();
}

export async function alternar() {
  if (medio && !medio.paused) { pausar(); return true; }
  return reproducir();
}

export function buscar(segundos) {
  if (medio && Number.isFinite(medio.duration)) medio.currentTime = Math.max(0, Math.min(medio.duration, segundos));
}

export function fijarVolumen(v) {
  volumen = Math.max(0, Math.min(1, v));
  if (ganancia) ganancia.gain.value = volumen;
  else if (medio) medio.volume = volumen;
}

export function muestrear() {
  const sonando = analizador && medio && !medio.paused && !medio.ended;
  if (!sonando) {
    nivel *= 0.9;
    for (let i = 0; i < N_BANDAS; i++) bandas[i] *= 0.9;
    return;
  }
  analizador.getByteTimeDomainData(onda8);
  let suma = 0;
  for (let i = 0; i < FFT; i++) { const v = (onda8[i] - 128) / 128; suma += v * v; }
  const objetivo = Math.min(1, Math.sqrt(suma / FFT) * 3);
  nivel += (objetivo - nivel) * (objetivo > nivel ? 0.35 : 0.08);
  analizador.getByteFrequencyData(frec8);
  for (let k = 0; k < N_BANDAS; k++) {
    const a = Math.max(1, Math.floor(INDICE_MAX ** (k / N_BANDAS)));
    const b = Math.max(a + 1, Math.floor(INDICE_MAX ** ((k + 1) / N_BANDAS)));
    let s = 0;
    for (let i = a; i < b; i++) s += frec8[i];
    bandas[k] = s / (b - a) / 255;
  }
}

export const amplitud = () => nivel;
export const espectro = () => bandas;
export const onda = () => onda8;

export function estado() {
  return {
    id: actual,
    cargando,
    sonando: !!medio && !medio.paused && !medio.ended,
    tiempo: medio ? medio.currentTime : 0,
    duracion: medio && Number.isFinite(medio.duration) ? medio.duration : 0,
  };
}

export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
