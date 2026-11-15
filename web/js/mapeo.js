/* Cálculo puro del modo en vivo (sin DOM ni Web Audio): aplica <id>_mapeo.json a los rasgos de una pista.
   Las fórmulas son las de docs/ESPEC_MODO_EN_VIVO.md (= 06_rasgos_a_audio.py); lo prueba pruebas/motor.test.mjs. */
"use strict";

export const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

/* Redondeo al par en los empates, como numpy.round: 0,5 → 0; 1,5 → 2; 2,5 → 2 (v ≥ 0) */
export function redondearPar(v) {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/* Cada dato ausente (null, undefined, NaN) toma el último valor válido; antes del primero, 'defecto' */
export function rellenar(v, defecto) {
  let ultimo = defecto;
  return v.map((x) => (x == null || Number.isNaN(x) ? ultimo : (ultimo = Number(x))));
}

/* Media móvil centrada de n fotogramas (n impar); en los bordes la ventana se acorta */
export function mediaMovil(x, n) {
  const h = (n | 1) >> 1;
  return x.map((_, i) => {
    let suma = 0, cuenta = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(x.length - 1, i + h); j++) { suma += x[j]; cuenta++; }
    return suma / cuenta;
  });
}

/* Percentil con interpolación lineal, como numpy.percentile; q en 0..100 */
export function percentil(v, q) {
  const s = [...v].sort((a, b) => a - b);
  const pos = ((s.length - 1) * q) / 100;
  const lo = Math.floor(pos), hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
