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

/* Un objeto por fotograma: nota (melodía, con octava), notas (arpegio), dron, pan (−1..1), ganancia (lineal),
   velocidad (MIDI nominal) y evento_fuerte. Todo sale de m = <id>_mapeo.json; R = rasgos de <id>_rasgos.json. */
export function calcularSerie(m, R) {
  const esc = m.escala.notas_base, oct = 12 * m.escala.octava;
  const v0 = m.vmin_sonido, v1 = m.vmax_sonido;
  const media = rellenar(R.map((r) => r[m.rasgo_tono || "media"]), m.relleno_media);
  const area = rellenar(R.map((r) => r.area), 0);
  const cEje = rellenar(R.map((r) => r[m.paneo.campo]), 0.5);
  const mediaS = m.suavizado_fotogramas > 1 ? mediaMovil(media, m.suavizado_fotogramas) : media;
  const cS = mediaMovil(cEje, m.paneo.suavizado_fotogramas);
  const [u1, u2] = m.densidad.umbrales;
  const v = m.volumen, p = m.paneo, rango = v.area_max - v.area_min;
  return R.map((_, i) => {
    const idx = redondearPar(limitar((mediaS[i] - v0) / (v1 - v0 + 1e-12), 0, 1) * (esc.length - 1));
    const k = m.densidad.activa ? (mediaS[i] < u1 ? 1 : mediaS[i] <= u2 ? 2 : 4) : 1;
    const paso = idx + k <= esc.length ? 1 : -1;               // sin sitio hacia arriba, el arpegio baja desde la nota base
    const notas = Array.from({ length: k }, (_, j) => esc[idx + paso * j] + oct);
    let cPan = p.rama === "amplia"
      ? limitar((cS[i] - p.p5) / (p.p95 - p.p5), 0, 1)
      : limitar(0.5 + (cS[i] - p.centro) / p.ancho_rama_estrecha, 0, 1);
    if (area[i] < p.area_centro) cPan = 0.5;                   // sin zona caliente apreciable (area cruda): al centro
    const aN = rango >= v.rango_minimo ? limitar((area[i] - v.area_min) / rango, 0, 1) : v.area_max >= v.rango_minimo ? 1 : 0;
    const ganancia = 10 ** ((v.db_min + (v.db_max - v.db_min) * aN) / 20);
    return {
      nota: esc[idx] + oct, notas, dron: m.dron.nota_midi, pan: 2 * cPan - 1, ganancia,
      velocidad: redondearPar(v.velocidad_max * ganancia),
      evento_fuerte: i > 0 && Math.abs(media[i] - media[i - 1]) > m.articulacion.umbral_evento,   // sobre la media CRUDA
    };
  });
}
