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

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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
  const btn = $("btn-reproducir");
  btn.textContent = e.sonando ? "Pausar" : "Reproducir";
  $("tiempo").textContent = `${mmss(e.tiempo)} / ${mmss(e.duracion || (actual ? actual.duracion_s : 0))}`;
  if (!arrastrando && e.duracion) {
    const v = Math.round((e.tiempo / e.duracion) * 1000);
    $("avance").value = v;
    $("avance").setAttribute("aria-valuetext", `${mmss(e.tiempo)} de ${mmss(e.duracion)}`);
  }
  marcarFichas(e.sonando);
  $("sonando-titulo").textContent = e.sonando && actual ? actual.titulo : "Nada suena todavía";
  const muestra = $("btn-muestra");
  muestra.textContent = e.sonando ? "Pausar" : "Escuchar una muestra";
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
  $("avance").value = 0;
  const estado = $("estado-rocola");
  estado.textContent = `Cargando «${p.titulo}»… 0 %`;
  lectura.limpiar();
  const rasgos = cargarRasgos(p).then((d) => {
    if (actual !== p) return;
    doc = d;
    dibujarGraficoPista($("grafico-pista"), p, d);
    if (d) lectura.actualizar(p, d, 0, false, true); else lectura.sinLectura();
  });
  const ok = await audio.cargar(p, (fr) => { if (actual === p) estado.textContent = `Cargando «${p.titulo}»… ${Math.round(fr * 100)} %`; });
  await rasgos;
  if (actual !== p) return;
  if (!ok) {
    estado.textContent = `No pude cargar «${p.titulo}». Revisa que exista el archivo ${p.video}.`;
    $("btn-reproducir").disabled = true;
    $("btn-cambiar").disabled = false;
    return;
  }
  estado.textContent = "Listo. Pulsa Reproducir.";
  if (opciones.reproducir) {
    const sono = await audio.reproducir();
    if (actual === p) estado.textContent = sono ? `Suena: ${p.titulo}` : "Pulsa Reproducir para escuchar.";
  }
}

export async function cambiar() {
  const otra = pistas.find((x) => !actual || x.id !== actual.id);
  const sonaba = audio.estado().sonando;
  await elegir(otra.id, { reproducir: sonaba });
}

export function iniciarRocola(lista) {
  pistas = lista;
  pintarTarjetas();
  audio.alCambiar(alAudio);
  $("btn-reproducir").addEventListener("click", async () => {
    const e = audio.estado();
    if (e.sonando) {
      audio.pausar();
      if (actual && doc) lectura.actualizar(actual, doc, audio.estado().tiempo, false, true);
      $("estado-rocola").textContent = `En pausa: ${actual.titulo}`;
    } else {
      const ok = await audio.reproducir();
      $("estado-rocola").textContent = ok ? `Suena: ${actual.titulo}` : "Pulsa Reproducir para escuchar.";
    }
  });
  $("btn-cambiar").addEventListener("click", cambiar);
  $("volumen").addEventListener("input", (ev) => {
    audio.fijarVolumen(ev.target.value / 100);
    ev.target.setAttribute("aria-valuetext", `${ev.target.value} %`);
  });
  const av = $("avance");
  av.addEventListener("pointerdown", () => { arrastrando = true; });
  av.addEventListener("pointerup", () => { arrastrando = false; });
  av.addEventListener("input", () => {
    const dur = audio.estado().duracion || (actual ? actual.duracion_s : 0);
    audio.buscar((av.value / 1000) * dur);
    if (actual && doc) lectura.actualizar(actual, doc, (av.value / 1000) * dur, false, true);
  });
  av.addEventListener("change", () => { arrastrando = false; });
  $("btn-muestra").addEventListener("click", async () => {
    const e = audio.estado();
    if (e.sonando) { audio.pausar(); return; }
    if (!actual) await elegir(pistas[0].id, { reproducir: true });
    else { const ok = await audio.reproducir(); if (ok) $("estado-rocola").textContent = `Suena: ${actual.titulo}`; }
  });
  audio.alCambiar((e) => { if (e.sonando && actual) $("estado-rocola").textContent = `Suena: ${actual.titulo}`; });
}
