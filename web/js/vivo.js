/* Sonido en vivo: genera en el navegador el audio de una pista a partir de sus rasgos y de su <id>_mapeo.json,
   con las mismas notas, dron, volumen y paneo que 06_rasgos_a_audio.py (docs/ESPEC_MODO_EN_VIVO.md, docs/PLAN_MODO_EN_VIVO.md).
   El <video> es el reloj; este módulo solo crea los nodos y sigue lo que haga el video. El cálculo está en mapeo.js. */
"use strict";

import * as audio from "./audio.js";
import { calcularSerie, aislar, eventos, nivelDron } from "./mapeo.js";

// Constantes de timbre y de tiempo (el resto sale del mapeo; ver plan 3.6)
const ARMONICOS = [1, 0.35, 0.15];            // forma «suave»: seno + 2.º y 3.er armónico, ÷ 1,5
const TAU_PUERTA = 0.015;                     // s: entrada y salida del sonido sin clic
const TODOS = { tono: true, volumen: true, paneo: true, dron: true };

let medio = null;
let mapeo = null, rasgosDatos = null;         // pista cargada
let serieBase = null, serie = null, ev = [];  // serie completa, serie con rasgos aislados y sus golpes
let ampDron = 0;
let rasgos = { ...TODOS };                    // casillas: qué rasgos modulan el sonido
let activo = false;                           // el modo seleccionado es «en vivo»
let nodos = null;
let abierta = false;                          // la puerta está abierta (suena)

const hz = (nota) => 440 * 2 ** ((nota - 69) / 12);

export function iniciar() {
  medio = audio.elementoMedio();
  for (const nombre of ["play", "playing", "pause", "ended"]) medio.addEventListener(nombre, () => alMedio(nombre));
}

/* Prepara una pista: calcula la serie y los golpes (no crea nodos ni suena todavía) */
export function cargar(m, R) {
  mapeo = m;
  rasgosDatos = R;
  serieBase = calcularSerie(m, R);
  ampDron = nivelDron(m, serieBase, eventos(m, serieBase));      // siempre con todo encendido: el dron no cambia de nivel
  recalcular();
  if (nodos) aplicarPista();
}

function recalcular() {
  serie = aislar(mapeo, serieBase, rasgos);
  ev = eventos(mapeo, serie);
}

function crearNodos() {
  const ctx = audio.contexto(), salida = audio.entradaVivo();
  if (nodos || !ctx || !salida) return !!nodos;
  const voz = ctx.createOscillator();
  try {
    const imag = new Float32Array([0, ...ARMONICOS.map((a) => a / 1.5)]);
    voz.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(imag.length), imag, { disableNormalization: true }));
  } catch (e) {
    voz.type = "sine";                          // sin PeriodicWave con opciones: seno puro
  }
  const gVoz = ctx.createGain(), gMelodia = ctx.createGain(), gDron = ctx.createGain(), puerta = ctx.createGain();
  const paneador = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const dron = ctx.createOscillator();
  dron.type = "sine";
  gVoz.gain.value = 0; gDron.gain.value = 0; puerta.gain.value = 0;
  const curva = new Float32Array(2049);         // limitador suave: 0,85·tanh(1,5·x) (sintesis.limitar, sin normalizar)
  curva.forEach((_, i, c) => { c[i] = 0.85 * Math.tanh(1.5 * ((i / 1024) - 1)); });
  const limitador = ctx.createWaveShaper();
  limitador.curve = curva;
  limitador.oversample = "2x";
  voz.connect(gVoz).connect(gMelodia);
  if (paneador) gMelodia.connect(paneador).connect(puerta); else gMelodia.connect(puerta);
  dron.connect(gDron).connect(puerta);          // el dron no se panea (ESPEC §2.4)
  puerta.connect(limitador).connect(salida);
  voz.start();
  dron.start();
  nodos = { ctx, voz, gVoz, gMelodia, paneador, dron, gDron, puerta };
  aplicarPista();
  return true;
}

/* Lo que depende de la pista: nota del dron y su nivel */
function aplicarPista() {
  const { ctx, dron, gDron, voz } = nodos;
  const ahora = ctx.currentTime;
  dron.frequency.setValueAtTime(mapeo.dron.hz, ahora);
  voz.frequency.setValueAtTime(hz(serie[0].nota), ahora);
  aplicarCasillas();
}

function aplicarCasillas() {
  const { ctx, gDron, gMelodia } = nodos;
  gDron.gain.setTargetAtTime(rasgos.dron ? ampDron : 0, ctx.currentTime, TAU_PUERTA);
  gMelodia.gain.setTargetAtTime(rasgos.tono || rasgos.volumen || rasgos.paneo ? 1 : 0, ctx.currentTime, TAU_PUERTA);
}

function puerta(abrir) {
  if (!nodos) return;
  abierta = abrir;
  nodos.puerta.gain.setTargetAtTime(abrir ? 1 : 0, nodos.ctx.currentTime, TAU_PUERTA);
}

function alMedio(nombre) {
  if (!activo || !nodos) return;
  if (nombre === "play" || nombre === "playing") puerta(true);
  else puerta(false);                           // pause, ended
}

/* Selecciona o deja el modo «en vivo». Hay que haber llamado a audio.fijarModo("vivo") y a audio.desbloquear() en el gesto */
export function activar(si) {
  if (si && (!mapeo || !crearNodos())) return false;
  activo = si;
  if (nodos) puerta(si && !medio.paused && !medio.ended);
  return true;
}

export function estado() {
  return { listo: !!mapeo, activo, sonando: abierta, rasgos: { ...rasgos }, ampDron };
}
