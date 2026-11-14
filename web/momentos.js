/* Rocola de la Tierra — momentos clave de una pista, calculados solo con sus rasgos.
   No hay nada escrito a mano: por eso la página dice "detectados automáticamente". */
"use strict";

const ORDEN_MOMENTOS = ["inicio", "minimo", "maximo", "salto", "cruce", "fin"];

/* Umbral del "cambio brusco": el mismo que usa el audio para dar un golpe fuerte
   (umbral_evento del pipeline o, si falta, 1/12 del rango de sonido). */
function umbralDeSalto(doc) {
  if (doc.umbral_evento != null) return doc.umbral_evento;
  const v0 = doc.vmin_sonido ?? doc.vmin, v1 = doc.vmax_sonido ?? doc.vmax;
  return v0 != null && v1 != null ? (v1 - v0) / 12 : null;
}

/* Marca rasgo.salto = true donde el valor cambia más que el umbral respecto al rasgo anterior. */
function marcarSaltos(rasgos, umbral) {
  if (umbral == null) return;
  for (let i = 1; i < rasgos.length; i++) {
    const a = rasgos[i - 1].media, b = rasgos[i].media;
    if (a != null && b != null && Math.abs(b - a) > umbral) rasgos[i].salto = true;
  }
}

function indiceDelMayorSalto(rasgos) {
  let mejor = -1, tamano = 0;
  for (let i = 1; i < rasgos.length; i++) {
    if (!rasgos[i].salto) continue;
    const d = Math.abs(rasgos[i].media - rasgos[i - 1].media);
    if (d > tamano) { mejor = i; tamano = d; }
  }
  return mejor;
}

/* Primer rasgo desde el que el valor ya no vuelve a bajar de la referencia (-1 si no lo hay
   o si es así desde el principio). */
function indiceDelCruce(rasgos, referencia) {
  if (referencia == null) return -1;
  let i = rasgos.length;
  while (i > 0 && rasgos[i - 1].media >= referencia) i--;
  return i > 0 && i < rasgos.length ? i : -1;
}

/* Devuelve [{ rasgo, tipos: ["maximo", "fin"] }] en orden de tiempo. */
function calcularMomentos(rasgos, referencia) {
  const R = rasgos.filter((r) => r.media != null);
  if (R.length < 2) return [];
  const valores = R.map((r) => r.media);
  const encontrados = { inicio: 0, fin: R.length - 1 };
  const min = Math.min(...valores), max = Math.max(...valores);
  if (max > min) {
    encontrados.minimo = valores.indexOf(min);
    encontrados.maximo = valores.indexOf(max);
  }
  const salto = indiceDelMayorSalto(R);
  if (salto >= 0) encontrados.salto = salto;
  const cruce = indiceDelCruce(R, referencia);
  if (cruce >= 0) encontrados.cruce = cruce;

  // un botón por momento: se juntan los que caen en el mismo rasgo, o en rasgos con la misma
  // fecha y el mismo valor a dos decimales (p. ej. el máximo y el final, los dos en 2023)
  const momentos = [];
  for (const tipo of ORDEN_MOMENTOS) {
    if (!(tipo in encontrados)) continue;
    const rasgo = R[encontrados[tipo]];
    const igual = momentos.find((m) => m.rasgo === rasgo ||
      (rasgo.fecha != null && m.rasgo.fecha === rasgo.fecha && Math.abs(m.rasgo.media - rasgo.media) < 0.005));
    if (igual) igual.tipos.push(tipo);
    else momentos.push({ rasgo, tipos: [tipo] });
  }
  return momentos.sort((a, b) => a.rasgo._t - b.rasgo._t);
}
