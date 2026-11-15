/* Prueba del cálculo del modo en vivo (sin Web Audio): node --test web/pruebas/motor.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { redondearPar, mediaMovil, rellenar, percentil } from "../js/mapeo.js";

test("T0 utilidades", () => {
  assert.deepEqual([0.5, 1.5, 2.5, 3.5, 2.4, 2.6].map(redondearPar), [0, 2, 2, 4, 2, 3]);
  assert.deepEqual(mediaMovil([1, 2, 3, 4], 3), [1.5, 2, 3, 3.5]);
  assert.deepEqual(rellenar([null, 2, NaN, 3], 9), [9, 2, 2, 3]);
  assert.equal(percentil([1, 2, 3, 4], 50), 2.5);
  assert.equal(percentil([4, 1, 3, 2], 5), 1.15);
});

// ---- datos de las dos pistas ----
import fs from "node:fs";
import { calcularSerie } from "../js/mapeo.js";

const IDS = ["gistemp_1880_2023", "sst_ecco2_2007_2008"];
const leer = (nombre) => JSON.parse(fs.readFileSync(new URL(`../assets/${nombre}`, import.meta.url), "utf8"));
const pista = (id) => ({ id, m: leer(`${id}_mapeo.json`), R: leer(`${id}_rasgos.json`).rasgos, doc: leer(`${id}_rasgos.json`), esperado: leer(`${id}_esperado.json`).fotogramas });

/* Discrepancias de la serie con _esperado.json: notas exactas, pan ± 0,02, ganancia ± 0,5 dB */
function discrepancias(serie, esperado) {
  const d = { notas: 0, arpegios: 0, dron: 0, pan: 0, ganancia: 0, velocidad: 0, evento_fuerte: 0 };
  esperado.forEach((e, i) => {
    const s = serie[i];
    if (s.nota !== e.nota) d.notas++;
    if (JSON.stringify(s.notas) !== JSON.stringify(e.notas)) d.arpegios++;
    if (s.dron !== e.dron) d.dron++;
    if (Math.abs(s.pan - e.pan) > 0.02) d.pan++;
    if (Math.abs(20 * Math.log10(s.ganancia / e.ganancia)) > 0.5) d.ganancia++;
    if (s.velocidad !== e.velocidad) d.velocidad++;
    if (s.evento_fuerte !== e.evento_fuerte) d.evento_fuerte++;
  });
  return d;
}
const total = (d) => Object.values(d).reduce((a, b) => a + b, 0);

for (const id of IDS) {
  test(`T1 ${id}: la serie coincide con _esperado.json`, () => {
    const { m, R, esperado } = pista(id);
    assert.equal(R.length, m.n_fotogramas);
    const serie = calcularSerie(m, R);
    assert.equal(serie.length, esperado.length);
    assert.deepEqual(discrepancias(serie, esperado), { notas: 0, arpegios: 0, dron: 0, pan: 0, ganancia: 0, velocidad: 0, evento_fuerte: 0 });
  });

  test(`T2 ${id}: el mapeo es coherente con los rasgos`, () => {
    const { m, R } = pista(id);
    const cS = mediaMovil(rellenar(R.map((r) => r[m.paneo.campo]), 0.5), m.paneo.suavizado_fotogramas);
    assert.ok(Math.abs(percentil(cS, 5) - m.paneo.p5) < 1e-9);
    assert.ok(Math.abs(percentil(cS, 95) - m.paneo.p95) < 1e-9);
    assert.equal(m.paneo.rama, m.paneo.p95 - m.paneo.p5 >= m.paneo.umbral_rama ? "amplia" : "estrecha");
  });
}

// T3: la prueba tiene que distinguir los errores del prototipo externo
test("T3 mutaciones: centroide_x, vmin/vmax de la paleta y sin media móvil se detectan", () => {
  for (const id of IDS) {
    const { m, R, doc, esperado } = pista(id);
    const conX = discrepancias(calcularSerie({ ...m, paneo: { ...m.paneo, campo: "centroide_x" } }, R), esperado);
    assert.ok(conX.pan > 0, `${id}: centroide_x no se detectó (pan)`);
    const conPaleta = discrepancias(calcularSerie({ ...m, vmin_sonido: doc.vmin, vmax_sonido: doc.vmax }, R), esperado);
    assert.ok(conPaleta.notas > 0, `${id}: vmin/vmax de la paleta no se detectó (notas)`);
    const sinMovil = discrepancias(calcularSerie({ ...m, suavizado_fotogramas: 1 }, R), esperado);
    assert.ok(total(sinMovil) > 0, `${id}: la media móvil de 3 no se detectó`);
  }
});
