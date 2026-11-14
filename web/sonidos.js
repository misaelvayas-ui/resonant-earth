/* Rocola de la Tierra — "Aprende los sonidos": ejemplos cortos hechos con Web Audio.
   Usan la misma escala que el audio del pipeline (pentatónica mayor desde Do) y un timbre parecido
   al del respaldo de 06 (un golpe triangular que se apaga, más un tono grave de seno para el dron). */
"use strict";

const DO4 = 60;                                   // la nota que la melodía toca con la referencia en GISTEMP
const PENTATONICA = [0, 2, 4, 7, 9];              // grados de la escala (semitonos sobre la tónica)
const PASO_S = 0.55;                              // separación entre las notas de un ejemplo

let contextoAudio = null;
let salidaActual = null;                          // ganancia maestra del ejemplo que está sonando

function midiAHz(nota) {
  return 440 * 2 ** ((nota - 69) / 12);
}

function abrirAudio() {
  const Clase = window.AudioContext || window.webkitAudioContext;
  if (!Clase) return null;
  if (!contextoAudio) contextoAudio = new Clase();
  if (contextoAudio.state === "suspended") contextoAudio.resume();
  return contextoAudio;
}

/* Un golpe de marimba aproximado: onda triangular que se apaga sola. pan: -1 izquierda … +1 derecha. */
function tocarGolpe(ctx, salida, { nota, cuando, fuerza = 0.5, pan = 0, dura = 0.5 }) {
  const osc = ctx.createOscillator();
  const envolvente = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = midiAHz(nota);
  envolvente.gain.setValueAtTime(0.0001, cuando);
  envolvente.gain.exponentialRampToValueAtTime(fuerza, cuando + 0.005);
  envolvente.gain.exponentialRampToValueAtTime(0.0001, cuando + dura);
  osc.connect(envolvente);
  if (ctx.createStereoPanner) {
    const paneo = ctx.createStereoPanner();
    paneo.pan.value = pan;
    envolvente.connect(paneo).connect(salida);
  } else {
    envolvente.connect(salida);
  }
  osc.start(cuando);
  osc.stop(cuando + dura + 0.05);
}

/* El dron: un seno grave y fijo, con entrada y salida suaves. */
function tocarDron(ctx, salida, { nota, cuando, dura }) {
  const osc = ctx.createOscillator();
  const envolvente = ctx.createGain();
  osc.frequency.value = midiAHz(nota);
  envolvente.gain.setValueAtTime(0.0001, cuando);
  envolvente.gain.exponentialRampToValueAtTime(0.22, cuando + 0.15);
  envolvente.gain.setValueAtTime(0.22, cuando + dura - 0.3);
  envolvente.gain.exponentialRampToValueAtTime(0.0001, cuando + dura);
  osc.connect(envolvente).connect(salida);
  osc.start(cuando);
  osc.stop(cuando + dura + 0.05);
}

/* Cada ejemplo programa sus notas desde t0 y devuelve cuántos segundos dura. */
const EJEMPLOS = {
  tono(ctx, salida, t0) {                          // de grave a aguda: una octava por paso
    [0, 12, 24, 36].forEach((subida, i) => tocarGolpe(ctx, salida, { nota: DO4 + subida, cuando: t0 + i * PASO_S }));
    return 4 * PASO_S;
  },
  volumen(ctx, salida, t0) {                       // -6 dB … 0 dB, como en el pipeline, y un paso intermedio
    [0.25, 0.4, 0.7].forEach((fuerza, i) => tocarGolpe(ctx, salida, { nota: DO4 + 12, cuando: t0 + i * PASO_S, fuerza }));
    return 3 * PASO_S;
  },
  paneo(ctx, salida, t0) {
    [-1, 0, 1].forEach((pan, i) => tocarGolpe(ctx, salida, { nota: DO4 + 12, cuando: t0 + i * 0.7, pan }));
    return 3 * 0.7;
  },
  dron(ctx, salida, t0) {                          // dron una octava bajo la nota de la referencia
    tocarDron(ctx, salida, { nota: DO4 - 12, cuando: t0, dura: 3.4 });
    tocarGolpe(ctx, salida, { nota: DO4, cuando: t0 + 1.0, dura: 0.8 });        // en la referencia
    tocarGolpe(ctx, salida, { nota: DO4 + 24, cuando: t0 + 2.1, dura: 0.8 });   // muy por encima
    return 3.4;
  },
  ritmo(ctx, salida, t0) {                         // 1, 2 y 4 notas en el mismo medio segundo (arpegio)
    let t = t0;
    for (const cuantas of [1, 2, 4]) {
      for (let j = 0; j < cuantas; j++) {
        const grado = PENTATONICA[j % PENTATONICA.length];
        tocarGolpe(ctx, salida, { nota: DO4 + 12 + grado, cuando: t + (j * 0.5) / cuantas, dura: 0.5 / cuantas + 0.15 });
      }
      t += 0.8;
    }
    return 2.4;
  },
  golpe(ctx, salida, t0) {
    [0.2, 0.2, 0.2, 0.8].forEach((fuerza, i) => tocarGolpe(ctx, salida, { nota: DO4 + 12, cuando: t0 + i * PASO_S, fuerza }));
    return 4 * PASO_S;
  },
};

function callarEjemplo() {
  if (!salidaActual || !contextoAudio) return;
  salidaActual.gain.setTargetAtTime(0, contextoAudio.currentTime, 0.02);
  salidaActual = null;
}

/* Toca un ejemplo (corta el anterior). volumen: 0…1. Devuelve su duración en segundos,
   o 0 si el navegador no tiene Web Audio. */
function tocarEjemplo(nombre, volumen = 0.8) {
  const ctx = abrirAudio();
  if (!ctx || !EJEMPLOS[nombre]) return 0;
  callarEjemplo();
  const salida = ctx.createGain();
  salida.gain.value = volumen;
  salida.connect(ctx.destination);
  salidaActual = salida;
  return EJEMPLOS[nombre](ctx, salida, ctx.currentTime + 0.05);
}
