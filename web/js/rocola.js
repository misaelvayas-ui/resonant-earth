/* Interfaz de la rocola: las dos tarjetas de pista, el escenario y sus controles. */
"use strict";

import * as audio from "./audio.js";
import { cargarRasgos, cargarMapeo } from "./datos.js";
import * as vivo from "./vivo.js";
import { dibujarGraficoPista } from "./grafico.js";
import * as lectura from "./lectura.js";
import * as explorar from "./explorar.js";

const $ = (id) => document.getElementById(id);
let pistas = [];
let actual = null;
let doc = null;
let arrastrando = false;
let mapeoActual = null;             // <id>_mapeo.json de la pista elegida (null: no hay sonido en vivo)
const modos = new Map();            // id de pista → "original" | "vivo" (solo durante la sesión)
const AYUDA = {
  sinPista: "Elige una pista para activar el sonido en vivo.",
  original: "Pista original: el audio del video, hecho con nuestro programa en Python.",
  vivo: "Sonido en vivo: tu navegador lo genera ahora mismo a partir de los datos. Mismas notas, otro timbre.",
  sinMapeo: "Esta pista no tiene sonido en vivo.",
  sinWebAudio: "Tu navegador no permite generar el sonido en vivo.",
};
const hayWebAudio = () => !!(window.AudioContext || window.webkitAudioContext);

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
    b.addEventListener("click", () => { audio.desbloquear(); elegir(p.id, { reproducir: true }); });
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

const RASGOS = [["tono", "Melodía"], ["volumen", "Volumen"], ["paneo", "Paneo"], ["dron", "Dron"]];
const rasgosMarcados = () => Object.fromEntries(RASGOS.map(([k]) => [k, $(`rasgo-${k}`).checked]));

/* Habilita o no el selector de sonido según lo que haya cargado */
function estadoSelector(habilitado, ayuda) {
  $("modo-sonido").disabled = !habilitado;
  if (!habilitado) $("rasgos-vivo").disabled = true;
  $("modo-ayuda").textContent = ayuda;
}

/* Pone el modo de sonido ("original" o "vivo"); si el vivo no es posible vuelve al original */
function ponerModo(modo, anunciar) {
  if (modo === "vivo") {
    const ok = !!mapeoActual && !!doc && audio.fijarModo("vivo") && vivo.activar(true);
    if (!ok) { modo = "original"; vivo.activar(false); audio.fijarModo("original"); }
  } else {
    vivo.activar(false);
    audio.fijarModo("original");
  }
  if (actual) modos.set(actual.id, modo);
  $("rasgos-vivo").disabled = modo !== "vivo";
  document.querySelector(`input[name="modo-sonido"][value="${modo}"]`).checked = true;
  $("modo-ayuda").textContent = AYUDA[modo];
  if (anunciar) decir(AYUDA[modo]);
}

/* Cuando ya hay rasgos y mapeo de la pista: prepara el motor en vivo y recupera el modo que tenía esa pista */
function prepararModo(p) {
  if (!hayWebAudio()) { estadoSelector(false, AYUDA.sinWebAudio); return; }
  if (!mapeoActual || !doc) { estadoSelector(false, AYUDA.sinMapeo); return; }
  vivo.cargar(mapeoActual, doc.rasgos);       // usa las casillas tal como están: vivo.fijarRasgos las mantiene al día
  estadoSelector(true, AYUDA.original);
  ponerModo(modos.get(p.id) || "original", false);
}

export async function elegir(id, opciones = {}) {
  const p = pistas.find((x) => x.id === id);
  if (!p) return;
  actual = p;
  doc = null;
  mapeoActual = null;
  vivo.activar(false);                 // la pista anterior deja de sonar en vivo hasta saber qué trae esta
  explorar.fijarPista(null, null);
  audio.fijarModo("original");
  estadoSelector(false, AYUDA.sinPista);
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
  $("btn-comparar").disabled = false;
  comparacion = null;
  $("avance").disabled = false;
  $("avance").max = String(p.duracion_s);
  $("avance").value = 0;
  decir(`Cargando «${p.titulo}»… 0 %`);
  lectura.limpiar();
  const rasgos = Promise.all([cargarRasgos(p), cargarMapeo(p)]).then(([d, m]) => {
    if (actual !== p) return;
    doc = d;
    mapeoActual = d ? m : null;
    explorar.fijarPista(p, mapeoActual);
    dibujarGraficoPista($("grafico-pista"), p, d, saltarA);
    if (d) lectura.actualizar(p, d, 0, false, true); else lectura.sinLectura();
    prepararModo(p);
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
  // la siguiente de la lista, en ciclo (sirve con 2 pistas o con más)
  const i = actual ? pistas.findIndex((x) => x.id === actual.id) : -1;
  const otra = pistas[(i + 1) % pistas.length];
  const sonaba = audio.estado().sonando;
  await elegir(otra.id, { reproducir: sonaba });
}

/* Mueve el video a 'seg' (gráfico, flechas) y deja la lectura en ese momento */
function saltarA(seg) {
  audio.buscar(seg);
  if (actual && doc) lectura.actualizar(actual, doc, seg, false, true);
}

/* «Antes y después»: suenan los primeros TRAMO s de la pista y, enseguida, los últimos. Así se oye el cambio sin esperar. */
const TRAMO = 5;
let comparacion = null;             // null, o { fase: 1 | 2, inicio2 }
async function comparar() {
  if (!actual) return;
  audio.desbloquear();                      // primero y sin await: es un gesto del usuario
  const dur = audio.estado().duracion || actual.duracion_s;
  if (dur < 2 * TRAMO + 1) return;
  comparacion = null;
  saltarA(0);
  const ok = await audio.reproducir();
  if (!ok) { decir("Pulsa Reproducir para escuchar."); return; }
  comparacion = { fase: 1, inicio2: dur - TRAMO };
  decir(`Antes: los primeros ${TRAMO} segundos de «${actual.titulo}».`);
}
function seguirComparacion(e) {
  if (!comparacion) return;
  if (!e.sonando) { comparacion = null; return; }           // pausa, final o cambio de pista: se cancela
  if (comparacion.fase === 1 && e.tiempo >= TRAMO) {
    comparacion.fase = 2;
    saltarA(comparacion.inicio2);
    decir(`Después: los últimos ${TRAMO} segundos.`);
  }
}

async function alternar() {
  audio.desbloquear();                      // primero y sin await: el gesto del usuario tiene que seguir activo
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
  $("btn-comparar").addEventListener("click", comparar);
  explorar.iniciarExplorar({ boton: $("btn-explorar"), zona: $("zona-explorar"), mira: $("mira"), texto: $("explorar-texto"), video: $("medio") },
    { alSalir: () => { if (actual && !audio.estado().sonando) decir(`En pausa: ${actual.titulo}`); } });
  audio.alCambiar(seguirComparacion);
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
    audio.desbloquear();
    const e = audio.estado();
    if (e.sonando) { audio.pausar(); return; }
    if (!actual) await elegir(pistas[0].id, { reproducir: true });
    else { const ok = await audio.reproducir(); if (ok) decir(`Suena: ${actual.titulo}`); }
  });
  let sonabaAntes = false;
  audio.alCambiar((e) => { if (e.sonando && !sonabaAntes && actual) decir(`Suena: ${actual.titulo}`); sonabaAntes = e.sonando; });
  $("rasgos-vivo").addEventListener("change", () => {
    const marcados = rasgosMarcados();
    vivo.fijarRasgos(marcados);
    const suenan = RASGOS.filter(([k]) => marcados[k]).map(([, nombre]) => nombre);
    decir(suenan.length ? `Suenan: ${suenan.join(", ")}.` : "No suena ningún rasgo.");
  });
  $("modo-sonido").addEventListener("change", (ev) => {
    audio.desbloquear();                  // primero y sin await: es un gesto del usuario
    ponerModo(ev.target.value, true);
  });
}
