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
