/* Rocola de la Tierra — narración con la voz del navegador (speechSynthesis).
   Es para quien no usa lector de pantalla: lee en voz alta la misma descripción automática.
   Mientras habla, avisa a app.js para que baje el volumen de la música. */
"use strict";

const PAUSA_VOZ_MS = 1500;                // silencio mínimo entre dos frases mientras suena la pista
const CODIGO_VOZ = { es: "es-ES", en: "en-US" };

const narrador = {
  turno: 0,                               // identifica la frase en curso (las canceladas se ignoran)
  ultimoFin: 0,
  alCambiar: () => {},                    // app.js pone aquí su función: recibe true al hablar, false al callar
};

function vozDisponible() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function vozHablando() {
  return vozDisponible() && (speechSynthesis.speaking || speechSynthesis.pending);
}

function elegirVoz(idioma) {
  const voces = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(idioma));
  return voces.find((v) => v.default) || voces.find((v) => v.localService) || voces[0] || null;
}

function callarVoz() {
  if (!vozDisponible()) return;
  narrador.turno++;
  speechSynthesis.cancel();
  narrador.alCambiar(false);
}

/* Dice el texto. Con forzar = true corta lo que estuviera diciendo; sin forzar, espera a
   terminar la frase anterior y deja una pausa, para no pisar la música todo el tiempo. */
function narrar(texto, idioma, forzar = false) {
  if (!vozDisponible() || !texto) return;
  if (forzar) callarVoz();
  else if (vozHablando() || Date.now() - narrador.ultimoFin < PAUSA_VOZ_MS) return;

  const frase = new SpeechSynthesisUtterance(texto);
  const voz = elegirVoz(idioma);
  if (voz) frase.voice = voz;
  frase.lang = voz ? voz.lang : CODIGO_VOZ[idioma] || idioma;
  const turno = ++narrador.turno;
  const terminar = () => {
    if (turno !== narrador.turno) return;
    narrador.ultimoFin = Date.now();
    narrador.alCambiar(false);
  };
  frase.onstart = () => { if (turno === narrador.turno) narrador.alCambiar(true); };
  frase.onend = terminar;
  frase.onerror = terminar;
  speechSynthesis.speak(frase);
}
