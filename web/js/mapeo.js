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

/* Golpes de la melodía, ordenados por t (segundos de pista): densidad, ligado y re-golpe como en 06:mel, fusion (sin humanizar).
   tipo: "ataque", "fuerte" (evento brusco) o "regolpe" (nota ligada que se vuelve a tocar suave). */
export function eventos(m, serie) {
  const T = m.seg_por_fotograma, a = m.articulacion, salida = [];
  let ultF = -1;
  serie.forEach((f, i) => {
    const k = f.notas.length;
    f.notas.forEach((nota, j) => {
      const t = i * T + (j * T) / k;
      const fin = t + (T / k) * a.duracion_nota;
      const forzado = f.evento_fuerte && j === 0;
      const vel = forzado ? Math.max(f.velocidad, m.volumen.velocidad_fuerte) : f.velocidad;
      const previo = salida[salida.length - 1];
      if (a.ligar && previo && nota === previo.nota && !forzado) {
        if (a.regolpe_ligado > 0 && j === 0 && i - ultF >= a.regolpe_ligado) {
          salida.push({ t, fin, nota, vel: Math.max(1, redondearPar(vel * a.regolpe_vel)), tipo: "regolpe", i });
          ultF = i;
        } else {
          previo.fin = fin;                                    // la nota se alarga, sin golpe nuevo
        }
        return;
      }
      salida.push({ t, fin, nota, vel, tipo: forzado ? "fuerte" : "ataque", i });
      ultF = i;
    });
  });
  return salida;
}

/* Valor de un campo de la serie en la posición 'pos' (s): interpolación lineal entre los CENTROS de fotograma
   ((i + 0,5)·T), constante antes del primero y después del último (06:renderizar_fluidsynth, 06:sintetizar_numpy) */
export function valorEn(serie, campo, pos, T) {
  const u = pos / T - 0.5;
  if (u <= 0) return serie[0][campo];
  if (u >= serie.length - 1) return serie[serie.length - 1][campo];
  const i = Math.floor(u);
  return serie[i][campo] + (serie[i + 1][campo] - serie[i][campo]) * (u - i);
}

/* Índice del primer golpe con t ≥ pos (búsqueda binaria); ev.length si no queda ninguno */
export function primerEvento(ev, pos) {
  let lo = 0, hi = ev.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ev[mid].t < pos - 1e-6) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/* Constantes de TIMBRE del respaldo numpy (06:sintetizar_numpy, sintesis:oscilador); son lo único que no sale del mapeo */
export const NIVEL_VOZ = 0.5;            // amplitud de la voz sostenida = NIVEL_VOZ · ganancia
export const NIVEL_GOLPE = 0.35;         // pico del golpe = NIVEL_GOLPE · velocidad / VEL_REF
export const VEL_REF = 90;
export const GOLPE_A = 0.003;            // s: ataque lineal del golpe
export const GOLPE_D = 0.12;             // s: caída lineal hasta 0
const DRON_DB = 7;                // dB del dron por debajo de la melodía (ESPEC §2.2)
export const ARMONICOS = [1, 0.35, 0.15];   // seno + 2.º y 3.er armónico, ÷ 1,5 (forma «suave»)

/* Amplitud del seno del dron: DRON_DB bajo el RMS de la melodía. Se calcula con la serie y los golpes COMPLETOS
   (sin aislar rasgos): el dron no cambia de nivel al marcar casillas. */
export function nivelDron(m, serie, ev) {
  const T = m.seg_por_fotograma, D = serie.length * T;
  const g2 = serie.reduce((a, f) => a + f.ganancia ** 2, 0) / serie.length;
  const eVoz = NIVEL_VOZ ** 2 * g2 * (ARMONICOS.reduce((a, c) => a + c * c, 0) / 2 / 1.5 ** 2);
  const eGolpe = (ev.reduce((a, e) => a + ((NIVEL_GOLPE * e.vel) / VEL_REF) ** 2, 0) * ((GOLPE_A + GOLPE_D) / 3) * (1 / 3)) / D;
  return Math.SQRT2 * 10 ** (-DRON_DB / 20) * Math.sqrt(eVoz + eGolpe);
}

/* Rasgos aislados (casillas de la interfaz): lo que se apaga queda FIJO, no en silencio.
   tono → nota de la referencia; volumen → 0 dB; paneo → centro. (El dron se apaga en el motor.) */
export function aislar(m, serie, rasgos) {
  const fija = m.nota_referencia_base + 12 * m.escala.octava;
  return serie.map((f) => {
    const g = { ...f };
    if (!rasgos.tono) { g.nota = fija; g.notas = [fija]; g.evento_fuerte = false; }
    if (!rasgos.volumen) { g.ganancia = m.volumen.ganancia_max; g.velocidad = m.volumen.velocidad_max; }
    if (!rasgos.paneo) g.pan = 0;
    return g;
  });
}
