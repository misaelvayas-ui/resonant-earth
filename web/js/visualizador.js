/* Espectro y forma de onda en canvas, a partir del audio que suena. */
"use strict";

import { espectro, onda } from "./audio.js";

const ACENTO = "#86cdfa";
const TINTA = "#f3f6f8";
const lienzos = [];

function preparar(canvas, barras, conOnda, ajustar) {
  const o = { canvas, ctx: canvas.getContext("2d"), barras, conOnda, visible: true, ajustar };
  const medir = () => {
    if (!o.ajustar) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * d));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * d));
  };
  medir();
  new ResizeObserver(medir).observe(canvas);
  new IntersectionObserver((es) => { o.visible = es[0].isIntersecting; }).observe(canvas);
  lienzos.push(o);
}

export function iniciarVisualizador(grande, mini) {
  preparar(grande, 48, true, true);
  preparar(mini, 24, false, false);
}

function rectRedondo(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function dibujar() {
  const b = espectro();
  const w8 = onda();
  for (const o of lienzos) {
    if (!o.visible) continue;
    const { ctx: c, canvas } = o;
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    const k = W / 400;                   // 1 en un lienzo de 400 px
    const sep = o.conOnda ? 3 * (W / canvas.clientWidth || 1) : 2;
    const ancho = (W - sep * (o.barras - 1)) / o.barras;
    c.fillStyle = ACENTO;
    for (let i = 0; i < o.barras; i++) {
      let v;
      if (o.conOnda) v = b[i + 2];
      else v = (b[i * 2] + b[i * 2 + 1]) / 2;
      const alto = Math.max(2, v * H);
      rectRedondo(c, i * (ancho + sep), H - alto, Math.max(1, ancho), alto, 2);
      c.fill();
    }
    if (o.conOnda) {
      c.strokeStyle = TINTA; c.globalAlpha = 0.7; c.lineWidth = 1.5 * (W / canvas.clientWidth || 1);
      c.beginPath();
      const paso = Math.max(1, Math.floor(w8.length / 256));
      for (let i = 0, n = 0; i < w8.length; i += paso, n++) {
        const x = (i / (w8.length - 1)) * W;
        const y = H / 2 + ((w8[i] - 128) / 128) * (H / 2) * 0.9;
        if (n === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      c.globalAlpha = 1;
    }
  }
}
