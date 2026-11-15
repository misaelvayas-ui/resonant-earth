/* Interfaz de la rocola: las dos tarjetas de pista, el escenario y sus controles. */
"use strict";

import * as audio from "./audio.js";
import { cargarRasgos } from "./datos.js";
import { dibujarGraficoPista } from "./grafico.js";
import * as lectura from "./lectura.js";

const $ = (id) => document.getElementById(id);
let pistas = [];
let actual = null;
let doc = null;
let arrastrando = false;

const SALTO = 5;                    // segundos que mueven las flechas izquierda y derecha

/* m:ss, o m:ss,d si la pista dura una fracción (30,5 s): el contador y el total se redondean igual */
function reloj(seg, decimales) {
  const f = decimales ? 10 : 1;
  const v = Math.floor(seg * f + 1e-6) / f;
  const m = Math.floor(v / 60), r = v - m * 60;
  return `${m}:${decimales ? r.toFixed(1).replace(".", ",").padStart(4, "0") : String(r).padStart(2, "0")}`;
}
const durTotal = (d) => Math.round(d * 10) / 10;
function tiempoTexto(t, dur) {
  const total = durTotal(dur);
  const dec = !Number.isInteger(total);
  return `${reloj(Math.min(t, total), dec)} / ${reloj(total, dec)}`;
}

/* #estado-rocola es un role="status": solo se reescribe si el texto cambia, para no repetirlo al lector */
function decir(texto) {
  const e = $("estado-rocola");
  if (e.textContent !== texto) e.textContent = texto;
}

export const pistaActual = () => actual;
export const documentoActual = () => doc;

function pintarTarjetas() {
  const cont = $("lista-pistas");
  cont.textContent = "";
  for (const p of pistas) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pista vidrio";
    b.dataset.id = p.id;
    b.dataset.brillo = "";
    b.setAttribute("aria-pressed", "false");
    const img = document.createElement("img");
    img.src = p.fotograma; img.alt = ""; img.width = 640; img.height = 320; img.loading = "lazy";
    const t = document.createElement("span"); t.className = "pista-titulo"; t.textContent = p.titulo;
    const d = document.createElement("span"); d.className = "pista-detalle"; d.textContent = `${p.periodo}. ${p.fuente}`;
    const r = document.createElement("span"); r.className = "pista-resumen";
    const rt = document.createElement("span"); rt.textContent = p.resumen;
    const f = document.createElement("span"); f.className = "pista-ficha"; f.textContent = "Elegida";
    r.append(rt, f);
    b.append(img, t, d, r);
    b.addEventListener("click", () => elegir(p.id, { reproducir: true }));
    cont.appendChild(b);
  }
}

function marcarFichas(sonando) {
  for (const b of $("lista-pistas").querySelectorAll(".pista")) {
    const es = actual && b.dataset.id === actual.id;
    b.setAttribute("aria-pressed", es ? "true" : "false");
    const f = b.querySelector(".pista-ficha");
    if (f) f.textContent = es && sonando ? "Sonando" : "Elegida";
  }
}

function alAudio(e) {
  const dur = e.duracion || (actual ? actual.duracion_s : 0);
  $("btn-reproducir").textContent = e.sonando ? "Pausar" : "Reproducir";
  $("tiempo").textContent = tiempoTexto(e.tiempo, dur);
  const av = $("avance");
  if (dur && Number(av.max) !== dur) av.max = String(dur);
  if (!arrastrando && dur) {
    av.value = String(Math.min(e.tiempo, dur));
    av.setAttribute("aria-valuetext", tiempoTexto(e.tiempo, dur).replace(" / ", " de "));
  }
  marcarFichas(e.sonando);
  $("sonando-titulo").textContent = e.sonando && actual ? actual.titulo : "Nada suena todavía";
  $("btn-muestra").textContent = e.sonando ? "Pausar" : "Escuchar una muestra";
  if (e.terminado && actual) decir(`Terminó: ${actual.titulo}`);
}

export async function elegir(id, opciones = {}) {
  const p = pistas.find((x) => x.id === id);
  if (!p) return;
  actual = p;
  doc = null;
  marcarFichas(false);
  $("titulo-pista").textContent = `${p.titulo} ${p.periodo}`;
  const f = $("fuente-pista");
  f.textContent = "";
  const a = document.createElement("a");
  a.href = p.fuente_url; a.textContent = p.fuente;
  f.appendChild(a);
  $("descripcion-pista").textContent = p.descripcion;
  $("descripcion-accesible").textContent = p.descripcion_accesible;
  $("leyenda-pista").textContent = p.leyenda;
  $("btn-reproducir").disabled = false;
  $("btn-cambiar").disabled = false;
  $("avance").disabled = false;
  $("avance").max = String(p.duracion_s);
  $("avance").value = 0;
  decir(`Cargando «${p.titulo}»… 0 %`);
  lectura.limpiar();
  const rasgos = cargarRasgos(p).then((d) => {
    if (actual !== p) return;
    doc = d;
    dibujarGraficoPista($("grafico-pista"), p, d, saltarA);
    if (d) lectura.actualizar(p, d, 0, false, true); else lectura.sinLectura();
  });
  const ok = await audio.cargar(p, (fr) => { if (actual === p) decir(`Cargando «${p.titulo}»… ${Math.round(fr * 100)} %`); });
  await rasgos;
  if (actual !== p) return;
  if (!ok) {
    decir(`No pude cargar «${p.titulo}». Revisa que exista el archivo ${p.video}.`);
    $("btn-reproducir").disabled = true;
    $("btn-cambiar").disabled = false;
    return;
  }
  decir("Listo. Pulsa Reproducir.");
  if (opciones.reproducir) {
    const sono = await audio.reproducir();
    if (actual === p) decir(sono ? `Suena: ${p.titulo}` : "Pulsa Reproducir para escuchar.");
  }
}

export async function cambiar() {
  const otra = pistas.find((x) => !actual || x.id !== actual.id);
  const sonaba = audio.estado().sonando;
  await elegir(otra.id, { reproducir: sonaba });
}

/* Mueve el video a 'seg' (gráfico, flechas) y deja la lectura en ese momento */
function saltarA(seg) {
  audio.buscar(seg);
  if (actual && doc) lectura.actualizar(actual, doc, seg, false, true);
}

async function alternar() {
  if (audio.estado().sonando) {
    audio.pausar();
    if (actual && doc) lectura.actualizar(actual, doc, audio.estado().tiempo, false, true);
    decir(`En pausa: ${actual.titulo}`);
  } else {
    const ok = await audio.reproducir();
    decir(ok ? `Suena: ${actual.titulo}` : "Pulsa Reproducir para escuchar.");
  }
}

/* Atajos globales: Espacio y flechas, salvo en campos de texto, controles que ya usan esas teclas, botones y enlaces */
function atajos(ev) {
  if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey || !actual) return;
  const t = ev.target instanceof Element ? ev.target : document.body;
  if (t.closest("input, textarea, select, [contenteditable], [role='slider'], [role='textbox'], [role='spinbutton']")) return;
  if (ev.key === " ") {
    if (t.closest("button, a[href], summary, [role='button']") || $("btn-reproducir").disabled) return;
    ev.preventDefault();
    alternar();
  } else if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
    const e = audio.estado();
    if (!e.duracion) return;
    ev.preventDefault();
    const adelante = ev.key === "ArrowRight";
    const destino = Math.max(0, Math.min(e.duracion, e.tiempo + (adelante ? SALTO : -SALTO)));
    saltarA(destino);
    decir(`${adelante ? "Adelantado" : "Retrocedido"} a ${reloj(destino, false)}`);
  }
}

export function iniciarRocola(lista) {
  pistas = lista;
  pintarTarjetas();
  audio.alCambiar(alAudio);
  $("btn-reproducir").addEventListener("click", alternar);
  document.addEventListener("keydown", atajos);
  $("btn-cambiar").addEventListener("click", cambiar);
  $("volumen").addEventListener("input", (ev) => {
    audio.fijarVolumen(ev.target.value / 100);
    ev.target.setAttribute("aria-valuetext", `${ev.target.value} %`);
  });
  const av = $("avance");
  av.addEventListener("pointerdown", () => { arrastrando = true; });
  av.addEventListener("pointerup", () => { arrastrando = false; });
  av.addEventListener("input", () => saltarA(Number(av.value)));
  av.addEventListener("change", () => { arrastrando = false; });
  $("btn-muestra").addEventListener("click", async () => {
    const e = audio.estado();
    if (e.sonando) { audio.pausar(); return; }
    if (!actual) await elegir(pistas[0].id, { reproducir: true });
    else { const ok = await audio.reproducir(); if (ok) decir(`Suena: ${actual.titulo}`); }
  });
  audio.alCambiar((e) => { if (e.sonando && actual) decir(`Suena: ${actual.titulo}`); });
}
