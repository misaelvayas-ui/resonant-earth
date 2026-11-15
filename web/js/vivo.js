/* Sonido en vivo: genera en el navegador el audio de una pista a partir de sus rasgos y de su <id>_mapeo.json,
   con las mismas notas, dron, volumen y paneo que 06_rasgos_a_audio.py (docs/ESPEC_MODO_EN_VIVO.md, docs/PLAN_MODO_EN_VIVO.md).
   El <video> es el reloj; este módulo solo crea los nodos y sigue lo que haga el video. El cálculo está en mapeo.js. */
"use strict";

import * as audio from "./audio.js";
import { calcularSerie, aislar, eventos, nivelDron, valorEn, primerEvento, NIVEL_VOZ, NIVEL_GOLPE, VEL_REF, GOLPE_A, GOLPE_D } from "./mapeo.js";

// Constantes de timbre y de tiempo (el resto sale del mapeo; ver plan 3.6)
const ARMONICOS = [1, 0.35, 0.15];            // forma «suave»: seno + 2.º y 3.er armónico, ÷ 1,5
const TAU_PUERTA = 0.015;                     // s: entrada y salida del sonido sin clic
const FUNDIDO_FINAL = 0.05;                   // s: fundido al terminar la pista (06:279)
const TAU_NOTA = 0.01;                        // s: glide de la voz (06:296)
const TAU_GANANCIA = 0.08;                    // s: suavizado de la ganancia (06:297)
const TICK = 25;                              // ms entre revisiones del planificador
const HORIZONTE = 0.2;                        // s de pista que se programan por adelantado
const HORIZONTE_OCULTA = 1.2;                 // con la pestaña oculta los temporizadores se frenan: se programa más lejos
const TODOS = { tono: true, volumen: true, paneo: true, dron: true };

let medio = null;
let mapeo = null, rasgosDatos = null;         // pista cargada
let serieBase = null, serie = null, ev = [];  // serie completa, serie con rasgos aislados y sus golpes
let ampDron = 0;
let rasgos = { ...TODOS };                    // casillas: qué rasgos modulan el sonido
let activo = false;                           // el modo seleccionado es «en vivo»
let nodos = null;
let abierta = false;                          // la puerta está abierta (suena)
let sig = 0;                                  // siguiente golpe por programar
let ancla = null;                             // { pos, ctx }: posición de la pista y reloj de audio en el mismo instante
let intervalo = null;
let programados = 0, ultimo = null;           // diagnóstico: golpes programados y el último { t, cuando }
const pendientes = new Set();                 // golpes programados que aún no han empezado

const hz = (nota) => 440 * 2 ** ((nota - 69) / 12);

export function iniciar() {
  medio = audio.elementoMedio();
  for (const nombre of ["play", "playing", "pause", "ended", "seeking", "seeked", "waiting", "stalled", "ratechange"]) medio.addEventListener(nombre, () => alMedio(nombre));
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

function puerta(abrir, fundido = false) {
  if (!nodos) return;
  abierta = abrir;
  const { ctx, puerta: g } = nodos, ahora = ctx.currentTime;
  if (fundido) {                                                      // el final de la pista: rampa lineal de 50 ms
    g.gain.cancelScheduledValues(ahora);
    g.gain.setValueAtTime(g.gain.value, ahora);
    g.gain.linearRampToValueAtTime(0, ahora + FUNDIDO_FINAL);
  } else {
    g.gain.setTargetAtTime(abrir ? 1 : 0, ahora, TAU_PUERTA);
  }
}

/* Posición de la pista en este instante. currentTime avanza a saltos en algunos navegadores: entre dos anclas
   se estima con el reloj de audio, y solo se vuelve a anclar si se separan más de 60 ms (salto, seeking, lag) */
function reloj() {
  const ahora = nodos.ctx.currentTime;
  const est = ancla.pos + (ahora - ancla.ctx) * medio.playbackRate;
  if (Math.abs(medio.currentTime - est) > 0.06) ancla = { pos: medio.currentTime, ctx: ahora };
  return ancla.pos + (ahora - ancla.ctx) * medio.playbackRate;
}

function golpe(e, cuando) {
  const { ctx, voz, gMelodia } = nodos;
  const f = hz(e.nota), fin = cuando + GOLPE_A + GOLPE_D;
  voz.frequency.setTargetAtTime(f, cuando, TAU_NOTA);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = f;
  g.gain.setValueAtTime(0, cuando);
  g.gain.linearRampToValueAtTime((NIVEL_GOLPE * e.vel) / VEL_REF, cuando + GOLPE_A);
  g.gain.linearRampToValueAtTime(0, fin);
  o.connect(g).connect(gMelodia);
  o.start(cuando);
  o.stop(fin + 0.02);
  const p = { o, g, cuando };
  pendientes.add(p);
  o.onended = () => { o.disconnect(); g.disconnect(); pendientes.delete(p); };
  programados++;
  ultimo = { t: e.t, cuando };
}

function tick() {
  if (!activo || !nodos || medio.paused || medio.seeking || medio.readyState < 3) return;
  const { ctx, gVoz, paneador } = nodos;
  const pos = reloj(), vel = medio.playbackRate, ahora = ctx.currentTime, T = mapeo.seg_por_fotograma;
  const horizonte = (document.hidden ? HORIZONTE_OCULTA : HORIZONTE) * vel;
  while (sig < ev.length && ev[sig].t < pos + horizonte) {
    const e = ev[sig++];
    if (e.t < pos - 0.05) continue;                                   // quedó atrás
    golpe(e, ahora + Math.max(0, (e.t - pos) / vel));
  }
  gVoz.gain.setTargetAtTime(NIVEL_VOZ * valorEn(serie, "ganancia", pos, T), ahora, TAU_GANANCIA);
  if (paneador) paneador.pan.setTargetAtTime(valorEn(serie, "pan", pos, T), ahora, mapeo.paneo.suavizado_s);
}

function cancelarPendientes() {
  const ahora = nodos.ctx.currentTime;
  for (const p of pendientes) {
    if (p.cuando <= ahora) continue;                                  // el que ya suena termina solo (< 0,13 s)
    try { p.o.stop(); } catch (e) { /* ya parado */ }
    p.o.disconnect(); p.g.disconnect();
    pendientes.delete(p);
  }
}

/* Vuelve a leer la posición del video: nada programado antes sirve y la voz recupera la nota que toca en ese punto */
function resincronizar() {
  cancelarPendientes();
  const { ctx, voz } = nodos;
  ancla = { pos: medio.currentTime, ctx: ctx.currentTime };
  sig = primerEvento(ev, ancla.pos);
  const vigente = ev[Math.max(0, sig - 1)];
  voz.frequency.cancelScheduledValues(ctx.currentTime);
  voz.frequency.setTargetAtTime(hz(vigente.nota), ctx.currentTime, TAU_NOTA);
}

function arrancar() {
  resincronizar();
  if (!intervalo) intervalo = setInterval(tick, TICK);
  tick();
  puerta(true);
}

function parar(final = false) {
  clearInterval(intervalo);
  intervalo = null;
  if (nodos) { cancelarPendientes(); puerta(false, final); }
}

function alMedio(nombre) {
  if (!activo || !nodos) return;
  if (nombre === "play") arrancar();
  else if (nombre === "playing") { if (!intervalo) arrancar(); }      // ya está en marcha tras "play": no se reprograma
  else if (nombre === "seeked") { if (!medio.paused && !medio.ended) arrancar(); }
  else if (nombre === "ratechange") { if (intervalo) resincronizar(); }   // el tempo cambia; las notas no
  else parar(nombre === "ended" || medio.ended);                      // pause, ended, seeking, waiting, stalled
}

/* Selecciona o deja el modo «en vivo». Hay que haber llamado a audio.fijarModo("vivo") y a audio.desbloquear() en el gesto */
export function activar(si) {
  if (si && (!mapeo || !crearNodos())) return false;
  activo = si;
  if (si && !medio.paused && !medio.ended) arrancar(); else parar();
  return true;
}

export function estado() {
  return { listo: !!mapeo, activo, sonando: abierta, programados, ultimo, rasgos: { ...rasgos }, ampDron };
}
